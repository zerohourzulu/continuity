import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { setup, disposition } from './helpers.mjs';
import * as core from '../packages/core-0.2/src/core/index.ts';
import { PortableFileEventStore } from '../packages/core-0.2/src/indexer/portable-file-event-store.ts';
import { openLocalAttemptRecorder } from '../packages/core-0.3/src/attempts.ts';
import { stateOf } from '../packages/core-0.3/src/local-store.ts';
import { createPortableQueryProjectionWriter } from '../packages/core-0.2/src/core/portable-query-output.ts';
import { REFERENCE_OUTPUT_LIMITS } from '../packages/core-0.2/src/core/reference-output-budget.ts';

const replay = events => core.replayPortable({ operationVersion: core.PORTABLE_REPLAY_VERSION, events });
const query = (observedEvents, extra = {}) => core.survivesPortable({
  operationVersion: core.PORTABLE_QUERY_VERSION, observedEvents, targetAgentId: 'bea', evaluationTime: 100,
  disclosure: core.portablePublicQueryDisclosure('SURVIVES'), ...extra,
});
const noAnswer = (result, code) => {
  assert.notEqual(result.epistemicStatus, 'ESTABLISHED');
  assert.equal(result.code, code);
  assert.equal(Object.hasOwn(result, 'answer'), false);
};
async function recording(t) {
  const s = await setup(t, 'pending');
  assert.equal(disposition(await s.broker.run(s.request)), 'OUTCOME_UNKNOWN');
  s.owner.grant({ id: 'attempt-recording', to: 'bea', actions: ['OBSERVE_OUTCOME', 'CREATE_ATTEMPT_DUTY'], resources: ['job:1'], expiresAt: 9999 });
  const state = replay(s.owner.exportHistory());
  assert.equal(state.status, 'ACCEPTED');
  const identity = stateOf(s.owner.exportHistory()).intentAdmissions.get('job:1').adapterIdentity;
  const acknowledgment = digit => core.createRemoteServiceReportAcknowledgment(identity, `0x${digit.repeat(64)}`);
  return { ...s, acknowledgment, recorder: openLocalAttemptRecorder(s.options) };
}

test('independently signed observation forks stay unverified rather than becoming one divergent-report history', async t => {
  const s = await recording(t);
  const base = s.owner.exportHistory(), head = replay(base).head;
  const leftFile = join(s.dir, 'left.jsonl'), rightFile = join(s.dir, 'right.jsonl');
  copyFileSync(s.options.historyFile, leftFile);
  copyFileSync(s.options.historyFile, rightFile);
  const leftRecorder = openLocalAttemptRecorder({ ...s.options, historyFile: leftFile });
  const rightRecorder = openLocalAttemptRecorder({ ...s.options, historyFile: rightFile });
  await leftRecorder.observe({ id: 'left-report', intent: 'job:1', acknowledgment: s.acknowledgment('a') });
  await rightRecorder.observe({ id: 'right-report', intent: 'job:1', acknowledgment: s.acknowledgment('b') });
  const left = new PortableFileEventStore(leftFile).readAll();
  const right = new PortableFileEventStore(rightFile).readAll();
  for (const branch of [left, right]) {
    assert.equal(replay(branch).status, 'ACCEPTED');
    assert.equal(branch.at(-1).data.administrativeAuthorization.challenge.eventHistoryHash, head.hash);
    const single = query(branch);
    assert.equal(single.epistemicStatus, 'ESTABLISHED');
    assert.equal(single.answer.outcomeObservations.length, 1);
    assert.equal(single.answer.outcomeObservations[0].reportStatus, 'REPORT_RECORDED');
  }
  assert.notEqual(left.at(-1).data.administrativeAuthorization.runtimeSignature, right.at(-1).data.administrativeAuthorization.runtimeSignature);
  for (const [evaluationEvents, observedEvents] of [[left, right], [right, left]]) {
    const comparison = query(observedEvents, { evaluationEvents });
    noAnswer(comparison, 'HISTORY_RELATION_UNVERIFIED');
    assert.equal(comparison.scope.headRelationship, 'UNVERIFIED');
    assert.equal(comparison.scope.freshness, 'UNVERIFIED');
    assert.equal(comparison.evidence.length, 2);
    assert.notEqual(comparison.evidence[0].historyHash, comparison.evidence[1].historyHash);
  }
  // Concatenation cannot turn the second branch's original-head signature into
  // a signature over the first branch. This is not a history merge operation.
  const concatenated = [...left, right.at(-1)];
  assert.equal(replay(concatenated).status, 'REJECTED');
  noAnswer(query(concatenated), 'STATE_NOT_AUTHORITATIVE');
  // The same two reports can coexist only through a new signature at the
  // selected continuation's exact head, producing a different valid history.
  await leftRecorder.observe({ id: 'continued-report', intent: 'job:1', acknowledgment: s.acknowledgment('b') });
  const continued = query(new PortableFileEventStore(leftFile).readAll());
  assert.equal(continued.epistemicStatus, 'ESTABLISHED');
  assert.equal(continued.answer.outcomeObservations.length, 2);
  assert.ok(continued.answer.outcomeObservations.every(item => item.reportStatus === 'DIVERGENT_REPORTS' && item.externalOutcome === 'NOT_PROVEN'));
  assert.equal(s.service.stats().requests, 1);
  assert.equal(s.service.stats().effects, 0);
});

test('strict-extension queries preserve evaluation-time facts and require disclosure of new attempt fields', async t => {
  const s = await recording(t);
  await s.recorder.createDuty({ id: 'review', intent: 'job:1', description: 'Review the pending attempt', deadline: 300 });
  await s.recorder.observe({ id: 'report-a', intent: 'job:1', acknowledgment: s.acknowledgment('a') });
  const evaluationEvents = s.owner.exportHistory();
  await s.recorder.observe({ id: 'report-b', intent: 'job:1', acknowledgment: s.acknowledgment('b') });
  const observedEvents = s.owner.exportHistory();
  const historical = query(observedEvents, { evaluationEvents });
  assert.equal(historical.epistemicStatus, 'ESTABLISHED');
  assert.equal(historical.scope.headRelationship, 'STRICT_EXTENSION');
  assert.equal(historical.scope.freshness, 'AT_EVALUATION');
  assert.equal(historical.answer.outcomeObservations.length, 1);
  assert.equal(historical.answer.outcomeObservations[0].reportStatus, 'REPORT_RECORDED');
  assert.equal(historical.answer.attemptDuties[0].status, 'OPEN');
  assert.equal(query(observedEvents).answer.outcomeObservations.length, 2);
  for (const field of ['outcomeObservations.reportDigest.value', 'attemptDuties.evidence']) {
    const all = core.portablePublicQueryDisclosure('SURVIVES');
    const disclosure = { mode: 'PUBLIC_MINIMAL', includedFields: all.includedFields.filter(path => path !== field), withheldFields: [field] };
    noAnswer(query(observedEvents, { disclosure }), 'DISCLOSURE_INVALID');
  }
});

test('new attempt fields remain inside replay and query input limits with no partial answer', async t => {
  const s = await recording(t);
  await s.recorder.createDuty({ id: 'review', intent: 'job:1', description: 'Review the pending attempt', deadline: 300 });
  await s.recorder.observe({ id: 'report-a', intent: 'job:1', acknowledgment: s.acknowledgment('a') });
  const events = s.owner.exportHistory();
  const cases = [
    ['description bytes', copy => { copy.find(e => e.type === 'ATTEMPT_DUTY_CREATED').data.record.description = 'x'.repeat(4097); }],
    ['source admission identifier bytes', copy => { copy.at(-1).data.sourceAdmissionEventId = 'x'.repeat(257); }],
    ['report digest bytes', copy => { copy.at(-1).data.acknowledgment.result.reportDigest.value = 'x'.repeat(4097); }],
  ];
  for (const [label, change] of cases) {
    const changed = structuredClone(events); change(changed);
    assert.equal(replay(changed).status, 'REJECTED', label);
    noAnswer(query(changed), 'INVALID_INPUT');
  }
  const oversizedHistory = Array.from({ length: 4097 }, () => events[0]);
  assert.equal(replay(oversizedHistory).status, 'REJECTED');
  noAnswer(query(oversizedHistory), 'INVALID_INPUT');
  assert.equal(query(events).epistemicStatus, 'ESTABLISHED');
});

test('projection accounting charges repeated evidence in each new row and withholds overflow answers', async t => {
  const s = await recording(t);
  await s.recorder.createDuty({ id: 'review', intent: 'job:1', description: 'Review the pending attempt', deadline: 300 });
  await s.recorder.observe({ id: 'report-a', intent: 'job:1', acknowledgment: s.acknowledgment('a') });
  const accepted = query(s.owner.exportHistory());
  assert.equal(accepted.epistemicStatus, 'ESTABLISHED');
  const rows = ['outcomeObservations', 'attemptDuties'].map(field => [field, accepted.answer[field][0]]);
  // This directly tests the package-owned projection writer using real E5 row
  // shapes. It does not claim these copied rows are a valid large signed history.
  const build = count => {
    const writer = createPortableQueryProjectionWriter({ outcomeObservations: [], attemptDuties: [] });
    for (let index = 0; index < count; index++) {
      const [field, row] = rows[index % rows.length];
      const { evidence, ...members } = row;
      assert.equal(evidence.length, 2);
      writer.row(field, `row:${index}`, members, [...evidence, evidence[0]]);
    }
    return writer.finish(() => {});
  };
  assert.equal(REFERENCE_OUTPUT_LIMITS.evidenceOccurrences, 4096);
  const fits = build(2048);
  assert.equal(fits.outputLimitExceeded, false);
  assert.equal(fits.answer.outcomeObservations.length + fits.answer.attemptDuties.length, 2048);
  const overflow = build(2049);
  assert.equal(overflow.outputLimitExceeded, true);
  assert.equal(Object.hasOwn(overflow, 'answer'), false);
  assert.ok(overflow.includedFields.includes('outcomeObservations.reportDigest.value'));
  assert.ok(overflow.includedFields.includes('attemptDuties.evidence.historyHash'));
});
