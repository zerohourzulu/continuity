import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';
import { openEvidenceClient } from '../src/client.mjs';
import { readEvidenceView } from '../src/view.mjs';
import { resolveProfile, PROTOCOL_VERSION, SCHEMA_VERSION, LIMITS } from '../src/profile.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fixtures = new Map();
for (const name of ['cheshire', 'security']) {
  const profile = resolveProfile(name);
  const text = await readFile(join(profile.bundleDir, 'catalog.json'), 'utf8');
  const catalog = JSON.parse(text);
  const bytes = new Map(await Promise.all(catalog.members.map(async member =>
    [member.evidenceId, await readFile(join(profile.bundleDir, member.fileName))])));
  fixtures.set(name, { profile, text, catalog, bytes });
}

function peer(name, mutate = () => {}) {
  const fixture = fixtures.get(name);
  const { profile } = fixture;
  let closed = false;
  const requests = [];
  return {
    requests,
    async start() {},
    async close() { if (!closed) { closed = true; this.onclose?.(); } },
    async send(request) {
      requests.push(structuredClone(request));
      if (request.id === undefined) return;
      let result;
      if (request.method === 'initialize') {
        result = { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {}, resources: {} }, serverInfo: { name: 'profile-fixture', version: '1' } };
      } else if (request.method === 'resources/read') {
        result = { contents: [{ uri: profile.catalogUri, mimeType: 'application/json', text: fixture.text }] };
      } else if (request.method === 'tools/call') {
        assert.equal(request.params.name, profile.toolName);
        assert.deepEqual(Object.keys(request.params.arguments).sort(), ['schemaVersion', 'catalogId', 'evidenceId', 'chunkIndex'].sort());
        assert.equal(request.params.arguments.catalogId, profile.catalogId);
        const { evidenceId, chunkIndex } = request.params.arguments;
        const member = fixture.catalog.members.find(item => item.evidenceId === evidenceId);
        const segment = fixture.bytes.get(evidenceId).subarray(chunkIndex * LIMITS.chunkBytes, (chunkIndex + 1) * LIMITS.chunkBytes);
        const value = { schemaVersion: SCHEMA_VERSION, catalogId: profile.catalogId, catalogSha256: profile.expectedCatalogSha256,
          evidenceId, encoding: member.encoding, artifactBytes: member.bytes, artifactSha256: member.sha256,
          chunkIndex, chunkCount: member.chunkCount, chunkBytes: segment.length, chunkSha256: hash(segment), dataBase64: segment.toString('base64'), scope: profile.scope };
        result = { structuredContent: value, content: [{ type: 'text', text: JSON.stringify(value) }] };
      } else throw new Error('Unexpected fixture method');
      const message = { jsonrpc: '2.0', id: request.id, result };
      mutate(message, request);
      const received = JSONRPCMessageSchema.parse(JSON.parse(JSON.stringify(message)));
      queueMicrotask(() => { if (!closed) this.onmessage?.(received); });
    },
  };
}

test('security retrieves all 16 selected artifacts and preserves seven complete parent members', async () => {
  const fixture = fixtures.get('security');
  const transport = peer('security');
  const reader = await openEvidenceClient({ profile: 'security', transport });
  try {
    const received = new Map();
    for (const member of fixture.catalog.members) {
      const bytes = await reader.readEvidence(member.evidenceId);
      assert.deepEqual(bytes, fixture.bytes.get(member.evidenceId));
      received.set(member.evidenceId, bytes);
    }
    assert.equal([...received.values()].reduce((sum, bytes) => sum + bytes.length, 0), 342_919);
    assert.equal(transport.requests.filter(request => request.method === 'tools/call').length, 51);
    const parent = received.get('queries');
    const parsed = JSON.parse(parent.toString('utf8'));
    const extracts = fixture.catalog.members.filter(member => member.provenance.kind === 'COMPLETE_CANONICAL_MEMBER_EXTRACT');
    assert.equal(extracts.length, 7);
    for (const member of extracts) {
      assert.equal(member.provenance.parentEvidenceId, 'queries');
      assert.equal(member.provenance.parentSha256, hash(parent));
      assert.deepEqual(JSON.parse(received.get(member.evidenceId)), parsed[member.provenance.memberKey]);
      assert.equal(received.get(member.evidenceId).toString('utf8'), JSON.stringify(parsed[member.provenance.memberKey]) + '\n');
    }
    assert.equal(Object.hasOwn(reader.catalog.scope, 'publicObservation'), false);
    assert.equal(Object.hasOwn(reader.catalog.scope, 'checkpoint'), false);
  } finally { await reader.close(); }
});

test('profile mismatches fail before evidence requests', async () => {
  for (const [selected, serving] of [['cheshire', 'security'], ['security', 'cheshire']]) {
    const transport = peer(serving);
    await assert.rejects(openEvidenceClient({ profile: selected, transport }), /catalog resource identity|pin mismatch/);
    assert.equal(transport.requests.filter(request => request.method === 'tools/call').length, 0);
  }
});

test('concurrent clients keep their shared graph ID bound to different fixed catalogs', async () => {
  const [cheshire, security] = await Promise.all([
    openEvidenceClient({ transport: peer('cheshire') }),
    openEvidenceClient({ profile: 'security', transport: peer('security') }),
  ]);
  try {
    const [oldBytes, newBytes] = await Promise.all([cheshire.readEvidence('graph'), security.readEvidence('graph')]);
    assert.deepEqual(oldBytes, fixtures.get('cheshire').bytes.get('graph'));
    assert.deepEqual(newBytes, fixtures.get('security').bytes.get('graph'));
    assert.notDeepEqual(oldBytes, newBytes);
    await assert.rejects(security.readEvidence('result.survives'), /unknown evidence ID/);
    await assert.rejects(cheshire.readEvidence('query.survives'), /unknown evidence ID/);
  } finally { await Promise.all([cheshire.close(), security.close()]); }
});

test('programmatic profile accepts only exact fixed names, never caller profile objects', async () => {
  for (const profile of ['unknown', 'Security', '', {}, [], null, resolveProfile('security')]) {
    await assert.rejects(openEvidenceClient({ profile, transport: peer('security') }), /UNKNOWN_PROFILE/);
    await assert.rejects(readEvidenceView('query.survives', { profile }), /UNKNOWN_PROFILE/);
  }
  await assert.rejects(readEvidenceView('query.survives', { profile: 'security', transport: peer('security') }), /Unknown view option/);
});

for (const field of ['scope', 'encoding']) {
  test(`security refuses altered ${field} despite authentic artifact bytes`, async () => {
    const transport = peer('security', (message, request) => {
      if (request.method !== 'tools/call') return;
      message.result.structuredContent[field] = field === 'scope' ? resolveProfile('cheshire').scope : 'TAGGED_TV';
      message.result.content[0].text = JSON.stringify(message.result.structuredContent);
    });
    const reader = await openEvidenceClient({ profile: 'security', transport });
    try { await assert.rejects(reader.readEvidence('domain'), new RegExp(`${field} mismatch`)); }
    finally { await reader.close(); }
  });
}

test('security pre-SDK closed-field checks still reject own __proto__', async () => {
  const reader = await openEvidenceClient({ profile: 'security', transport: peer('security', (message, request) => {
    if (request.method === 'tools/call') Object.defineProperty(message.result.structuredContent, '__proto__', { value: {}, enumerable: true });
  }) });
  try { await assert.rejects(reader.readEvidence('domain'), /segment fields/); }
  finally { await reader.close(); }
});

const clientPath = fileURLToPath(new URL('../src/client.mjs', import.meta.url));
const viewPath = fileURLToPath(new URL('../src/view.mjs', import.meta.url));
function cli(path, args) { return spawnSync(process.execPath, [path, ...args], { encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 10_000 }); }

test('malformed CLI profile positions/options fail without stdout or fallback', () => {
  const badClientArgs = [ ['--profile'], ['--profile', 'other', 'verify-all'], ['--profile', 'security', '--profile', 'cheshire', 'verify-all'],
    ['verify-all', '--profile', 'security'], ['--profile', 'security', 'read', 'domain', '--profile', 'cheshire'] ];
  const badViewArgs = [['--profile'], ['--profile', 'other', 'domain'], ['--profile', 'security', '--profile', 'cheshire', 'domain'], ['domain', '--profile', 'security']];
  for (const [path, candidates] of [[clientPath, badClientArgs], [viewPath, badViewArgs]]) {
    for (const args of candidates) {
      const result = cli(path, args);
      assert.equal(result.status, 1, `${path}: ${args.join(' ')}`);
      assert.equal(result.stdout, '');
    }
  }
});

test('actual stdio security selection reports verified selected bytes and original/derived counts', () => {
  const result = cli(clientPath, ['--profile', 'security', 'verify-all']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.status, 'VERIFIED_SELECTED_BYTES');
  assert.equal(summary.artifacts, 16);
  assert.equal(summary.bytes, 342919);
  assert.equal(summary.chunks, 51);
  assert.equal(summary.unchangedOriginals, 9);
  assert.equal(summary.completeDerivedQueryMembers, 7);
  const read = cli(clientPath, ['--profile', 'security', 'read', 'query.survives']);
  assert.equal(read.status, 0, read.stderr);
  assert.equal(read.stdout, fixtures.get('security').bytes.get('query.survives').toString('utf8'));
});

test('actual views preserve security canonical graph markers and complete query provenance, with old tagged default', async () => {
  const [graph, query, old] = await Promise.all([
    readEvidenceView('graph', { profile: 'security' }),
    readEvidenceView('query.survives', { profile: 'security' }),
    readEvidenceView('result.replay'),
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(graph.data)), JSON.parse(fixtures.get('security').bytes.get('graph')));
  assert.ok(JSON.stringify(graph.data).includes('$securityCase.map'));
  assert.deepEqual(JSON.parse(JSON.stringify(query.data)), JSON.parse(fixtures.get('security').bytes.get('query.survives')));
  assert.equal(query.provenance.kind, 'COMPLETE_CANONICAL_MEMBER_EXTRACT');
  assert.equal(query.provenance.memberKey, 'survives');
  assert.equal(query.originalSha256, hash(fixtures.get('security').bytes.get('query.survives')));
  assert.equal(query.scope.evidenceClass, 'LOCAL_SYNTHETIC_CASE');
  assert.equal(old.catalogId, resolveProfile().catalogId);
  assert.equal(old.data.status, 'ACCEPTED');
  assert.equal(Object.hasOwn(old, 'provenance'), false);
});
