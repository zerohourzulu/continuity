// Pure format/binding helpers. No store, actuator, coordinator or current authority.
import { parseStrictJson } from '../../retained-evidence-mcp/src/strict-json.mjs';
import { canonicalEncode, hashCanonical, immutableProtocolInput } from '../../../packages/core-0.2/src/core/canonical.ts';
import { derivePortableAdapterIdentity } from '../../../packages/core-0.2/src/core/portable-integration.ts';
import { approvedPortableAdapterProfileForPolicy, PORTABLE_ADAPTER_POLICY_E2_HASH,
  LOCAL_SYNTHETIC_ENDPOINT_STATE_ADAPTER_ID } from '../../../packages/core-0.2/src/core/portable-adapter-engine.ts';

const DESCRIPTOR = 'continuity-reviewed-state-action/1';
const COMMAND = 'continuity-synthetic-state-command/1';
const DESCRIPTOR_KEYS = ['schemaVersion', 'intentId', 'resource', 'action', 'expectedRevision',
  'proposalSha256', 'snapshotManifestSha256', 'reviewMaterialSha256', 'reviewHead'];
const COMMAND_KEYS = ['schemaVersion', 'resource', 'intentId', 'idempotencyKey', 'submissionFingerprint',
  'expectedRevision', 'action', 'proposalSha256', 'snapshotManifestSha256', 'reviewMaterialSha256', 'reviewHead'];
const fail = () => { throw new TypeError('INVALID_STATE_ACTION'); };
const matches = (pattern, value) => typeof value === 'string' && pattern.exec(value)?.[0] === value;
const hash = value => matches(/^0x[a-f0-9]{64}$/, value);
const sha = value => matches(/^[a-f0-9]{64}$/, value);
const integer = (value, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0 && value <= max;
const closed = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

function parse(text) {
  // Never invoke caller conversion, getters or proxy traps at this boundary.
  if (typeof text !== 'string' || !text.length || text.length > 4096 || !text.isWellFormed()
    || Buffer.byteLength(text, 'utf8') > 4096) fail();
  try { return parseStrictJson(Buffer.from(text, 'utf8')); } catch { fail(); }
}

function descriptor(value) {
  if (!matches(/^[\x21-\x7e]{1,256}$/, value.intentId)
    || !matches(/^synthetic-endpoint:[a-z0-9-]{1,128}$/, value.resource)
    || !['RELEASE', 'RESTORE'].includes(value.action) || !integer(value.expectedRevision, 31)
    || !sha(value.proposalSha256) || !sha(value.snapshotManifestSha256) || !sha(value.reviewMaterialSha256)
    || !closed(value.reviewHead, ['hash', 'position', 'canonicalTime']) || !hash(value.reviewHead.hash)
    || !integer(value.reviewHead.position) || !integer(value.reviewHead.canonicalTime)) fail();
  return Object.freeze({ schemaVersion: DESCRIPTOR, intentId: value.intentId, resource: value.resource,
    action: value.action, expectedRevision: value.expectedRevision, proposalSha256: value.proposalSha256,
    snapshotManifestSha256: value.snapshotManifestSha256, reviewMaterialSha256: value.reviewMaterialSha256,
    reviewHead: Object.freeze({ hash: value.reviewHead.hash, position: value.reviewHead.position,
      canonicalTime: value.reviewHead.canonicalTime }) });
}

export function parseReviewedAction(descriptorUtf8) {
  const value = parse(descriptorUtf8);
  if (!closed(value, DESCRIPTOR_KEYS) || value.schemaVersion !== DESCRIPTOR) fail();
  return descriptor(value);
}

export function projectCommandToDescriptor(commandUtf8) {
  const value = parse(commandUtf8);
  if (!closed(value, COMMAND_KEYS) || value.schemaVersion !== COMMAND
    || !hash(value.idempotencyKey) || !hash(value.submissionFingerprint)) fail();
  return descriptor(value);
}

export function commandFromAdmission(descriptorUtf8, submission) {
  const reviewed = parseReviewedAction(descriptorUtf8);
  // Core captures this integration object once (ordinary accessors may be read),
  // then replays the exact signed admission prefix. The SDK supplies frozen data.
  const stable = immutableProtocolInput(submission);
  const identity = derivePortableAdapterIdentity(stable);
  const expectedProfile = approvedPortableAdapterProfileForPolicy(PORTABLE_ADAPTER_POLICY_E2_HASH,
    LOCAL_SYNTHETIC_ENDPOINT_STATE_ADAPTER_ID);
  const request = stable.admissionEvent.data.authorizationProof.request;
  if (canonicalEncode(identity.adapterProfile) !== canonicalEncode(expectedProfile)
    || identity.intentId !== reviewed.intentId || request.resource !== reviewed.resource
    || request.action !== (reviewed.action === 'RELEASE' ? 'release-synthetic-endpoint' : 'restore-synthetic-hold')
    || request.termsCommitment !== hashCanonical(reviewed)) fail();
  const commandUtf8 = JSON.stringify({ schemaVersion: COMMAND, resource: reviewed.resource, intentId: reviewed.intentId,
    idempotencyKey: identity.idempotencyKey, submissionFingerprint: identity.submissionFingerprint,
    expectedRevision: reviewed.expectedRevision, action: reviewed.action, proposalSha256: reviewed.proposalSha256,
    snapshotManifestSha256: reviewed.snapshotManifestSha256, reviewMaterialSha256: reviewed.reviewMaterialSha256,
    reviewHead: reviewed.reviewHead }) + '\n';
  if (canonicalEncode(projectCommandToDescriptor(commandUtf8)) !== canonicalEncode(reviewed)) fail();
  return commandUtf8;
}
