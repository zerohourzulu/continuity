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
import { resolveProfile, SCHEMA_VERSION, PROTOCOL_VERSION, LIMITS } from '../src/profile.mjs';
import { COMMON_PROFILES, commonCaseSpec } from '../../core02-evidence-consumer/src/specs.mjs';

const PINS = { 'core02-packet': 'edaab345037e8ae489197ff0e8d01305a223e323b17809c05fcab0d82e32b115',
  'core02-simulated': '4fdae26b4ce457403a46bfa5c72ce43de00182a4e1317fce3258eba7fa3fd4dc' };
const sha = value => createHash('sha256').update(value).digest('hex');
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const serverPath = fileURLToPath(new URL('../src/server.mjs', import.meta.url));
const frame = value => JSON.stringify(value) + '\n';
const args = (profile, evidenceId = 'graph') => ({ schemaVersion: SCHEMA_VERSION, catalogId: profile.catalogId, evidenceId, chunkIndex: 0 });
const cache = new Map();
function fixture(name) {
  if (!cache.has(name)) cache.set(name, (async () => {
    const profile = resolveProfile(name), text = await readFile(join(profile.bundleDir, 'catalog.json'), 'utf8');
    const catalog = JSON.parse(text), artifacts = new Map();
    for (const member of catalog.members) artifacts.set(member.evidenceId, await readFile(join(profile.bundleDir, member.fileName)));
    return { profile, text, catalog, artifacts };
  })());
  return cache.get(name);
}
function observation(name) {
  const inner = new StdioClientTransport({ command: process.execPath, args: [serverPath, '--profile', name],
    stderr: 'ignore', maxBufferSize: LIMITS.responseBytes });
  const requests = [], messages = [];
  const transport = {
    async start() { inner.onmessage = value => { messages.push(structuredClone(value)); transport.onmessage?.(value); };
      inner.onerror = error => transport.onerror?.(error); inner.onclose = () => transport.onclose?.(); await inner.start(); },
    send(value) { requests.push(structuredClone(value)); return inner.send(value); },
    close: () => inner.close(), setProtocolVersion: version => inner.setProtocolVersion?.(version),
  };
  return { transport, requests, messages };
}
async function connected(name) {
  const server = await createEvidenceServer({ profile: name }), [left, right] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'common-profile-test', version: '1' });
  await server.connect(right); await client.connect(left);
  return { client, close: async () => { await client.close(); await server.close(); } };
}
// Complete pinned-data transport; mutations exercise only affected reader refusal paths.
function peer(f, mutate = () => {}) {
  let closed = false;
  return {
    async start() {}, async close() { if (!closed) { closed = true; this.onclose?.(); } },
    async send(request) {
      if (request.id === undefined) return;
      let result;
      if (request.method === 'initialize') result = { protocolVersion: PROTOCOL_VERSION, capabilities: { resources: {}, tools: {} }, serverInfo: { name: 'fixed-common-data', version: '1' } };
      else if (request.method === 'resources/read') result = { contents: [{ uri: f.profile.catalogUri, mimeType: 'application/json', text: f.text }] };
      else if (request.method === 'tools/call') {
        const { evidenceId, chunkIndex } = request.params.arguments, member = f.catalog.members.find(item => item.evidenceId === evidenceId);
        const segment = f.artifacts.get(evidenceId).subarray(chunkIndex * LIMITS.chunkBytes, (chunkIndex + 1) * LIMITS.chunkBytes);
        const value = { schemaVersion: SCHEMA_VERSION, catalogId: f.profile.catalogId, catalogSha256: f.profile.expectedCatalogSha256,
          evidenceId, encoding: member.encoding, artifactBytes: member.bytes, artifactSha256: member.sha256, chunkIndex,
          chunkCount: member.chunkCount, chunkBytes: segment.length, chunkSha256: sha(segment), dataBase64: segment.toString('base64'), scope: f.profile.scope };
        result = { structuredContent: value, content: [{ type: 'text', text: JSON.stringify(value) }] };
      } else throw new Error('Unexpected fixture operation');
      const message = { jsonrpc: '2.0', id: request.id, result }; mutate(message, request);
      const captured = JSONRPCMessageSchema.parse(JSON.parse(JSON.stringify(message)));
      queueMicrotask(() => { if (!closed) this.onmessage?.(captured); });
    },
  };
}

test('both common catalogs preserve all 31 selected originals and complete original MANIFEST membership', async () => {
  let total = 0;
  for (const name of COMMON_PROFILES) {
    const f = await fixture(name), spec = commonCaseSpec(name), expectedCount = name === 'core02-packet' ? 18 : 13;
    assert.equal(sha(Buffer.from(f.text)), PINS[name]); assert.equal(f.profile.expectedCatalogSha256, PINS[name]);
    assert.equal(spec.catalogSha256, PINS[name]); assert.equal(f.catalog.members.length, expectedCount);
    assert.deepEqual(f.catalog.members.map(member => member.evidenceId), spec.evidenceIds);
    assert.deepEqual(f.catalog.scope, f.profile.scope); assert.deepEqual(f.catalog.domain, spec.domain);
    assert.deepEqual(f.catalog.historyHead, spec.head); assert.deepEqual(f.catalog.adapterProfile, spec.adapterProfile);
    assert.deepEqual(f.profile.selectedCounts, { unchangedOriginals: expectedCount, completeDerivedQueryMembers: 0 });
    for (const key of ['newEvaluation', 'newChainObservation', 'readerGrantsCurrentAuthority']) assert.equal(f.profile.scope[key], false);
    for (const key of ['publicObservation', 'publicFinality', 'checkpoint']) assert.equal(Object.hasOwn(f.profile.scope, key), false);
    const manifest = JSON.parse(f.artifacts.get('exportManifest'));
    assert.equal(sha(f.artifacts.get('exportManifest')), spec.exportManifestSha256);
    assert.equal(manifest.files.length, expectedCount - 1);
    assert.deepEqual(manifest.files.map(file => file.name), spec.members.filter(member => member.evidenceId !== 'exportManifest').map(member => member.exportFileName));
    for (const member of f.catalog.members) {
      const expected = spec.members.find(item => item.evidenceId === member.evidenceId), bytes = f.artifacts.get(member.evidenceId);
      assert.ok(expected); assert.equal(member.provenance.kind, 'UNCHANGED_RETAINED_ARTIFACT');
      assert.match(member.fileName, /^[A-Za-z0-9.]+\.(?:json|log)$/);
      assert.equal(bytes.length, member.bytes); assert.equal(sha(bytes), member.sha256);
      assert.ok(bytes.equals(await readFile(join(repository, expected.sourcePath))), expected.sourcePath);
      assert.equal(member.chunkCount, Math.ceil(member.bytes / LIMITS.chunkBytes));
      if (member.evidenceId !== 'exportManifest') {
        const original = manifest.files.find(file => file.name === member.exportFileName);
        assert.deepEqual(original, { name: member.exportFileName, bytes: member.bytes, sha256: member.sha256 });
      }
    }
    total += f.catalog.members.length;
  }
  assert.equal(total, 31);
});

test('actual fixed-profile stdio clients retrieve every common artifact in bounded unchanged frames', async () => {
  let count = 0;
  for (const name of COMMON_PROFILES) {
    const f = await fixture(name), observed = observation(name), reader = await openEvidenceClient({ profile: name, transport: observed.transport });
    try {
      for (const member of f.catalog.members) {
        const actual = await reader.readEvidence(member.evidenceId);
        assert.ok(actual.equals(f.artifacts.get(member.evidenceId))); assert.equal(sha(actual), member.sha256); count++;
      }
      const calls = observed.requests.filter(message => message.method === 'tools/call');
      assert.equal(calls.length, f.catalog.members.reduce((sum, member) => sum + member.chunkCount, 0));
      for (const call of calls) { assert.equal(call.params.name, f.profile.toolName); assert.deepEqual(Object.keys(call.params.arguments).sort(), ['catalogId', 'chunkIndex', 'evidenceId', 'schemaVersion']); }
      assert.ok(observed.requests.every(message => Buffer.byteLength(frame(message)) <= LIMITS.inputFrameBytes));
      assert.ok(observed.messages.every(message => Buffer.byteLength(frame(message)) <= LIMITS.responseBytes));
      for (const message of observed.messages.filter(value => value.result?.structuredContent)) {
        assert.equal(Object.keys(message.result.structuredContent).length, 13);
        assert.deepEqual(message.result.structuredContent, JSON.parse(message.result.content[0].text));
        assert.deepEqual(message.result.structuredContent.scope, f.profile.scope);
      }
    } finally { await reader.close(); }
  }
  assert.equal(count, 31);
});

test('common instances isolate catalogs and reject wrong-profile RPC, extra fields and invalid launch selection', async () => {
  for (const name of COMMON_PROFILES) {
    const f = await fixture(name), other = resolveProfile(COMMON_PROFILES.find(value => value !== name)), connection = await connected(name);
    try {
      assert.deepEqual((await connection.client.listResources()).resources.map(item => item.uri), [f.profile.catalogUri]);
      const tool = (await connection.client.listTools()).tools[0];
      assert.equal(tool.name, f.profile.toolName); assert.equal(tool.inputSchema.additionalProperties, false);
      assert.deepEqual(tool.inputSchema.properties.evidenceId.enum, f.profile.evidenceIds);
      await assert.rejects(connection.client.readResource({ uri: other.catalogUri }));
      for (const request of [
        { name: other.toolName, arguments: args(f.profile) },
        { name: f.profile.toolName, arguments: { ...args(f.profile), catalogId: other.catalogId } },
        { name: f.profile.toolName, arguments: { ...args(f.profile), profile: other.name } },
        { name: f.profile.toolName, arguments: { ...args(f.profile), schemaVersion: 'continuity-retained-evidence/999' } },
      ]) assert.equal((await connection.client.callTool(request)).isError, true);
      const graph = await connection.client.callTool({ name: f.profile.toolName, arguments: args(f.profile) });
      assert.equal(graph.structuredContent.artifactSha256, f.catalog.members.find(item => item.evidenceId === 'graph').sha256);
      if (name === 'core02-simulated') assert.equal((await connection.client.callTool({ name: f.profile.toolName, arguments: args(f.profile, 'packetFileAgent') })).isError, true);
    } finally { await connection.close(); }
  }
  for (const argv of [['--profile', 'core02'], ['--profile=core02-packet'], ['--profile', 'core02-packet', '--profile', 'core02-simulated']]) {
    const result = spawnSync(process.execPath, [serverPath, ...argv], { encoding: 'utf8', timeout: 10_000, maxBuffer: 65_536 });
    assert.equal(result.status, 1); assert.equal(result.stdout, '');
  }
  const f = await fixture('core02-packet');
  await assert.rejects(openEvidenceClient({ profile: 'core02-packet', unsupported: true, transport: peer(f) }), /unknown client option/);
});

test('original logs remain raw bytes and produce separately labeled UTF8 text views rather than JSON', async () => {
  const f = await fixture('core02-packet');
  for (const evidenceId of ['packetFileAgent', 'packetFileAuth']) {
    const original = f.artifacts.get(evidenceId), member = f.catalog.members.find(item => item.evidenceId === evidenceId);
    assert.equal(member.mediaType, 'text/plain'); assert.equal(f.profile.presentation[evidenceId], 'UTF8_TEXT');
    assert.throws(() => JSON.parse(original.toString('utf8')));
    const view = await readEvidenceView(evidenceId, { profile: f.profile.name });
    assert.equal(view.viewKind, 'DERIVED_UTF8_TEXT_VIEW'); assert.equal(typeof view.data, 'string');
    assert.equal(view.data, new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(original));
    assert.ok(Buffer.from(view.data, 'utf8').equals(original));
    assert.equal(view.originalSha256, member.sha256); assert.equal(view.originalBytes, member.bytes);
    assert.equal(view.encoding, member.encoding); assert.deepEqual(view.provenance, member.provenance);
    assert.equal(view.scope.newEvaluation, false); assert.equal(view.scope.readerGrantsCurrentAuthority, false);
  }
});

test('clients refuse changed bytes, incomplete text envelopes and cross-profile catalogs or scopes', async () => {
  const f = await fixture('core02-packet'), other = await fixture('core02-simulated');
  for (const [selected, serving] of [[f, other], [other, f]]) await assert.rejects(openEvidenceClient({ profile: selected.profile.name, transport: peer(serving) }));
  for (const mutate of [
    message => { const value = message.result.structuredContent, changed = Buffer.from(value.dataBase64, 'base64'); changed[0] = 0xff;
      value.dataBase64 = changed.toString('base64'); value.chunkSha256 = sha(changed); message.result.content[0].text = JSON.stringify(value); },
    message => { message.result.content = []; },
    message => { message.result.structuredContent.scope = other.profile.scope; message.result.content[0].text = JSON.stringify(message.result.structuredContent); },
  ]) {
    const reader = await openEvidenceClient({ profile: f.profile.name, transport: peer(f, (message, request) => { if (request.method === 'tools/call') mutate(message); }) });
    try { await assert.rejects(reader.readEvidence('packetFileAgent')); } finally { await reader.close(); }
  }
});

test('the three accepted old catalogs, pins and scopes remain unchanged with one small compatibility read', async () => {
  const old = { cheshire: ['6d607541ae3320dee8856362f7c374064df136467ece990e06cb1628062ef55d', 21],
    security: ['b859159dfbe2c88d53a49da93a7707a431452b1bb6f551e1062eee2e114fe3dc', 16],
    'durable-security': ['ae5d8b2a8419432ded3f08167f43ff6b3a059aee272d7cb1a333fee87ab1a1d5', 20] };
  for (const [name, [pin, count]] of Object.entries(old)) {
    const profile = resolveProfile(name), bytes = await readFile(join(profile.bundleDir, 'catalog.json')), catalog = JSON.parse(bytes);
    assert.equal(profile.expectedCatalogSha256, pin); assert.equal(sha(bytes), pin);
    assert.equal(catalog.members.length, count); assert.deepEqual(catalog.scope, profile.scope);
  }
  assert.equal(resolveProfile(), resolveProfile('cheshire'));
  assert.deepEqual(LIMITS, { chunkBytes: 8192, inputFrameBytes: 16384, argumentBytes: 1024, responseBytes: 49152,
    catalogBytes: 32768, artifactBytes: 8388608, selectedBytes: 16777216, sessionRequests: 8192, sessionOutputBytes: 134217728 });
  const profile = resolveProfile('durable-security'), reader = await openEvidenceClient({ profile: profile.name });
  try {
    const actual = await reader.readEvidence('domain');
    assert.ok(actual.equals(await readFile(join(profile.bundleDir, 'domain.json'))));
  } finally { await reader.close(); }
});
