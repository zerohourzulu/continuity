// Root integration regressions; fixture semantics and query vocabulary reused
// from the contributed CLI/Lens/MCP tests. Expected decisions remain unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, renameSync, symlinkSync, linkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { openObservation } from '../lib/lens.mjs';
import { decodeHistory, loadSourceConfig, selectSource, readBoundedFile } from '../lib/history-source.mjs';
import { runReaderChild } from '../lib/reader-runner.mjs';
import { LIMITS, encode, boundedResult, validateOptions } from '../lib/reader-contract.mjs';
import { parseStrictJson } from '../integrations/retained-evidence-mcp/src/strict-json.mjs';
import { PortableFileEventStore } from '../packages/core-0.2/src/indexer/portable-file-event-store.ts';
import { handover, handoverDenied, mandate, MANDATE, ID, FIXTURES, replay } from './helpers.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ask = { actor: ID.b, action: 'record-review-progress', resource: ID.obligation };
function scratch(t) { const dir = mkdtempSync(join(tmpdir(), 'continuity-r2-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; }
function jsonFile(dir, name, value) { const p = join(dir, name); writeFileSync(p, encode(value)); return p; }
const code = expected => error => error.code === expected;
function cli(...args) { return spawnSync(process.execPath, ['bin/continuity.mjs', ...args], { cwd: ROOT, encoding: 'utf8', timeout: 25000, maxBuffer: 1024 * 1024 }); }

test('captured-byte decoder matches original canonical store and JSON array exactly', () => {
  const file = join(FIXTURES, 'handover-history.jsonl');
  assert.equal(encode(decodeHistory(readFileSync(file))), encode(new PortableFileEventStore(file).readAll()));
  assert.equal(encode(decodeHistory(readFileSync(join(FIXTURES, 'handover-history.json')))), encode(handover.events));
});
test('one immutable observation survives file replacement before composite queries', t => {
  const dir = scratch(t), file = jsonFile(dir, 'history.json', handover.events);
  const captured = openObservation(file);
  const head = captured.observe('verify').head;
  const alternate = jsonFile(dir, 'new.json', handoverDenied.events);
  renameSync(alternate, file);
  const report = captured.observe('handover_report', { at: '25' });
  assert.deepEqual(report.head, head);
  assert.equal(report.evaluationTime, 25);
  assert.equal(report.agents.length, 2);
  for (const row of report.agents) {
    assert.equal(row.result.epistemicStatus, 'ESTABLISHED');
    assert.deepEqual({ ...row.result.scope.observedHead }, { ...head });
    assert.deepEqual({ ...row.result.scope.evaluationHead }, { ...head });
  }
  assert.equal(captured.observe('check', ask).decision, 'ALLOW');
  assert.notEqual(openObservation(file).observe('verify').head.hash, head.hash);
  assert.equal(openObservation(file).observe('check', ask).decision, 'DENY');
  assert.equal(captured.observe('survives', { agent: ID.a }).result.answer.obligations[0].status, 'OPEN');
  assert.equal(captured.observe('survives', { agent: ID.a }).result.answer.currentPerformanceAssignments[0].assigneeId, ID.b);
  assert.equal(captured.observe('why', ask).result.answer.authorization.decision, 'ALLOW');
  assert.equal(captured.observe('responsible', ask).result.answer.authorizationDecision, 'ALLOW');
});
test('independent writer replaces history during the composite without mixing its answers', async t => {
  const dir = scratch(t), file = jsonFile(dir, 'history.json', handover.events);
  const captured = openObservation(file), head = captured.observe('verify').head;
  const control = new Int32Array(new SharedArrayBuffer(8));
  const worker = new Worker(`
    const { workerData, parentPort } = require('node:worker_threads');
    const { writeFileSync, renameSync } = require('node:fs');
    const state = new Int32Array(workerData.control);
    parentPort.postMessage('ready');
    while (!Atomics.load(state, 1)) {
      writeFileSync(workerData.file + '.next', workerData.histories[Atomics.load(state, 0) % 2]);
      renameSync(workerData.file + '.next', workerData.file);
      Atomics.add(state, 0, 1);
    }
  `, { eval: true, workerData: { file, control: control.buffer, histories: [encode(handover.events), encode(handoverDenied.events)] } });
  t.after(async () => { Atomics.store(control, 1, 1); await worker.terminate(); });
  await new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); });
  const before = Atomics.load(control, 0);
  const result = captured.observe('handover_report');
  const after = Atomics.load(control, 0);
  Atomics.store(control, 1, 1); await worker.terminate();
  assert(after > before, 'independent replacement actually occurred during report computation');
  for (const row of result.agents) assert.deepEqual({ ...row.result.scope.observedHead }, { ...head });
  assert.equal(result.agents.find(row => row.agent === ID.a).result.answer.currentPerformanceAssignments[0].assigneeId, ID.b);
});
test('real CLI reports explicit file, head, time and outcome without mutating inputs', () => {
  const file = join(FIXTURES, 'handover-history.jsonl'), before = readFileSync(file);
  const result = cli('check', '--file', file, '--actor', ID.b, '--action', ask.action, '--resource', ID.obligation, '--json');
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout);
  assert.equal(value.decision, 'ALLOW');
  assert.equal(value.evaluationTime, value.head.canonicalTime);
  assert.match(value.scopeNote, /not a capability/);
  assert(!result.stdout.includes(file));
  assert.deepEqual(readFileSync(file), before);
  const old = cli('check', '--file', file, '--actor', ID.a, '--action', ask.action, '--resource', ID.obligation, '--json');
  assert.equal(old.status, 3, old.stderr);
  assert.equal(JSON.parse(old.stdout).decision, 'DENY');
  const invalid = cli('check', '--file', file, '--actor', ID.b, '--action', ask.action, '--resource', ID.obligation, '--at', '');
  assert.equal(invalid.status, 2);
});
test('exact amount omission, zero, cap and over-cap cross the real CLI JSON boundary', t => {
  const file = jsonFile(scratch(t), 'quantitative.json', mandate.events.slice(0, 6));
  const args = ['check', '--file', file, '--actor', MANDATE.buyer, '--action', 'purchase', '--resource', MANDATE.plush, '--json'];
  for (const [amount, decision, expectedCode] of [[undefined, 'DENY', 'AMOUNT_REQUIRED'], ['0', 'ALLOW', null], ['2500', 'ALLOW', null], ['2501', 'DENY', 'AMOUNT_EXCEEDED'], [(2n ** 256n - 1n).toString(), 'DENY', 'AMOUNT_EXCEEDED']]) {
    const child = cli(...args, ...(amount === undefined ? [] : ['--amount', amount]));
    assert.equal(child.status, decision === 'ALLOW' ? 0 : 3, child.stderr);
    const result = JSON.parse(child.stdout);
    assert.equal(result.decision, decision); assert.equal(result.code, expectedCode);
    assert.equal(Object.hasOwn(result.request, 'amount'), amount !== undefined);
    if (amount !== undefined) assert.equal(result.evidence.proof?.request.amount?.['$continuity.bigint'] ?? result.request.amount, amount);
  }
  for (const amount of ['', '00', '-1', '1e3', '0x10', '1.0', ' 1', '1\n', (2n ** 256n).toString(), 0, null]) {
    assert.throws(() => validateOptions('check', { ...ask, amount }), code('INVALID_AMOUNT'));
  }
});
test('explicit canonical time is validated and affects the observed decision', () => {
  const view = openObservation(join(FIXTURES, 'handover-history.jsonl'));
  assert.equal(view.observe('check', { ...ask, at: '1001' }).decision, 'DENY');
  for (const at of [null, 0, '', '-0', '01', '1e2', '9007199254740992', '1\n']) assert.throws(() => view.observe('verify', { at }), code('INVALID_EVALUATION_TIME'));
  assert.equal(view.observe('verify', { at: '0' }).evaluationTime, 0);
  for (const extra of [{ consequential: true }, { disclosure: 'evidence' }, { events: [] }, { head: {} }]) assert.throws(() => view.observe('check', { ...ask, ...extra }), code('INVALID_ARGUMENTS'));
});
test('summary disclosure conceals evidence and refuses wider queries before release', () => {
  const file = join(FIXTURES, 'handover-history.jsonl');
  const view = openObservation(file, { disclosure: 'summary' });
  const status = view.observe('status');
  assert(!('agents' in status));
  assert(!encode(status).includes(ID.a));
  const check = view.observe('check', ask);
  assert.equal(check.decision, 'ALLOW'); assert(!('evidence' in check));
  assert(!encode(check).includes(ID.reviewAuthorityB));
  for (const op of ['why', 'responsible', 'survives', 'handover_report']) assert.throws(() => view.observe(op, op === 'survives' ? { agent: ID.a } : ['why', 'responsible'].includes(op) ? ask : {}), code('DISCLOSURE_DENIED'));
});
test('named config rejects traversal, links and unpermitted operations without host paths', t => {
  const dir = scratch(t), file = jsonFile(dir, 'history.json', handover.events);
  const cfg = jsonFile(dir, 'config.json', { version: 'continuity-reader-config/1', root: '.', sources: { demo: { file: 'history.json', disclosure: 'summary', operations: ['verify'] } } });
  const loaded = loadSourceConfig(cfg);
  assert.equal(selectSource(loaded, 'demo', 'verify').path, realpathSync(file));
  for (const name of ['../history.json', file, 'missing', 'demo\n', '__proto__']) assert.throws(() => selectSource(loaded, name, 'verify'), code('SOURCE_DENIED'));
  assert.throws(() => selectSource(loaded, 'demo', 'check'), code('OPERATION_DENIED'));
  const alternate = jsonFile(dir, 'replacement.json', { version: 'continuity-reader-config/1', root: '.', sources: {} });
  renameSync(alternate, cfg);
  assert.equal(selectSource(loaded, 'demo', 'verify').path, realpathSync(file), 'configuration captured at startup');
  renameSync(file, join(dir, 'original.json')); symlinkSync(join(dir, 'original.json'), file);
  assert.throws(() => selectSource(loaded, 'demo', 'verify'), code('SOURCE_PATH_DENIED'));
  assert.throws(() => readBoundedFile(file), code('SOURCE_UNAVAILABLE'));
  linkSync(join(dir, 'original.json'), join(dir, 'hard.json'));
  assert.throws(() => readBoundedFile(join(dir, 'hard.json')), code('SOURCE_NOT_REGULAR'));
});
test('strict JSON refuses duplicate escaped keys, malformed UTF8, nesting and finite limits', () => {
  for (const text of ['{"a":1,"\\u0061":2}', '{"x":{"a":1,"a":2}}']) assert.throws(() => parseStrictJson(Buffer.from(text)), code('DUPLICATE_KEY'));
  assert.throws(() => parseStrictJson(Buffer.from([0xc0, 0xaf])), code('INVALID_UTF8'));
  assert.throws(() => parseStrictJson(Buffer.from('['.repeat(65) + '0' + ']'.repeat(65))), code('JSON_DEPTH_EXCEEDED'));
  assert.throws(() => parseStrictJson(Buffer.from('[1,2,3]'), { maxNodes: 3 }), code('JSON_NODES_EXCEEDED'));
  assert.throws(() => parseStrictJson(Buffer.from('1e400')), code('INVALID_JSON_NUMBER'));
  assert.throws(() => decodeHistory(Buffer.alloc(LIMITS.history + 1)), code('SOURCE_BYTES_EXCEEDED'));
  assert.throws(() => decodeHistory(Buffer.from(encode(Array(257).fill(handover.events[0])))), code('EVENT_LIMIT_EXCEEDED'));
  assert.throws(() => decodeHistory(Buffer.from('[]')), code('HISTORY_EMPTY'));
  assert.throws(() => decodeHistory(Buffer.from('[{"$continuity.bigint":"0","extra":1}]')), code('HISTORY_MALFORMED'));
  assert.throws(() => boundedResult({ x: 'x'.repeat(LIMITS.output) }), code('OUTPUT_LIMIT_EXCEEDED'));
});
test('store integrity errors and rejected replay never become authority', t => {
  const text = readFileSync(join(FIXTURES, 'handover-history.jsonl'), 'utf8');
  assert.throws(() => decodeHistory(Buffer.from(text.replace('"recordHash":"0x', '"recordHash":"0xf'))), code('HISTORY_INTEGRITY'));
  assert.throws(() => decodeHistory(Buffer.from(text.slice(0, -1))), code('HISTORY_MALFORMED'));
  const file = jsonFile(scratch(t), 'bad.json', [{ type: 'NOT_A_PROTOCOL_EVENT' }]);
  const view = openObservation(file);
  assert.notEqual(view.observe('verify').replayStatus, 'ACCEPTED');
  assert.throws(() => view.observe('check', ask), code('HISTORY_REJECTED'));
});
test('actual worker timeout/output/import faults are bounded and classified separately', t => {
  const dir = scratch(t);
  const worker = join(dir, 'worker.mjs'), pidFile = join(dir, 'pid');
  writeFileSync(worker, `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); while(true) {}`);
  const start = Date.now();
  assert.throws(() => runReaderChild(worker, '{}', 600), code('READER_TIMEOUT'));
  assert(Date.now() - start < 5000);
  const pid = Number(readFileSync(pidFile, 'utf8'));
  assert.throws(() => process.kill(pid, 0), e => e.code === 'ESRCH');
  writeFileSync(worker, 'process.stdout.write("x".repeat(1000000));');
  assert.throws(() => runReaderChild(worker, '{}'), code('OUTPUT_LIMIT_EXCEEDED'));
  writeFileSync(worker, 'import "./missing.mjs";');
  assert.throws(() => runReaderChild(worker, '{}'), code('READER_FAILED'));
});
