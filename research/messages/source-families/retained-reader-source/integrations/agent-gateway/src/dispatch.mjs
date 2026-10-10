// Trusted launch selects the application, case and actor. RPC data never does.
// Only this narrow boundary is implemented here; Core and application guards
// remain authoritative, including reconciliation and current-control checks.
import { types } from 'node:util';

const SCHEMA = 'continuity-agent-gateway/1';
// MCP includes both structuredContent and JSON text: reserve room for both
// copies and their escaping within the server's 49 KiB wire response bound.
const RESPONSE_BYTES = 16 * 1024;
const SLUG = /^[a-z][a-z0-9-]{0,31}$/;
const FILE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const NOTE_CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u;
const UNPAIRED_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u;
const ABSENT = Symbol('absent own data');
const TOOL_NAMES = ['gateway.status', 'gateway.collect', 'gateway.note', 'gateway.disposition'];
const APP_METHODS = ['inspectCase', 'collectCase', 'recordReviewProgress', 'reviewCase'];
const APP_REFUSALS = new Set([
  'OLD_WORKER_NO_LONGER_CURRENT', 'SUCCESSOR_OPEN_DUTY_REQUIRED',
  'REVIEW_ACTOR_UNKNOWN', 'REVIEW_AGENT_INACTIVE', 'REVIEW_SESSION_FENCED',
  'REVIEW_SESSION_EXPIRED', 'REVIEW_ROLE_NOT_CURRENT', 'REVIEW_ASSIGNMENT_REQUIRED',
  'REVIEW_AUTHORITY_REQUIRED', 'REVIEW_INDEPENDENT_GRANT_REQUIRED',
  'REVIEW_PACKET_UNAVAILABLE', 'REVIEW_NOTE_ID_CONFLICT', 'REVIEW_FILE_NOT_SELECTED',
  'REVIEW_PROGRESS_INVALID', 'REVIEW_HEAD_CHANGED', 'REVIEW_RECORD_MEMBERSHIP',
  'REVIEW_PACKET_BINDING', 'REVIEW_RECORD_CHAIN', 'REVIEW_HISTORY_ORDER',
  'REVIEW_HISTORY_BINDING', 'REVIEW_ACTOR_BINDING', 'REVIEW_AUTHORIZATION_BINDING',
  'REVIEW_SIGNATURE_INVALID', 'ACKNOWLEDGMENT_UNAVAILABLE_REVIEW_UNRESOLVED',
  'ACKNOWLEDGMENT_NOT_VERIFIED', 'ADMISSION_NOT_DURABLE_AT_EXECUTOR_ENTRY',
  'INTENT_ALREADY_DECLARED_RECONCILE_FIRST', 'CASE_EVENT_LIMIT',
  'APPEND_READBACK_MISMATCH', 'ADMINISTRATIVE_READBACK_MISMATCH',
  'ADMISSION_NOT_ADMITTED', 'ADMISSION_UNAVAILABLE', 'ADMISSION_INVALID_PREPARATION',
]);

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function check(condition, code = 'APPLICATION_RESULT_UNAVAILABLE') { if (!condition) fail(code); }
function plain(value, code) {
  check(value !== null && typeof value === 'object' && !types.isProxy(value), code);
  const prototype = Object.getPrototypeOf(value);
  check(prototype === Object.prototype || prototype === null, code);
}
function own(value, key, code = 'APPLICATION_RESULT_UNAVAILABLE') {
  plain(value, code);
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) return ABSENT;
  check(Object.hasOwn(descriptor, 'value') && descriptor.enumerable, code);
  return descriptor.value;
}
function required(value, key, code) {
  const result = own(value, key, code);
  check(result !== ABSENT, code);
  return result;
}
function closed(value, keys, code) {
  plain(value, code);
  const actual = Reflect.ownKeys(value);
  check(actual.length === keys.length && actual.every(key => typeof key === 'string' && keys.includes(key)), code);
  return Object.fromEntries(keys.map(key => [key, required(value, key, code)]));
}
function array(value, maximum) {
  check(value !== null && typeof value === 'object' && !types.isProxy(value));
  check(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype);
  const length = Object.getOwnPropertyDescriptor(value, 'length').value;
  check(length <= maximum && Reflect.ownKeys(value).length === length + 1);
  const result = [];
  for (let i = 0; i < length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    check(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable);
    result.push(descriptor.value);
  }
  return result;
}
function text(value, pattern, maximum = 160) {
  check(typeof value === 'string' && value.length <= maximum && exactMatch(pattern, value));
  return value;
}
function exactMatch(pattern, value) {
  const match = pattern.exec(value);
  return match !== null && match[0] === value;
}
function choice(value, values) { check(values.includes(value)); return value; }
function integer(value, maximum = Number.MAX_SAFE_INTEGER) {
  check(Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0 && value <= maximum);
  return value;
}
function boolean(value) { check(typeof value === 'boolean'); return value; }
function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const EMPTY_SCHEMA = { type: 'object', properties: {}, required: [], additionalProperties: false };
const NOTE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['fileName', 'noteId', 'note'],
  properties: {
    fileName: { type: 'string', minLength: 1, maxLength: 80, pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$(?![\\s\\S])' },
    noteId: { type: 'string', minLength: 1, maxLength: 32, pattern: '^[a-z][a-z0-9-]{0,31}$(?![\\s\\S])' },
    note: { type: 'string', maxLength: 1000, description: 'Untrusted application note, at most 1000 UTF-8 bytes. Valid Unicode; tab and newline are allowed, other control characters are refused.' },
  },
};
const DESCRIPTORS = deepFreeze([
  { name: 'gateway.status', description: 'Read compact status of the fixed synthetic case at its retained canonical time. This grants no current authority.', inputSchema: EMPTY_SCHEMA, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'gateway.collect', description: 'Ask fixed worker A to collect the configured synthetic packet. Repeated collection uses the application\'s reconciliation-only path; do not automatically retry errors.', inputSchema: EMPTY_SCHEMA, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
  { name: 'gateway.note', description: 'Record an application review note as the fixed worker, subject to current session, Role, assignment and independent permission checks. Notes never establish incident resolution.', inputSchema: NOTE_SCHEMA, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
  { name: 'gateway.disposition', description: 'Ask fixed worker B to record the existing unresolved review disposition. The application requires B\'s current open duty and authority; this does not resolve the incident.', inputSchema: EMPTY_SCHEMA, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
]);

function noteArguments(args) {
  const value = closed(args, ['fileName', 'noteId', 'note'], 'INVALID_ARGUMENTS');
  check(typeof value.fileName === 'string' && exactMatch(FILE_NAME, value.fileName), 'INVALID_ARGUMENTS');
  check(typeof value.noteId === 'string' && exactMatch(SLUG, value.noteId), 'INVALID_ARGUMENTS');
  check(typeof value.note === 'string' && value.note.length <= 1000 &&
    !NOTE_CONTROLS.test(value.note) && !UNPAIRED_SURROGATE.test(value.note) &&
    Buffer.byteLength(value.note, 'utf8') <= 1000, 'INVALID_ARGUMENTS');
  return Object.freeze(value);
}

function projectHead(value) {
  return {
    hash: text(required(value, 'hash'), HASH),
    position: integer(required(value, 'position')),
    canonicalTime: integer(required(value, 'canonicalTime')),
  };
}
function projectFile(value) {
  return { name: text(required(value, 'name'), FILE_NAME, 80), bytes: integer(required(value, 'bytes'), 65536), sha256: text(required(value, 'sha256'), SHA256) };
}
function projectReview(value, caseId) {
  check(required(value, 'scope') === 'APPLICATION_RECORDED_WORK');
  check(required(value, 'incidentResolution') === 'NOT_PROVEN');
  const files = array(required(value, 'files'), 8).map(file => {
    const latestNoteId = required(file, 'latestNoteId');
    const latestActorId = required(file, 'latestActorId');
    return { ...projectFile(file), reviewed: boolean(required(file, 'reviewed')),
      latestNoteId: latestNoteId === null ? null : text(latestNoteId, SLUG, 32),
      latestActorId: latestActorId === null ? null : choice(latestActorId, [`a:${caseId}`, `b:${caseId}`]),
    };
  });
  const remainingFiles = array(required(value, 'remainingFiles'), 8).map(name => text(name, FILE_NAME, 80));
  const recordCount = integer(required(value, 'recordCount'), 32);
  const reviewedCount = integer(required(value, 'reviewedCount'), 8);
  const totalFiles = integer(required(value, 'totalFiles'), 8);
  check(totalFiles === files.length && reviewedCount === files.filter(file => file.reviewed).length && recordCount >= reviewedCount);
  check(new Set(files.map(file => file.name)).size === files.length);
  check(JSON.stringify(remainingFiles) === JSON.stringify(files.filter(file => !file.reviewed).map(file => file.name)));
  check(files.every(file => file.reviewed ? file.latestNoteId !== null && file.latestActorId !== null : file.latestNoteId === null && file.latestActorId === null));
  return { scope: 'APPLICATION_RECORDED_WORK', recordCount, reviewedCount, totalFiles, remainingFiles,
    selectedFiles: files, verification: choice(required(value, 'verification'), ['NO_RECORDS', 'HISTORICAL_SIGNATURE_AND_SCOPE_VERIFIED']),
    incidentResolution: 'NOT_PROVEN', noteTextIncluded: false };
}
function projectSummary(value, caseId) {
  check(required(value, 'schemaVersion') === 'continuity-local-intake-summary/0.2' && required(value, 'caseId') === caseId);
  const scope = required(value, 'scope');
  for (const [key, expected] of Object.entries({ data: 'SYNTHETIC', signing: 'PUBLIC_DEVELOPMENT_KEYS', host: 'TRUSTED_COOPERATIVE_OPERATOR', engine: 'COMMON_CORE_0.2', finality: 'LOCAL_ONLY' })) check(required(scope, key) === expected);
  const sourcePacket = required(value, 'packet');
  const packet = { status: choice(required(sourcePacket, 'status'), ['OUTCOME_UNKNOWN', 'NOT_STARTED', 'PACKET_VERIFIED', 'SIMULATED_ACKNOWLEDGMENT_RECORDED']) };
  const manifestDigest = own(sourcePacket, 'manifestSha256');
  if (manifestDigest !== ABSENT) packet.manifestSha256 = text(manifestDigest, SHA256);
  const files = own(sourcePacket, 'files');
  if (files !== ABSENT) packet.files = array(files, 8).map(projectFile);
  const sourceAdmission = required(value, 'admission');
  let admission = null;
  if (sourceAdmission !== null) {
    check(required(sourceAdmission, 'intentId') === `intent:${caseId}`);
    admission = { intentId: `intent:${caseId}`, consumed: boolean(required(sourceAdmission, 'consumed')) };
  }
  const sourceDuty = required(value, 'duty');
  let duty = null;
  if (sourceDuty !== null) {
    check(required(sourceDuty, 'bearer') === `role:${caseId}`);
    duty = { bearer: `role:${caseId}`, performer: choice(required(sourceDuty, 'performer'), [`a:${caseId}`, `b:${caseId}`]), status: choice(required(sourceDuty, 'status'), ['OPEN', 'OUTCOME_UNKNOWN']), incidentResolution: 'NOT_PROVEN' };
  }
  return { stage: choice(required(value, 'stage'), ['AWAITING_INTAKE', 'RECONCILIATION_REQUIRED', 'REVIEW_DUTY']),
    head: projectHead(required(value, 'head')), predecessorEpoch: integer(required(value, 'predecessorEpoch')),
    admission, packet, duty, review: projectReview(required(value, 'review'), caseId),
    execution: choice(required(scope, 'execution'), ['NOT_STARTED', 'UNCERTAIN', 'RETAINED_PACKET_VERIFIED', 'SIMULATED']),
    externalOutcome: choice(required(scope, 'externalOutcome'), ['NOT_PROVEN', 'SIMULATED']) };
}
function projectReconciliation(value) {
  const result = { status: choice(required(value, 'status'), ['NOT_INVOKED', 'OUTCOME_UNKNOWN', 'TERMINAL', 'IDEMPOTENCY_FINGERPRINT_CONFLICT', 'SUBMITTED', 'FAILED', 'RETRY']) };
  const recorded = own(value, 'recorded');
  if (recorded !== ABSENT) result.recorded = boolean(recorded);
  return result;
}
function projectResult(name, value, caseId, args) {
  check(required(value, 'caseId') === caseId);
  if (name === 'gateway.note') {
    const status = choice(required(value, 'status'), ['REVIEW_RECORDED', 'REVIEW_ALREADY_RECORDED']);
    check(required(value, 'noteId') === args.noteId);
    return { kind: 'REVIEW_NOTE', status, noteId: args.noteId, review: projectReview(required(value, 'review'), caseId) };
  }
  const status = own(value, 'status');
  if (name === 'gateway.collect' && status !== ABSENT) {
    choice(status, ['RECONCILIATION_ONLY', 'RECONCILIATION_REQUIRED']);
    return { kind: 'COLLECTION_RECONCILIATION', status, reconciliation: projectReconciliation(required(value, status === 'RECONCILIATION_ONLY' ? 'result' : 'invocation')), summary: projectSummary(required(value, 'case'), caseId) };
  }
  check(status === ABSENT);
  return { kind: 'CASE_SUMMARY', summary: projectSummary(value, caseId) };
}

function sanitizedApplicationCode(error) {
  // Never stringify arbitrary errors, invoke message/code accessors, traverse
  // causes or return filesystem error text. A known code remains just a code.
  if (error === null || (typeof error !== 'object' && typeof error !== 'function') || types.isProxy(error)) return 'APPLICATION_UNAVAILABLE';
  for (const key of ['code', 'message']) {
    const descriptor = Object.getOwnPropertyDescriptor(error, key);
    if (descriptor && Object.hasOwn(descriptor, 'value') && typeof descriptor.value === 'string' && APP_REFUSALS.has(descriptor.value)) return descriptor.value;
  }
  return 'APPLICATION_UNAVAILABLE';
}

/** No application imports or calls occur during trusted dispatcher creation. */
export function createDispatcher(options) {
  check(arguments.length === 1, 'INVALID_GATEWAY_CONFIGURATION');
  const { caseId, actor, application } = closed(options, ['caseId', 'actor', 'application'], 'INVALID_GATEWAY_CONFIGURATION');
  check(typeof caseId === 'string' && exactMatch(SLUG, caseId) && (actor === 'a' || actor === 'b'), 'INVALID_GATEWAY_CONFIGURATION');
  plain(application, 'INVALID_GATEWAY_APPLICATION');
  // Select four own function references once. Additional trusted module exports
  // are never exposed to RPC and cannot replace these references after launch.
  const app = Object.fromEntries(APP_METHODS.map(name => {
    const method = required(application, name, 'INVALID_GATEWAY_APPLICATION');
    check(typeof method === 'function' && !types.isProxy(method), 'INVALID_GATEWAY_APPLICATION');
    return [name, method];
  }));
  const allowed = actor === 'a' ? ['gateway.status', 'gateway.collect', 'gateway.note'] : ['gateway.status', 'gateway.note', 'gateway.disposition'];
  const tools = Object.freeze(DESCRIPTORS.filter(tool => allowed.includes(tool.name)));
  let tail = Promise.resolve();

  function envelope(ok, code, appDispatched, result, outcome) {
    const reply = { schemaVersion: SCHEMA, caseId, actor, ok, code,
      ...(result === undefined ? {} : { result }),
      scope: { appDispatched, noDispatch: !appDispatched, outcome,
        envelopeSuccessMeans: 'REQUEST_RETURNED_A_COMPACT_RESULT_NOT_EFFECT_OR_INCIDENT_SUCCESS',
        data: 'SYNTHETIC', signing: 'PUBLIC_DEVELOPMENT_KEYS', host: 'TRUSTED_COOPERATIVE_OPERATOR',
        grantsCurrentAuthority: false, incidentResolution: 'NOT_PROVEN',
        currentAuthorityDecidedBy: 'UNCHANGED_APPLICATION_AND_CORE_GUARDS',
        time: 'RETAINED_CANONICAL_TIME_WHEN_INCLUDED', wallClockFreshness: 'NOT_CLAIMED',
        automaticRetry: false, errorDoesNotProveNoEffect: true,
        isolation: 'COOPERATIVE_PROCESS_AND_API_SEPARATION_ONLY',
      },
    };
    if (Buffer.byteLength(JSON.stringify(reply) + '\n', 'utf8') > RESPONSE_BYTES) {
      // The application has already returned: oversized projection is still
      // uncertainty, never a claim that the dispatch did not happen.
      return envelope(false, 'APPLICATION_RESULT_UNAVAILABLE', appDispatched, undefined, appDispatched ? 'UNKNOWN' : 'NOT_DISPATCHED');
    }
    return reply;
  }

  function call(name, args) {
    // Capture before awaiting the preceding call; mutation while queued cannot
    // replace an actor/case/tool argument or alter a note accepted at entry.
    let captured, refusal;
    if (arguments.length !== 2) refusal = 'INVALID_ARGUMENTS';
    else if (typeof name !== 'string' || !TOOL_NAMES.includes(name)) refusal = 'UNKNOWN_TOOL';
    else if (!allowed.includes(name)) refusal = 'TOOL_NOT_AVAILABLE_FOR_ACTOR';
    else {
      try { captured = name === 'gateway.note' ? noteArguments(args) : Object.freeze(closed(args, [], 'INVALID_ARGUMENTS')); }
      catch { refusal = 'INVALID_ARGUMENTS'; }
    }
    const run = async () => {
      if (refusal) return envelope(false, refusal, false, undefined, 'NOT_DISPATCHED');
      let value;
      try {
        if (name === 'gateway.status') value = await app.inspectCase(caseId);
        else if (name === 'gateway.collect') value = await app.collectCase(caseId);
        else if (name === 'gateway.note') value = await app.recordReviewProgress(caseId, actor, captured.fileName, captured.noteId, captured.note);
        else value = await app.reviewCase(caseId);
      } catch (error) { return envelope(false, sanitizedApplicationCode(error), true, undefined, 'UNKNOWN'); }
      try {
        const result = projectResult(name, value, caseId, captured);
        const uncertain = result.kind === 'COLLECTION_RECONCILIATION' && (result.status === 'RECONCILIATION_REQUIRED' || result.reconciliation.status === 'OUTCOME_UNKNOWN');
        return envelope(true, 'OK', true, result, uncertain ? 'UNKNOWN' : 'REPORTED');
      } catch { return envelope(false, 'APPLICATION_RESULT_UNAVAILABLE', true, undefined, 'UNKNOWN'); }
    };
    const response = tail.then(run);
    // One failed call cannot poison the queue; no call is repeated here.
    tail = response.then(() => undefined, () => undefined);
    return response;
  }
  return Object.freeze({ tools, call });
}
