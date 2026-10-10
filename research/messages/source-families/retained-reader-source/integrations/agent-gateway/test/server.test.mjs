import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createGatewayServer, parseLaunch, GATEWAY_LIMITS } from '../src/server.mjs';
import { GatewayStdioTransport } from '../src/transport.mjs';
import { createAgentClient } from '../src/client.mjs';
import { Client, InMemoryTransport, CallToolResultSchema } from '../src/mcp-dependencies.mjs';

const caseId = 'gateway-test';
function initialSummary() {
  return {
    schemaVersion: 'continuity-local-intake-summary/0.2', caseId,
    head: { canonicalTime: 0, position: 0, hash: `0x${'a'.repeat(64)}` },
    stage: 'AWAITING_INTAKE', predecessorEpoch: 1, admission: null, duty: null,
    packet: { status: 'NOT_STARTED' },
    review: { scope: 'APPLICATION_RECORDED_WORK', recordCount: 0, reviewedCount: 0, totalFiles: 0,
      remainingFiles: [], files: [], incidentResolution: 'NOT_PROVEN', verification: 'NO_RECORDS' },
    scope: { data: 'SYNTHETIC', signing: 'PUBLIC_DEVELOPMENT_KEYS', host: 'TRUSTED_COOPERATIVE_OPERATOR',
      engine: 'COMMON_CORE_0.2', finality: 'LOCAL_ONLY', execution: 'NOT_STARTED', externalOutcome: 'NOT_PROVEN' }
  };
}
async function session(actor, body) {
  const calls = [];
  const application = Object.fromEntries(['inspectCase', 'collectCase', 'recordReviewProgress', 'reviewCase']
    .map(name => [name, async (...args) => { calls.push([name, ...args]); return initialSummary(); }]));
  const server = await createGatewayServer({ caseId, actor, application });
  const client = new Client({ name: 'gateway-mocked-boundary-check', version: '0.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    await body({ client, calls });
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}
async function call(client, params) {
  const response = await client.request({ method: 'tools/call', params }, CallToolResultSchema, { timeout: 2000 });
  assert.equal(response.content.length, 1);
  assert.equal(response.content[0].type, 'text');
  const value = JSON.parse(response.content[0].text);
  assert.deepEqual(response.structuredContent, value);
  assert.equal(response.isError, !value.ok);
  assert.equal(value.schemaVersion, 'continuity-agent-gateway/1');
  assert.equal(value.caseId, caseId);
  return value;
}
function noDispatch(value, code) {
  assert.equal(value.ok, false);
  assert.equal(value.code, code);
  assert.equal(value.scope.appDispatched, false);
  assert.equal(value.scope.noDispatch, true);
  assert.equal(value.scope.outcome, 'NOT_DISPATCHED');
}

test('official SDK linked transport lists only actor tools and returns matching compact text/structured data', { timeout: 10000 }, async () => {
  for (const actor of ['a', 'b']) await session(actor, async ({ client, calls }) => {
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map(tool => tool.name).sort(), (actor === 'a' ?
      ['gateway.status', 'gateway.collect', 'gateway.note'] : ['gateway.status', 'gateway.note', 'gateway.disposition']).sort());
    for (const tool of listed.tools) assert.equal(tool.inputSchema.additionalProperties, false);
    const value = await call(client, { name: 'gateway.status', arguments: {} });
    assert.equal(value.ok, true);
    assert.equal(value.actor, actor);
    assert.equal(value.result.kind, 'CASE_SUMMARY');
    assert.equal(value.scope.grantsCurrentAuthority, false);
    assert.equal(value.scope.incidentResolution, 'NOT_PROVEN');
    assert.deepEqual(calls, [['inspectCase', caseId]]);
    assert.ok(Buffer.byteLength(JSON.stringify(value), 'utf8') < GATEWAY_LIMITS.responseBytes);
  });
});

test('raw MCP arguments retain own proto and extra fields until refusal, including actor restriction', { timeout: 10000 }, async () => {
  for (const actor of ['a', 'b']) await session(actor, async ({ client, calls }) => {
    for (const args of [JSON.parse('{"__proto__":{"actor":"b"}}'), { actor: actor === 'a' ? 'b' : 'a' },
      { caseId: 'another-case' }, { inputDirectory: '/tmp/not-selected' }, { extra: null }]) {
      noDispatch(await call(client, { name: 'gateway.status', arguments: args }), 'INVALID_ARGUMENTS');
    }
    noDispatch(await call(client, { name: 'gateway.note', arguments: {
      fileName: '../agent.log', noteId: 'one', note: 'text'
    } }), 'INVALID_ARGUMENTS');
    noDispatch(await call(client, { name: 'gateway.create', arguments: {} }), 'UNKNOWN_TOOL');
    noDispatch(await call(client, { name: actor === 'a' ? 'gateway.disposition' : 'gateway.collect', arguments: {} }),
      'TOOL_NOT_AVAILABLE_FOR_ACTOR');
    // The official SDK refuses non-record argument shapes before the custom handler.
    for (const args of [[], null]) await assert.rejects(client.request({ method: 'tools/call',
      params: { name: 'gateway.status', arguments: args } }, CallToolResultSchema, { timeout: 2000 }),
    error => error.code === -32602);
    assert.deepEqual(calls, []);
  });
});

test('MCP call params are exact and own proto, metadata and task selectors cannot disappear before guard', { timeout: 10000 }, async () => {
  await session('a', async ({ client, calls }) => {
    for (const params of [
      { name: 'gateway.status', arguments: {}, extra: true },
      { name: 'gateway.status', arguments: {}, _meta: { actor: 'b' } },
      JSON.parse('{"name":"gateway.status","arguments":{},"__proto__":{"actor":"b"}}'),
      { name: 'gateway.status' }
    ]) noDispatch(await call(client, params), 'INVALID_TOOL_PARAMETERS');
    // Task creation is rejected by SDK capability enforcement before our handler.
    await assert.rejects(client.request({ method: 'tools/call', params: {
      name: 'gateway.status', arguments: {}, task: { ttl: 1 }
    } }, CallToolResultSchema, { timeout: 2000 }), error => Number.isInteger(error.code) && /task/i.test(error.message));
    assert.deepEqual(calls, []);
  });
});

test('trusted launch has one fixed case/actor grammar and finite gateway frame/session limits', () => {
  assert.deepEqual(parseLaunch(['--case', caseId, '--actor', 'a']), { caseId, actor: 'a' });
  assert.deepEqual(parseLaunch(['--case', caseId, '--actor', 'b']), { caseId, actor: 'b' });
  for (const args of [[], ['--actor', 'a', '--case', caseId], ['--case', '../case', '--actor', 'a'],
    ['--case', `${caseId}\n`, '--actor', 'a'],
    ['--case', caseId, '--actor', 'c'], ['--case', caseId, '--actor', 'a', '--module', 'other'],
    ['--case', caseId, '--actor', 'a', '--profile', 'other'], ['--case', caseId, '--actor', 'a', '--case', 'other']]) {
    assert.throws(() => parseLaunch(args), /INVALID_LAUNCH_ARGUMENTS/);
  }
  assert.equal(Object.isFrozen(GATEWAY_LIMITS), true);
  assert.deepEqual(GATEWAY_LIMITS, { inputFrameBytes: 16 * 1024, responseBytes: 49 * 1024,
    sessionRequests: 64, sessionOutputBytes: 1024 * 1024 });
});

test('raw JSON-line gateway transport preserves proto and extra parameters for no-dispatch refusal', { timeout: 10000 }, async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const transport = new GatewayStdioTransport(input, output, { limits: GATEWAY_LIMITS });
  const calls = [];
  const application = Object.fromEntries(['inspectCase', 'collectCase', 'recordReviewProgress', 'reviewCase']
    .map(name => [name, async (...args) => { calls.push([name, ...args]); return initialSummary(); }]));
  const server = await createGatewayServer({ caseId, actor: 'a', application });
  const waiting = new Map();
  const responseFrames = [];
  let buffered = '';
  output.on('data', chunk => {
    buffered += chunk.toString('utf8');
    let newline;
    while ((newline = buffered.indexOf('\n')) !== -1) {
      const frame = buffered.slice(0, newline); buffered = buffered.slice(newline + 1);
      const message = JSON.parse(frame);
      responseFrames.push(frame);
      const pending = waiting.get(message.id);
      if (pending) { waiting.delete(message.id); clearTimeout(pending.timer); pending.resolve(message); }
    }
  });
  const send = (id, line) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`MOCK_RPC_RESPONSE_TIMEOUT:${id}`)); }, 2000);
    waiting.set(id, { resolve, reject, timer });
    input.write(`${line}\n`);
  });
  try {
    await server.connect(transport);
    const initialized = await send(1, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'raw-gateway-test', version: '0.0.0' }
    } }));
    assert.equal(Object.hasOwn(initialized, 'error'), false);
    input.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    const malformed = [
      '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"gateway.collect","arguments":{},"__proto__":{"actor":"b"}}}',
      '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"gateway.collect","arguments":{},"extra":true}}',
      '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"gateway.collect","arguments":{"__proto__":{"actor":"b"}}}}'
    ];
    for (let i = 0; i < malformed.length; i++) {
      const response = await send(i + 2, malformed[i]);
      assert.equal(Object.hasOwn(response, 'error'), false);
      const value = JSON.parse(response.result.content[0].text);
      assert.deepEqual(value, response.result.structuredContent);
      noDispatch(value, i === 2 ? 'INVALID_ARGUMENTS' : 'INVALID_TOOL_PARAMETERS');
      assert.deepEqual(calls, []);
    }
    const accepted = await send(5,
      '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"gateway.collect","arguments":{}}}');
    assert.equal(accepted.result.structuredContent.ok, true);
    assert.deepEqual(calls, [['collectCase', caseId]]);
    assert.equal(responseFrames.length, 5);
    assert.ok(responseFrames.every(frame => Buffer.byteLength(frame, 'utf8') + 1 <= GATEWAY_LIMITS.responseBytes));
  } finally {
    for (const pending of waiting.values()) { clearTimeout(pending.timer); pending.reject(new Error('MOCK_TRANSPORT_CLOSED')); }
    input.end();
    await Promise.allSettled([server.close(), transport.close()]);
    output.destroy();
  }
});

test('agent client preserves a valid envelope and treats channel or binding failures as uncertain without retry', async () => {
  const envelope = { schemaVersion: 'continuity-agent-gateway/1', caseId, actor: 'a', ok: true, code: 'OK',
    result: { kind: 'CASE_SUMMARY' }, scope: { grantsCurrentAuthority: false, incidentResolution: 'NOT_PROVEN' } };
  const response = value => ({ structuredContent: value, isError: !value.ok,
    content: [{ type: 'text', text: JSON.stringify(value) }] });
  let behavior = () => response(envelope);
  const calls = [];
  const agent = createAgentClient({ callTool: async params => { calls.push(params); return behavior(); } }, { caseId, actor: 'a' });
  assert.deepEqual(await agent.request('gateway.status'), envelope);
  const brokenText = response(envelope); brokenText.content[0].text = JSON.stringify({ ...envelope, ok: false });
  for (const next of [
    () => { throw new Error('/private/CHANNEL_FAILURE'); },
    () => response({ ...envelope, caseId: 'wrong-case' }),
    () => response({ ...envelope, actor: 'b' }),
    () => brokenText
  ]) {
    behavior = next;
    const before = calls.length;
    await assert.rejects(agent.request('gateway.collect'), { message: 'GATEWAY_RESPONSE_UNAVAILABLE_OUTCOME_UNKNOWN' });
    assert.equal(calls.length, before + 1);
  }
  assert.deepEqual(calls, [{ name: 'gateway.status', arguments: {} },
    ...Array.from({ length: 4 }, () => ({ name: 'gateway.collect', arguments: {} }))]);
});
