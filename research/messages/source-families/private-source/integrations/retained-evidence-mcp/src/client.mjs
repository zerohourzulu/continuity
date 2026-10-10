import { humanEvidenceCommandError } from './human-error.mjs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  SCHEMA_VERSION, PROTOCOL_VERSION, LIMITS, resolveProfile, parseProfilePrefix,
} from './profile.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(`Evidence retrieval failed: ${message}`); };
const RESPONSE_KEYS = ['schemaVersion', 'catalogId', 'catalogSha256', 'evidenceId', 'encoding', 'artifactBytes', 'artifactSha256', 'chunkIndex', 'chunkCount', 'chunkBytes', 'chunkSha256', 'dataBase64', 'scope'].sort();
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

// Enforce our negotiated profile and full response envelope before SDK result parsing.
// The server remains a trusted local process; this is not a hostile-process sandbox.
function guardedTransport(inner) {
  const toolRequests = new Set();
  const transport = {
    start: () => {
      inner.onmessage = message => {
        if (Buffer.byteLength(JSON.stringify(message) + '\n') > LIMITS.responseBytes) {
          transport.onerror?.(new Error('Evidence response exceeds frame limit'));
          void transport.close();
          return;
        }
        if (toolRequests.has(message.id) && ('result' in message || 'error' in message)) {
          toolRequests.delete(message.id);
          if ('result' in message && message.result?.isError !== true) {
            try {
              // JSONRPCMessageSchema retains this nested value. CallToolResultSchema
              // later removes own __proto__ keys from structuredContent, so validate
              // the original shape and text here, before that lossy parsing step.
              validateRepresentations(message.result);
            } catch (error) {
              // Reject the pending SDK request with our local validation failure;
              // never forward a normalized version of the invalid peer result.
              transport.onmessage?.({ jsonrpc: '2.0', id: message.id,
                error: { code: -32603, message: error.message } });
              return;
            }
          }
        }
        transport.onmessage?.(message);
      };
      inner.onerror = error => transport.onerror?.(error);
      inner.onclose = () => transport.onclose?.();
      return inner.start();
    },
    send: message => {
      if (message.method === 'tools/call' && message.id !== undefined) toolRequests.add(message.id);
      return inner.send(message);
    },
    close: () => { toolRequests.clear(); return inner.close(); },
    setProtocolVersion: version => {
      assert(version === PROTOCOL_VERSION, 'unsupported negotiated protocol');
      inner.setProtocolVersion?.(version);
    },
  };
  return transport;
}

function validateCatalog(result, profile) {
  assert(result.contents?.length === 1, 'catalog must contain one complete resource');
  const resource = result.contents[0];
  assert(resource.uri === profile.catalogUri && resource.mimeType === 'application/json', 'catalog resource identity');
  assert(typeof resource.text === 'string' && resource.blob === undefined, 'catalog must be original UTF-8 text');
  const bytes = Buffer.from(resource.text, 'utf8');
  assert(bytes.length <= LIMITS.catalogBytes, 'catalog size');
  assert(digest(bytes) === profile.expectedCatalogSha256, 'catalog trusted pin mismatch');
  const catalog = JSON.parse(resource.text);
  assert(catalog.schemaVersion === SCHEMA_VERSION && catalog.catalogId === profile.catalogId && catalog.resourceUri === profile.catalogUri, 'catalog profile');
  assert(catalog.chunkBytes === LIMITS.chunkBytes && isDeepStrictEqual(catalog.scope, profile.scope), 'catalog scope or chunk size');
  assert(isDeepStrictEqual(catalog.members.map(member => member.evidenceId), profile.evidenceIds), 'catalog membership or ordering');
  let total = 0;
  for (const member of catalog.members) {
    assert(Number.isSafeInteger(member.bytes) && member.bytes > 0 && member.bytes <= LIMITS.artifactBytes, 'artifact byte limit');
    assert(member.chunkCount === Math.ceil(member.bytes / LIMITS.chunkBytes), 'catalog chunk count');
    assert(typeof member.sha256 === 'string' && /^[a-f0-9]{64}$/.test(member.sha256), 'catalog artifact hash');
    total += member.bytes;
  }
  assert(total <= LIMITS.selectedBytes, 'selection byte limit');
  return freeze(catalog);
}

function validateRepresentations(result) {
  const value = result?.structuredContent;
  assert(value && typeof value === 'object' && !Array.isArray(value), 'missing structured segment');
  assert(isDeepStrictEqual(Object.keys(value).sort(), RESPONSE_KEYS), 'segment fields');
  assert(result.content?.length === 1 && result.content[0].type === 'text', 'segment text representation');
  assert(result.content[0].text === JSON.stringify(value), 'structured/text disagreement or truncated text');
  return value;
}

function validateChunk(result, member, index, profile) {
  assert(result.isError !== true, 'server reported an unavailable or invalid evidence request');
  const value = validateRepresentations(result);
  const expected = {
    schemaVersion: SCHEMA_VERSION, catalogId: profile.catalogId, catalogSha256: profile.expectedCatalogSha256,
    evidenceId: member.evidenceId, encoding: member.encoding, artifactBytes: member.bytes,
    artifactSha256: member.sha256, chunkIndex: index, chunkCount: member.chunkCount,
    chunkBytes: Math.min(LIMITS.chunkBytes, member.bytes - index * LIMITS.chunkBytes), scope: profile.scope,
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    assert(isDeepStrictEqual(value[key], expectedValue), `segment ${key} mismatch`);
  }
  assert(typeof value.chunkSha256 === 'string' && /^[a-f0-9]{64}$/.test(value.chunkSha256), 'segment hash encoding');
  assert(typeof value.dataBase64 === 'string' && value.dataBase64.length === 4 * Math.ceil(expected.chunkBytes / 3), 'base64 length');
  const bytes = Buffer.from(value.dataBase64, 'base64');
  assert(bytes.toString('base64') === value.dataBase64, 'noncanonical base64');
  assert(bytes.length === expected.chunkBytes, 'segment byte length');
  assert(digest(bytes) === value.chunkSha256, 'segment hash mismatch');
  return bytes;
}

/** Open only the sibling local server, or an explicitly supplied trusted test transport.
 * readEvidence returns original bytes only after complete verification; catalog is immutable.
 */
export async function openEvidenceClient(options = {}) {
  assert(options && typeof options === 'object' && !Array.isArray(options), 'client options');
  assert(Object.keys(options).every(key => ['profile', 'transport', 'bundleDir'].includes(key)), 'unknown client option');
  const profile = resolveProfile(options.profile);
  assert(!(options.transport && options.bundleDir), 'choose transport or bundle directory');
  if (options.bundleDir !== undefined) assert(typeof options.bundleDir === 'string' && options.bundleDir.length > 0, 'bundle directory');
  const args = [fileURLToPath(new URL('./server.mjs', import.meta.url))];
  if (profile.name !== 'cheshire') args.push('--profile', profile.name);
  if (options.bundleDir) args.push('--bundle-dir', options.bundleDir);
  const transport = guardedTransport(options.transport ?? new StdioClientTransport({
    command: process.execPath, args, stderr: 'inherit', maxBufferSize: LIMITS.responseBytes,
  }));
  const client = new Client({ name: 'continuity-evidence-reader', version: '0.2.0-dev.1' }, { capabilities: {} });
  let closed = false;
  const close = async () => { if (!closed) { closed = true; await client.close(); } };
  try {
    await client.connect(transport);
    const catalog = validateCatalog(await client.readResource({ uri: profile.catalogUri }), profile);
    const members = new Map(catalog.members.map(member => [member.evidenceId, member]));
    // Serialize complete reads so callers cannot accidentally flood this finite local session.
    let pending = Promise.resolve();
    const readEvidence = evidenceId => {
      const run = pending.then(async () => {
        assert(!closed, 'client is closed');
        assert(typeof evidenceId === 'string' && members.has(evidenceId), 'unknown evidence ID');
        const member = members.get(evidenceId);
        const chunks = [];
        for (let index = 0; index < member.chunkCount; index++) {
          const result = await client.callTool({ name: profile.toolName, arguments: {
            schemaVersion: SCHEMA_VERSION, catalogId: profile.catalogId, evidenceId, chunkIndex: index,
          } });
          chunks.push(validateChunk(result, member, index, profile));
        }
        const original = Buffer.concat(chunks);
        assert(original.length === member.bytes && digest(original) === member.sha256, 'complete original length/hash mismatch');
        return original;
      });
      pending = run.catch(() => {});
      return run;
    };
    return { client, catalog, readEvidence, close };
  } catch (error) {
    await close().catch(() => {});
    throw error;
  }
}

async function main(argv) {
  const parsed = parseProfilePrefix(argv);
  const profile = resolveProfile(parsed.profile);
  const [command, evidenceId, ...extra] = parsed.args;
  assert(extra.length === 0 && ['catalog', 'read', 'verify-all'].includes(command) &&
    (command === 'read' ? profile.evidenceIds.includes(evidenceId) : evidenceId === undefined),
  'usage: node src/client.mjs [--profile cheshire|security|durable-security|core02-packet|core02-simulated] catalog | read <evidenceId> | verify-all');
  const reader = await openEvidenceClient({ profile: profile.name });
  try {
    if (command === 'catalog') {
      // A labeled metadata view, not a substitute for the pinned resource bytes.
      process.stdout.write(JSON.stringify({ catalogSha256: profile.expectedCatalogSha256, catalog: reader.catalog }, null, 2) + '\n');
    } else if (command === 'read') {
      process.stdout.write(await reader.readEvidence(evidenceId));
    } else {
      let bytes = 0;
      for (const id of profile.evidenceIds) bytes += (await reader.readEvidence(id)).length;
      const summary = { status: profile.name === 'cheshire' ? 'VERIFIED_ORIGINAL_BYTES' : 'VERIFIED_SELECTED_BYTES', catalogId: profile.catalogId,
        catalogSha256: profile.expectedCatalogSha256, artifacts: profile.evidenceIds.length, bytes,
        chunks: reader.catalog.members.reduce((n, member) => n + member.chunkCount, 0), scope: profile.scope };
      if (profile.selectedCounts !== undefined) Object.assign(summary, profile.selectedCounts);
      process.stdout.write(JSON.stringify(summary) + '\n');
    }
  } finally { await reader.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(humanEvidenceCommandError(error) + '\n');
    process.exitCode = 1;
  });
}
