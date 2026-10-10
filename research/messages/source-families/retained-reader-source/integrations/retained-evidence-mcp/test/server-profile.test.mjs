import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createEvidenceServer } from '../src/server.mjs';
import { resolveProfile, SCHEMA_VERSION, PROTOCOL_VERSION, LIMITS, CATALOG_ID, CATALOG_URI } from '../src/profile.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const args = (profile, evidenceId = profile.evidenceIds[0], chunkIndex = 0) => ({ schemaVersion: SCHEMA_VERSION, catalogId: profile.catalogId, evidenceId, chunkIndex });
const rpc = (id, method, params) => ({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
const initialize = rpc(0, 'initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'profile-test', version: '1' } });
const frame = value => JSON.stringify(value) + '\n';
const serverPath = fileURLToPath(new URL('../src/server.mjs', import.meta.url));
const launch = (argv, input = frame(initialize)) => spawnSync(process.execPath, [serverPath, ...argv], { input, timeout: 15000, maxBuffer: 2 * 1024 * 1024 });

async function connected(options) {
  const server = await createEvidenceServer(options);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'profile-test', version: '1' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, close: async () => { await client.close(); await server.close(); } };
}

async function catalogFor(client, profile) {
  const result = await client.readResource({ uri: profile.catalogUri });
  assert.equal(result.contents.length, 1);
  assert.equal(result.contents[0].uri, profile.catalogUri);
  assert.equal(hash(Buffer.from(result.contents[0].text)), profile.expectedCatalogSha256);
  return JSON.parse(result.contents[0].text);
}

test('default Cheshire and security instances discover only their fixed schemas/catalogs and retained bytes', async () => {
  assert.equal(resolveProfile().catalogId, CATALOG_ID);
  assert.equal(resolveProfile().catalogUri, CATALOG_URI);
  const peers = await Promise.all([connected(), connected({ profile: 'security' })]);
  try {
    for (let i = 0; i < peers.length; i++) {
      const profile = resolveProfile(i === 0 ? 'cheshire' : 'security'), { client } = peers[i];
      assert.deepEqual(Object.keys(client.getServerCapabilities()).sort(), ['resources', 'tools']);
      const resources = await client.listResources();
      assert.deepEqual(resources.resources.map(({ uri, name }) => ({ uri, name })), [{ uri: profile.catalogUri, name: profile.resourceName }]);
      assert.deepEqual(await client.listResourceTemplates(), { resourceTemplates: [] });
      const catalog = await catalogFor(client, profile);
      assert.deepEqual(catalog.scope, profile.scope);
      assert.deepEqual(catalog.members.map(member => member.evidenceId), profile.evidenceIds);
      const { tools } = await client.listTools();
      assert.equal(tools.length, 1);
      const tool = tools[0];
      assert.equal(tool.name, profile.toolName);
      assert.equal(tool.inputSchema.additionalProperties, false);
      assert.deepEqual(tool.inputSchema.required, ['schemaVersion', 'catalogId', 'evidenceId', 'chunkIndex']);
      assert.equal(tool.inputSchema.properties.catalogId.const, profile.catalogId);
      assert.deepEqual(tool.inputSchema.properties.evidenceId.enum, profile.evidenceIds);
      assert.equal(tool.outputSchema.additionalProperties, false);
      assert.equal(tool.outputSchema.required.length, 13);
      assert.equal(tool.outputSchema.properties.catalogSha256.const, profile.expectedCatalogSha256);
      const scopeSchema = tool.outputSchema.properties.scope;
      assert.deepEqual(scopeSchema.required, Object.keys(profile.scope));
      for (const [key, value] of Object.entries(profile.scope)) assert.equal(scopeSchema.properties[key].const, value);
      const result = await client.callTool({ name: profile.toolName, arguments: args(profile) });
      const data = result.structuredContent;
      assert.deepEqual(data, JSON.parse(result.content[0].text));
      assert.deepEqual(data.scope, profile.scope);
      assert.equal(data.catalogId, profile.catalogId);
      assert.equal(data.catalogSha256, profile.expectedCatalogSha256);
      assert.equal(data.encoding, catalog.members[0].encoding);
      assert.equal(data.chunkCount, 1);
      assert.deepEqual(Buffer.from(data.dataBase64, 'base64'), await readFile(path.join(profile.bundleDir, catalog.members[0].fileName)));
      assert.equal(data.chunkSha256, catalog.members[0].sha256);
      if (i === 1) {
        for (const forbidden of ['publicObservation', 'publicFinality', 'checkpoint']) assert.equal(Object.hasOwn(data.scope, forbidden), false);
        assert.equal(data.scope.evidenceClass, 'LOCAL_SYNTHETIC_CASE');
        assert.equal(data.scope.localFinality, 'LOCAL_ONLY');
        assert.equal(data.scope.realCollectionPerformed, false);
      }
    }
  } finally { await Promise.all(peers.map(peer => peer.close())); }
});

test('each instance rejects foreign tool/catalog/URI/exclusive IDs and RPC profile selectors', async () => {
  for (const name of ['cheshire', 'security']) {
    const profile = resolveProfile(name), other = resolveProfile(name === 'cheshire' ? 'security' : 'cheshire');
    const peer = await connected({ profile: name });
    try {
      const foreignId = other.evidenceIds.find(id => !profile.evidenceIds.includes(id));
      const attempts = [
        [{ name: other.toolName, arguments: args(profile) }, 'UNKNOWN_TOOL'],
        [{ name: profile.toolName, arguments: { ...args(profile), catalogId: other.catalogId } }, 'INVALID_ARGUMENTS'],
        [{ name: profile.toolName, arguments: args(profile, foreignId) }, 'INVALID_ARGUMENTS'],
        [{ name: profile.toolName, arguments: { ...args(profile), profile: other.name } }, 'INVALID_ARGUMENTS'],
      ];
      for (const [request, code] of attempts) {
        const result = await peer.client.callTool(request);
        assert.equal(result.isError, true);
        assert.equal(result.structuredContent, undefined);
        const body = JSON.parse(result.content[0].text);
        assert.equal(body.error.code, code);
        assert.deepEqual(body.scope, profile.scope);
      }
      await assert.rejects(peer.client.readResource({ uri: other.catalogUri }), /UNKNOWN_CATALOG_RESOURCE/);
    } finally { await peer.close(); }
  }
});

test('interleaved same-ID graph requests preserve each instance edition and scope', async () => {
  const profiles = [resolveProfile('cheshire'), resolveProfile('security')];
  const peers = await Promise.all(profiles.map(profile => connected({ profile: profile.name })));
  try {
    const catalogs = await Promise.all(peers.map((peer, i) => catalogFor(peer.client, profiles[i])));
    const responses = await Promise.all(Array.from({ length: 12 }, (_, i) => {
      const index = i % 2;
      return peers[index].client.callTool({ name: profiles[index].toolName, arguments: args(profiles[index], 'graph') });
    }));
    for (let i = 0; i < responses.length; i++) {
      const index = i % 2, profile = profiles[index], member = catalogs[index].members.find(member => member.evidenceId === 'graph');
      const data = responses[i].structuredContent;
      assert.equal(data.artifactSha256, member.sha256);
      assert.deepEqual(data.scope, profile.scope);
      assert.equal(data.catalogId, profile.catalogId);
    }
    assert.notEqual(responses[0].structuredContent.artifactSha256, responses[1].structuredContent.artifactSha256);
  } finally { await Promise.all(peers.map(peer => peer.close())); }
});

test('selected security pin remains fixed through bundle overrides and catalog/file tamper', async () => {
  const profile = resolveProfile('security');
  await assert.rejects(createEvidenceServer({ profile: 'security', bundleDir: resolveProfile('cheshire').bundleDir }), /CATALOG_INTEGRITY/);
  await assert.rejects(createEvidenceServer({ bundleDir: profile.bundleDir }), /CATALOG_INTEGRITY/);
  for (const invalid of ['unknown', 'Security', '', null, { name: 'security' }]) await assert.rejects(createEvidenceServer({ profile: invalid }), /UNKNOWN_PROFILE/);
  const dir = await mkdtemp(path.join(tmpdir(), 'continuity-profile-boundary-'));
  try {
    await cp(profile.bundleDir, dir, { recursive: true });
    const originalCatalog = await readFile(path.join(dir, 'catalog.json'));
    const catalog = JSON.parse(originalCatalog);
    catalog.scope.publicObservation = 'SYNTHETIC_TAMPER';
    await writeFile(path.join(dir, 'catalog.json'), JSON.stringify(catalog));
    await assert.rejects(createEvidenceServer({ profile: 'security', bundleDir: dir }), /CATALOG_INTEGRITY/);
    await writeFile(path.join(dir, 'catalog.json'), originalCatalog);
    await writeFile(path.join(dir, catalog.members[0].fileName), '{}');
    await assert.rejects(createEvidenceServer({ profile: 'security', bundleDir: dir }), /ARTIFACT_INTEGRITY/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('actual CLI supports only a single valid profile prefix and preserves default launch', () => {
  for (const [argv, profile] of [[[], resolveProfile()], [['--profile', 'cheshire'], resolveProfile()], [['--profile', 'security'], resolveProfile('security')], [['--profile', 'security', '--bundle-dir', resolveProfile('security').bundleDir], resolveProfile('security')]]) {
    const result = launch(argv, [initialize, rpc(1, 'tools/list'), rpc(2, 'resources/read', { uri: profile.catalogUri }), rpc(3, 'tools/call', { name: profile.toolName, arguments: args(profile) })].map(frame).join(''));
    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(result.stderr.length, 0);
    const messages = result.stdout.toString().trim().split('\n').map(JSON.parse);
    assert.equal(messages[1].result.tools[0].name, profile.toolName);
    assert.equal(hash(Buffer.from(messages[2].result.contents[0].text)), profile.expectedCatalogSha256);
    assert.deepEqual(messages[3].result.structuredContent.scope, profile.scope);
  }
  const malformed = [
    ['--profile'], ['--profile', 'unknown'], ['--profile', 'Security'], ['--profile', ''],
    ['--profile', 'security', '--profile', 'cheshire'], ['--profile', 'security', '--profile', 'security'],
    ['--bundle-dir', resolveProfile().bundleDir, '--profile', 'security'], ['--profile=security'],
    ['--profile', 'security', '--bundle-dir', '--profile'], ['security'],
  ];
  for (const argv of malformed) {
    const result = launch(argv);
    assert.equal(result.status, 1, JSON.stringify(argv));
    assert.equal(result.stdout.length, 0);
    assert.equal(result.stderr.toString().trim(), 'RETAINED_EVIDENCE_STARTUP_FAILED');
  }
});

test('security stdio retains raw own-key protection before SDK normalization', () => {
  const profile = resolveProfile('security');
  const requests = [frame(initialize)];
  for (const [i, padding] of [1, LIMITS.argumentBytes * 2].entries()) {
    const arguments_ = JSON.parse(JSON.stringify(args(profile)).slice(0, -1) + ',"__proto__":' + JSON.stringify('x'.repeat(padding)) + '}');
    let wire = frame(rpc(i + 1, 'tools/call', { name: profile.toolName, arguments: arguments_ }));
    if (i === 0) wire = wire.replace('"__proto__"', '"\\u005f_proto__"');
    requests.push(wire);
  }
  requests.push(frame(rpc(3, 'tools/call', { name: profile.toolName, arguments: args(profile) })));
  const result = launch(['--profile', 'security'], requests.join(''));
  assert.equal(result.status, 0, result.stderr.toString());
  const messages = result.stdout.toString().trim().split('\n').map(JSON.parse);
  for (let i = 1; i <= 2; i++) {
    assert.equal(messages[i].result.isError, true);
    const body = JSON.parse(messages[i].result.content[0].text);
    assert.equal(body.error.code, i === 1 ? 'INVALID_ARGUMENTS' : 'ARGUMENT_LIMIT');
    assert.deepEqual(body.scope, profile.scope);
  }
  assert.equal(messages[3].result.structuredContent.evidenceId, profile.evidenceIds[0]);
});
