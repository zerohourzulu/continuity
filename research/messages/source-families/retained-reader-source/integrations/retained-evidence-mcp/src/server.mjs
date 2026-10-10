import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { BoundedStdioTransport } from './bounded-stdio.mjs';
import { parseStrictJson } from './strict-json.mjs';
import { SCHEMA_VERSION, SERVER_INFO, LIMITS, resolveProfile, parseProfilePrefix } from './profile.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
// The SDK's CallToolRequestSchema normalizes its arguments record and drops own
// __proto__ keys. Preserve that entire value until our size/strict-key checks.
// Server still performs its standard tools/call request/result validation, but
// invokes our handler with the request parsed by this supplied schema.
const retainedReadRequestSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({ name: z.string(), arguments: z.unknown().optional(), task: z.unknown().optional(), _meta: z.unknown().optional() }).passthrough()
});
const literalSchema = value => ({ type: typeof value, const: value });
const outputPropertiesFor = profile => ({
  schemaVersion: literalSchema(SCHEMA_VERSION), catalogId: literalSchema(profile.catalogId), catalogSha256: literalSchema(profile.expectedCatalogSha256),
  evidenceId: { type: 'string', enum: [...profile.evidenceIds] }, encoding: { type: 'string' },
  artifactBytes: { type: 'integer', minimum: 1, maximum: LIMITS.artifactBytes }, artifactSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
  chunkIndex: { type: 'integer', minimum: 0, maximum: Math.ceil(LIMITS.artifactBytes / LIMITS.chunkBytes) - 1 },
  chunkCount: { type: 'integer', minimum: 1, maximum: Math.ceil(LIMITS.artifactBytes / LIMITS.chunkBytes) },
  chunkBytes: { type: 'integer', minimum: 1, maximum: LIMITS.chunkBytes }, chunkSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
  dataBase64: { type: 'string', maxLength: 4 * Math.ceil(LIMITS.chunkBytes / 3), pattern: '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$' },
  scope: { type: 'object', properties: Object.fromEntries(Object.entries(profile.scope).map(([key, value]) => [key, literalSchema(value)])), required: Object.keys(profile.scope), additionalProperties: false }
});

async function readOrdinaryFile(filePath, maximum) {
  const handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.size > BigInt(maximum)) throw new Error('BUNDLE_FILE_INVALID');
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!result.bytesRead) throw new Error('BUNDLE_FILE_CHANGED');
      offset += result.bytesRead;
    }
    const extra = await handle.read(Buffer.alloc(1), 0, 1, offset);
    const after = await handle.stat({ bigint: true });
    if (extra.bytesRead || ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].some(key => before[key] !== after[key])) throw new Error('BUNDLE_FILE_CHANGED');
    return bytes;
  } finally { await handle.close(); }
}

async function loadBundle(bundleDir, profile) {
  try {
    bundleDir = path.resolve(bundleDir);
    const directory = await lstat(bundleDir);
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('BUNDLE_DIRECTORY_INVALID');
    const catalogBytes = await readOrdinaryFile(path.join(bundleDir, 'catalog.json'), LIMITS.catalogBytes);
    if (sha256(catalogBytes) !== profile.expectedCatalogSha256) throw new Error('CATALOG_INTEGRITY');
    const catalog = parseStrictJson(catalogBytes);
    if (catalog.schemaVersion !== SCHEMA_VERSION || catalog.catalogId !== profile.catalogId || catalog.resourceUri !== profile.catalogUri || catalog.chunkBytes !== LIMITS.chunkBytes || catalog.members.length !== profile.evidenceIds.length) throw new Error('CATALOG_PROFILE');
    if (!catalog.scope || Object.keys(catalog.scope).length !== Object.keys(profile.scope).length ||
        Object.entries(profile.scope).some(([key, value]) => !Object.hasOwn(catalog.scope, key) || catalog.scope[key] !== value)) throw new Error('CATALOG_PROFILE');
    const names = new Set(['catalog.json']);
    for (let i = 0; i < catalog.members.length; i++) {
      const member = catalog.members[i];
      if (member.evidenceId !== profile.evidenceIds[i] || !/^[A-Za-z0-9.]+\.(?:json|log)$/.test(member.fileName) || names.has(member.fileName) || !Number.isSafeInteger(member.bytes) || member.bytes < 1 || member.bytes > LIMITS.artifactBytes || !/^[0-9a-f]{64}$/.test(member.sha256) || member.chunkCount !== Math.ceil(member.bytes / LIMITS.chunkBytes)) throw new Error('CATALOG_PROFILE');
      names.add(member.fileName);
    }
    const actual = await readdir(bundleDir);
    if (actual.length !== names.size || actual.some(name => !names.has(name))) throw new Error('BUNDLE_MEMBERSHIP');
    let total = 0;
    const files = new Map();
    for (const member of catalog.members) {
      total += member.bytes;
      if (total > LIMITS.selectedBytes) throw new Error('BUNDLE_SIZE');
      const bytes = await readOrdinaryFile(path.join(bundleDir, member.fileName), LIMITS.artifactBytes);
      if (bytes.length !== member.bytes || sha256(bytes) !== member.sha256) throw new Error('ARTIFACT_INTEGRITY');
      files.set(member.evidenceId, { member, bytes });
    }
    return { catalogBytes, files };
  } catch (error) {
    // Never expose OS error messages, paths, caller values or proof contents.
    const known = new Set(['BUNDLE_FILE_INVALID', 'BUNDLE_FILE_CHANGED', 'BUNDLE_DIRECTORY_INVALID', 'CATALOG_INTEGRITY', 'CATALOG_PROFILE', 'BUNDLE_MEMBERSHIP', 'BUNDLE_SIZE', 'ARTIFACT_INTEGRITY']);
    throw new Error(known.has(error?.message) ? error.message : 'BUNDLE_UNAVAILABLE');
  }
}

function transportError(code, scope) {
  return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: { kind: 'TRANSPORT_ERROR', code }, scope }) }] };
}

export async function createEvidenceServer({ profile = 'cheshire', bundleDir } = {}) {
  const selected = resolveProfile(profile);
  const { catalogBytes, files } = await loadBundle(bundleDir === undefined ? selected.bundleDir : bundleDir, selected);
  const argumentSchema = z.object({ schemaVersion: z.literal(SCHEMA_VERSION), catalogId: z.literal(selected.catalogId), evidenceId: z.enum(selected.evidenceIds), chunkIndex: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict();
  const outputProperties = outputPropertiesFor(selected);
  const readerError = code => transportError(code, selected.scope);
  const server = new Server(SERVER_INFO, { capabilities: { resources: {}, tools: {} }, instructions: selected.description });
  server.setRequestHandler(ListResourcesRequestSchema, () => ({ resources: [{ uri: selected.catalogUri, name: selected.resourceName, description: selected.description, mimeType: 'application/json' }] }));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, () => ({ resourceTemplates: [] }));
  server.setRequestHandler(ReadResourceRequestSchema, request => {
    if (request.params.uri !== selected.catalogUri) throw new McpError(ErrorCode.InvalidParams, 'UNKNOWN_CATALOG_RESOURCE');
    return { contents: [{ uri: selected.catalogUri, mimeType: 'application/json', text: catalogBytes.toString('utf8') }] };
  });
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [{
    name: selected.toolName, description: selected.description,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: { type: 'object', properties: { schemaVersion: { type: 'string', const: SCHEMA_VERSION }, catalogId: { type: 'string', const: selected.catalogId }, evidenceId: { type: 'string', enum: [...selected.evidenceIds] }, chunkIndex: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER } }, required: ['schemaVersion', 'catalogId', 'evidenceId', 'chunkIndex'], additionalProperties: false },
    outputSchema: { type: 'object', properties: outputProperties, required: Object.keys(outputProperties), additionalProperties: false }
  }] }));
  server.setRequestHandler(retainedReadRequestSchema, request => {
    if (request.params.name !== selected.toolName) return readerError('UNKNOWN_TOOL');
    if (Object.hasOwn(request.params, 'task')) return readerError('UNSUPPORTED_TASK');
    const args = request.params.arguments;
    if (Buffer.byteLength(JSON.stringify(args) ?? '') > LIMITS.argumentBytes) return readerError('ARGUMENT_LIMIT');
    const checked = argumentSchema.safeParse(args);
    if (!checked.success) return readerError('INVALID_ARGUMENTS');
    const { evidenceId, chunkIndex } = checked.data;
    const { member, bytes } = files.get(evidenceId);
    if (chunkIndex >= member.chunkCount) return readerError('CHUNK_UNAVAILABLE');
    const chunk = bytes.subarray(chunkIndex * LIMITS.chunkBytes, Math.min(bytes.length, (chunkIndex + 1) * LIMITS.chunkBytes));
    const result = {
      schemaVersion: SCHEMA_VERSION, catalogId: selected.catalogId, catalogSha256: selected.expectedCatalogSha256,
      evidenceId, encoding: member.encoding, artifactBytes: bytes.length, artifactSha256: member.sha256,
      chunkIndex, chunkCount: member.chunkCount, chunkBytes: chunk.length, chunkSha256: sha256(chunk),
      dataBase64: chunk.toString('base64'), scope: selected.scope
    };
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  });
  return server;
}

async function main() {
  const { profile, args } = parseProfilePrefix(process.argv.slice(2));
  if (args.some(arg => arg === '--profile' || arg.startsWith('--profile='))) throw new Error('INVALID_LAUNCH_ARGUMENTS');
  if (args.length && (args.length !== 2 || args[0] !== '--bundle-dir' || !args[1])) throw new Error('INVALID_LAUNCH_ARGUMENTS');
  const server = await createEvidenceServer(args.length ? { profile, bundleDir: args[1] } : { profile });
  const transport = new BoundedStdioTransport();
  transport.onerror = () => { process.exitCode = 1; };
  server.onerror = () => {
    process.exitCode = 1;
    if (!transport.closed) transport.fail('MCP_TRANSPORT_FAILURE');
  };
  await server.connect(transport);
  await transport.done;
  if (transport.failureCode) process.stderr.write(`${transport.failureCode}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { process.stderr.write('RETAINED_EVIDENCE_STARTUP_FAILED\n'); process.exitCode = 1; });
}
