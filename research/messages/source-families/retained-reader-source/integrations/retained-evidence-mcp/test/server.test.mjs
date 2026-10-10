import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, symlink, unlink, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { PassThrough, Writable } from 'node:stream';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { deserializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js';
import { createEvidenceServer } from '../src/server.mjs';
import { BoundedStdioTransport } from '../src/bounded-stdio.mjs';
import { CATALOG_ID, CATALOG_URI, DEFAULT_BUNDLE_DIR, EXPECTED_CATALOG_SHA256, LIMITS, PROTOCOL_VERSION, SCHEMA_VERSION } from '../src/profile.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const args = (evidenceId = 'result.replay', chunkIndex = 0) => ({ schemaVersion: SCHEMA_VERSION, catalogId: CATALOG_ID, evidenceId, chunkIndex });
const rpc = (id, method, params) => ({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });
const initialize = rpc(0, 'initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'adapter-test', version: '1' } });
const frame = object => JSON.stringify(object) + '\n';
const serverPath = fileURLToPath(new URL('../src/server.mjs', import.meta.url));
const launch = input => spawnSync(process.execPath, [serverPath], { input, maxBuffer: 3 * 1024 * 1024, timeout: 15000 });

async function connected(bundleDir) {
  const server = await createEvidenceServer(bundleDir ? { bundleDir } : {});
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'adapter-test', version: '1' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { server, client };
}

test('SDK discovery and chunk envelope preserve exact bytes and repeated reads', async () => {
  const { client, server } = await connected();
  try {
    assert.deepEqual(Object.keys(client.getServerCapabilities()).sort(), ['resources', 'tools']);
    const resources = await client.listResources();
    assert.equal(resources.resources.length, 1);
    assert.equal(resources.resources[0].uri, CATALOG_URI);
    assert.deepEqual(await client.listResourceTemplates(), { resourceTemplates: [] });
    const resource = await client.readResource({ uri: CATALOG_URI });
    assert.equal(digest(Buffer.from(resource.contents[0].text)), EXPECTED_CATALOG_SHA256);
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 1);
    assert.equal(tools.tools[0].name, 'cheshire.read');
    assert.equal(tools.tools[0].outputSchema.additionalProperties, false);
    assert.deepEqual(tools.tools[0].outputSchema.required, ['schemaVersion', 'catalogId', 'catalogSha256', 'evidenceId', 'encoding', 'artifactBytes', 'artifactSha256', 'chunkIndex', 'chunkCount', 'chunkBytes', 'chunkSha256', 'dataBase64', 'scope']);
    const results = [];
    for (let i = 0; i < 2; i++) results.push(await client.callTool({ name: 'cheshire.read', arguments: args() }));
    assert.deepEqual(results[0], results[1]);
    const data = results[0].structuredContent;
    assert.deepEqual(data, JSON.parse(results[0].content[0].text));
    assert.deepEqual(Object.keys(data), ['schemaVersion', 'catalogId', 'catalogSha256', 'evidenceId', 'encoding', 'artifactBytes', 'artifactSha256', 'chunkIndex', 'chunkCount', 'chunkBytes', 'chunkSha256', 'dataBase64', 'scope']);
    const original = await readFile(path.join(DEFAULT_BUNDLE_DIR, 'result.replay.json'));
    assert.deepEqual(Buffer.from(data.dataBase64, 'base64'), original);
    assert.equal(data.chunkSha256, digest(original));
    assert.equal(data.scope.readerGrantsCurrentAuthority, false);
    assert.equal(data.scope.newEvaluation, false);
    const last = await client.callTool({ name: 'cheshire.read', arguments: args('snapshot', 787) });
    assert.equal(last.structuredContent.chunkBytes, 7872);
    assert.equal(Buffer.byteLength(frame({ jsonrpc: '2.0', id: 'x'.repeat(128), result: last } )) <= LIMITS.responseBytes, true);
  } finally { await client.close(); await server.close(); }
});

test('reader rejects invalid version/catalog/ID/path/URL/index/extra keys and argument budget', async () => {
  const { client, server } = await connected();
  try {
    const invalid = [ { ...args(), schemaVersion: 'future' }, { ...args(), catalogId: 'other' }, args('../snapshot.json'), args('https://example.invalid/proof'), args('unknown'), args('result.replay', -1), args('result.replay', 0.5), args('result.replay', Number.MAX_SAFE_INTEGER + 1), args('result.replay', 1), { ...args(), extra: true }, { ...args(), extra: 'x'.repeat(1024) } ];
    for (const arguments_ of invalid) {
      const result = await client.callTool({ name: 'cheshire.read', arguments: arguments_ });
      assert.equal(result.isError, true);
      const error = JSON.parse(result.content[0].text);
      assert.equal(error.error.kind, 'TRANSPORT_ERROR');
      assert.equal(error.scope.readerGrantsCurrentAuthority, false);
      assert.equal(result.structuredContent, undefined);
    }
    const padded = { ...args(), extra: '' };
    padded.extra = 'x'.repeat(LIMITS.argumentBytes - Buffer.byteLength(JSON.stringify(padded)));
    assert.equal(Buffer.byteLength(JSON.stringify(padded)), LIMITS.argumentBytes);
    const exact = await client.callTool({ name: 'cheshire.read', arguments: padded });
    assert.equal(JSON.parse(exact.content[0].text).error.code, 'INVALID_ARGUMENTS');
    padded.extra += 'x';
    const over = await client.callTool({ name: 'cheshire.read', arguments: padded });
    assert.equal(JSON.parse(over.content[0].text).error.code, 'ARGUMENT_LIMIT');
    await assert.rejects(client.readResource({ uri: 'file:///private/unserved' }), /UNKNOWN_CATALOG_RESOURCE/);
  } finally { await client.close(); await server.close(); }
});

test('startup refuses missing/tampered/symlink/nonregular/unexpected files, catalog mismatch and linked directory', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'continuity-adapter-boundary-'));
  try {
    const cases = [
      async dir => unlink(path.join(dir, 'result.replay.json')),
      async dir => writeFile(path.join(dir, 'result.replay.json'), '{}'),
      async dir => { await unlink(path.join(dir, 'result.replay.json')); await symlink(path.join(DEFAULT_BUNDLE_DIR, 'result.replay.json'), path.join(dir, 'result.replay.json')); },
      async dir => { await unlink(path.join(dir, 'result.replay.json')); await mkdir(path.join(dir, 'result.replay.json')); },
      async dir => writeFile(path.join(dir, 'private.txt'), 'UNSERVED_SYNTHETIC_SENTINEL'),
      async dir => writeFile(path.join(dir, 'catalog.json'), '{}')
    ];
    for (let i = 0; i < cases.length; i++) {
      const dir = path.join(parent, String(i));
      await cp(DEFAULT_BUNDLE_DIR, dir, { recursive: true });
      await cases[i](dir);
      await assert.rejects(createEvidenceServer({ bundleDir: dir }), error => /^BUNDLE_|^ARTIFACT_|^CATALOG_/.test(error.message) && !error.message.includes(parent));
      await rm(dir, { recursive: true, force: true });
    }
    await symlink(DEFAULT_BUNDLE_DIR, path.join(parent, 'linked'));
    await assert.rejects(createEvidenceServer({ bundleDir: path.join(parent, 'linked') + '/' }), /BUNDLE_DIRECTORY_INVALID/);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test('disk mutation after startup does not change verified served buffers', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'continuity-adapter-stability-'));
  await cp(DEFAULT_BUNDLE_DIR, dir, { recursive: true });
  const { client, server } = await connected(dir);
  try {
    const before = await client.callTool({ name: 'cheshire.read', arguments: args() });
    await writeFile(path.join(dir, 'result.replay.json'), 'CHANGED_AFTER_VERIFIED_LOAD');
    assert.deepEqual(await client.callTool({ name: 'cheshire.read', arguments: args() }), before);
  } finally { await client.close(); await server.close(); await rm(dir, { recursive: true, force: true }); }
});

test('real stdio negotiates profile and accepts batches of individually bounded frames', () => {
  const messages = [initialize, ...Array.from({ length: 180 }, (_, i) => rpc(i + 1, 'ping', { padding: 'x'.repeat(150) }))];
  const input = messages.map(frame).join('');
  assert.ok(Buffer.byteLength(input) > LIMITS.inputFrameBytes);
  const result = launch(input);
  assert.equal(result.status, 0, result.stderr.toString());
  const output = result.stdout.toString().trim().split('\n').map(JSON.parse);
  assert.equal(output.length, messages.length);
  assert.equal(output[0].result.protocolVersion, PROTOCOL_VERSION);
});

test('actual stdio rejects own __proto__ arguments before SDK normalization', () => {
  const cases = [
    { padding: 1, escaped: false, code: 'INVALID_ARGUMENTS' },
    { padding: 2048, escaped: false, code: 'ARGUMENT_LIMIT' },
    { padding: 1, escaped: true, code: 'INVALID_ARGUMENTS' },
    { padding: 2048, escaped: true, code: 'ARGUMENT_LIMIT' }
  ];
  const requests = [frame(initialize), frame(rpc(1, 'resources/templates/list'))];
  for (let i = 0; i < cases.length; i++) {
    const fixture = cases[i];
    const arguments_ = JSON.parse(JSON.stringify(args()).slice(0, -1) + ',"__proto__":' + JSON.stringify('x'.repeat(fixture.padding)) + '}');
    assert.equal(Object.hasOwn(arguments_, '__proto__'), true);
    assert.equal(Buffer.byteLength(JSON.stringify(arguments_)) > LIMITS.argumentBytes, fixture.code === 'ARGUMENT_LIMIT');
    let wire = frame(rpc(i + 2, 'tools/call', { name: 'cheshire.read', arguments: arguments_ }));
    if (fixture.escaped) wire = wire.replace('"__proto__"', '"\\u005f_proto__"');
    // Verify the actual SDK JSON-RPC transport boundary retains the nested own
    // key; the custom tools/call request schema must preserve it through dispatch.
    const boundary = deserializeMessage(wire);
    assert.equal(Object.hasOwn(boundary.params.arguments, '__proto__'), true);
    assert.equal(Buffer.byteLength(JSON.stringify(boundary.params.arguments)), Buffer.byteLength(JSON.stringify(arguments_)));
    requests.push(wire);
  }
  requests.push(frame(rpc(6, 'tools/call', { name: 'cheshire.read', arguments: args() })));
  const result = launch(requests.join(''));
  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stderr.length, 0);
  const responses = result.stdout.toString().trim().split('\n').map(JSON.parse);
  assert.equal(responses.length, requests.length);
  assert.deepEqual(responses[1].result, { resourceTemplates: [] });
  for (let i = 0; i < cases.length; i++) {
    const response = responses[i + 2];
    assert.equal(response.id, i + 2);
    assert.equal(response.result.isError, true);
    assert.equal(response.result.structuredContent, undefined);
    assert.equal(JSON.parse(response.result.content[0].text).error.code, cases[i].code);
  }
  const valid = responses.at(-1).result;
  assert.equal(valid.isError, undefined);
  assert.equal(valid.structuredContent.evidenceId, 'result.replay');
  assert.deepEqual(valid.structuredContent, JSON.parse(valid.content[0].text));
  assert.equal(digest(Buffer.from(valid.structuredContent.dataBase64, 'base64')), valid.structuredContent.artifactSha256);
});

test('real stdio rejects malformed framing, nested decoded duplicates, oversized IDs and unterminated input', () => {
  const inputs = [
    ['{"jsonrpc":"2.0","id":1,"method":"ping","params":{"x":1,"\\u0078":2}}\n', 'DUPLICATE_KEY'],
    ['{"jsonrpc":"2.0","id":1,"id":2,"method":"ping"}\n', 'DUPLICATE_KEY'],
    [Buffer.from([0xff, 10]), 'INVALID_UTF8'],
    ['{"broken":}\n', 'INVALID_JSON'],
    ['x'.repeat(LIMITS.inputFrameBytes + 1), 'INPUT_FRAME_LIMIT'],
    [frame(rpc('x'.repeat(129), 'ping')), 'INVALID_RPC_ID'],
    [frame(rpc(Number.MAX_SAFE_INTEGER + 1, 'ping')), 'INVALID_RPC_ID'],
    [frame(rpc(1, 'ping')).trim(), 'UNTERMINATED_FRAME']
  ];
  for (const [input, code] of inputs) {
    const result = launch(input);
    assert.equal(result.status, 1, code + ': ' + result.stderr);
    assert.equal(result.stdout.length, 0, code);
    assert.equal(result.stderr.toString().trim(), code);
  }
});

test('exact raw input-frame and session-request ceilings include lifecycle frames', () => {
  const base = frame(rpc(1, 'ping'));
  const exact = base.slice(0, -1) + ' '.repeat(LIMITS.inputFrameBytes - Buffer.byteLength(base) + 1) + '\n';
  assert.equal(Buffer.byteLength(exact), LIMITS.inputFrameBytes + 1);
  assert.equal(launch(exact).status, 0);
  const input = Array.from({ length: LIMITS.sessionRequests + 1 }, (_, i) => frame(rpc(i, 'ping'))).join('');
  const result = launch(input);
  assert.equal(result.status, 1, result.stderr.toString());
  assert.equal(result.stderr.toString().trim(), 'SESSION_REQUEST_LIMIT');
  assert.equal(result.stdout.toString().trim().split('\n').length, LIMITS.sessionRequests);
});

test('transport measures exact full output frames and cumulative budget without partial writes', async () => {
  for (const kind of ['frame', 'session']) {
    const input = new PassThrough(), output = new PassThrough();
    const chunks = []; output.on('data', chunk => chunks.push(chunk));
    const message = { jsonrpc: '2.0', id: 1, result: { value: 'x'.repeat(30) } };
    const length = Buffer.byteLength(frame(message));
    const limits = { ...LIMITS, responseBytes: kind === 'frame' ? length : LIMITS.responseBytes, sessionOutputBytes: kind === 'session' ? length : LIMITS.sessionOutputBytes };
    const transport = new BoundedStdioTransport(input, output, { limits });
    await transport.start();
    await transport.send(message);
    if (kind === 'frame') await assert.rejects(transport.send({ ...message, result: { value: 'x'.repeat(31) } }), /RESPONSE_FRAME_LIMIT/);
    else await assert.rejects(transport.send(message), /SESSION_OUTPUT_LIMIT/);
    assert.equal(Buffer.concat(chunks).length, length);
    await transport.done;
  }
});

test('default 48KiB response and128MiB session-output ceilings are exact', async () => {
  const input = new PassThrough();
  let written = 0;
  const output = new Writable({ write(chunk, encoding, callback) { written += chunk.length; callback(); } });
  const transport = new BoundedStdioTransport(input, output);
  await transport.start();
  const message = { jsonrpc: '2.0', id: 1, result: { value: '' } };
  const overhead = Buffer.byteLength(frame(message));
  message.result.value = 'x'.repeat(LIMITS.responseBytes - overhead);
  assert.equal(Buffer.byteLength(frame(message)), LIMITS.responseBytes);
  const completeFrames = Math.floor(LIMITS.sessionOutputBytes / LIMITS.responseBytes);
  for (let i = 0; i < completeFrames; i++) await transport.send(message);
  const remaining = LIMITS.sessionOutputBytes - written;
  message.result.value = 'x'.repeat(remaining - overhead);
  await transport.send(message);
  assert.equal(written, LIMITS.sessionOutputBytes);
  await assert.rejects(transport.send(message), /SESSION_OUTPUT_LIMIT/);
  assert.equal(written, LIMITS.sessionOutputBytes);
  await transport.done;

  const input2 = new PassThrough(), output2 = new PassThrough();
  let oversizedWritten = 0; output2.on('data', chunk => { oversizedWritten += chunk.length; });
  const transport2 = new BoundedStdioTransport(input2, output2);
  await transport2.start();
  message.result.value = 'x'.repeat(LIMITS.responseBytes - overhead + 1);
  await assert.rejects(transport2.send(message), /RESPONSE_FRAME_LIMIT/);
  assert.equal(oversizedWritten, 0);
  await transport2.done;
});

test('closing blocked output settles pending request processing', async () => {
  const input = new PassThrough();
  const output = new PassThrough({ highWaterMark: 1 });
  const transport = new BoundedStdioTransport(input, output);
  await transport.start();
  const sending = transport.send({ jsonrpc: '2.0', id: 1, result: {} });
  output.destroy();
  await sending;
  await transport.done;
  assert.equal(transport.failureCode, 'OUTPUT_UNAVAILABLE');
});
