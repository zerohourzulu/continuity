import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { explainBytes, explainCode, explainRecord } from '../messages/explain.mjs';

test('unavailable proof explanation preserves typed cause and excludes private payload', () => {
  const record = {status: 'UNVERIFIED', reason: 'P_NATIVE_VERIFIER_UNAVAILABLE', permitsExecution: false,
    cause: {kind: 'INPUT_FILE_MISSING', phase: 'NOT_STARTED'}, privatePayload: 'PRIVATE_SENTINEL'};
  const before = structuredClone(record);
  const text = explainRecord('p-v9', record);
  assert.match(text, /does not mean the proof is bad/);
  assert.match(text, /verifier did not start/);
  assert.match(text, /required input file was not found/);
  assert.match(text, /P_NATIVE_VERIFIER_UNAVAILABLE/);
  assert.doesNotMatch(text, /PRIVATE_SENTINEL/);
  assert.deepEqual(record, before);
});

test('guarded empty CALL refusal does not invent a bad-proof conclusion', () => {
  const text = explainRecord('p-v9', {status: 'UNVERIFIED', reason: 'P_PROOF_CHECK_FAILED',
    componentReason: 'ENROLLED_CHECK_FAILED', checkDetail: 'FALLBACK_EMPTY_REVERT'});
  assert.match(text, /did not pass the enrolled check/);
  assert.match(text, /does not show that it was faked/);
  assert.match(text, /guarded exact empty CALL revert/);
  assert.throws(() => explainRecord('p-v9', {status: 'UNVERIFIED', reason: 'P_PROOF_CHECK_FAILED', componentReason: 'PUBLIC_RESULT_MISMATCH'}));
});

test('unsupported reader format retains its distinct operator explanation', () => {
  const text = explainRecord('reader', {code: 'UNSUPPORTED_HISTORY_PROFILE'});
  assert.match(text, /source, binding, manifest or migration format this reader does not support/);
  assert.match(text, /Reported code: UNSUPPORTED_HISTORY_PROFILE/);
  assert.doesNotMatch(text, /a stage is still open/);
});

test('unknown or contradictory supplied contexts are refused', () => {
  for (const value of [null, [], {status: 'VERIFIED', reason: 'P_NATIVE_RESULT'},
    {status: 'UNVERIFIED', reason: 'P_NATIVE_RESULT', permitsExecution: true},
    {status: 'UNVERIFIED', reason: 'P_NATIVE_SNAPSHOT_CHANGED', cause: {kind: 'SNAPSHOT_CHANGED', phase: 'NOT_STARTED'}}]) {
    assert.throws(() => explainRecord('p-v9', value));
  }
  assert.throws(() => explainRecord('unknown-surface', {code: 'REFUSED'}));
  assert.throws(() => explainCode('gateway', 'UNKNOWN'));
});

test('strict saved-record input rejects duplicate keys and extra JSON values', () => {
  for (const bytes of ['{"code":"UNSUPPORTED_HISTORY_PROFILE","code":"HELP"}',
    '{"code":"UNSUPPORTED_HISTORY_PROFILE"} {}', Buffer.from([0xff]), 'x'.repeat(65537)]) {
    assert.throws(() => explainBytes('reader', bytes));
  }
});

test('CLI emits bounded human guidance while malformed input exits with refusal', () => {
  const cli = new URL('../messages/explain.mjs', import.meta.url);
  const success = spawnSync(process.execPath, [cli.pathname, '--surface', 'gateway', '--code', 'GATEWAY_CONFIGURATION_UNAVAILABLE'], {encoding: 'utf8'});
  assert.equal(success.status, 0);
  assert.match(success.stdout, /does not establish that nothing started or that a restart is safe/);
  const refused = spawnSync(process.execPath, [cli.pathname, '--surface', 'reader'], {input: '{}', encoding: 'utf8'});
  assert.equal(refused.status, 2);
  assert.equal(refused.stdout, '');
  assert.match(refused.stderr, /EXPLANATION_CONTEXT_REFUSED/);
});
