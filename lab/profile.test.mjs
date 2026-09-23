import assert from 'node:assert/strict';
import test from 'node:test';
import * as core from '../packages/core-0.2/src/core/index.ts';
import {
  derivePortableAdapterIdempotencyKey,
  derivePortableAdapterNoEffectReference,
  knownPortableAdapterAcknowledgmentVersion,
  knownPortableAdapterProfile,
  validateKnownPortableAdapterProfile,
} from '../packages/core-0.2/src/core/portable-adapter-engine.ts';

const hash = byte => `0x${byte.repeat(64)}`;
const reportDigest = hash('a');
const remoteId = core.REMOTE_SERVICE_REPORT_ADAPTER_ID;
const profile = core.approvedPortableAdapterProfileForPolicy(core.PORTABLE_ADAPTER_POLICY_E4_HASH, remoteId);
const domain = { protocol: 'continuity', version: '0.2', deploymentId: 'remote-report-test', chainId: '1', verifyingContract: `0x${'1'.repeat(40)}` };
const identityFor = (adapterProfile = profile, intentId = 'report:1') => {
  const idempotencyKey = derivePortableAdapterIdempotencyKey(domain, intentId);
  const submissionFingerprint = hash('b');
  const admissionHead = { hash: hash('c'), position: 7, canonicalTime: 10 };
  return { adapterProfile, domain, intentId, admissionHead, idempotencyKey, submissionFingerprint,
    durableEventHistoryHash: admissionHead.hash,
    adapterNoEffectReference: derivePortableAdapterNoEffectReference(idempotencyKey, submissionFingerprint) };
};
const identity = identityFor();
const acknowledgment = () => core.createRemoteServiceReportAcknowledgment(identity, reportDigest);

test('E1–E3 preserve captured policy hashes, profile order and descriptor hashes', () => {
  const descriptors = {
    'adapter:local-document-release': '0x9749dc03bd4db3c4a1f8eba707fa5ab49ea02f0a948b22697a3b7152a01393bc',
    'adapter:local-evidence-packet': '0xd4b988c1f23603cf35d9abd0db5a7eb56ef7a5fba1a8f3e904490c1ce4458d64',
    'adapter:local-synthetic-endpoint-state': '0x486bad2029389663117b06785e641f3a6ec2a90ca89b60e95267965ddc5977ed',
    'adapter:simulated': '0xa9f3354121fdbc4d983093e34684d5ddc841874f8fccadbafe30df65f2e16ac2',
  };
  const editions = [
    ['E1', core.PORTABLE_ADAPTER_POLICY_HASH, '0x00c3498e2744943663475d0187ca979cdd09763b88427781883693c4b8c163a7', ['adapter:local-evidence-packet', 'adapter:simulated']],
    ['E2', core.PORTABLE_ADAPTER_POLICY_E2_HASH, '0x22eb40a92e50c998e007f67f0af0bc584e25f4b21c9bd802cbebe5981828810e', ['adapter:local-evidence-packet', 'adapter:local-synthetic-endpoint-state', 'adapter:simulated']],
    ['E3', core.PORTABLE_ADAPTER_POLICY_E3_HASH, '0xda1ac0f7af67e35a2acd3e213089bafd65204e4bb50e6a0823f8e7e941168666', ['adapter:local-document-release', 'adapter:local-evidence-packet', 'adapter:local-synthetic-endpoint-state', 'adapter:simulated']],
  ];
  for (const [edition, actualHash, expectedHash, ids] of editions) {
    assert.equal(actualHash, expectedHash);
    const policy = core.resolvePortableAdapterPolicy(actualHash);
    assert.equal(policy.edition, edition);
    assert.deepEqual(policy.profiles.map(p => p.profileId), ids);
    assert.deepEqual(policy.profiles.map(p => p.descriptorHash), ids.map(id => descriptors[id]));
    assert.equal(core.validatePortableAdapterProfileForPolicy(actualHash, profile), false);
    assert.throws(() => core.approvedPortableAdapterProfileForPolicy(actualHash, remoteId));
  }
});

test('E4 recognizes only its fixed tuple and does not broaden the legacy default', () => {
  const policy = core.resolvePortableAdapterPolicy(core.PORTABLE_ADAPTER_POLICY_E4_HASH);
  assert.equal(policy.edition, 'E4');
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(Object.isFrozen(policy.profiles), true);
  assert.equal(core.validatePortableAdapterProfileForPolicy(policy.hash, profile), true);
  assert.equal(validateKnownPortableAdapterProfile(profile), true);
  assert.equal(knownPortableAdapterProfile(remoteId), profile);
  assert.equal(knownPortableAdapterAcknowledgmentVersion(profile), 'continuity-remote-service-report-ack/1');
  assert.equal(core.validatePortableAdapterProfile(profile), false);
  assert.throws(() => core.approvedPortableAdapterProfile(remoteId));
  assert.equal(core.resolvePortableAdapterPolicy(undefined), undefined);
  assert.equal(core.resolvePortableAdapterPolicy(hash('d')), undefined);
  assert.throws(() => core.approvedPortableAdapterProfileForPolicy(policy.hash, 'adapter:caller-registered'));
  assert.equal(core.validatePortableAdapterProfileForPolicy(policy.hash, { ...profile, descriptorHash: hash('e') }), false);
});

test('remote acknowledgment contains only a retained report digest bound to the exact identity', () => {
  const ack = acknowledgment();
  assert.equal(ack.schemaVersion, 'continuity-remote-service-report-ack/1');
  assert.equal(ack.result.kind, 'REMOTE_SERVICE_REPORTED');
  assert.deepEqual(Object.keys(ack.result).sort(), ['kind', 'reportDigest']);
  assert.deepEqual(Object.keys(ack.result.reportDigest).sort(), ['algorithm', 'value']);
  assert.equal(ack.result.reportDigest.algorithm, 'sha256');
  assert.equal(ack.result.reportDigest.value, reportDigest);
  assert.equal(Object.isFrozen(ack.result.reportDigest), true);
  assert.equal(core.validatePortableAdapterAcknowledgment(ack, identity), true);
  assert.equal(core.validatePortableAdapterAcknowledgmentShape(ack), true);
  assert.equal(core.validatePortableAdapterAcknowledgment(ack, identityFor(profile, 'report:other')), false);
  assert.equal(core.portableAdapterAcknowledgmentTransactionReference(ack, identity), reportDigest);
  const evidence = core.portableAdapterAcknowledgmentEvidence(identity, ack);
  assert.equal(evidence.reference, core.hashCanonical(ack));
  assert.equal(evidence.evidenceType, ack.schemaVersion);
  assert.equal(evidence.attesterId, remoteId);
});

test('remote acknowledgment rejects extra fields, schema/result substitutions and invalid digests', () => {
  const changes = [
    ack => { ack.success = true; },
    ack => { ack.result.success = true; },
    ack => { ack.result.reportDigest.extra = undefined; },
    ack => { ack.schemaVersion = core.PORTABLE_ADAPTER_ACKNOWLEDGMENT_VERSION; },
    ack => { ack.result.kind = 'LOCAL_PACKET_CREATED'; },
    ack => { ack.result.reportDigest.algorithm = 'keccak256'; },
    ack => { ack.result.reportDigest.value = hash('A'); },
    ack => { ack.result.reportDigest.value = `${reportDigest}\n`; },
    ack => { ack.admissionHead.position++; },
    ack => { ack.submissionFingerprint = hash('e'); },
    ack => { ack.result.reportDigest.value = 'x'.repeat(4097); },
  ];
  for (const mutate of changes) {
    const changed = structuredClone(acknowledgment());
    mutate(changed);
    assert.equal(core.validatePortableAdapterAcknowledgment(changed, identity), false);
    assert.throws(() => core.portableAdapterAcknowledgmentTransactionReference(changed, identity));
  }
  assert.throws(() => core.createRemoteServiceReportAcknowledgment(identity, hash('A')));
  assert.throws(() => core.createRemoteServiceReportAcknowledgment(identity, `${reportDigest}\n`));
  const simulator = identityFor(core.approvedPortableAdapterProfile(core.SIMULATED_ADAPTER_ID));
  assert.throws(() => core.createRemoteServiceReportAcknowledgment(simulator, reportDigest));
  assert.throws(() => core.createPortableAdapterAcknowledgment(identity, reportDigest));
});

test('remote acknowledgment capture rejects accessors and proxies without executing them', () => {
  let touched = 0;
  const accessor = structuredClone(acknowledgment());
  Object.defineProperty(accessor.result.reportDigest, 'value', { enumerable: true, get() { touched++; return reportDigest; } });
  assert.equal(core.validatePortableAdapterAcknowledgment(accessor, identity), false);
  const proxy = new Proxy(acknowledgment(), {
    getPrototypeOf() { touched++; return Object.prototype; },
    ownKeys() { touched++; return []; },
    get() { touched++; return undefined; },
  });
  assert.equal(core.validatePortableAdapterAcknowledgment(proxy, identity), false);
  assert.equal(touched, 0);
});

test('the remote report profile cannot create or validate no-effect evidence', () => {
  assert.throws(() => core.createPortableAdapterNoEffect(identity));
  const forged = structuredClone(acknowledgment());
  forged.schemaVersion = core.PORTABLE_ADAPTER_NO_EFFECT_VERSION;
  forged.kind = 'NO_EFFECT';
  forged.result = { kind: 'SIMULATED_NO_EFFECT', reference: identity.adapterNoEffectReference };
  assert.equal(core.validatePortableAdapterNoEffect(forged, identity), false);
  assert.equal(core.validatePortableAdapterNoEffectShape(forged), false);
  assert.throws(() => core.portableAdapterNoEffectEvidence(identity, forged));
});
