// Application-only operator approval. No signer, store, Core authority or filesystem access.
import { createHash, createPublicKey, verify } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { parseStrictJson } from '../../retained-evidence-mcp/src/strict-json.mjs';

const POLICY = 'continuity-operator-policy/1';
const DOCUMENT_POLICY = 'continuity-document-operator-policy/1';
const CHALLENGE = 'continuity-operator-challenge/1';
const DECISION = 'continuity-operator-decision/1';
const fail = code => { throw new Error(code); };
const check = (ok, code = 'OPERATOR_INVALID_INPUT') => { if (!ok) fail(code); };
const matches = (pattern, value) => typeof value === 'string' && pattern.exec(value)?.[0] === value;
const identifier = value => matches(/^[\x21-\x7e]{1,128}$/, value);
const bindingId = value => matches(/^[\x21-\x7e]{1,256}$/, value);
const hex = (value, size) => typeof value === 'string' && value.length === size && /^[0-9a-f]+$/.test(value);
const slug = value => matches(/^[a-z][a-z0-9-]{0,31}$/, value);
const closed = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
function text(value, limit, code = 'OPERATOR_INVALID_INPUT') {
  check(typeof value === 'string' && value.length > 0 && value.length <= limit && value.isWellFormed(), code);
  check(Buffer.byteLength(value, 'utf8') <= limit, code);
  return value;
}
function parse(value, maximum) {
  text(value, maximum);
  try { return parseStrictJson(Buffer.from(value, 'utf8')); } catch { fail('OPERATOR_INVALID_JSON'); }
}
function freeze(value) {
  // Only used on the shallow, fully validated closed parser-derived structures below.
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
function path(value) {
  text(value, 4096);
  check(!value.includes('\0') && isAbsolute(value) && resolve(value) === value, 'OPERATOR_INVALID_PATH');
}
export function sha(value) {
  check(Buffer.isBuffer(value) || (typeof value === 'string' && value.isWellFormed()), 'OPERATOR_INVALID_BYTES');
  return createHash('sha256').update(value).digest('hex');
}
export function parsePolicy(policyUtf8) {
  const value = parse(policyUtf8, 16 * 1024);
  const document = value?.schemaVersion === DOCUMENT_POLICY;
  check(closed(value, ['schemaVersion', 'edition', 'caseDirectory', 'approvalDirectory', 'instanceId', 'operatorId', 'keyId',
    'publicKeyHex', 'resource', 'actions', 'credentialClass', ...(document ? ['recipientId', 'releaseSlotId', 'resourcePolicySha256'] : [])])
    && (value.schemaVersion === POLICY || document), 'OPERATOR_INVALID_POLICY');
  check(identifier(value.edition) && identifier(value.operatorId) && identifier(value.keyId)
    && hex(value.instanceId, 32) && hex(value.publicKeyHex, 64)
    && (document ? matches(/^quarantined-document:[a-z0-9-]{1,64}$/, value.resource)
      : matches(/^synthetic-endpoint:[a-z0-9-]{1,128}$/, value.resource))
    && ['PUBLIC_DEVELOPMENT_FIXTURE', 'OPERATOR_ENROLLED'].includes(value.credentialClass), 'OPERATOR_INVALID_POLICY');
  path(value.caseDirectory); path(value.approvalDirectory);
  if (document) {
    check(matches(/^recipient:[a-z0-9-]{1,64}$/, value.recipientId) && matches(/^release-slot:[a-z0-9-]{1,64}$/, value.releaseSlotId)
      && hex(value.resourcePolicySha256, 64) && Array.isArray(value.actions) && value.actions.length === 1
      && value.actions[0] === 'RELEASE_DOCUMENT', 'OPERATOR_INVALID_POLICY');
  } else {
    check(Array.isArray(value.actions) && value.actions.length >= 1 && value.actions.length <= 2
      && value.actions.every(action => action === 'RELEASE' || action === 'RESTORE')
      && new Set(value.actions).size === value.actions.length, 'OPERATOR_INVALID_POLICY');
  }
  return freeze(value);
}
export function parseChallenge(challengeUtf8) {
  const value = parse(challengeUtf8, 64 * 1024);
  check(closed(value, ['schemaVersion', 'challengeId', 'instanceId', 'policySha256', 'caseId', 'actionId', 'who', 'domain',
    'actorBinding', 'requestUtf8', 'reviewDisplaySha256']) && value.schemaVersion === CHALLENGE, 'OPERATOR_INVALID_CHALLENGE');
  check(hex(value.challengeId, 32) && hex(value.instanceId, 32) && hex(value.policySha256, 64)
    && hex(value.reviewDisplaySha256, 64) && slug(value.caseId) && slug(value.actionId)
    && ['a', 'b'].includes(value.who), 'OPERATOR_INVALID_CHALLENGE');
  const domain = value.domain;
  check(closed(domain, ['protocol', 'version', 'deploymentId', 'chainId', 'verifyingContract'])
    && bindingId(domain.protocol) && bindingId(domain.version) && bindingId(domain.deploymentId)
    && bindingId(domain.chainId) && matches(/^0x[0-9a-fA-F]{40}$/, domain.verifyingContract), 'OPERATOR_INVALID_DOMAIN');
  const binding = value.actorBinding;
  check(closed(binding, ['actorId', 'runtimeSessionId', 'credentialKeyId', 'controlEpoch', 'roleId', 'roleTenureId'])
    && ['actorId', 'runtimeSessionId', 'credentialKeyId', 'roleId', 'roleTenureId'].every(key => bindingId(binding[key]))
    && Number.isSafeInteger(binding.controlEpoch) && binding.controlEpoch > 0, 'OPERATOR_INVALID_BINDING');
  // Exact request bytes are opaque here. The root wrapper validates their action/context projection.
  text(value.requestUtf8, 16 * 1024, 'OPERATOR_INVALID_REQUEST');
  return freeze(value);
}
function validateDecision(value) {
  check(closed(value, ['schemaVersion', 'challengeUtf8', 'operatorId', 'keyId', 'decision', 'reason'])
    && value.schemaVersion === DECISION && identifier(value.operatorId) && identifier(value.keyId)
    && ['APPROVE', 'DENY'].includes(value.decision), 'OPERATOR_INVALID_DECISION');
  parseChallenge(value.challengeUtf8);
  text(value.reason, 1024, 'OPERATOR_INVALID_REASON');
  return value;
}
export function decisionText(challengeUtf8, operatorId, keyId, decision, reason) {
  const value = validateDecision({ schemaVersion: DECISION, challengeUtf8, operatorId, keyId, decision, reason });
  return text(JSON.stringify(value) + '\n', 128 * 1024, 'OPERATOR_DECISION_LIMIT');
}
export function verifyDecision(envelopeUtf8, challengeUtf8, policyUtf8) {
  const policy = parsePolicy(policyUtf8), challenge = parseChallenge(challengeUtf8);
  check(challenge.policySha256 === sha(policyUtf8) && challenge.instanceId === policy.instanceId, 'OPERATOR_POLICY_BINDING');
  const envelope = parse(envelopeUtf8, 256 * 1024);
  check(closed(envelope, ['decisionUtf8', 'signatureHex']) && hex(envelope.signatureHex, 128), 'OPERATOR_INVALID_ENVELOPE');
  const decision = validateDecision(parse(envelope.decisionUtf8, 128 * 1024));
  check(decision.challengeUtf8 === challengeUtf8 && decision.operatorId === policy.operatorId && decision.keyId === policy.keyId,
    'OPERATOR_DECISION_BINDING');
  // RFC 8410 SubjectPublicKeyInfo encoding for a raw Ed25519 key; no key comes from the envelope.
  let key;
  try { key = createPublicKey({ key: Buffer.from('302a300506032b6570032100' + policy.publicKeyHex, 'hex'), format: 'der', type: 'spki' }); }
  catch { fail('OPERATOR_INVALID_PUBLIC_KEY'); }
  check(key.asymmetricKeyType === 'ed25519', 'OPERATOR_INVALID_PUBLIC_KEY');
  check(verify(null, Buffer.from(DECISION + '\n' + envelope.decisionUtf8, 'utf8'), key, Buffer.from(envelope.signatureHex, 'hex')),
    'OPERATOR_BAD_SIGNATURE');
  // Authenticates enrolled credential control only. No human presence, truth or current Core power is inferred.
  return freeze(decision);
}
