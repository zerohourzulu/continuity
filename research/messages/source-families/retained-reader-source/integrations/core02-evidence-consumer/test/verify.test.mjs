import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { verifyCommonEvidence, TOTAL_INPUT_BYTES, OUTPUT_BYTES } from '../src/verify.mjs';
import { COMMON_PROFILES, commonCaseSpec } from '../src/specs.mjs';
import { canonicalEncode } from '../../../packages/core-0.2/src/core/canonical.ts';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (actual, expected) => assert.equal(canonicalEncode(actual), canonicalEncode(expected));
const originals = new Map(COMMON_PROFILES.map(name => [name, Object.fromEntries(commonCaseSpec(name).members.map(member =>
  [member.evidenceId, readFileSync(join(repository, member.sourcePath))]))]));
const data = name => Object.fromEntries(Object.entries(originals.get(name)).map(([key, bytes]) => [key, Buffer.from(bytes)]));
const parsed = (name, id) => JSON.parse(originals.get(name)[id]);
const reports = new Map();
function report(name) {
  if (!reports.has(name)) reports.set(name, verifyCommonEvidence(name, data(name)));
  return reports.get(name);
}
const refuses = (operation, code) => assert.throws(operation, error => error.code === code);

test('both fixed cases reproduce exact retained receipt, head and five queries without changing original inputs', () => {
  for (const name of COMMON_PROFILES) {
    const spec = commonCaseSpec(name), input = data(name), before = Object.fromEntries(Object.entries(input).map(([id, bytes]) => [id, Buffer.from(bytes)]));
    // Evaluate each fixed case once; subsequent positive assertions reuse this report.
    const actual = verifyCommonEvidence(name, input); reports.set(name, actual);
    assert.equal(actual.schemaVersion, 'continuity-common-case-inspection/1');
    assert.equal(actual.profile, name); assert.equal(actual.caseId, spec.caseId); assert.equal(actual.verifierId, 'continuity-core/0.2');
    same(actual.domain, spec.domain); same(actual.head, spec.head);
    same(actual.receipt, parsed(name, 'receiptVerification'));
    same(actual.acknowledgment, parsed(name, 'receipt').payload.result.acknowledgment);
    assert.equal(actual.evaluation.receiptExactMatch, true);
    assert.deepEqual(actual.evaluation.queriesExactMatch, ['responsible', 'sourceAtEvaluation', 'sourceHistorical', 'successor', 'survives']);
    assert.equal(actual.evaluation.authorizationScopes.sourceAtEvaluation.presentConsequentialUse, true);
    assert.equal(actual.evaluation.authorizationScopes.sourceHistorical.presentConsequentialUse, false);
    assert.equal(actual.successorAuthorization.presentConsequentialUse, false);
    assert.equal(actual.duty.bearer, `role:${spec.caseId}`); assert.equal(actual.duty.performer, `b:${spec.caseId}`);
    assert.equal(actual.duty.status, 'OUTCOME_UNKNOWN'); assert.equal(actual.duty.incidentResolution, 'NOT_PROVEN');
    same(actual.sources.artifacts, spec.members.map(({ evidenceId, exportFileName, bytes, sha256 }) => ({ evidenceId, exportFileName, bytes, sha256 })));
    assert.equal(actual.sources.catalogSha256, spec.catalogSha256); assert.equal(actual.sources.exportManifestSha256, spec.exportManifestSha256);
    assert.equal(actual.sources.sourcePinVerification, 'CALLER_PREIMPORT_CHECK_REQUIRED');
    assert.equal(actual.retainedObservations.applicationReview.verificationHere, 'BYTES_PINNED_APPLICATION_SIGNATURES_NOT_REVERIFIED');
    for (const [id, bytes] of Object.entries(input)) assert.ok(bytes.equals(before[id]), `${name}/${id} mutated`);
  }
});

test('packet inspection binds exact original manifest/log bytes while simulator presents no packet evidence', () => {
  const packet = report('core02-packet'), input = originals.get('core02-packet'), spec = commonCaseSpec('core02-packet');
  assert.equal(packet.packetInspection.status, 'LOCAL_PACKET_BYTES_VERIFIED');
  assert.equal(packet.acknowledgment.result.kind, 'LOCAL_PACKET_CREATED');
  assert.equal(packet.packetInspection.manifest.sha256, sha(input.packetManifest));
  assert.equal(packet.acknowledgment.result.manifestDigest.value, `0x${sha(input.packetManifest)}`);
  const expectedFiles = spec.members.filter(member => member.mediaType === 'text/plain').map(member => ({
    name: member.exportFileName.slice('packet-file-'.length), evidenceId: member.evidenceId,
    bytes: input[member.evidenceId].length, sha256: sha(input[member.evidenceId]),
  }));
  assert.deepEqual(packet.packetInspection.files, expectedFiles);
  assert.equal(packet.packetInspection.fileCount, 2);
  assert.equal(packet.packetInspection.totalFileBytes, expectedFiles.reduce((sum, member) => sum + member.bytes, 0));
  assert.equal(packet.packetInspection.externalOutcome, 'NOT_PROVEN');
  const simulated = report('core02-simulated');
  assert.equal(simulated.packetInspection.status, 'SIMULATED_NO_PACKET_FILES');
  assert.equal(simulated.acknowledgment.result.kind, 'SIMULATED_SUBMISSION');
  assert.deepEqual(simulated.packetInspection.files, []); assert.equal(simulated.packetInspection.fileCount, 0);
  assert.equal(simulated.packetInspection.totalFileBytes, 0); assert.equal(simulated.packetInspection.externalOutcome, 'SIMULATED');
  for (const result of [packet, simulated]) {
    assert.equal(result.packetInspection.executorInvoked, false);
    assert.equal(result.scope.newReadOnlyEvaluation, true); assert.equal(result.scope.readerNewEvaluation, false);
    for (const key of ['newAction', 'grantsCurrentAuthority', 'executorInvoked', 'newSignatures']) assert.equal(result.scope[key], false);
    assert.equal(result.scope.wallClockFreshness, 'NOT_CLAIMED'); assert.equal(result.scope.finality, 'LOCAL_ONLY');
  }
});

test('unsupported profile/version and changed source bytes are refused at fixed identity boundary', () => {
  for (const name of ['cheshire', 'security', 'durable-security', 'core02', 'core02-packet/0.1', '', undefined, {}])
    refuses(() => verifyCommonEvidence(name, data('core02-packet')), 'UNSUPPORTED_COMMON_CORE_PROFILE');
  refuses(() => verifyCommonEvidence('core02-packet', data('core02-packet'), 'extra'), 'ARGUMENTS_REFUSED');
  // These are byte-authentication checks, not claims to have reached deeper
  // semantic replay branches with unauthenticated mutated histories.
  const oldVersion = data('core02-packet'), history = JSON.parse(oldVersion.history);
  history[0].data.domain.version = '0.1'; oldVersion.history = Buffer.from(JSON.stringify(history) + '\n');
  refuses(() => verifyCommonEvidence('core02-packet', oldVersion), 'ARTIFACT_IDENTITY_MISMATCH');
  for (const name of COMMON_PROFILES) for (const member of commonCaseSpec(name).members) {
    const changed = data(name); changed[member.evidenceId][0] ^= 1;
    refuses(() => verifyCommonEvidence(name, changed), 'ARTIFACT_IDENTITY_MISMATCH');
  }
});

test('missing, extra and cross-profile artifacts cannot be substituted into a case', () => {
  for (const name of COMMON_PROFILES) {
    const missing = data(name); delete missing.exportManifest;
    refuses(() => verifyCommonEvidence(name, missing), 'ARTIFACT_MEMBERSHIP');
    const extra = data(name); extra.unselected = undefined;
    refuses(() => verifyCommonEvidence(name, extra), 'ARTIFACT_MEMBERSHIP');
    const swapped = data(name), other = COMMON_PROFILES.find(value => value !== name);
    swapped.history = Buffer.from(originals.get(other).history);
    refuses(() => verifyCommonEvidence(name, swapped), 'ARTIFACT_IDENTITY_MISMATCH');
    refuses(() => verifyCommonEvidence(name, data(other)), 'ARTIFACT_MEMBERSHIP');
  }
});

test('own-data Buffer capture refuses unsafe surfaces and enforces finite input/output bounds', () => {
  assert.equal(TOTAL_INPUT_BYTES, 1_048_576); assert.equal(OUTPUT_BYTES, 65_536);
  for (const name of COMMON_PROFILES) {
    const actual = report(name);
    assert.equal(actual.sources.totalInputBytes, Object.values(originals.get(name)).reduce((sum, bytes) => sum + bytes.length, 0));
    assert.ok(actual.sources.totalInputBytes <= TOTAL_INPUT_BYTES);
    assert.ok(Buffer.byteLength(JSON.stringify(actual) + '\n') <= OUTPUT_BYTES);
  }
  let invoked = 0;
  const getter = data('core02-packet'); Object.defineProperty(getter, 'history', { enumerable: true, get() { invoked++; return Buffer.alloc(1); } });
  refuses(() => verifyCommonEvidence('core02-packet', getter), 'ARTIFACT_DATA_REQUIRED');
  const proxy = new Proxy(data('core02-packet'), { ownKeys() { invoked++; return []; }, getPrototypeOf() { invoked++; return null; } });
  refuses(() => verifyCommonEvidence('core02-packet', proxy), 'ARTIFACT_RECORD_REQUIRED');
  const bufferProxy = data('core02-packet'); bufferProxy.history = new Proxy(bufferProxy.history, { get() { invoked++; return undefined; } });
  refuses(() => verifyCommonEvidence('core02-packet', bufferProxy), 'ARTIFACT_BUFFER_REQUIRED');
  assert.equal(invoked, 0);
  const plainBytes = data('core02-packet'); plainBytes.history = new Uint8Array(plainBytes.history);
  refuses(() => verifyCommonEvidence('core02-packet', plainBytes), 'ARTIFACT_BUFFER_REQUIRED');
  const shared = data('core02-packet'); shared.history = Buffer.from(new SharedArrayBuffer(8));
  refuses(() => verifyCommonEvidence('core02-packet', shared), 'SHARED_BUFFER_REFUSED');
  const decorated = data('core02-packet'); decorated.history.extra = true;
  refuses(() => verifyCommonEvidence('core02-packet', decorated), 'ARTIFACT_BUFFER_FIELDS');
  const oversized = data('core02-packet'); oversized.summary = Buffer.alloc(TOTAL_INPUT_BYTES + 1);
  refuses(() => verifyCommonEvidence('core02-packet', oversized), 'INPUT_BYTES_LIMIT');
});
