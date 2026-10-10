import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { canonicalEncode, hashCanonical, captureBoundedCanonicalReplayBodyIncrementally } from '../../../packages/core-0.2/src/core/canonical.ts';
import { createPortableReplayKernel, PORTABLE_REPLAY_VERSION } from '../../../packages/core-0.2/src/core/portable-replay.ts';
import { derivePortableAdapterIdentity } from '../../../packages/core-0.2/src/core/portable-integration.ts';
import { PORTABLE_ADAPTER_SUBMISSION_VERSION, PORTABLE_ADAPTER_POLICY_E2_HASH, LOCAL_SYNTHETIC_ENDPOINT_STATE_ADAPTER_ID, approvedPortableAdapterProfileForPolicy, validatePortableAdapterAcknowledgment, portableAdapterAcknowledgmentEvidence } from '../../../packages/core-0.2/src/core/portable-adapter-engine.ts';
import { parseStrictJson } from '../../retained-evidence-mcp/src/strict-json.mjs';
import { parseReviewedAction, projectCommandToDescriptor } from '../../synthetic-state-executor/src/contract.mjs';

const MAX_BYTES = 2 * 1024 * 1024;
const unicode = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u;
const fail = code => { const error = new Error(code); error.code = code; error.status = 'INVALID'; throw error; };
const check = (condition, code) => { if (!condition) fail(code); };
const equal = (left, right, code) => check(canonicalEncode(left) === canonicalEncode(right), code);
const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');
const closed = (value, keys, code) => {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), code);
  equal(Object.keys(value).sort(), [...keys].sort(), code);
};

// Reject proxies before reflection, never invoke getters/toJSON, and preserve
// scalar types and field presence while making a bounded immutable snapshot.
function capture(input) {
  let nodes = 0, bytes = 0;
  const seen = new WeakSet();
  const copy = (value, depth) => {
    check(++nodes <= 100000 && depth <= 64, 'SA_INPUT_LIMIT');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      check(!unicode.test(value) && value.length <= MAX_BYTES, 'SA_INPUT_STRING');
      bytes += Buffer.byteLength(value, 'utf8');
      check(bytes <= MAX_BYTES, 'SA_INPUT_LIMIT');
      return value;
    }
    if (typeof value === 'number') {
      check(Number.isSafeInteger(value) && !Object.is(value, -0), 'SA_INPUT_NUMBER');
      return value;
    }
    check(typeof value === 'object' && !types.isProxy(value) && !seen.has(value), 'SA_INPUT_OBJECT');
    seen.add(value);
    const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
    check(array ? proto === Array.prototype : (proto === Object.prototype || proto === null), 'SA_INPUT_OBJECT');
    const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
    check(keys.length <= 10001 && keys.every(key => typeof key === 'string'), 'SA_INPUT_LIMIT');
    const out = array ? [] : Object.create(null);
    if (array) {
      const length = descriptors.length;
      check(length && Object.hasOwn(length, 'value') && Number.isSafeInteger(length.value) && length.value <= 10000 && keys.length === length.value + 1, 'SA_INPUT_ARRAY');
      for (let i = 0; i < length.value; i++) {
        const property = descriptors[String(i)];
        check(property && property.enumerable && Object.hasOwn(property, 'value'), 'SA_INPUT_ARRAY');
        out.push(copy(property.value, depth + 1));
      }
    } else {
      for (const key of keys) {
        const property = descriptors[key];
        check(property.enumerable && Object.hasOwn(property, 'value') && !unicode.test(key), 'SA_INPUT_PROPERTY');
        bytes += Buffer.byteLength(key, 'utf8');
        check(bytes <= MAX_BYTES, 'SA_INPUT_LIMIT');
        Object.defineProperty(out, key, { value: copy(property.value, depth + 1), enumerable: true });
      }
    }
    seen.delete(value);
    return Object.freeze(out);
  };
  const result = copy(input, 0);
  check(Buffer.byteLength(JSON.stringify(result), 'utf8') <= MAX_BYTES, 'SA_INPUT_LIMIT');
  return result;
}

function parseText(text) {
  check(typeof text === 'string' && text.length > 0 && text.length <= 4096 && !unicode.test(text), 'SA_RECORD_TEXT');
  check(Buffer.byteLength(text, 'utf8') <= 4096, 'SA_RECORD_TEXT');
  return capture(parseStrictJson(Buffer.from(text, 'utf8')));
}

function replay(events) {
  const kernel = createPortableReplayKernel();
  const result = captureBoundedCanonicalReplayBodyIncrementally(events, { operationVersion: PORTABLE_REPLAY_VERSION, events }, kernel.visit);
  check(result.status === 'CAPTURED', 'SA_HISTORY_CAPTURE');
  const finished = kernel.finish();
  check(finished.status === 'ACCEPTED', 'SA_HISTORY_REPLAY');
  return finished.state;
}

function checkTransition(value, command) {
  closed(value, ['schemaVersion', 'resource', 'identity', 'commandSha256', 'before', 'after'], 'SA_TRANSITION_SCHEMA');
  const before = { revision: command.expectedRevision, status: command.action === 'RELEASE' ? 'HELD' : 'RELEASED' };
  const after = { revision: command.expectedRevision + 1, status: command.action === 'RELEASE' ? 'RELEASED' : 'HELD' };
  equal(value, {
    schemaVersion: 'continuity-synthetic-state-transition/1', resource: command.resource,
    identity: { intentId: command.intentId, idempotencyKey: command.idempotencyKey, submissionFingerprint: command.submissionFingerprint },
    commandSha256: value.commandSha256, before, after,
  }, 'SA_TRANSITION_BINDING');
}

/** Historical evidence only. Invalid required relationships return no partial report. */
export function inspectActionEvidence(input) {
  try {
    check(arguments.length === 1, 'SA_ARGUMENTS');
    const captured = capture(input);
    closed(captured, ['events', 'records'], 'SA_INPUT_SCHEMA');
    const { events, records } = captured;
    check(Array.isArray(events) && events.length > 0 && events.length <= 120, 'SA_EVENT_COUNT');
    check(Array.isArray(records) && records.length <= 32, 'SA_RECORD_COUNT');
    const state = replay(events);
    check(state.genesis.adapterPolicyHash === PORTABLE_ADAPTER_POLICY_E2_HASH && state.genesis.finality === 'LOCAL_ONLY', 'SA_HISTORY_PROFILE');
    const profile = approvedPortableAdapterProfileForPolicy(state.genesis.adapterPolicyHash, LOCAL_SYNTHETIC_ENDPOINT_STATE_ADAPTER_ID);
    const actions = [], seen = new Set();
    let prior = { revision: 0, status: 'HELD' }, resource, previousAdmissionPosition = -1;
    for (const record of records) {
      closed(record, ['descriptorUtf8', 'commandUtf8', 'transitionUtf8'], 'SA_RECORD_SCHEMA');
      // Parse all exact strings ourselves before accepting the helper's binding.
      const rawDescriptor = parseText(record.descriptorUtf8), command = parseText(record.commandUtf8), transition = parseText(record.transitionUtf8);
      const descriptor = parseReviewedAction(record.descriptorUtf8);
      equal(descriptor, rawDescriptor, 'SA_DESCRIPTOR_CAPTURE');
      equal(projectCommandToDescriptor(record.commandUtf8), descriptor, 'SA_COMMAND_DESCRIPTOR');
      check(!seen.has(descriptor.intentId), 'SA_DUPLICATE_INTENT');
      seen.add(descriptor.intentId);
      check(resource === undefined || resource === descriptor.resource, 'SA_RESOURCE_SEQUENCE');
      resource = descriptor.resource;
      const declaration = state.intentDeclarations.get(descriptor.intentId)?.data;
      const admission = state.intentAdmissions.get(descriptor.intentId);
      check(declaration !== undefined && admission !== undefined, 'SA_MISSING_ADMISSION');
      equal(declaration.adapterProfile, profile, 'SA_ADAPTER_PROFILE');
      check(declaration.resource === descriptor.resource && declaration.action === (descriptor.action === 'RELEASE' ? 'release-synthetic-endpoint' : 'restore-synthetic-hold'), 'SA_DECLARATION_ACTION');
      const termsCommitment = hashCanonical(descriptor);
      check(declaration.termsCommitment === termsCommitment, 'SA_SIGNED_TERMS');
      const position = admission.admissionEventPosition, declarationPosition = position - 1;
      check(position > previousAdmissionPosition && descriptor.reviewHead.position === position - 2 && declarationPosition >= 1, 'SA_REVIEW_SUFFIX');
      previousAdmissionPosition = position;
      const declarationEvent = events[declarationPosition];
      check(declarationEvent.type === 'TRANSACTION_INTENT_DECLARED' && declarationEvent.data.intentId === descriptor.intentId, 'SA_REVIEW_DECLARATION');
      equal(descriptor.reviewHead, { hash: state.eventHistoryHashes[descriptor.reviewHead.position], position: descriptor.reviewHead.position, canonicalTime: events[descriptor.reviewHead.position].timestamp }, 'SA_REVIEW_HEAD');
      const admissionEvent = events[position];
      const { operationVersion, ...identity } = derivePortableAdapterIdentity({ operationVersion: PORTABLE_ADAPTER_SUBMISSION_VERSION, domain: admissionEvent.data.authorizationProof.domain, intentId: descriptor.intentId, admissionEvent, admittedHistory: events.slice(0, position + 1) });
      equal(identity, admission.adapterIdentity, 'SA_IDENTITY_RECONSTRUCTION');
      check(command.intentId === identity.intentId && command.idempotencyKey === identity.idempotencyKey && command.submissionFingerprint === identity.submissionFingerprint, 'SA_COMMAND_IDENTITY');
      check(transition.commandSha256 === sha(record.commandUtf8), 'SA_COMMAND_DIGEST');
      checkTransition(transition, command);
      equal(transition.before, prior, 'SA_TRANSITION_SEQUENCE');
      prior = transition.after;
      const transitionDigest = { algorithm: 'keccak256', value: hashCanonical(transition) };
      const consumed = state.intentConsumptions.get(descriptor.intentId);
      let consumption = { status: 'UNRECORDED' };
      if (consumed !== undefined) {
        check(validatePortableAdapterAcknowledgment(consumed.acknowledgment, identity), 'SA_ACK_IDENTITY');
        equal(consumed.acknowledgment.result, { kind: 'LOCAL_ENDPOINT_STATE_CHANGED', transitionDigest }, 'SA_ACK_TRANSITION');
        check(consumed.transactionReference === transitionDigest.value, 'SA_CONSUMPTION_REFERENCE');
        equal(consumed.evidenceReference, portableAdapterAcknowledgmentEvidence(identity, consumed.acknowledgment), 'SA_CONSUMPTION_EVIDENCE');
        consumption = { status: 'RECORDED', eventId: consumed.eventId, eventPosition: consumed.eventPosition, acknowledgment: consumed.acknowledgment };
      }
      actions.push({ intentId: descriptor.intentId, descriptor, termsCommitment, identity,
        historicalAuthority: { status: 'VERIFIED_AT_ADMISSION', actorId: admission.actorId, runtimeSessionId: admission.runtimeSessionId, controlEpoch: admission.controlEpoch, roleId: admission.roleId, roleTenureId: admission.roleTenureId, admissionEventId: admission.admissionEventId, admissionHead: admission.admissionHead },
        transition: { status: 'LOCALLY_RETAINED_ASSERTION', commandSha256: transition.commandSha256, transitionDigest, before: transition.before, after: transition.after },
        consumption, externalEffect: { status: 'NOT_PROVEN' }, currentAuthority: { status: 'NOT_EVALUATED' },
      });
    }
    const admissionsWithoutTransition = [];
    for (const admission of state.intentAdmissions.values()) {
      if (admission.adapterIdentity.adapterProfile.profileId !== profile.profileId || seen.has(admission.intentId)) continue;
      check(!state.intentConsumptions.has(admission.intentId), 'SA_MISSING_CONSUMED_TRANSITION');
      admissionsWithoutTransition.push({ intentId: admission.intentId, admissionEventId: admission.admissionEventId, admissionHead: admission.admissionHead, consumption: 'UNRECORDED', localEffect: 'NOT_PROVEN' });
    }
    const duties = [...state.obligations].map(([obligationId, duty]) => ({ obligationId, sourceIntentId: duty.record.sourceIntentId, bearer: duty.record.durableRoleId, performer: duty.performanceAssigneeId, status: duty.status, incidentResolution: 'NOT_PROVEN' }));
    return capture({ schemaVersion: 'continuity-security-action-reader/1', status: 'VERIFIED',
      history: { status: 'REPLAY_VERIFIED', eventCount: events.length, head: state.head, domain: state.genesis.domain, adapterPolicyHash: state.genesis.adapterPolicyHash },
      actions, admissionsWithoutTransition, duties,
      scope: { reviewMaterial: 'DIGEST_BOUND_ONLY', historyCompleteness: 'SUPPLIED_HISTORY_ONLY', finality: 'LOCAL_ONLY', presentConsequentialUse: false },
    });
  } catch (error) {
    fail(typeof error?.code === 'string' && /^SA_[A-Z_]{1,64}$/.test(error.code) ? error.code : 'SA_VALIDATION_FAILED');
  }
}
