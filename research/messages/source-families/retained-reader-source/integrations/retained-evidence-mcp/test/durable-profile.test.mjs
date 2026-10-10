import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';
import { createEvidenceServer } from '../src/server.mjs';
import { openEvidenceClient } from '../src/client.mjs';
import { readEvidenceView } from '../src/view.mjs';
import { resolveProfile, SCHEMA_VERSION, PROTOCOL_VERSION, LIMITS, EXPECTED_CATALOG_SHA256 } from '../src/profile.mjs';

const NAME = 'durable-security';
const NAMES = ['cheshire', 'security', NAME];
const PIN = 'ae5d8b2a8419432ded3f08167f43ff6b3a059aee272d7cb1a333fee87ab1a1d5';
const ORIGINAL_IDS = ['domain', 'scenario', 'history', 'receipt', 'receiptVerification', 'cases', 'queries',
  'admissionObservations', 'graph', 'durabilityObservations', 'administrativeEvents', 'reopenedHistory', 'reopenedHead'];
const QUERY_KEYS = ['responsible', 'staleSession', 'successorAllowed', 'successorOutsideScope', 'survives', 'why', 'whyAtEvaluation'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const serverPath = fileURLToPath(new URL('../src/server.mjs', import.meta.url));
const clientPath = fileURLToPath(new URL('../src/client.mjs', import.meta.url));
const viewPath = fileURLToPath(new URL('../src/view.mjs', import.meta.url));
const args = (profile, evidenceId = 'graph', chunkIndex = 0) => ({ schemaVersion: SCHEMA_VERSION, catalogId: profile.catalogId, evidenceId, chunkIndex });
const rpc = (id, method, params) => ({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
const initialize = rpc(0, 'initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'durable-profile-check', version: '1' } });
const frame = message => JSON.stringify(message) + '\n';
const cli = (source, argv, input) => spawnSync(process.execPath, [source, ...argv], {
  input, encoding: 'utf8', timeout: 20_000, maxBuffer: 4 * 1024 * 1024,
});
const fixturePromises = new Map();
function fixture(name = NAME) {
  if (!fixturePromises.has(name)) fixturePromises.set(name, (async () => {
    const profile = resolveProfile(name), text = await readFile(join(profile.bundleDir, 'catalog.json'), 'utf8');
    const catalog = JSON.parse(text);
    const bytes = new Map(await Promise.all(catalog.members.map(async member => [member.evidenceId, await readFile(join(profile.bundleDir, member.fileName))])));
    return { profile, text, catalog, bytes };
  })());
  return fixturePromises.get(name);
}
function durableScope(scope) {
  for (const key of ['publicObservation', 'publicFinality', 'checkpoint']) assert.equal(Object.hasOwn(scope, key), false);
  assert.equal(scope.kind, 'RETAINED_EVIDENCE');
  assert.equal(scope.evidenceClass, 'LOCAL_SYNTHETIC_DURABLE_CASE');
  assert.equal(scope.localFinality, 'LOCAL_ONLY'); assert.equal(scope.coreExecution, 'SIMULATED');
  assert.equal(scope.roleDuty, 'OUTCOME_UNKNOWN'); assert.equal(scope.realCollectionPerformed, false);
  for (const key of ['newEvaluation', 'newChainObservation', 'readerGrantsCurrentAuthority']) assert.equal(scope[key], false);
}
async function connected(name) {
  const server = await createEvidenceServer({ profile: name });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'durable-profile-check', version: '1' });
  await server.connect(serverTransport); await client.connect(clientTransport);
  return { client, close: async () => { await client.close(); await server.close(); } };
}
function observedStdio() {
  const inner = new StdioClientTransport({ command: process.execPath, args: [serverPath, '--profile', NAME],
    stderr: 'ignore', maxBufferSize: LIMITS.responseBytes });
  const requests = [], messages = [];
  const transport = {
    async start() {
      inner.onmessage = message => { messages.push(structuredClone(message)); transport.onmessage?.(message); };
      inner.onerror = error => transport.onerror?.(error); inner.onclose = () => transport.onclose?.();
      await inner.start();
    },
    send(message) { requests.push(structuredClone(message)); return inner.send(message); },
    close: () => inner.close(), setProtocolVersion: version => inner.setProtocolVersion?.(version),
  };
  return { transport, requests, messages };
}
// A bounded data-only peer for selected client refusal branches, not an evaluator.
function peer(f, mutate = () => {}) {
  let closed = false;
  const requests = [];
  return {
    requests, async start() {}, async close() { if (!closed) { closed = true; this.onclose?.(); } },
    async send(request) {
      requests.push(structuredClone(request)); if (request.id === undefined) return;
      let result;
      if (request.method === 'initialize') result = { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {}, resources: {} }, serverInfo: { name: 'fixed-data-peer', version: '1' } };
      else if (request.method === 'resources/read') result = { contents: [{ uri: f.profile.catalogUri, mimeType: 'application/json', text: f.text }] };
      else if (request.method === 'tools/call') {
        const { evidenceId, chunkIndex } = request.params.arguments;
        const member = f.catalog.members.find(item => item.evidenceId === evidenceId);
        const segment = f.bytes.get(evidenceId).subarray(chunkIndex * LIMITS.chunkBytes, (chunkIndex + 1) * LIMITS.chunkBytes);
        const value = { schemaVersion: SCHEMA_VERSION, catalogId: f.profile.catalogId, catalogSha256: f.profile.expectedCatalogSha256,
          evidenceId, encoding: member.encoding, artifactBytes: member.bytes, artifactSha256: member.sha256,
          chunkIndex, chunkCount: member.chunkCount, chunkBytes: segment.length, chunkSha256: hash(segment), dataBase64: segment.toString('base64'), scope: f.profile.scope };
        result = { structuredContent: value, content: [{ type: 'text', text: JSON.stringify(value) }] };
      } else throw new Error('Unexpected fixture request');
      const message = { jsonrpc: '2.0', id: request.id, result };
      mutate(message, request);
      const received = JSONRPCMessageSchema.parse(JSON.parse(JSON.stringify(message)));
      queueMicrotask(() => { if (!closed) this.onmessage?.(received); });
    },
  };
}

test('durable catalog preserves 13 original identities, seven complete extracts and separate original-run/correction provenance', async () => {
  const f = await fixture(), { profile, catalog } = f;
  assert.equal(hash(Buffer.from(f.text)), PIN); assert.equal(profile.expectedCatalogSha256, PIN);
  assert.equal(Buffer.byteLength(f.text), 15311);
  assert.equal(profile.catalogId, 'durable-security-retained-2026-09-11-r1');
  assert.equal(profile.catalogUri, 'continuity://durable-security/catalog');
  assert.equal(profile.toolName, 'durable-security.read'); assert.equal(profile.resourceName, 'durable-security.catalog');
  assert.deepEqual(profile.selectedCounts, { unchangedOriginals: 13, completeDerivedQueryMembers: 7 });
  assert.deepEqual(profile.evidenceIds, [...ORIGINAL_IDS, ...QUERY_KEYS.map(key => `query.${key}`)]);
  assert.deepEqual(catalog.members.map(x => x.evidenceId), profile.evidenceIds);
  assert.deepEqual(catalog.scope, profile.scope); durableScope(catalog.scope);
  for (const value of [profile, profile.scope, profile.evidenceIds, profile.presentation, profile.selectedCounts]) assert.equal(Object.isFrozen(value), true);
  const source = JSON.parse(await readFile(new URL('../sources/durable-case-provenance.json', import.meta.url), 'utf8'));
  assert.equal(source.catalogSha256, PIN);
  assert.equal(source.originalArtifacts, 13); assert.equal(source.completeDerivedMembers, 7);
  assert.equal(source.recoveryRecord.status, 'EXECUTED_VERIFIED_NOT_ACCEPTED');
  assert.equal(source.rootDisposition.status, 'PROVISIONALLY_ACCEPTED');
  assert.equal(catalog.provenance.rootDispositionSha256, source.rootDisposition.sha256);
  assert.match(catalog.provenance.sourceQualifier, /Original runner.*later entry-accounting.*no whole-story rerun/);
  assert.match(catalog.provenance.sourceCorrection, /DSR-P2-01 CLOSED/);
  const originals = catalog.members.filter(x => x.provenance.kind === 'UNCHANGED_RETAINED_ARTIFACT');
  assert.deepEqual(originals.map(x => x.evidenceId), ORIGINAL_IDS);
  assert.equal(source.recoveryRecord.members.length, 13);
  for (const member of originals) {
    const original = source.recoveryRecord.members.find(x => x.path === member.fileName);
    assert.ok(original); assert.equal(member.bytes, original.bytes); assert.equal(member.sha256, original.sha256);
    assert.equal(f.bytes.get(member.evidenceId).length, original.bytes); assert.equal(hash(f.bytes.get(member.evidenceId)), original.sha256);
  }
  const parent = f.bytes.get('queries'), parsed = JSON.parse(parent);
  assert.equal(parent.toString('utf8'), JSON.stringify(parsed) + '\n');
  const extracts = catalog.members.filter(x => x.provenance.kind === 'COMPLETE_CANONICAL_MEMBER_EXTRACT');
  assert.equal(extracts.length, 7);
  for (const member of extracts) {
    assert.equal(member.provenance.parentEvidenceId, 'queries'); assert.equal(member.provenance.parentSha256, hash(parent));
    assert.equal(member.evidenceId, `query.${member.provenance.memberKey}`);
    assert.equal(f.bytes.get(member.evidenceId).toString('utf8'), JSON.stringify(parsed[member.provenance.memberKey]) + '\n');
  }
  assert.equal(EXPECTED_CATALOG_SHA256, '6d607541ae3320dee8856362f7c374064df136467ece990e06cb1628062ef55d');
  assert.equal(resolveProfile(), resolveProfile('cheshire')); assert.equal(resolveProfile().expectedCatalogSha256, EXPECTED_CATALOG_SHA256);
  assert.deepEqual(LIMITS, { chunkBytes: 8192, inputFrameBytes: 16384, argumentBytes: 1024, responseBytes: 49152,
    catalogBytes: 32768, artifactBytes: 8388608, selectedBytes: 16777216, sessionRequests: 8192, sessionOutputBytes: 134217728 });
});

test('actual stdio reader reassembles all 20 selected artifacts in 74 bounded chunks and preserves complete query parents', async () => {
  const f = await fixture(), observed = observedStdio();
  const reader = await openEvidenceClient({ profile: NAME, transport: observed.transport });
  try {
    const received = new Map();
    for (const member of f.catalog.members) {
      const bytes = await reader.readEvidence(member.evidenceId);
      assert.deepEqual(bytes, f.bytes.get(member.evidenceId)); assert.equal(hash(bytes), member.sha256);
      received.set(member.evidenceId, bytes);
    }
    assert.equal(received.size, 20); assert.equal([...received.values()].reduce((sum, b) => sum + b.length, 0), 503569);
    const toolCalls = observed.requests.filter(x => x.method === 'tools/call'); assert.equal(toolCalls.length, 74);
    for (const request of toolCalls) {
      assert.equal(request.params.name, f.profile.toolName);
      assert.deepEqual(Object.keys(request.params.arguments).sort(), ['schemaVersion', 'catalogId', 'evidenceId', 'chunkIndex'].sort());
    }
    assert.ok(observed.requests.every(x => Buffer.byteLength(frame(x)) <= LIMITS.inputFrameBytes));
    assert.ok(observed.messages.every(x => Buffer.byteLength(frame(x)) <= LIMITS.responseBytes));
    const segments = observed.messages.filter(x => x.result?.structuredContent).map(x => x.result);
    assert.equal(segments.length, 74);
    for (const segment of segments) {
      assert.equal(Object.keys(segment.structuredContent).length, 13);
      assert.deepEqual(segment.structuredContent, JSON.parse(segment.content[0].text));
      assert.deepEqual(segment.structuredContent.scope, f.profile.scope);
      assert.ok(segment.structuredContent.chunkBytes <= LIMITS.chunkBytes);
    }
    const parent = JSON.parse(received.get('queries'));
    for (const key of QUERY_KEYS) assert.equal(received.get(`query.${key}`).toString('utf8'), JSON.stringify(parent[key]) + '\n');
    assert.deepEqual(received.get('history'), received.get('reopenedHistory'));
  } finally { await reader.close(); }
});

test('three instances isolate fixed catalog/schema discovery and interleaved graph reads, rejecting cross-profile requests', async () => {
  const profiles = NAMES.map(resolveProfile), peers = await Promise.all(NAMES.map(connected));
  try {
    const graphHashes = new Set();
    for (let i = 0; i < peers.length; i++) {
      const { client } = peers[i], p = profiles[i];
      assert.deepEqual((await client.listResources()).resources.map(x => [x.uri, x.name]), [[p.catalogUri, p.resourceName]]);
      assert.deepEqual(await client.listResourceTemplates(), { resourceTemplates: [] });
      const tools = (await client.listTools()).tools;
      assert.equal(tools.length, 1); assert.equal(tools[0].name, p.toolName);
      assert.equal(tools[0].inputSchema.additionalProperties, false); assert.equal(tools[0].inputSchema.required.length, 4);
      assert.equal(tools[0].outputSchema.additionalProperties, false); assert.equal(tools[0].outputSchema.required.length, 13);
      assert.equal(tools[0].inputSchema.properties.catalogId.const, p.catalogId);
      assert.deepEqual(tools[0].inputSchema.properties.evidenceId.enum, p.evidenceIds);
      const resource = (await client.readResource({ uri: p.catalogUri })).contents[0];
      assert.equal(hash(Buffer.from(resource.text)), p.expectedCatalogSha256);
      for (const other of profiles.filter(x => x.name !== p.name)) {
        await assert.rejects(client.readResource({ uri: other.catalogUri }), /UNKNOWN_CATALOG_RESOURCE/);
        for (const [request, code] of [
          [{ name: other.toolName, arguments: args(p) }, 'UNKNOWN_TOOL'],
          [{ name: p.toolName, arguments: { ...args(p), catalogId: other.catalogId } }, 'INVALID_ARGUMENTS'],
          [{ name: p.toolName, arguments: { ...args(p), profile: other.name } }, 'INVALID_ARGUMENTS'],
        ]) {
          const refused = await client.callTool(request); assert.equal(refused.isError, true);
          const error = JSON.parse(refused.content[0].text); assert.equal(error.error.code, code); assert.deepEqual(error.scope, p.scope);
        }
      }
      if (p.name !== NAME) {
        const refused = await client.callTool({ name: p.toolName, arguments: args(p, 'durabilityObservations') });
        assert.equal(refused.isError, true);
      }
    }
    const reads = await Promise.all([...profiles, ...profiles].map((p, i) => peers[i % 3].client.callTool({ name: p.toolName, arguments: args(p) })));
    for (let i = 0; i < reads.length; i++) {
      const p = profiles[i % 3], actual = reads[i].structuredContent;
      const member = (await fixture(p.name)).catalog.members.find(x => x.evidenceId === 'graph');
      assert.equal(actual.catalogId, p.catalogId); assert.equal(actual.artifactSha256, member.sha256); assert.deepEqual(actual.scope, p.scope);
      graphHashes.add(actual.artifactSha256);
    }
    assert.equal(graphHashes.size, 3);
  } finally { await Promise.all(peers.map(p => p.close())); }
});

test('durable clients reject old catalogs and inherited old scopes before releasing evidence', async () => {
  const durable = await fixture();
  for (const other of ['cheshire', 'security']) {
    for (const [selected, serving] of [[NAME, other], [other, NAME]]) {
      const transport = peer(await fixture(serving));
      await assert.rejects(openEvidenceClient({ profile: selected, transport }), /catalog resource identity|pin mismatch/);
      assert.equal(transport.requests.filter(x => x.method === 'tools/call').length, 0);
    }
    const reader = await openEvidenceClient({ profile: NAME, transport: peer(durable, (message, request) => {
      if (request.method !== 'tools/call') return;
      message.result.structuredContent.scope = resolveProfile(other).scope;
      message.result.content[0].text = JSON.stringify(message.result.structuredContent);
    }) });
    try { await assert.rejects(reader.readEvidence('domain'), /scope mismatch/); } finally { await reader.close(); }
  }
  const raw = await openEvidenceClient({ profile: NAME, transport: peer(durable, (message, request) => {
    if (request.method === 'tools/call') Object.defineProperty(message.result.structuredContent, '__proto__', { value: {}, enumerable: true });
  }) });
  try { await assert.rejects(raw.readEvidence('domain'), /segment fields/); } finally { await raw.close(); }
});

test('fixed durable launch selection and actual stdio raw-key/argument bounds reject malformed input without fallback', async () => {
  const p = resolveProfile(NAME);
  for (const invalid of ['Durable-security', 'durable', '', null, {}, p]) {
    assert.throws(() => resolveProfile(invalid), /UNKNOWN_PROFILE/);
    await assert.rejects(openEvidenceClient({ profile: invalid, transport: peer(await fixture()) }), /UNKNOWN_PROFILE/);
  }
  for (const argv of [['--profile'], ['--profile', 'durable'], ['--profile=durable-security'],
    ['--profile', NAME, '--profile', 'security'], ['--bundle-dir', p.bundleDir, '--profile', NAME]]) {
    const result = cli(serverPath, argv, frame(initialize)); assert.equal(result.status, 1, JSON.stringify(argv));
    assert.equal(result.stdout, ''); assert.equal(result.stderr.trim(), 'RETAINED_EVIDENCE_STARTUP_FAILED');
  }
  for (const source of [clientPath, viewPath]) {
    const result = cli(source, ['--profile', NAME, '--profile', 'security']);
    assert.equal(result.status, 1); assert.equal(result.stdout, '');
  }
  const frames = [frame(initialize)];
  for (const [i, padding] of [1, LIMITS.argumentBytes * 2].entries()) {
    const input = JSON.parse(JSON.stringify(args(p)).slice(0, -1) + ',"__proto__":' + JSON.stringify('x'.repeat(padding)) + '}');
    frames.push(frame(rpc(i + 1, 'tools/call', { name: p.toolName, arguments: input })));
  }
  frames.push(frame(rpc(3, 'tools/call', { name: p.toolName, arguments: args(p) })));
  const result = cli(serverPath, ['--profile', NAME], frames.join(''));
  assert.equal(result.status, 0, result.stderr); assert.equal(result.stderr, '');
  const lines = result.stdout.trim().split('\n'); assert.ok(lines.every(line => Buffer.byteLength(line + '\n') <= LIMITS.responseBytes));
  const messages = lines.map(JSON.parse); assert.equal(messages.length, 4);
  assert.equal(JSON.parse(messages[1].result.content[0].text).error.code, 'INVALID_ARGUMENTS');
  assert.equal(JSON.parse(messages[2].result.content[0].text).error.code, 'ARGUMENT_LIMIT');
  assert.equal(messages[3].result.structuredContent.catalogId, p.catalogId);
  durableScope(messages[3].result.structuredContent.scope);
});

test('durable CLI summary distinguishes 13 originals from seven extracts and views preserve provenance and map markers', async () => {
  const f = await fixture();
  const result = cli(clientPath, ['--profile', NAME, 'verify-all']);
  assert.equal(result.status, 0, result.stderr); assert.equal(result.stderr, '');
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.status, 'VERIFIED_SELECTED_BYTES'); assert.equal(summary.catalogId, f.profile.catalogId);
  assert.equal(summary.catalogSha256, PIN); assert.equal(summary.artifacts, 20); assert.equal(summary.bytes, 503569); assert.equal(summary.chunks, 74);
  assert.equal(summary.unchangedOriginals, 13); assert.equal(summary.completeDerivedQueryMembers, 7); durableScope(summary.scope);
  for (const id of ['graph', 'query.survives', 'durabilityObservations']) {
    const view = await readEvidenceView(id, { profile: NAME }), member = f.catalog.members.find(x => x.evidenceId === id);
    assert.equal(view.viewKind, 'DERIVED_TYPED_VIEW'); assert.equal(view.catalogId, f.profile.catalogId); assert.equal(view.catalogSha256, PIN);
    assert.equal(view.originalSha256, member.sha256); assert.equal(view.originalBytes, member.bytes);
    assert.deepEqual(JSON.parse(JSON.stringify(view.data)), JSON.parse(f.bytes.get(id)));
    assert.deepEqual(view.provenance, member.provenance); assert.equal(view.encoding, member.encoding); durableScope(view.scope);
    if (id === 'graph') assert.ok(JSON.stringify(view.data).includes('$securityCase.map'));
    if (id === 'query.survives') {
      assert.equal(view.provenance.kind, 'COMPLETE_CANONICAL_MEMBER_EXTRACT'); assert.equal(view.provenance.memberKey, 'survives');
    }
  }
});
