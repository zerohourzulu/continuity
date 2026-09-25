import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { privateKeyToAccount } from 'viem/accounts';
import * as core from '../packages/core-0.2/src/core/index.ts';
import { CORE_EVENT_TYPES, coreEventTypeRank, validateCanonicalEventShape } from '../packages/core-0.2/src/core/event-schema.ts';
import { portableAdministrativeTransitionEffect } from '../packages/core-0.2/src/core/portable-administration-codec.ts';
import { prepareAdministrativeEvent, produceAdministrativeEvent } from '../packages/core-0.2/src/administration/index.ts';
import { PortableFileEventStore } from '../packages/core-0.2/src/indexer/portable-file-event-store.ts';
import { createLocalAttemptOwner as createLocalOwner, createLocalReviewOwner, createLocalDomain } from '../packages/core-0.3/src/local-owner.ts';
import { openLocalExecution, commitTerms } from '../packages/core-0.3/src/execution.ts';
import { openLocalAttemptRecorder, inspectAttemptHistory } from '../packages/core-0.3/src/attempts.ts';
import { stateOf } from '../packages/core-0.3/src/local-store.ts';

// Known-public fixture keys and an effect-free adapter; no network or real payments.
const firstAccount = privateKeyToAccount(`0x${'11'.repeat(32)}`);
const secondAccount = privateKeyToAccount(`0x${'22'.repeat(32)}`);
const summaryDigest = `0x${'a'.repeat(64)}`;
const reportDigest = `0x${'b'.repeat(64)}`;
const review = { id: 'review:1', duty: 'investigate', summaryDigest };
const recordActions = ['OBSERVE_OUTCOME', 'CREATE_ATTEMPT_DUTY', 'ASSIGN_ATTEMPT_DUTY'];
const sign = account => hash => account.signMessage({ message: { raw: hash } });
const replay = events => core.replayPortable({ operationVersion: core.PORTABLE_REPLAY_VERSION, events });
const query = (observedEvents, extra = {}) => core.survivesPortable({ operationVersion: core.PORTABLE_QUERY_VERSION,
  observedEvents, targetAgentId: 'first', evaluationTime: 100, disclosure: core.portablePublicQueryDisclosure('SURVIVES'), ...extra });
async function setup(t, { e5 = false, close = true, expiresAt = 1000, closeLimits = {} } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'continuity-duty-review-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let at = 100;
  const config = { historyFile: join(dir, 'history.jsonl'), domain: createLocalDomain(), owner: 'owner', controller: 'controller', now: () => at };
  const owner = (e5 ? createLocalOwner : createLocalReviewOwner)(config);
  owner.createAgent({ id: 'first' }); owner.createRole({ id: 'operator' });
  owner.appoint({ agent: 'first', role: 'operator', tenure: 'tenure:1', number: 1 });
  owner.admitRuntime({ agent: 'first', session: 'session:first', epoch: 1, key: 'key:first', address: firstAccount.address, expiresAt: 2000 });
  owner.grant({ id: 'execute', to: 'first', actions: ['make-fixture'], resources: ['synthetic'], expiresAt: 1000, maxAmount: 50n, maxCumulativeAmount: 50n, maxTransactions: 1 });
  const options = { ...config, session: 'session:first', signHash: sign(firstAccount) };
  const unknown = input => { const identity = core.derivePortableAdapterIdentity(input); return { status: 'OUTCOME_UNKNOWN', idempotencyKey: identity.idempotencyKey, submissionFingerprint: identity.submissionFingerprint }; };
  let submissions = 0;
  const policy = e5 ? core.PORTABLE_ADAPTER_POLICY_E5_HASH : core.PORTABLE_ADAPTER_POLICY_E6_HASH;
  const adapter = { adapterProfile: core.approvedPortableAdapterProfileForPolicy(policy, core.REMOTE_SERVICE_REPORT_ADAPTER_ID),
    async submit(input) { submissions++; return unknown(input); }, reconcile: unknown };
  const execution = openLocalExecution(options, adapter, 'REMOTE_REPORT');
  const result = await execution.run({ id: 'job:1', action: 'make-fixture', resource: 'synthetic', role: 'operator', tenure: 'tenure:1',
    amount: 50n, counterparty: 'synthetic:vendor', termsCommitment: commitTerms({ units: 'SYNTHETIC' }) });
  assert.equal(result.invocation.status, 'OUTCOME_UNKNOWN');
  const grantRecord = (to, id = to) => owner.grant({ id: `records:${id}`, to, actions: recordActions, resources: ['job:1'], expiresAt: 1000 });
  const grantClose = (to = 'first', id = to, extra = {}) => owner.grant({ id: `close:${id}`, to, actions: ['CLOSE_ATTEMPT_DUTY'], resources: ['job:1'], expiresAt, ...extra });
  grantRecord('first'); if (close) grantClose('first', 'first', closeLimits);
  const recorder = openLocalAttemptRecorder(options);
  await recorder.createDuty({ id: 'investigate', intent: 'job:1', description: 'Investigate retained evidence; no fulfillment claim', deadline: 2000 });
  const state = () => stateOf(owner.exportHistory());
  const acknowledgment = digest => core.createRemoteServiceReportAcknowledgment(state().intentAdmissions.get('job:1').adapterIdentity, digest ?? reportDigest);
  const view = () => inspectAttemptHistory(owner.exportHistory()).attempts[0];
  return { owner, config, options, recorder, state, acknowledgment, view, grantRecord, grantClose, submissions: () => submissions, at: n => { at = n; } };
}
function replace(s) {
  s.owner.createAgent({ id: 'second' });
  s.owner.declareSuccession({ id: 'succession', from: 'first', to: 'second', role: 'operator' });
  s.owner.succeed({ id: 'handover', rule: 'succession', fromAgent: 'first', fromTenure: 'tenure:1', toAgent: 'second', toTenure: 'tenure:2', role: 'operator', number: 2 });
  s.owner.admitRuntime({ agent: 'second', session: 'session:second', epoch: 1, key: 'key:second', address: secondAccount.address, expiresAt: 2000 });
  return { ...s.options, session: 'session:second', signHash: sign(secondAccount) };
}
function producerInput(s, overrides = {}) {
  const events = s.owner.exportHistory(), state = stateOf(events);
  const observationEventIds = (state.outcomeObservations.get('job:1') ?? []).map(x => x.eventId).sort(core.compareProtocolStrings);
  return { events, expectedDomain: s.config.domain, expectedHistoryHead: state.head, runtimeSessionId: 'session:first',
    transition: { id: 'direct:review', type: 'ATTEMPT_DUTY_REVIEW_CLOSED', timestamp: s.config.now(),
      data: { dutyId: 'investigate', actorId: 'first', observationEventIds, summaryDigest, ...overrides } } };
}
const invariant = state => core.canonicalEncode({ admissions: [...state.intentAdmissions], consumptions: [...state.intentConsumptions],
  outcomes: [...state.intentOutcomeStates], receipts: [...state.receiptCommitments], usage: [...state.authorityUsage], nonces: [...state.nonceReservationsByActor].map(([actor, reservations]) => [actor, [...reservations]]) });

test('E6 review binds complete sorted evidence and has no business, execution or capacity effect', async t => {
  const s = await setup(t);
  assert.equal(s.view().duty.reviewStatus, 'UNREVIEWED');
  await s.recorder.observe({ id: 'z', intent: 'job:1', acknowledgment: s.acknowledgment() });
  await s.recorder.observe({ id: 'a', intent: 'job:1', acknowledgment: s.acknowledgment(`0x${'c'.repeat(64)}`) });
  const before = invariant(s.state()), originalDuty = s.view().duty.record;
  const written = await s.recorder.reviewDuty(review), state = s.state(), item = s.view();
  assert.equal(item.duty.reviewStatus, 'REVIEW_CLOSED'); assert.equal(item.externalOutcome, 'NOT_PROVEN');
  assert.equal(item.reportStatus, 'DIVERGENT_REPORTS'); assert.deepEqual(item.duty.record, originalDuty); assert.equal(item.duty.record.status, 'OPEN');
  const closure = item.duty.reviews[0];
  assert.equal(closure.actorId, 'first'); assert.equal(closure.eventId, written.eventId); assert.equal(closure.summaryDigest, summaryDigest);
  assert.deepEqual(closure.observationEventIds, ['attempt-observation:a', 'attempt-observation:z']);
  assert.equal(invariant(state), before); assert.equal(s.submissions(), 1);
  const event = state.events[closure.eventPosition], effect = portableAdministrativeTransitionEffect(event);
  assert.deepEqual(effect, { transitionEventType: event.type, dutyId: 'investigate', actorId: 'first', observationEventIds: closure.observationEventIds, summaryDigest });
  assert.equal(event.data.administrativeAuthorization.challenge.transitionEffectHash, core.hashCanonical(effect));
  const q = s.owner.survives('first'); assert.equal(q.epistemicStatus, 'ESTABLISHED');
  const projected = q.answer.attemptDuties[0]; assert.equal(projected.reviewStatus, 'REVIEW_CLOSED');
  assert.deepEqual(projected.reviews, item.duty.reviews); assert.equal(projected.status, 'OPEN'); assert.equal(projected.externalOutcome, 'NOT_PROVEN');
  for (const id of [...closure.observationEventIds, closure.eventId]) assert.ok(projected.evidence.some(e => e.kind === 'EVENT' && e.eventId === id));
  const detached = state.attemptDutyReviews; detached.clear(); assert.equal(state.attemptDutyReviews.size, 1);
  assert.throws(() => { item.duty.reviews[0].observationEventIds.push('forged'); });
});

test('zero evidence review stays NOT_PROVEN; any later observation needs a fresh review and an exact repeat is observational', async t => {
  const s = await setup(t); await s.recorder.reviewDuty(review);
  assert.equal(s.view().duty.reviewStatus, 'REVIEW_CLOSED'); assert.equal(s.view().reportStatus, 'NO_RECORDED_REPORTS');
  assert.deepEqual(s.view().duty.reviews[0].observationEventIds, []);
  await s.recorder.observe({ id: 'first', intent: 'job:1', acknowledgment: s.acknowledgment() });
  assert.equal(s.view().duty.reviewStatus, 'NEEDS_REVIEW');
  let before = readFileSync(s.config.historyFile); await s.recorder.reviewDuty(review); assert.deepEqual(readFileSync(s.config.historyFile), before);
  await s.recorder.reviewDuty({ ...review, id: 'review:2' }); assert.equal(s.view().duty.reviewStatus, 'REVIEW_CLOSED');
  await s.recorder.observe({ id: 'same-digest-new-record', intent: 'job:1', acknowledgment: s.acknowledgment() });
  assert.equal(s.view().duty.reviewStatus, 'NEEDS_REVIEW'); assert.equal(s.view().reportStatus, 'REPORT_RECORDED');
  s.owner.advanceEpoch({ agent: 'first', from: 1, to: 2 });
  before = readFileSync(s.config.historyFile); await s.recorder.reviewDuty(review); assert.deepEqual(readFileSync(s.config.historyFile), before);
  await assert.rejects(s.recorder.reviewDuty({ ...review, id: 'retired-new' }));
  await assert.rejects(s.recorder.reviewDuty({ ...review, summaryDigest: `0x${'d'.repeat(64)}` }), e => e.code === 'OPERATION_CONFLICT');
  assert.equal(s.view().externalOutcome, 'NOT_PROVEN');
});

test('review requires the explicit current assignee as well as current role, runtime and independent close permission', async t => {
  const s = await setup(t); await s.recorder.reviewDuty(review);
  const nextOptions = replace(s), next = openLocalAttemptRecorder(nextOptions);
  s.grantRecord('second'); s.grantClose('second');
  await assert.rejects(next.reviewDuty({ ...review, id: 'before-assignment' }));
  await next.assignDuty({ id: 'to-second', duty: 'investigate' });
  assert.equal(s.view().duty.reviewStatus, 'NEEDS_REVIEW');
  await assert.rejects(s.recorder.reviewDuty({ ...review, id: 'former-assignee' }));
  const before = readFileSync(s.config.historyFile); await s.recorder.reviewDuty(review); assert.deepEqual(readFileSync(s.config.historyFile), before);
  await next.reviewDuty({ ...review, id: 'second-review' }); assert.equal(s.view().duty.reviewStatus, 'REVIEW_CLOSED');
  assert.deepEqual(s.view().duty.reviews.map(x => x.actorId), ['first', 'second']);
  s.owner.revoke('close:second'); await assert.rejects(next.reviewDuty({ ...review, id: 'revoked' }));
});

test('absent, capped, expired and wrong-key close authority cannot close; async signing rechecks head and fresh time', async t => {
  const missing = await setup(t, { close: false }); await assert.rejects(missing.recorder.reviewDuty(review));
  missing.grantClose('first', 'capped', { maxTransactions: 2 }); await assert.rejects(missing.recorder.reviewDuty(review));
  const expiring = await setup(t, { expiresAt: 101 }); expiring.at(101); await assert.rejects(expiring.recorder.reviewDuty(review));
  const wrong = await setup(t); const bad = openLocalAttemptRecorder({ ...wrong.options, signHash: sign(secondAccount) }); await assert.rejects(bad.reviewDuty(review));
  const race = await setup(t);
  const racing = openLocalAttemptRecorder({ ...race.options, async signHash(hash) { race.owner.createAgent({ id: 'concurrent' }); return sign(firstAccount)(hash); } });
  await assert.rejects(racing.reviewDuty(review), e => e.code === 'HISTORY_CONFLICT'); assert.equal(race.state().attemptDutyReviews.size, 0);
  const late = await setup(t, { expiresAt: 101 });
  const delayed = openLocalAttemptRecorder({ ...late.options, async signHash(hash) { late.at(101); return sign(firstAccount)(hash); } });
  await assert.rejects(delayed.reviewDuty(review)); assert.equal(late.state().attemptDutyReviews.size, 0);
});

test('replay independently rejects a forged review or incomplete evidence despite a valid administrative signature', async t => {
  const s = await setup(t);
  await s.recorder.observe({ id: 'a', intent: 'job:1', acknowledgment: s.acknowledgment() });
  await s.recorder.observe({ id: 'z', intent: 'job:1', acknowledgment: s.acknowledgment() });
  for (const observationEventIds of [[], ['attempt-observation:a'], ['attempt-observation:a', 'foreign'], ['attempt-observation:z', 'attempt-observation:a']]) {
    assert.throws(() => prepareAdministrativeEvent(producerInput(s, { observationEventIds })));
  }
  const input = producerInput(s), produced = await produceAdministrativeEvent(input, { signHash: sign(firstAccount) });
  assert.equal(replay([...input.events, produced.event]).status, 'ACCEPTED');
  for (const changed of [ { summaryDigest: `0x${'d'.repeat(64)}` }, { observationEventIds: ['attempt-observation:a'] }, { actorId: 'second' } ]) {
    const event = structuredClone(produced.event); Object.assign(event.data, changed);
    assert.notEqual(replay([...input.events, event]).status, 'ACCEPTED');
  }
  // Independently sign a malformed complete-set claim; replay must apply its own set check.
  const forged = structuredClone(produced.event); forged.data.observationEventIds = ['attempt-observation:a'];
  forged.data.administrativeAuthorization.challenge.transitionEffectHash = core.hashCanonical(portableAdministrativeTransitionEffect(forged));
  forged.data.administrativeAuthorization.runtimeSignature = await sign(firstAccount)(core.hashCanonical(forged.data.administrativeAuthorization.challenge));
  assert.equal(validateCanonicalEventShape(forged).ok, true);
  assert.notEqual(replay([...input.events, forged]).status, 'ACCEPTED');
  const foreign = structuredClone(produced.event); foreign.data.observationEventIds = ['foreign:a', 'foreign:z'];
  foreign.data.administrativeAuthorization.challenge.transitionEffectHash = core.hashCanonical(portableAdministrativeTransitionEffect(foreign));
  foreign.data.administrativeAuthorization.runtimeSignature = await sign(firstAccount)(core.hashCanonical(foreign.data.administrativeAuthorization.challenge));
  assert.equal(validateCanonicalEventShape(foreign).ok, true);
  const originalSome = Array.prototype.some;
  let attacked;
  try { Array.prototype.some = () => false; attacked = replay([...input.events, foreign]); }
  finally { Array.prototype.some = originalSome; }
  assert.equal(attacked.status, 'REJECTED');
});

test('closed schema enforces the 128-item sorted unique bound and every review field is signed', async t => {
  const s = await setup(t); const input = producerInput(s), { event } = await produceAdministrativeEvent(input, { signHash: sign(firstAccount) });
  const clone = changed => { const value = structuredClone(event); Object.assign(value.data, changed); return value; };
  assert.equal(validateCanonicalEventShape(clone({ observationEventIds: Array.from({ length: 128 }, (_, i) => `observation:${String(i).padStart(3, '0')}`) })).ok, true);
  for (const observationEventIds of [Array.from({ length: 129 }, (_, i) => `observation:${String(i).padStart(3, '0')}`), ['same', 'same'], ['z', 'a'], [undefined], null]) {
    assert.equal(validateCanonicalEventShape(clone({ observationEventIds })).ok, false);
  }
  for (const changed of [{ summaryDigest: 'bad' }, { summaryDigest: undefined }, { extra: true }, { dutyId: '' }, { actorId: 1 }]) assert.equal(validateCanonicalEventShape(clone(changed)).ok, false);
  const effect = portableAdministrativeTransitionEffect(event);
  for (const changed of [{ dutyId: 'other' }, { actorId: 'other' }, { observationEventIds: ['one'] }, { summaryDigest: `0x${'f'.repeat(64)}` }]) assert.notEqual(core.hashCanonical(effect), core.hashCanonical(portableAdministrativeTransitionEffect(clone(changed))));
  for (const bad of [{ ...review, extra: true }, { ...review, summaryDigest: undefined }]) await assert.rejects(s.recorder.reviewDuty(bad));
});

test('E1–E5 hashes and ranks remain frozen; E5 keeps its output shape and rejects review events', async t => {
  const hashes = ['0x00c3498e2744943663475d0187ca979cdd09763b88427781883693c4b8c163a7', '0x22eb40a92e50c998e007f67f0af0bc584e25f4b21c9bd802cbebe5981828810e',
    '0xda1ac0f7af67e35a2acd3e213089bafd65204e4bb50e6a0823f8e7e941168666', '0xe332eb30cd57a0106582649f124d33d17272096cd42b96d9155b53594a3894a5',
    '0x32c2a5608c7110f1a291517e136cedf62d59a2cb81be1141dd2705bce307ab29'];
  assert.deepEqual([core.PORTABLE_ADAPTER_POLICY_HASH, core.PORTABLE_ADAPTER_POLICY_E2_HASH, core.PORTABLE_ADAPTER_POLICY_E3_HASH, core.PORTABLE_ADAPTER_POLICY_E4_HASH, core.PORTABLE_ADAPTER_POLICY_E5_HASH], hashes);
  assert.equal(core.resolvePortableAdapterPolicy(core.PORTABLE_ADAPTER_POLICY_E6_HASH).edition, 'E6');
  assert.deepEqual(core.resolvePortableAdapterPolicy(core.PORTABLE_ADAPTER_POLICY_E6_HASH).semanticExtensions, ['continuity-attempt-observation-duty/1', 'continuity-attempt-duty-review/1']);
  // Later policy editions append events; the E6 event must keep its original rank.
  assert.equal(CORE_EVENT_TYPES[24], 'ATTEMPT_DUTY_REVIEW_CLOSED'); assert.equal(coreEventTypeRank('ATTEMPT_DUTY_ASSIGNED'), 23); assert.equal(coreEventTypeRank('ATTEMPT_DUTY_REVIEW_CLOSED'), 24);
  const e5 = await setup(t, { e5: true }); await e5.recorder.observe({ id: 'legacy', intent: 'job:1', acknowledgment: e5.acknowledgment() });
  assert.equal(Object.hasOwn(e5.view().duty, 'reviews'), false); assert.equal(Object.hasOwn(e5.owner.survives('first').answer.attemptDuties[0], 'reviewStatus'), false);
  await assert.rejects(e5.recorder.reviewDuty(review), e => e.code === 'PROFILE_MISMATCH');
  assert.throws(() => prepareAdministrativeEvent(producerInput(e5)), e => e.code === 'POLICY_UNAVAILABLE');
  const e6 = await setup(t); const { event } = await produceAdministrativeEvent(producerInput(e6), { signHash: sign(firstAccount) });
  assert.notEqual(replay([...e5.owner.exportHistory(), event]).status, 'ACCEPTED');
  for (const hash of hashes.slice(0, 4)) {
    const prefix = structuredClone(e6.owner.exportHistory().slice(0, 2)); prefix[0].data.adapterPolicyHash = hash;
    assert.equal(replay(prefix).status, 'ACCEPTED'); assert.notEqual(replay([...prefix, event]).status, 'ACCEPTED');
  }
});

test('signed review forks remain unverified and historical queries retain the earlier review status', async t => {
  const s = await setup(t); const input = producerInput(s);
  const left = await produceAdministrativeEvent(input, { signHash: sign(firstAccount) });
  const rightInput = structuredClone(input); rightInput.transition.id = 'right:review'; rightInput.transition.data.summaryDigest = `0x${'c'.repeat(64)}`;
  const right = await produceAdministrativeEvent(rightInput, { signHash: sign(firstAccount) });
  const leftEvents = [...input.events, left.event], rightEvents = [...input.events, right.event];
  for (const events of [leftEvents, rightEvents]) {
    assert.equal(replay(events).status, 'ACCEPTED');
    assert.equal(query(events).answer.attemptDuties[0].reviewStatus, 'REVIEW_CLOSED');
  }
  const comparison = query(rightEvents, { evaluationEvents: leftEvents });
  assert.equal(comparison.code, 'HISTORY_RELATION_UNVERIFIED'); assert.equal(Object.hasOwn(comparison, 'answer'), false);
  assert.equal(replay([...leftEvents, right.event]).status, 'REJECTED');
  const historical = query(leftEvents, { evaluationEvents: input.events });
  assert.equal(historical.epistemicStatus, 'ESTABLISHED'); assert.equal(historical.scope.headRelationship, 'STRICT_EXTENSION');
  assert.equal(historical.scope.freshness, 'AT_EVALUATION'); assert.equal(historical.answer.attemptDuties[0].reviewStatus, 'UNREVIEWED');
  for (const field of ['attemptDuties.reviewStatus', 'attemptDuties.reviews.summaryDigest', 'attemptDuties.reviews.observationEventIds']) {
    const all = core.portablePublicQueryDisclosure('SURVIVES');
    const disclosure = { mode: 'PUBLIC_MINIMAL', includedFields: all.includedFields.filter(path => path !== field), withheldFields: [field] };
    const result = query(leftEvents, { disclosure }); assert.equal(result.code, 'DISCLOSURE_INVALID'); assert.equal(Object.hasOwn(result, 'answer'), false);
  }
});

test('A-to-B-to-A canonical reassignment cannot revive A\'s earlier review', async t => {
  const s = await setup(t); await s.recorder.reviewDuty(review);
  const original = s.view().duty.reviews[0];
  s.owner.createAgent({ id: 'second' });
  s.owner.admitRuntime({ agent: 'second', session: 'session:second', epoch: 1, key: 'key:second', address: secondAccount.address, expiresAt: 2000 });
  s.grantRecord('second'); s.grantClose('second');
  const second = openLocalAttemptRecorder({ ...s.options, session: 'session:second', signHash: sign(secondAccount) });
  const store = new PortableFileEventStore(s.config.historyFile);
  const reassign = (from, to, number) => store.appendAtExpectedHead({ id: `role-reassignment:${number}`, type: 'ROLE_TRANSFERRED', timestamp: 100,
    data: { roleId: 'operator', fromAgentId: from, fromRoleTenureId: `tenure:${number - 1}`, toAgentId: to,
      toRoleTenureId: `tenure:${number}`, toTenureNumber: number, principalId: 'owner', transferKind: 'REASSIGNMENT' } }, s.state().head);
  reassign('first', 'second', 2); await second.assignDuty({ id: 'assign-second', duty: 'investigate' });
  assert.equal(s.view().duty.reviewStatus, 'NEEDS_REVIEW');
  reassign('second', 'first', 3); await s.recorder.assignDuty({ id: 'assign-first-again', duty: 'investigate' });
  assert.equal(replay(s.owner.exportHistory()).status, 'ACCEPTED');
  assert.equal(s.state().agents.get('first').terminated, false); assert.equal(s.state().agents.get('second').terminated, false);
  assert.equal(s.view().duty.currentAssigneeId, 'first'); assert.deepEqual(s.view().duty.reviews, [original]);
  assert.equal(s.view().duty.reviewStatus, 'NEEDS_REVIEW');
  assert.equal(s.owner.survives('first').answer.attemptDuties[0].reviewStatus, 'NEEDS_REVIEW');
  const before = readFileSync(s.config.historyFile); await s.recorder.reviewDuty(review); assert.deepEqual(readFileSync(s.config.historyFile), before);
  assert.equal(s.view().duty.reviewStatus, 'NEEDS_REVIEW');
  await s.recorder.reviewDuty({ ...review, id: 'first-after-reassignment' });
  assert.equal(s.view().duty.reviewStatus, 'REVIEW_CLOSED'); assert.equal(s.view().duty.record.status, 'OPEN');
  assert.equal(s.view().duty.reviews.length, 2);
});
