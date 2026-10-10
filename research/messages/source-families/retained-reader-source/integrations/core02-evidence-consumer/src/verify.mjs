// Fixed retained cases only. The public caller checks the accepted source pin
// before importing this module. This module performs no I/O or new action.
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import {
  canonicalEncode, hashCanonical, replayPortable, derivePortableAdapterIdentity,
  verifyPortableReceipt, whyPortable, responsiblePortable, survivesPortable,
  portablePublicQueryDisclosure, validatePortableAdapterAcknowledgment,
  approvedPortableAdapterProfile, PORTABLE_ADAPTER_POLICY_HASH,
  PORTABLE_REPLAY_VERSION,
  PORTABLE_RECEIPT_VERIFICATION_VERSION, PORTABLE_QUERY_VERSION,
} from '../../../packages/core-0.2/src/core/index.ts';
import { parseStrictJson } from '../../retained-evidence-mcp/src/strict-json.mjs';
import { commonCaseSpec } from './specs.mjs';

export const OUTPUT_BYTES = 65536;
export const TOTAL_INPUT_BYTES = 1048576;
const MAX_HISTORY_EVENTS = 64;
// This accepted operation version is not a named export of the public index.
const ADAPTER_SUBMISSION_VERSION = 'continuity-adapter-submission/0.2';
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const byteLengthOf = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength').get;
const bufferOf = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { const error = new Error(code); error.code = code; throw error; };
const requireFact = (condition, code) => { if (!condition) fail(code); };
const equal = (actual, expected, code) => requireFact(canonicalEncode(actual) === canonicalEncode(expected), code);
const keysEqual = (value, keys, code) => {
  requireFact(value !== null && typeof value === 'object' && !Array.isArray(value), code);
  equal(Object.keys(value).sort(), [...keys].sort(), code);
};

function captureArtifacts(artifacts, spec) {
  requireFact(artifacts !== null && typeof artifacts === 'object' && !types.isProxy(artifacts), 'ARTIFACT_RECORD_REQUIRED');
  const prototype = Object.getPrototypeOf(artifacts);
  requireFact(prototype === Object.prototype || prototype === null, 'ARTIFACT_RECORD_REQUIRED');
  const keys = Reflect.ownKeys(artifacts);
  requireFact(keys.length === spec.evidenceIds.length && keys.every(key => typeof key === 'string' && spec.evidenceIds.includes(key)), 'ARTIFACT_MEMBERSHIP');
  const snapshots = Object.create(null);
  let total = 0;
  // Inspect descriptors, never read a caller property or invoke a custom getter.
  for (const member of spec.members) {
    const descriptor = Object.getOwnPropertyDescriptor(artifacts, member.evidenceId);
    requireFact(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable, 'ARTIFACT_DATA_REQUIRED');
    const value = descriptor.value;
    requireFact(value !== null && typeof value === 'object' && !types.isProxy(value), 'ARTIFACT_BUFFER_REQUIRED');
    requireFact(Buffer.isBuffer(value) && Object.getPrototypeOf(value) === Buffer.prototype, 'ARTIFACT_BUFFER_REQUIRED');
    const length = byteLengthOf.call(value);
    total += length;
    requireFact(Number.isSafeInteger(total) && total <= TOTAL_INPUT_BYTES, 'INPUT_BYTES_LIMIT');
    requireFact(!types.isSharedArrayBuffer(bufferOf.call(value)), 'SHARED_BUFFER_REFUSED');
    const bufferKeys = Reflect.ownKeys(value);
    requireFact(bufferKeys.length === length && bufferKeys.every((key, index) => key === String(index)), 'ARTIFACT_BUFFER_FIELDS');
    const copy = Buffer.alloc(length);
    Uint8Array.prototype.set.call(copy, value);
    snapshots[member.evidenceId] = copy;
  }
  // Complete the aggregate boundary before hashing; authenticate every member
  // before parsing any member or evaluating any protocol data.
  for (const member of spec.members) {
    const copy = snapshots[member.evidenceId];
    requireFact(copy.length === member.bytes && sha(copy) === member.sha256, 'ARTIFACT_IDENTITY_MISMATCH');
  }
  return { snapshots, total };
}

function parseArtifacts(bytes, spec) {
  const data = Object.create(null);
  for (const member of spec.members) {
    if (member.mediaType !== 'application/json') continue;
    try { data[member.evidenceId] = parseStrictJson(bytes[member.evidenceId]); }
    catch { fail('ARTIFACT_JSON_INVALID'); }
  }
  return data;
}

function verifyManifest(data, spec) {
  const manifest = data.exportManifest;
  keysEqual(manifest, ['schemaVersion', 'caseId', 'domain', 'head', 'disclosure', 'files'], 'EXPORT_MANIFEST_FIELDS');
  requireFact(manifest.schemaVersion === 'continuity-local-intake-export/0.2' && manifest.caseId === spec.caseId && manifest.disclosure === 'SYNTHETIC_LOCAL_CASE', 'EXPORT_MANIFEST_SCOPE');
  equal(manifest.domain, spec.domain, 'EXPORT_MANIFEST_DOMAIN');
  equal(manifest.head, spec.head, 'EXPORT_MANIFEST_HEAD');
  const expected = spec.members.filter(member => member.evidenceId !== 'exportManifest').map(member => ({ name: member.exportFileName, bytes: member.bytes, sha256: member.sha256 }));
  // Original ordering and complete closed rows are part of this retained manifest.
  equal(manifest.files, expected, 'EXPORT_MANIFEST_MEMBERSHIP');
}

function oneEvent(history, type, intentId) {
  const selected = history.map((event, position) => ({ event, position })).filter(({ event }) => event.type === type && (intentId === undefined || event.data.intentId === intentId));
  requireFact(selected.length === 1, 'EXPECTED_SINGLE_EVENT');
  return selected[0];
}

function reproduce(data, spec) {
  const history = data.history;
  requireFact(Array.isArray(history) && history.length > 0 && history.length <= MAX_HISTORY_EVENTS, 'HISTORY_EVENT_LIMIT');
  equal(history[0].data.domain, spec.domain, 'HISTORY_DOMAIN');
  requireFact(history[0].data.adapterPolicyHash === PORTABLE_ADAPTER_POLICY_HASH, 'HISTORY_ADAPTER_POLICY');
  const replay = replayPortable({ operationVersion: PORTABLE_REPLAY_VERSION, events: history });
  requireFact(replay.status === 'ACCEPTED', 'HISTORY_REPLAY_REJECTED');
  equal(replay.head, spec.head, 'HISTORY_HEAD_MISMATCH');
  requireFact(replay.eventCount === history.length && history.length === spec.head.position + 1, 'HISTORY_COUNT_MISMATCH');
  const time = spec.head.canonicalTime;
  const intentId = `intent:${spec.caseId}`;
  const declared = oneEvent(history, 'TRANSACTION_INTENT_DECLARED', intentId);
  const admitted = oneEvent(history, 'TRANSACTION_INTENT_ADMITTED', intentId);
  const consumed = oneEvent(history, 'TRANSACTION_INTENT_CONSUMED', intentId);
  const committed = oneEvent(history, 'RECEIPT_RECORDED');
  requireFact(declared.position < admitted.position && admitted.position < consumed.position && consumed.position < committed.position, 'RECEIPT_CAUSAL_ORDER');
  equal(declared.event.data.adapterProfile, spec.adapterProfile, 'DECLARED_ADAPTER_PROFILE');
  equal(approvedPortableAdapterProfile(spec.adapterProfile.profileId), spec.adapterProfile, 'APPROVED_ADAPTER_PROFILE');
  const identity = derivePortableAdapterIdentity({ operationVersion: ADAPTER_SUBMISSION_VERSION, domain: spec.domain, intentId, admissionEvent: admitted.event, admittedHistory: history.slice(0, admitted.position + 1) });
  const acknowledgment = consumed.event.data.acknowledgment;
  requireFact(validatePortableAdapterAcknowledgment(acknowledgment, identity), 'ACKNOWLEDGMENT_IDENTITY');
  equal(acknowledgment.adapterProfile, spec.adapterProfile, 'ACKNOWLEDGMENT_PROFILE');
  equal(data.receipt.payload.result.acknowledgment, acknowledgment, 'RECEIPT_ACKNOWLEDGMENT');
  equal(data.invocation.disposition.acknowledgment, acknowledgment, 'INVOCATION_ACKNOWLEDGMENT');
  const receipt = verifyPortableReceipt({ operationVersion: PORTABLE_RECEIPT_VERIFICATION_VERSION, artifact: data.receipt, issuanceEvents: history.slice(0, committed.position + 1), observedEvents: history, expectedDomain: spec.domain, verifierTime: time });
  equal(receipt, data.receiptVerification, 'RECEIPT_VERIFICATION_MISMATCH');
  requireFact(receipt.status === 'EVALUATED' && receipt.valid === true && receipt.authentic === true && receipt.historical === true && receipt.current === false, 'RECEIPT_EXPECTED_AXES');
  const source = data.admission.input;
  equal(source.events, history.slice(0, admitted.position), 'ADMISSION_SOURCE_PREFIX');
  equal(source.domain, spec.domain, 'ADMISSION_SOURCE_DOMAIN');
  equal(data.beforeEffect.history, history.slice(0, admitted.position + 1), 'BEFORE_EFFECT_PREFIX');
  equal(data.beforeEffect.head, identity.admissionHead, 'BEFORE_EFFECT_HEAD');
  const queryBase = { operationVersion: PORTABLE_QUERY_VERSION, evaluationEvents: history, observedEvents: history, authorizationDomain: spec.domain, evaluationTime: time };
  const sourceQuery = { operationVersion: PORTABLE_QUERY_VERSION, evaluationEvents: source.events, observedEvents: history, authorizationDomain: source.domain, evaluationTime: source.evaluationTime, request: source.request, consequentialBinding: source.binding };
  const whyDisclosure = portablePublicQueryDisclosure('WHY');
  const queries = {
    successor: whyPortable({ ...queryBase, request: { actorId: `b:${spec.caseId}`, action: 'record-collection-disposition', resource: `obligation:${spec.caseId}`, claimedAt: time }, disclosure: whyDisclosure }),
    survives: survivesPortable({ operationVersion: PORTABLE_QUERY_VERSION, observedEvents: history, targetAgentId: `a:${spec.caseId}`, evaluationTime: time, disclosure: portablePublicQueryDisclosure('SURVIVES') }),
    sourceAtEvaluation: whyPortable({ ...sourceQuery, observedEvents: source.events, disclosure: whyDisclosure }),
    sourceHistorical: whyPortable({ ...sourceQuery, disclosure: whyDisclosure }),
    responsible: responsiblePortable({ ...sourceQuery, disclosure: portablePublicQueryDisclosure('RESPONSIBLE') }),
  };
  equal(queries, data.queries, 'QUERY_REPRODUCTION_MISMATCH');
  const outcomes = queries.survives.answer.adapterOutcomes.filter(row => row.intentId === intentId);
  requireFact(outcomes.length === 1, 'QUERY_ADAPTER_OUTCOME');
  equal(outcomes[0].acknowledgment, acknowledgment, 'QUERY_ACKNOWLEDGMENT');
  equal(data.summary.head, spec.head, 'SUMMARY_HEAD');
  requireFact(data.summary.caseId === spec.caseId && data.summary.schemaVersion === 'continuity-local-intake-summary/0.2', 'SUMMARY_SCOPE');
  equal(data.summary.admission, { consumed: true, intentId }, 'SUMMARY_ADMISSION');
  equal(data.terms.caseId, spec.caseId, 'TERMS_CASE');
  requireFact(data.terms.syntheticOnly === true && hashCanonical(data.terms) === declared.event.data.termsCommitment, 'TERMS_COMMITMENT');
  return { replay, receipt, queries, acknowledgment, identity, declaration: declared.event.data, consumption: consumed.event.data };
}

function inspectPacket(data, bytes, spec, verified) {
  const { acknowledgment, identity, declaration, consumption } = verified;
  const simulated = spec.profile === 'core02-simulated';
  const externalOutcome = simulated ? 'SIMULATED' : 'NOT_PROVEN';
  requireFact(data.receipt.payload.assurance.externalOutcome === externalOutcome && data.summary.scope.externalOutcome === externalOutcome && verified.receipt.externalOutcome.primaryCode === externalOutcome, 'EXTERNAL_ASSURANCE_MISMATCH');
  equal(data.summary.packet.acknowledgment, acknowledgment, 'SUMMARY_ACKNOWLEDGMENT');
  if (simulated) {
    requireFact(acknowledgment.result.kind === 'SIMULATED_SUBMISSION' && data.summary.packet.status === 'SIMULATED_ACKNOWLEDGMENT_RECORDED' && data.summary.packet.externalEffect === 'NONE_SIMULATED', 'SIMULATION_SCOPE');
    equal(data.summary.packet.files, [], 'SIMULATED_FILES_PRESENT');
    equal(data.reviewProgress, [], 'SIMULATED_REVIEW_NOTES_PRESENT');
    requireFact(!spec.members.some(member => member.exportFileName.startsWith('packet-') || ['attempt.json', 'ack.json'].includes(member.exportFileName)), 'SIMULATED_PACKET_ARTIFACTS_PRESENT');
    return { status: 'SIMULATED_NO_PACKET_FILES', files: [], fileCount: 0, totalFileBytes: 0, externalOutcome, executorInvoked: false, sourceEvidenceIds: ['history', 'receipt', 'summary', 'exportManifest'] };
  }
  requireFact(acknowledgment.result.kind === 'LOCAL_PACKET_CREATED' && data.summary.packet.status === 'PACKET_VERIFIED', 'LOCAL_PACKET_SCOPE');
  const manifest = data.packetManifest;
  const manifestSha256 = sha(bytes.packetManifest);
  requireFact(acknowledgment.result.manifestDigest.algorithm === 'sha256' && acknowledgment.result.manifestDigest.value === `0x${manifestSha256}` && consumption.transactionReference === `0x${manifestSha256}`, 'RAW_PACKET_MANIFEST_DIGEST');
  const expected = { schemaVersion: 'continuity-local-packet-manifest/0.2', idempotencyKey: identity.idempotencyKey, submissionFingerprint: identity.submissionFingerprint, intentId: identity.intentId, selection: data.terms.selection, termsCommitment: declaration.termsCommitment, resource: declaration.resource, adapterIdentity: identity };
  equal(manifest, expected, 'PACKET_MANIFEST_BINDING');
  equal(data.attempt, { ...expected, schemaVersion: 'continuity-local-packet-attempt/0.2' }, 'PACKET_ATTEMPT_BINDING');
  const evidence = { kind: 'EXTERNAL', evidenceType: acknowledgment.schemaVersion, reference: hashCanonical(acknowledgment), attesterId: spec.adapterProfile.profileId };
  equal(data.ack, { schemaVersion: 'continuity-local-packet-ack/0.2', idempotencyKey: identity.idempotencyKey, submissionFingerprint: identity.submissionFingerprint, manifestSha256, acknowledgment, evidence }, 'PACKET_ACK_BINDING');
  equal(consumption.evidenceReference, evidence, 'CONSUMPTION_EVIDENCE_BINDING');
  equal(data.invocation.disposition.evidence, evidence, 'INVOCATION_EVIDENCE_BINDING');
  equal(data.summary.packet.manifest, manifest, 'SUMMARY_PACKET_MANIFEST');
  requireFact(data.summary.packet.manifestSha256 === manifestSha256, 'SUMMARY_PACKET_DIGEST');
  const fileMembers = spec.members.filter(member => member.exportFileName.startsWith('packet-file-'));
  requireFact(Array.isArray(manifest.selection) && manifest.selection.length === fileMembers.length, 'PACKET_FILE_MEMBERSHIP');
  const files = fileMembers.map(member => ({ name: member.exportFileName.slice('packet-file-'.length), evidenceId: member.evidenceId, bytes: bytes[member.evidenceId].length, sha256: sha(bytes[member.evidenceId]) }));
  const selection = files.map(({ name, bytes: length, sha256 }) => ({ name, bytes: length, sha256 }));
  equal(manifest.selection, selection, 'RAW_PACKET_FILES_DIGEST');
  equal(data.summary.packet.files, selection, 'SUMMARY_PACKET_FILES');
  return { status: 'LOCAL_PACKET_BYTES_VERIFIED', manifest: { evidenceId: 'packetManifest', bytes: bytes.packetManifest.length, sha256: manifestSha256, hashing: 'EXACT_ORIGINAL_BYTES_INCLUDING_FINAL_LF' }, files, fileCount: files.length, totalFileBytes: files.reduce((sum, file) => sum + file.bytes, 0), externalOutcome, executorInvoked: false, sourceEvidenceIds: ['packetManifest', 'packetFileAgent', 'packetFileAuth', 'ack', 'attempt', 'history', 'receipt', 'terms'] };
}

function explainDuty(data, spec, queries) {
  const obligations = queries.survives.answer.obligations.filter(row => row.obligationId === `obligation:${spec.caseId}`);
  requireFact(obligations.length === 1, 'SURVIVING_DUTY_REQUIRED');
  const obligation = obligations[0];
  const assignments = queries.survives.answer.currentPerformanceAssignments.filter(row => row.obligationId === obligation.obligationId);
  requireFact(assignments.length === 1 && assignments[0].assigneeId === obligation.performanceAssigneeId, 'DUTY_ASSIGNMENT_MISMATCH');
  requireFact(obligation.durableRoleId === `role:${spec.caseId}` && obligation.performanceAssigneeId === `b:${spec.caseId}` && obligation.status === 'OUTCOME_UNKNOWN', 'DUTY_SCOPE');
  equal({ bearer: data.summary.duty.bearer, performer: data.summary.duty.performer, status: data.summary.duty.status }, { bearer: obligation.durableRoleId, performer: obligation.performanceAssigneeId, status: obligation.status }, 'SUMMARY_DUTY');
  const successor = queries.successor.answer;
  requireFact(successor.authorization.decision === 'ALLOW' && successor.authorization.consequential === false && successor.presentConsequentialUse === false, 'SUCCESSOR_AUTHORIZATION_SCOPE');
  equal(successor.authorization.proof.permissionPath, [data.summary.successorGrant.grant], 'SUCCESSOR_INDEPENDENT_GRANT');
  requireFact(data.summary.successorGrant.grant.independent === true, 'SUCCESSOR_INDEPENDENT_GRANT');
  requireFact(queries.sourceAtEvaluation.answer.presentConsequentialUse === true && queries.sourceHistorical.answer.presentConsequentialUse === false, 'HISTORICAL_QUERY_SCOPE');
  return { obligationId: obligation.obligationId, bearer: obligation.durableRoleId, performer: obligation.performanceAssigneeId, status: obligation.status, deadline: obligation.deadline, incidentResolution: 'NOT_PROVEN', sourceEvidenceIds: ['queries', 'history', 'summary'] };
}

/** Synchronous, pure verification of exactly one fixed retained artifact set. */
export function verifyCommonEvidence(profileName, artifacts) {
  requireFact(arguments.length === 2, 'ARGUMENTS_REFUSED');
  let spec;
  try { spec = commonCaseSpec(profileName); } catch { fail('UNSUPPORTED_COMMON_CORE_PROFILE'); }
  requireFact(spec.coreVersion === '0.2' && spec.packageVersion === '0.2.0' && spec.verifierId === 'continuity-core/0.2' && spec.domain.version === '0.2', 'UNSUPPORTED_CORE_VERSION');
  const { snapshots, total } = captureArtifacts(artifacts, spec);
  const data = parseArtifacts(snapshots, spec);
  verifyManifest(data, spec);
  const verified = reproduce(data, spec);
  const packetInspection = inspectPacket(data, snapshots, spec, verified);
  const duty = explainDuty(data, spec, verified.queries);
  const queryScope = query => ({ decision: query.answer.authorization.decision, consequential: query.answer.authorization.consequential, presentConsequentialUse: query.answer.presentConsequentialUse, freshness: query.scope.freshness, headRelationship: query.scope.headRelationship, evaluationHead: query.scope.evaluationHead, observedHead: query.scope.observedHead });
  const report = {
    schemaVersion: 'continuity-common-case-inspection/1', profile: spec.profile, caseId: spec.caseId, verifierId: spec.verifierId, domain: spec.domain, head: spec.head,
    acknowledgment: verified.acknowledgment,
    receipt: verified.receipt,
    duty,
    successorAuthorization: { ...verified.queries.successor.answer, scope: verified.queries.successor.scope, independentGrant: data.summary.successorGrant, sourceEvidenceIds: ['queries', 'history', 'summary'] },
    packetInspection,
    evaluation: { replay: verified.replay, receiptExactMatch: true, queriesExactMatch: ['responsible', 'sourceAtEvaluation', 'sourceHistorical', 'successor', 'survives'], authorizationScopes: { sourceAtEvaluation: queryScope(verified.queries.sourceAtEvaluation), sourceHistorical: queryScope(verified.queries.sourceHistorical), successor: queryScope(verified.queries.successor) }, graph: 'PINNED_RETAINED_BYTES_NOT_RECOMPUTED' },
    retainedObservations: { predecessorDenial: { decision: data.staleRequest.proposal.authorization.decision, code: data.staleRequest.proposal.authorization.code, executorInvoked: data.staleRequest.executorInvoked, sourceEvidenceIds: ['staleRequest'], newEvaluation: false }, applicationReview: { recordCount: data.reviewProgress.length, retainedVerification: data.summary.review.verification, verificationHere: 'BYTES_PINNED_APPLICATION_SIGNATURES_NOT_REVERIFIED', incidentResolution: data.summary.review.incidentResolution, sourceEvidenceIds: ['reviewProgress', 'summary'] } },
    explanation: [
      'The reader supplies unchanged retained bytes. This caller performs new read-only Core 0.2 replay, receipt verification and five query evaluations at the retained canonical time.',
      'The receipt is authentic and historically valid; after handover it is not current authorization. CURRENT on a retained query means current relative to that query\'s supplied history, never wall-clock permission.',
      'The Role remains the duty bearer and B is the assigned performer. The separate independent permission grant is reproduced; assignment or this report does not grant authority. The successor query is non-consequential and presentConsequentialUse is false.',
      spec.profile === 'core02-packet' ? 'Exact retained manifest and log bytes match the typed acknowledgment. This packet inspection leaves the Core external-outcome assurance at NOT_PROVEN and does not establish incident resolution.' : 'The simulator acknowledgment has SIMULATED assurance and no packet-file evidence. File names in the declared terms are requested fixtures, not collected files.',
      'Review notes and the old-worker denial are retained application observations. Their original bytes are authenticated here; application signatures and the old request are not newly evaluated.',
    ],
    sources: { catalogId: spec.catalogId, catalogSha256: spec.catalogSha256, exportManifestSha256: spec.exportManifestSha256, sourceEdition: spec.sourceEdition, coreVersion: spec.coreVersion, packageVersion: spec.packageVersion, sourcePinVerification: 'CALLER_PREIMPORT_CHECK_REQUIRED', totalInputBytes: total, artifacts: spec.members.map(({ evidenceId, exportFileName, bytes, sha256 }) => ({ evidenceId, exportFileName, bytes, sha256 })) },
    scope: { readerNewEvaluation: false, newReadOnlyEvaluation: true, newAction: false, grantsCurrentAuthority: false, executorInvoked: false, newSignatures: false, retainedCanonicalTime: spec.head.canonicalTime, wallClockFreshness: 'NOT_CLAIMED', data: 'SYNTHETIC', host: 'TRUSTED_COOPERATIVE_OPERATOR', signing: 'PUBLIC_DEVELOPMENT_KEYS', finality: 'LOCAL_ONLY', incidentResolution: 'NOT_PROVEN', versionRouting: 'FIXED_COMMON_CORE_0.2_ONLY' },
  };
  requireFact(Buffer.byteLength(JSON.stringify(report) + '\n', 'utf8') <= OUTPUT_BYTES, 'OUTPUT_BYTES_LIMIT');
  return report;
}
