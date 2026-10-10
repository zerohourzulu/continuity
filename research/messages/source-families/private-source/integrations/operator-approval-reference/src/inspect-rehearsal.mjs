// Detached, read-only historical reconstruction with existing Core/application algorithms.
// Original absolute path pins are compared as data and are never opened.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readRegular, parseJson, list, safeDirectory } from '../../security-action-reference/src/safe-io.mjs';
import { parsePolicy, parseChallenge, verifyDecision, sha } from './contract.mjs';
import { readSnapshot } from '../../security-action-reference/src/context.mjs';
import { inspectState } from '../../security-action-reference/src/application.mjs';
import { inspectActionEvidence } from '../../security-action-reader/src/verifier.mjs';
import { parseReviewedAction } from '../../synthetic-state-executor/src/contract.mjs';
import { PortableFileEventStore } from '../../../packages/core-0.2/src/indexer/portable-file-event-store.ts';
import { core, ids, session, replay, validateConfig } from '../../security-action-reference/src/protocol.mjs';

const LIMIT = 4 * 1024 * 1024;
const encoded = value => JSON.stringify(value) + '\n';
const equal = (left, right) => assert.equal(core.canonicalEncode(left), core.canonicalEncode(right));
const exactId = value => assert.ok(typeof value === 'string' && /^[0-9a-f]{32}$/.exec(value)?.[0] === value);
const fields = (value, names) => {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), [...names].sort());
};

export function inspectRehearsal(root) {
  safeDirectory(root);
  // Pin every direct read and listing across this inspection. This is a cooperative
  // local reader, not protection against hostile writers or same-path rollback.
  const reads = new Map(), listings = new Map();
  const utf8 = (path, maximum = 262144) => {
    const bytes = readRegular(path, maximum);
    const previous = reads.get(path);
    if (previous) assert.ok(previous.bytes.equals(bytes));
    reads.set(path, { bytes, maximum });
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  };
  const read = (path, maximum = 262144) => parseJson(Buffer.from(utf8(path, maximum)), maximum);
  const members = (path, maximum) => {
    const names = list(path, maximum); listings.set(path, { names, maximum }); return names;
  };
  const run = read(join(root, 'RUN.json'));
  assert.equal(run.schemaVersion, 'continuity-operator-rehearsal/1');
  assert.ok(typeof run.runRelative === 'string' && /^rehearsal-[0-9a-f]{12}$/.exec(run.runRelative)?.[0] === run.runRelative);
  assert.equal(run.credentialClass, 'PUBLIC_DEVELOPMENT_FIXTURE');
  assert.equal(run.humanPresence, 'NOT_PROVEN');
  assert.equal(run.fault, 'WITHHOLD_ACKNOWLEDGMENT');
  exactId(run.parentChallengeId);
  const results = read(join(root, 'RESULTS.json'), 1048576);
  assert.equal(results.schemaVersion, 'continuity-operator-rehearsal-results/1');
  exactId(results.parentChallengeId); exactId(results.childChallengeId);
  assert.equal(results.parentChallengeId, run.parentChallengeId);
  assert.notEqual(results.childChallengeId, results.parentChallengeId);
  const base = safeDirectory(join(root, run.runRelative));
  const caseDirectory = safeDirectory(join(base, 'case'));
  const approvals = safeDirectory(join(base, 'approvals'));
  const policyUtf8 = utf8(join(base, 'control', 'policy.json'), 16384), policy = parsePolicy(policyUtf8);
  assert.equal(policy.caseDirectory, run.originalCaseDirectory);
  assert.equal(policy.approvalDirectory, join(dirname(policy.caseDirectory), 'approvals'));
  assert.equal(policy.credentialClass, run.credentialClass);
  const config = validateConfig(read(join(caseDirectory, 'case.json'), 32768));
  assert.equal(config.caseId, run.caseId); assert.equal(policy.resource, config.actionResource);
  assert.deepEqual(members(approvals, 32), [results.parentChallengeId, results.childChallengeId].sort());

  function selection(id, who, actionId, filenames) {
    const path = safeDirectory(join(approvals, id));
    assert.deepEqual(members(path, 12), [...filenames].sort());
    const challengeUtf8 = utf8(join(path, 'challenge.json'), 65536), ch = parseChallenge(challengeUtf8);
    assert.equal(ch.challengeId, id); assert.equal(ch.who, who); assert.equal(ch.actionId, actionId);
    assert.equal(ch.instanceId, policy.instanceId); assert.equal(ch.policySha256, sha(policyUtf8));
    assert.equal(ch.caseId, run.caseId); equal(ch.domain, config.domain);
    const i = ids(ch.caseId);
    equal(ch.actorBinding, { actorId: i[who], ...session(ch.caseId, who), roleId: i.role, roleTenureId: i['tenure-' + who] });
    const request = parseJson(Buffer.from(ch.requestUtf8), 16384);
    fields(request, ['descriptorUtf8', 'proposalUtf8', 'snapshotId', 'snapshotManifestSha256']);
    assert.equal(request.snapshotId, actionId);
    assert.ok(typeof request.proposalUtf8 === 'string' && request.proposalUtf8.length > 0 &&
      Buffer.byteLength(request.proposalUtf8) <= 4096 && request.proposalUtf8.isWellFormed());
    const descriptor = parseReviewedAction(request.descriptorUtf8);
    assert.equal(descriptor.intentId, 'action:' + run.caseId + ':' + actionId);
    assert.equal(descriptor.action, 'RELEASE'); assert.equal(descriptor.expectedRevision, 0);
    assert.equal(descriptor.resource, policy.resource); assert.ok(policy.actions.includes(descriptor.action));
    assert.equal(descriptor.proposalSha256, sha(request.proposalUtf8));
    assert.equal(descriptor.snapshotManifestSha256, request.snapshotManifestSha256);
    const snapshot = readSnapshot(caseDirectory, request.snapshotId, request.snapshotManifestSha256);
    equal(snapshot.config, config); equal(descriptor.reviewHead, snapshot.summary.head);
    assert.equal(descriptor.reviewMaterialSha256, sha(encoded(snapshot.material)));
    const displayUtf8 = utf8(join(path, 'display.json'), LIMIT);
    assert.equal(sha(displayUtf8), ch.reviewDisplaySha256);
    // Reconstruct the application's exact display, including ordered original bytes.
    const display = { schemaVersion: 'continuity-operator-review-display/1', requestUtf8: ch.requestUtf8,
      actorBinding: ch.actorBinding, summary: snapshot.summary, material: snapshot.material, progress: snapshot.entries,
      originals: [...snapshot.originals].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, data]) => {
        const text = data.toString('utf8'), utf8 = Buffer.from(text).equals(data) ? text : null;
        return { path, bytes: data.length, sha256: sha(data), utf8, base64: utf8 === null ? data.toString('base64') : null };
      }), limitations: ['Synthetic local evidence only; source truth and external effect are not proved.',
        'Operator signature establishes enrolled key control, not human presence or comprehension.',
        'Approval cannot create an agent permission or discharge the investigation duty.'] };
    assert.equal(displayUtf8, encoded(display));
    return { path, ch, challengeUtf8, request, descriptor, snapshot, display };
  }
  const parent = selection(results.parentChallengeId, 'a', 'initial-release', ['challenge.json', 'display.json']);
  const child = selection(results.childChallengeId, 'b', 'fresh-release', ['challenge.json', 'display.json', 'preparation.json',
    'decision.json', 'reservation.json', 'effect-claim.json', 'admission-result.json', 'invocation-result.json',
    'recovery-started.json', 'reconciliation-result.json']);
  // The final retained material must still be the material selected by the child.
  for (const [relative, bytes] of child.snapshot.originals) {
    const path = join(caseDirectory, relative), maximum = 65536;
    assert.ok(bytes.equals(readRegular(path, maximum))); reads.set(path, { bytes, maximum });
  }
  const preparation = { schemaVersion: 'continuity-operator-preparation/1', parentChallengeId: parent.ch.challengeId,
    parentChallengeSha256: sha(parent.challengeUtf8), childChallengeSha256: sha(child.challengeUtf8) };
  assert.equal(utf8(join(child.path, 'preparation.json'), 4096), encoded(preparation));
  assert.ok(parent.snapshot.events.length < child.snapshot.events.length);
  equal(parent.snapshot.events, child.snapshot.events.slice(0, parent.snapshot.events.length));
  assert.equal(parent.snapshot.summary.duty.performer, ids(run.caseId).a);
  assert.equal(child.snapshot.summary.duty.performer, ids(run.caseId).b);
  const envelopeUtf8 = utf8(join(child.path, 'decision.json'));
  const decision = verifyDecision(envelopeUtf8, child.challengeUtf8, policyUtf8);
  assert.equal(decision.decision, 'APPROVE');
  const reservationUtf8 = utf8(join(child.path, 'reservation.json'));
  assert.equal(reservationUtf8, encoded({ schemaVersion: 'continuity-operator-reservation/1', challengeId: child.ch.challengeId,
    challengeSha256: sha(child.challengeUtf8), decisionSha256: sha(envelopeUtf8), requestSha256: sha(child.ch.requestUtf8) }));
  for (const [filename, schemaVersion] of [['effect-claim.json', 'continuity-operator-effect-claim/1'],
    ['recovery-started.json', 'continuity-operator-recovery-started/1']]) {
    assert.equal(utf8(join(child.path, filename)), encoded({ schemaVersion, reservationSha256: sha(reservationUtf8) }));
  }

  const historyPath = join(caseDirectory, 'history.jsonl'); utf8(historyPath, 2 * 1024 * 1024);
  const events = new PortableFileEventStore(historyPath).readAll();
  assert.ok(events.length > 0 && events.length <= 120);
  equal(child.snapshot.events, events.slice(0, child.snapshot.events.length));
  const databasePath = join(caseDirectory, 'effect', 'effect.sqlite');
  const databaseBytes = readRegular(databasePath, 1048576), state = inspectState(caseDirectory);
  assert.ok(databaseBytes.equals(readRegular(databasePath, 1048576)));
  assert.equal(state.status, 'OK'); equal(state.state, { revision: 1, status: 'RELEASED' });
  assert.equal(state.records.length, 1);
  assert.deepEqual(members(join(caseDirectory, 'actions'), 32), ['fresh-release']);
  const actionPath = safeDirectory(join(caseDirectory, 'actions', 'fresh-release'));
  assert.deepEqual(members(actionPath, 8), ['admission.json', 'descriptor.canonical.txt', 'invocation.json', 'reconciliation.json', 'request.json']);
  assert.equal(utf8(join(actionPath, 'request.json'), 16384), child.ch.requestUtf8);
  assert.equal(utf8(join(actionPath, 'descriptor.canonical.txt'), 16384), core.canonicalEncode(child.descriptor) + '\n');
  const retained = state.records[0];
  const reader = inspectActionEvidence({ events, records: [{ descriptorUtf8: child.request.descriptorUtf8,
    commandUtf8: retained.commandUtf8, transitionUtf8: encoded(retained.transition) }] });
  assert.equal(reader.status, 'VERIFIED'); assert.equal(reader.actions.length, 1);
  assert.equal(reader.admissionsWithoutTransition.length, 0);
  const action = reader.actions[0], authority = action.historicalAuthority;
  assert.equal(action.intentId, child.descriptor.intentId); equal(child.ch.domain, reader.history.domain);
  const admissionEvent = events.find(event => event.id === authority.admissionEventId); assert.ok(admissionEvent);
  equal(child.ch.actorBinding, { actorId: authority.actorId, runtimeSessionId: authority.runtimeSessionId,
    credentialKeyId: admissionEvent.data.authorizationProof.credentialKeyId, controlEpoch: authority.controlEpoch,
    roleId: authority.roleId, roleTenureId: authority.roleTenureId });
  assert.equal(action.consumption.status, 'RECORDED');
  assert.equal(events.length, child.snapshot.events.length + 3);
  const declaration = events[child.snapshot.events.length];
  assert.equal(declaration.id, run.caseId + ':action-declare-fresh-release');
  assert.equal(declaration.type, 'TRANSACTION_INTENT_DECLARED');
  assert.equal(declaration.data.intentId, child.descriptor.intentId);
  equal(events.at(-2), admissionEvent); assert.equal(events.at(-1).id, action.consumption.eventId);

  const rawAdmission = read(join(actionPath, 'admission.json'));
  const proof = admissionEvent.data.authorizationProof;
  const admittedResult = { operationVersion: core.PORTABLE_INTENT_ADMISSION_VERSION, status: 'ADMITTED',
    authorization: proof, admissionEvent, newHead: authority.admissionHead };
  const { actorId, ...selectedBinding } = child.ch.actorBinding;
  equal(rawAdmission, { input: { operationVersion: core.PORTABLE_INTENT_ADMISSION_VERSION,
    events: [...child.snapshot.events, declaration], expectedHistoryHead: admissionEvent.data.expectedHistoryHead,
    admissionEventId: admissionEvent.id, domain: child.ch.domain, policyVersion: proof.policyVersion,
    request: proof.request, evaluationTime: admissionEvent.data.evaluationTime,
    binding: { ...selectedBinding, intentId: child.descriptor.intentId, nonce: declaration.data.nonce,
      runtimeSignature: admissionEvent.data.runtimeSignature } },
    proposal: { operationVersion: core.PORTABLE_INTENT_ADMISSION_VERSION, status: 'PROPOSED', authorization: proof,
      expectedHead: admissionEvent.data.expectedHistoryHead, admissionEvent, prospectiveHead: authority.admissionHead },
    admission: { status: 'ADMITTED', result: admittedResult } });
  const admission = read(join(child.path, 'admission-result.json'));
  equal(admission, { status: 'ADMITTED', intentId: child.descriptor.intentId,
    handle: { intentId: child.descriptor.intentId, actionId: child.ch.actionId }, admission: admittedResult });
  const invocation = read(join(child.path, 'invocation-result.json'));
  equal(invocation, read(join(actionPath, 'invocation.json')));
  equal(invocation, { status: 'OUTCOME_UNKNOWN', reason: 'The adapter cannot establish a definitive outcome.',
    idempotencyKey: action.identity.idempotencyKey, submissionFingerprint: action.identity.submissionFingerprint,
    executorInvoked: true, contextGuardPassed: true });
  const reconciliation = read(join(child.path, 'reconciliation-result.json'));
  equal(reconciliation, read(join(actionPath, 'reconciliation.json')));
  equal(reconciliation, { status: 'RETRY', disposition: { status: 'RETRY', idempotencyKey: action.identity.idempotencyKey,
    submissionFingerprint: action.identity.submissionFingerprint, acknowledgment: action.consumption.acknowledgment,
    retainedEvidence: events.at(-1).data.evidenceReference }, recorded: true, head: reader.history.head });
  const reconstructed = replay(events);
  assert.equal(reader.duties.length, 1); const duty = reader.duties[0];
  assert.equal(duty.status, 'OPEN'); assert.equal(duty.performer, ids(run.caseId).b);
  assert.equal(duty.obligationId, ids(run.caseId).obligation);
  const final = read(join(root, 'VIEW-FINAL.json'), LIMIT);
  assert.equal(final.schemaVersion, 'continuity-operator-workbench/1');
  equal(final.scope.credentialClass, policy.credentialClass); assert.equal(final.scope.syntheticOnly, true);
  assert.equal(final.scope.humanPresence, 'NOT_PROVEN');
  equal(final.challenge, { challengeId: child.ch.challengeId, sha256: sha(child.challengeUtf8), policySha256: sha(policyUtf8),
    operatorId: policy.operatorId, keyId: policy.keyId, publicKeyHex: policy.publicKeyHex });
  equal(final.selection, { caseId: child.ch.caseId, actionId: child.ch.actionId, requestUtf8: child.ch.requestUtf8,
    descriptor: child.descriptor, proposalUtf8: child.request.proposalUtf8, snapshotId: child.request.snapshotId,
    snapshotManifestSha256: child.request.snapshotManifestSha256, reviewHead: child.descriptor.reviewHead,
    actorBinding: child.ch.actorBinding, evidenceDisplay: child.display });
  equal(final.current.head, reader.history.head); equal(final.current.state, state);
  equal(final.current.duties, [...reconstructed.obligations.values()]);
  equal(final.approval, { status: 'SPENT', decision: 'APPROVE', reason: decision.reason, signatureStatus: 'ENROLLED_KEY_SIGNATURE_VERIFIED' });
  equal(final.preparation, { ...preparation, assurance: 'UNSIGNED_APPLICATION_PROVENANCE_ONLY' });
  equal(final.outcome, { admission, invocation, reconciliation });
  for (const [path, { bytes, maximum }] of reads) assert.ok(bytes.equals(readRegular(path, maximum)));
  for (const [path, { names, maximum }] of listings) assert.deepEqual(list(path, maximum), names);
  assert.ok(databaseBytes.equals(readRegular(databasePath, 1048576)));
  return { schemaVersion: 'continuity-operator-rehearsal-report/1', caseId: run.caseId,
    parentChallengeId: parent.ch.challengeId, childChallengeId: child.ch.challengeId,
    parentDecision: 'ABSENT', decision: decision.decision, signature: 'ENROLLED_PUBLIC_FIXTURE_KEY_VERIFIED',
    eventCount: events.length, transitions: state.records.length, state: state.state,
    duty: { status: duty.status, assignee: duty.performer }, historicalCore: reader.status,
    recovery: { invocation: invocation.status, reconciliation: reconciliation.status, recorded: reconciliation.recorded },
    scope: 'HISTORICAL_EXISTING_ALGORITHM_RECONSTRUCTION', currentAuthority: 'NOT_EVALUATED', currentTrust: 'NOT_EVALUATED',
    operatorCredential: policy.credentialClass, humanPresence: 'NOT_PROVEN', freshProcess: 'NOT_ESTABLISHED_BY_RETAINED_RECORDS',
    effectScope: 'LOCAL_SYNTHETIC_ONLY', sourceTruth: 'NOT_PROVEN', historyCompleteness: 'SUPPLIED_HISTORY_ONLY',
    pathPins: 'HISTORICAL_ORIGINAL_PATH_ASSERTIONS_NOT_REUSABLE_AT_RELOCATED_PATH' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3);
  process.stdout.write(encoded(inspectRehearsal(resolve(process.argv[2]))));
}
