// Offline source-signature data contract. No filesystem, Core, signer or network access.
import { createHash, createPublicKey, verify } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { parseStrictJson } from '../../retained-evidence-mcp/src/strict-json.mjs';
import { parseIncident } from '../intake/contract.mjs';

export const SOURCE_POLICY = 'continuity-incident-source-policy/1';
export const SOURCE_ASSERTION = 'continuity-incident-source-assertion/1';
export const SOURCE_RESULT = 'continuity-incident-source-result/1';
export const LIMITS = Object.freeze({
  incident: 16384, document: 65536, policy: 8192, attestation: 32768,
  assertionUtf8: 8192, maxReportAgeMs: 604800000,
});
export const REFUSAL_CODES = Object.freeze([
  'SOURCE_INVALID_SELECTION', 'SOURCE_INVALID_PATH', 'SOURCE_INPUT_OUTPUT_OVERLAP',
  'SOURCE_INVALID_INPUT', 'SOURCE_INPUT_LIMIT', 'SOURCE_INVALID_EVALUATION_TIME',
  'SOURCE_INVALID_JSON', 'SOURCE_INVALID_POLICY', 'SOURCE_POLICY_PIN_MISMATCH',
  'SOURCE_POLICY_DISABLED', 'SOURCE_INVALID_ATTESTATION', 'SOURCE_INVALID_ASSERTION',
  'SOURCE_INVALID_INCIDENT', 'SOURCE_SELECTION_MISMATCH', 'SOURCE_CONTENT_MISMATCH',
  'SOURCE_TIME_REFUSED', 'SOURCE_INVALID_SIGNATURE', 'SOURCE_INPUT_IO_REFUSED',
]);

class SourceError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new SourceError(code); };
const check = (ok, code) => { if (!ok) fail(code); };
const match = (expression, value) => typeof value === 'string' && expression.exec(value)?.[0] === value;
const identifier = value => match(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/, value);
const validCase = value => match(/^[a-z][a-z0-9-]{0,31}$/, value);
const digest = value => match(/^[0-9a-f]{64}$/, value);
const timestamp = value => Number.isSafeInteger(value) && value >= 0;
const closed = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && Reflect.ownKeys(value).length === keys.length
  && keys.every(key => Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value'));
const freeze = value => {
  // Only bounded, validated result structures are passed here, never unvalidated JSON trees.
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const localPath = value => typeof value === 'string' && value.isWellFormed()
  && !/[\u0000-\u001f\u007f-\u009f]/u.test(value) && Buffer.byteLength(value, 'utf8') < 4096
  && isAbsolute(value) && resolve(value) === value;
const inside = (path, directory) => path === directory
  || (directory === '/' ? path.startsWith('/') : path.startsWith(directory + '/'));

export function sha(bytes) {
  check(Buffer.isBuffer(bytes), 'SOURCE_INVALID_INPUT');
  return createHash('sha256').update(bytes).digest('hex');
}
export function encode(value) {
  try {
    const serialized = JSON.stringify(value, null, 2);
    check(typeof serialized === 'string', 'SOURCE_INVALID_INPUT');
    return Buffer.from(serialized + '\n', 'utf8');
  } catch { fail('SOURCE_INVALID_INPUT'); }
}

export const HELP = `Usage:
  verify-incident-source --incident ABSOLUTE_FILE --document ABSOLUTE_FILE --attestation ABSOLUTE_FILE --policy ABSOLUTE_FILE --expected-policy-sha256 SHA256 --case CASE_ID --out NEW_PRIVATE_DIRECTORY
  verify-incident-source --help

Verify exact incident and document bytes against a detached source signature and a selected local source-key policy.
Select the policy and its SHA256 independently through trusted local configuration, not from the reporter.
Success means: Signature matches the selected source-key policy.
Policy freshness and institutional identity are not established; incident truth and signing time are not verified.
This observation does not create or change a case, grant Core authority, or establish case inclusion.
Public development fixture credentials remain labeled. The verifier reads no private key and offers no signing option.
`;

export function parseSourceArgs(args) {
  check(Array.isArray(args), 'SOURCE_INVALID_SELECTION');
  if (args.length === 1 && args[0] === '--help') return Object.freeze({ help: true });
  check(args.length === 14, 'SOURCE_INVALID_SELECTION');
  const names = ['--incident', '--document', '--attestation', '--policy', '--expected-policy-sha256', '--case', '--out'];
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index], value = args[index + 1];
    check(names.includes(option) && !Object.hasOwn(values, option)
      && typeof value === 'string' && !value.startsWith('--'), 'SOURCE_INVALID_SELECTION');
    values[option] = value;
  }
  check(closed(values, names) && validCase(values['--case']) && digest(values['--expected-policy-sha256']),
    'SOURCE_INVALID_SELECTION');
  const pathOptions = ['--incident', '--document', '--attestation', '--policy', '--out'];
  for (const option of pathOptions) check(localPath(values[option]), 'SOURCE_INVALID_PATH');
  for (const option of pathOptions.slice(0, -1)) {
    check(!inside(values[option], values['--out']) && !inside(values['--out'], values[option]),
      'SOURCE_INPUT_OUTPUT_OVERLAP');
  }
  return Object.freeze({
    incidentPath: values['--incident'], documentPath: values['--document'],
    attestationPath: values['--attestation'], policyPath: values['--policy'],
    expectedPolicySha256: values['--expected-policy-sha256'], caseId: values['--case'],
    outputDirectory: values['--out'],
  });
}

function parseJson(raw) {
  try { return parseStrictJson(raw); }
  catch { fail('SOURCE_INVALID_JSON'); }
}
export function parsePolicy(raw) {
  const policy = parseJson(raw);
  check(closed(policy, ['schemaVersion', 'audience', 'sourceId', 'keyId', 'publicKeyHex', 'keyStatus',
    'notBefore', 'notAfter', 'maxReportAgeMs', 'credentialClass']) && policy.schemaVersion === SOURCE_POLICY,
  'SOURCE_INVALID_POLICY');
  check(identifier(policy.audience) && identifier(policy.sourceId) && identifier(policy.keyId)
    && digest(policy.publicKeyHex) && ['ENABLED', 'REVOKED'].includes(policy.keyStatus)
    && timestamp(policy.notBefore) && timestamp(policy.notAfter) && policy.notBefore < policy.notAfter
    && Number.isSafeInteger(policy.maxReportAgeMs) && policy.maxReportAgeMs >= 1
    && policy.maxReportAgeMs <= LIMITS.maxReportAgeMs
    && ['PUBLIC_DEVELOPMENT_FIXTURE', 'LOCALLY_DECLARED_SOURCE'].includes(policy.credentialClass),
  'SOURCE_INVALID_POLICY');
  return policy;
}
function identity(value, maximum) {
  return closed(value, ['bytes', 'sha256']) && Number.isSafeInteger(value.bytes)
    && value.bytes >= 1 && value.bytes <= maximum && digest(value.sha256);
}
function parseAttestation(raw) {
  const envelope = parseJson(raw);
  check(closed(envelope, ['assertionUtf8', 'signatureHex'])
    && typeof envelope.assertionUtf8 === 'string' && envelope.assertionUtf8.isWellFormed()
    && Buffer.byteLength(envelope.assertionUtf8, 'utf8') >= 1
    && Buffer.byteLength(envelope.assertionUtf8, 'utf8') <= LIMITS.assertionUtf8
    && match(/^[0-9a-f]{128}$/, envelope.signatureHex), 'SOURCE_INVALID_ATTESTATION');
  const assertion = parseJson(Buffer.from(envelope.assertionUtf8, 'utf8'));
  check(closed(assertion, ['schemaVersion', 'audience', 'sourceId', 'keyId', 'reportId', 'caseId',
    'incident', 'document', 'issuedAt', 'expiresAt']) && assertion.schemaVersion === SOURCE_ASSERTION,
  'SOURCE_INVALID_ASSERTION');
  check(identifier(assertion.audience) && identifier(assertion.sourceId) && identifier(assertion.keyId)
    && identifier(assertion.reportId) && validCase(assertion.caseId)
    && identity(assertion.incident, LIMITS.incident) && identity(assertion.document, LIMITS.document)
    && timestamp(assertion.issuedAt) && timestamp(assertion.expiresAt), 'SOURCE_INVALID_ASSERTION');
  return { envelope, assertion };
}
function assess(raws, selection, inputs, evaluatedAt) {
  check(inputs.policy.sha256 === selection.expectedPolicySha256, 'SOURCE_POLICY_PIN_MISMATCH');
  const policy = parsePolicy(raws.policy);
  const { envelope, assertion } = parseAttestation(raws.attestation);
  try { parseIncident(raws.incident, selection.caseId, inputs.document); }
  catch (error) {
    if (error?.message === 'INCIDENT_CASE_MISMATCH') fail('SOURCE_SELECTION_MISMATCH');
    if (error?.message === 'INCIDENT_DOCUMENT_MISMATCH') fail('SOURCE_CONTENT_MISMATCH');
    if (['INVALID_UTF8', 'INVALID_JSON', 'DUPLICATE_KEY'].includes(error?.code)) fail('SOURCE_INVALID_JSON');
    fail('SOURCE_INVALID_INCIDENT');
  }
  check(assertion.caseId === selection.caseId && assertion.audience === policy.audience
    && assertion.sourceId === policy.sourceId && assertion.keyId === policy.keyId, 'SOURCE_SELECTION_MISMATCH');
  for (const name of ['incident', 'document']) {
    check(assertion[name].bytes === inputs[name].bytes && assertion[name].sha256 === inputs[name].sha256,
      'SOURCE_CONTENT_MISMATCH');
  }
  check(policy.keyStatus === 'ENABLED', 'SOURCE_POLICY_DISABLED');
  check(policy.notBefore <= assertion.issuedAt && assertion.issuedAt <= evaluatedAt
    && evaluatedAt < assertion.expiresAt && assertion.expiresAt <= policy.notAfter
    && assertion.expiresAt - assertion.issuedAt <= policy.maxReportAgeMs, 'SOURCE_TIME_REFUSED');
  let signatureMatches = false;
  try {
    // Fixed Ed25519 SPKI wrapper; the key comes only from the digest-pinned local policy.
    const key = createPublicKey({
      key: Buffer.from('302a300506032b6570032100' + policy.publicKeyHex, 'hex'), format: 'der', type: 'spki',
    });
    signatureMatches = key.asymmetricKeyType === 'ed25519'
      && verify(null, Buffer.from(SOURCE_ASSERTION + '\n' + envelope.assertionUtf8, 'utf8'),
        key, Buffer.from(envelope.signatureHex, 'hex'));
  } catch { fail('SOURCE_INVALID_SIGNATURE'); }
  check(signatureMatches, 'SOURCE_INVALID_SIGNATURE');
  return {
    audience: assertion.audience, sourceId: assertion.sourceId, keyId: assertion.keyId,
    reportId: assertion.reportId, caseId: assertion.caseId, issuedAt: assertion.issuedAt,
    expiresAt: assertion.expiresAt, credentialClass: policy.credentialClass,
  };
}

export function evaluateSource(raws, selection, evaluatedAt) {
  check(closed(selection, ['caseId', 'expectedPolicySha256']) && validCase(selection.caseId)
    && digest(selection.expectedPolicySha256), 'SOURCE_INVALID_SELECTION');
  check(timestamp(evaluatedAt), 'SOURCE_INVALID_EVALUATION_TIME');
  check(closed(raws, ['incident', 'document', 'policy', 'attestation']), 'SOURCE_INVALID_INPUT');
  // Copy each bounded input once; all hashes, parsing and signature checks use those same snapshots.
  const selected = { caseId: selection.caseId, expectedPolicySha256: selection.expectedPolicySha256 };
  const snapshots = {}, inputs = {};
  for (const name of ['incident', 'document', 'policy', 'attestation']) {
    check(Buffer.isBuffer(raws[name]), 'SOURCE_INVALID_INPUT');
    check(raws[name].length >= 1 && raws[name].length <= LIMITS[name], 'SOURCE_INPUT_LIMIT');
    snapshots[name] = Buffer.from(raws[name]);
    inputs[name] = { bytes: snapshots[name].length, sha256: sha(snapshots[name]) };
  }
  let verifiedStatement = null, refusalCode = null;
  try { verifiedStatement = assess(snapshots, selected, inputs, evaluatedAt); }
  catch (error) {
    // Never expose parser text, raw content or an unexpected native-crypto diagnostic.
    refusalCode = error instanceof SourceError && REFUSAL_CODES.includes(error.code)
      ? error.code : 'SOURCE_INVALID_INPUT';
  }
  const verified = verifiedStatement !== null;
  return freeze({
    schemaVersion: SOURCE_RESULT,
    status: verified ? 'SOURCE_SIGNATURE_VERIFIED' : 'SOURCE_VERIFICATION_REFUSED',
    evaluatedAt, selection: selected, inputs, verifiedStatement,
    claims: {
      sourceSignature: verified ? 'MATCHES_SELECTED_POLICY' : 'NOT_ESTABLISHED',
      policyFreshness: 'NOT_ESTABLISHED', institutionIdentity: 'NOT_VERIFIED',
      incidentTruth: 'NOT_VERIFIED', signingTime: 'NOT_WITNESSED',
      coreAuthority: 'NOT_EVALUATED', caseInclusion: 'NOT_EVALUATED',
    },
    refusalCode,
  });
}
