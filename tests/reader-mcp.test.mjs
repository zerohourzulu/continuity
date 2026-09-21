import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { handover, mandate, FIXTURES, ID, MANDATE } from './helpers.mjs';
import { encode, LIMITS } from '../lib/reader-contract.mjs';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SERVER = join(ROOT, 'integrations/retained-evidence-mcp/src/server.mjs');
const request = (id, method, params) => ({ jsonrpc: '2.0', id, method, params });
const init = request(0, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'reader-test', version: '1' } });
const initialized = { jsonrpc: '2.0', method: 'notifications/initialized' };
const call = (id, operation, args) => request(id, 'tools/call', { name: `continuity_${operation}`, arguments: args });
const value = reply => JSON.parse(reply.result.content[0].text);
function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'continuity-mcp-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const history = join(dir, 'history.jsonl'); writeFileSync(history, readFileSync(join(FIXTURES, 'handover-history.jsonl')));
  writeFileSync(join(dir, 'quantity.json'), encode(mandate.events.slice(0, 6)));
  const config = join(dir, 'config.json');
  const operations = ['verify', 'status', 'check', 'why', 'responsible', 'survives', 'handover_report'];
  writeFileSync(config, JSON.stringify({ version: 'continuity-reader-config/1', root: '.', sources: {
    demo: { file: 'history.jsonl', disclosure: 'evidence', operations },
    quiet: { file: 'history.jsonl', disclosure: 'summary', operations },
    limited: { file: 'history.jsonl', disclosure: 'summary', operations: ['verify'] },
    quantity: { file: 'quantity.json', disclosure: 'evidence', operations: ['check'] },
  } }));
  return { dir, config, history };
}
function batch(config, messages, extra = '') {
  const result = spawnSync(process.execPath, [SERVER, '--config', config], {
    cwd: ROOT, input: messages.map(x => JSON.stringify(x) + '\n').join('') + extra,
    encoding: 'utf8', timeout: 90000, maxBuffer: 2 * 1024 * 1024,
  });
  assert(!result.error, String(result.error));
  return { ...result, replies: result.stdout.trim().split('\n').filter(Boolean).map(x => JSON.parse(x)) };
}

test('real stdio lifecycle, tools and one-head composite report agree with CLI', t => {
  const { config, history } = setup(t), before = readFileSync(history), configBefore = readFileSync(config);
  const asks = { source: 'demo', actor: ID.b, action: 'record-review-progress', resource: ID.obligation, at: '25' };
  const run = batch(config, [request(99, 'tools/list', {}), init, initialized, request(1, 'tools/list', {}), call(2, 'list_histories', {}), call(3, 'check', asks), call(4, 'why', asks), call(5, 'responsible', asks), call(6, 'survives', { source: 'demo', agent: ID.a }), call(7, 'handover_report', { source: 'demo' }), call(8, 'status', { source: 'demo' }), request(9, 'ping', {})]);
  assert.equal(run.status, 0, run.stderr); assert.equal(run.stderr, '');
  const byId = new Map(run.replies.map(r => [r.id, r]));
  assert.equal(byId.get(99).error.message, 'NOT_INITIALIZED');
  assert.equal(byId.get(0).result.protocolVersion, '2025-06-18');
  assert.match(byId.get(0).result.instructions, /not a capability/);
  assert.equal(byId.get(1).result.tools.length, 8);
  assert(!JSON.stringify(value(byId.get(2))).includes(history));
  assert.equal(value(byId.get(3)).decision, 'ALLOW');
  assert.equal(value(byId.get(4)).result.answer.authorization.decision, 'ALLOW');
  assert.equal(value(byId.get(5)).result.answer.authorizationDecision, 'ALLOW');
  assert.equal(value(byId.get(6)).result.answer.obligations[0].status, 'OPEN');
  const report = value(byId.get(7));
  for (const row of report.agents) assert.deepEqual(row.result.scope.observedHead, report.head);
  assert.deepEqual(value(byId.get(8)).agents, report.agents);
  const cli = spawnSync(process.execPath, ['bin/continuity.mjs', 'handover_report', '--file', history, '--json'], { cwd: ROOT, encoding: 'utf8', timeout: 20000 });
  assert.equal(cli.status, 0, cli.stderr);
  const cliReport = JSON.parse(cli.stdout);
  assert.deepEqual(cliReport.agents, report.agents); assert.deepEqual(cliReport.head, report.head);
  assert.deepEqual(readFileSync(history), before); assert.deepEqual(readFileSync(config), configBefore);
});

test('real stdio denies caller paths, config override, wider disclosure and invalid quantities', t => {
  const { config, history } = setup(t);
  const ask = { actor: ID.b, action: 'record-review-progress', resource: ID.obligation };
  const run = batch(config, [init, initialized,
    call(1, 'verify', { source: history }), call(2, 'verify', { source: '../history.jsonl' }), call(3, 'verify', { source: 'absent' }),
    call(4, 'check', { source: 'limited', ...ask }), call(5, 'why', { source: 'quiet', ...ask }),
    call(6, 'status', { source: 'quiet' }), call(7, 'check', { source: 'quiet', ...ask }),
    call(8, 'verify', { source: 'demo', history }), call(9, 'check', { source: 'quiet', ...ask, disclosure: 'evidence' }),
    call(10, 'check', { source: 'demo', ...ask, amount: 0 }), call(11, 'check', { source: 'demo', ...ask, consequential: true }),
    call(12, 'verify', { source: 'demo', at: null }), call(13, 'verify', { source: 'demo', at: '01' }),
  ]);
  assert.equal(run.status, 0, run.stderr);
  const byId = new Map(run.replies.map(r => [r.id, r]));
  for (const id of [1, 2, 3]) assert.equal(value(byId.get(id)).error, 'SOURCE_DENIED');
  assert.equal(value(byId.get(4)).error, 'OPERATION_DENIED');
  assert.equal(value(byId.get(5)).error, 'DISCLOSURE_DENIED');
  assert(!('agents' in value(byId.get(6))));
  assert(!('evidence' in value(byId.get(7)))); assert.equal(value(byId.get(7)).decision, 'ALLOW');
  for (const id of [8, 9, 11]) assert.equal(byId.get(id).error.message, 'INVALID_PARAMS');
  assert.equal(value(byId.get(10)).error, 'INVALID_AMOUNT');
  for (const id of [12, 13]) assert.equal(value(byId.get(id)).error, 'INVALID_EVALUATION_TIME');
  assert(!run.stdout.includes(history)); assert(!run.stdout.includes(ID.reviewAuthorityB));
});

test('exact quantitative omission and decimal values cross actual stdio', t => {
  const { config } = setup(t);
  const base = { source: 'quantity', actor: MANDATE.buyer, action: 'purchase', resource: MANDATE.plush };
  const run = batch(config, [init, initialized, call(1, 'check', base), call(2, 'check', { ...base, amount: '0' }), call(3, 'check', { ...base, amount: '2500' }), call(4, 'check', { ...base, amount: '2501' })]);
  assert.equal(run.status, 0, run.stderr);
  const results = run.replies.slice(1).map(value);
  assert.deepEqual(results.map(r => r.decision), ['DENY', 'ALLOW', 'ALLOW', 'DENY']);
  assert.deepEqual(results.map(r => r.code), ['AMOUNT_REQUIRED', null, null, 'AMOUNT_EXCEEDED']);
  assert(!Object.hasOwn(results[0].request, 'amount')); assert.equal(results[1].request.amount, '0');
});

test('actual transport rejects duplicates, nesting, oversized and incomplete frames', t => {
  const { config } = setup(t);
  const duplicate = batch(config, [init, initialized], '{"jsonrpc":"2.0","id":1,"method":"ping","params":{"x":1,"\\u0078":2}}\n');
  assert.equal(duplicate.replies.at(-1).error.message, 'PARSE_ERROR');
  const deep = batch(config, [], '['.repeat(17) + '0' + ']'.repeat(17) + '\n');
  assert.equal(deep.replies[0].error.message, 'PARSE_ERROR');
  const large = batch(config, [], 'x'.repeat(LIMITS.request + 1));
  assert.equal(large.status, 2); assert.equal(large.replies[0].error.message, 'REQUEST_LIMIT_EXCEEDED');
  const incomplete = batch(config, [], '{');
  assert.equal(incomplete.status, 2); assert.equal(incomplete.replies[0].error.message, 'INCOMPLETE_MESSAGE');
});
test('real stdio rejects oversized and duplicate-key history without leaking source data', t => {
  const { config, history } = setup(t);
  writeFileSync(history, Buffer.alloc(LIMITS.history + 1, 65));
  let run = batch(config, [init, initialized, call(1, 'verify', { source: 'demo' })]);
  assert.equal(value(run.replies.at(-1)).error, 'SOURCE_BYTES_EXCEEDED');
  writeFileSync(history, '[{"secret":"HIDDEN-MARKER","secret":1}]');
  run = batch(config, [init, initialized, call(1, 'verify', { source: 'demo' })]);
  assert.equal(value(run.replies.at(-1)).error, 'DUPLICATE_KEY');
  assert(!run.stdout.includes('HIDDEN-MARKER')); assert(!run.stdout.includes(history));
  writeFileSync(history, Buffer.from([0xc0, 0xaf]));
  run = batch(config, [init, initialized, call(1, 'verify', { source: 'demo' })]);
  assert.equal(value(run.replies.at(-1)).error, 'HISTORY_MALFORMED');
});

test('running server captures config and rejects a later source symlink swap', async t => {
  const { config, history, dir } = setup(t);
  const child = spawn(process.execPath, [SERVER, '--config', config], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => child.kill('SIGKILL'));
  let pending = '', errorText = '', waiting = [];
  child.stderr.on('data', b => { errorText += b; });
  child.stdout.on('data', b => {
    pending += b;
    let index;
    while ((index = pending.indexOf('\n')) >= 0) {
      const result = JSON.parse(pending.slice(0, index)); pending = pending.slice(index + 1);
      const item = waiting.shift(); assert(item); clearTimeout(item.timer); item.resolve(result);
    }
  });
  const send = message => new Promise((resolve, reject) => {
    const item = { resolve, timer: setTimeout(() => reject(new Error('RPC timeout')), 20000) };
    waiting.push(item); child.stdin.write(JSON.stringify(message) + '\n');
  });
  await send(init); child.stdin.write(JSON.stringify(initialized) + '\n');
  const first = await send(call(1, 'verify', { source: 'demo' })); assert.equal(value(first).replayStatus, 'ACCEPTED');
  writeFileSync(config, '{}');
  const second = await send(call(2, 'verify', { source: 'demo' })); assert.equal(value(second).configHash, value(first).configHash);
  renameSync(history, join(dir, 'moved.jsonl')); symlinkSync(join(dir, 'moved.jsonl'), history);
  const refused = await send(call(3, 'verify', { source: 'demo' })); assert.equal(value(refused).error, 'SOURCE_PATH_DENIED');
  assert(!JSON.stringify(refused).includes(dir));
  child.stdin.end();
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('server did not exit')), 5000); child.on('close', status => { clearTimeout(timer); assert.equal(status, 0, errorText); resolve(); }); });
});
