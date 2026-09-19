// Pure operator-side proposal decoding. The trusted snapshot reader accesses
// captured memory only; this module imports no application, gateway or I/O.
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { parseStrictJson } from '../../retained-evidence-mcp/src/strict-json.mjs';
import { SUPPLEMENT_EVIDENCE_SCOPE } from '../../core-0.2-reference/src/review-supplement-format.mjs';

const INVALID = 'PROPOSAL_INVALID';
const SOURCE = 'PROPOSAL_SOURCE_MISMATCH';
const SLUG = /^[a-z][a-z0-9-]{0,31}$(?![\s\S])/;
const FILE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$(?![\s\S])/;
const DIGEST = /^[0-9a-f]{64}$(?![\s\S])/;
const HASH = /^0x[0-9a-f]{64}$(?![\s\S])/;
const CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u;
const SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const bufferLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length').get;
const backingBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function fail(code = INVALID) { const error = new Error(code); error.code = code; throw error; }
function check(condition, code = INVALID) { if (!condition) fail(code); }
function plain(value, code = INVALID) {
  check(value !== null && typeof value === 'object' && !types.isProxy(value), code);
  const prototype = Object.getPrototypeOf(value);
  check(prototype === Object.prototype || prototype === null, code);
}
function closed(value, names, code = INVALID) {
  plain(value, code);
  const keys = Reflect.ownKeys(value);
  check(keys.length === names.length && keys.every(key => typeof key === 'string' && names.includes(key)), code);
  const result = Object.create(null);
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    check(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable, code);
    result[name] = descriptor.value;
  }
  return result;
}
function integer(value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER, code = INVALID) {
  check(Number.isSafeInteger(value) && !Object.is(value, -0) && value >= minimum && value <= maximum, code);
  return value;
}
function matches(value, pattern, code = INVALID) {
  check(typeof value === 'string' && pattern.test(value), code);
  return value;
}
function text(value, maximum) {
  check(typeof value === 'string' && value.length > 0 && value.length <= maximum &&
    !SURROGATE.test(value) && !CONTROLS.test(value) && Buffer.byteLength(value, 'utf8') <= maximum);
  return value;
}
function list(value, minimum, maximum, code = INVALID) {
  check(value !== null && typeof value === 'object' && !types.isProxy(value), code);
  check(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype, code);
  const length = Object.getOwnPropertyDescriptor(value, 'length').value;
  integer(length, minimum, maximum, code);
  check(Reflect.ownKeys(value).length === length + 1, code);
  const result = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    check(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable, code);
    result.push(descriptor.value);
  }
  return result;
}
function freeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

// Inspect descriptors before reading any caller-owned member. This bounded
// capture also refuses cycles, proxies, accessors and non-JSON source values.
function captureData(value) {
  let nodes = 0, stringBytes = 0;
  const ancestors = new Set();
  function capture(item, depth) {
    check(++nodes <= 100000 && depth <= 64, SOURCE);
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'string') {
      check(item.length <= 2 * 1024 * 1024 && !SURROGATE.test(item), SOURCE);
      stringBytes += Buffer.byteLength(item, 'utf8');
      check(stringBytes <= 2 * 1024 * 1024, SOURCE);
      return item;
    }
    if (typeof item === 'number') {
      check(Number.isFinite(item) && !Object.is(item, -0), SOURCE);
      return item;
    }
    check(item !== null && typeof item === 'object' && !types.isProxy(item) && !ancestors.has(item), SOURCE);
    ancestors.add(item);
    let result;
    if (Array.isArray(item)) result = list(item, 0, 4096, SOURCE).map(child => capture(child, depth + 1));
    else {
      plain(item, SOURCE);
      const keys = Reflect.ownKeys(item);
      check(keys.length <= 256 && keys.every(key => typeof key === 'string'), SOURCE);
      const record = closed(item, keys, SOURCE);
      result = Object.create(null);
      for (const key of keys) result[key] = capture(record[key], depth + 1);
    }
    ancestors.delete(item);
    return result;
  }
  return capture(value, 0);
}
function head(value) {
  const item = closed(value, ['hash', 'position', 'canonicalTime'], SOURCE);
  return { hash: matches(item.hash, HASH, SOURCE), position: integer(item.position, 0, Number.MAX_SAFE_INTEGER, SOURCE),
    canonicalTime: integer(item.canonicalTime, 0, Number.MAX_SAFE_INTEGER, SOURCE) };
}
function sameHead(actual, expected) {
  const captured = head(actual);
  check(captured.hash === expected.hash && captured.position === expected.position && captured.canonicalTime === expected.canonicalTime, SOURCE);
}
function sourceConfig(options) {
  try {
    const config = closed(options, ['caseId', 'actor', 'snapshot'], SOURCE);
    matches(config.caseId, SLUG, SOURCE);
    check(config.actor === 'a' || config.actor === 'b', SOURCE);
    const snapshot = closed(config.snapshot, ['catalog', 'statusSource', 'read'], SOURCE);
    check(typeof snapshot.read === 'function' && !types.isProxy(snapshot.read), SOURCE);
    const catalog = closed(captureData(snapshot.catalog), ['schemaVersion', 'caseId', 'source', 'payloadCount',
      'totalSnapshotBytes', 'members', 'receiptAxes', 'lineConvention', 'scope'], SOURCE);
    // statusSource is not used for authority here; still reject executable data
    // anywhere in the configured snapshot before invoking its trusted reader.
    captureData(snapshot.statusSource);
    check(catalog.schemaVersion === 'continuity-agent-evidence-catalog/1' && catalog.caseId === config.caseId &&
      catalog.lineConvention === 'ONE_BASED_LF; FINAL_LF_BELONGS_TO_PRECEDING_LINE; EMPTY_TEXT_LINE_1', SOURCE);
    integer(catalog.payloadCount, 1, 32, SOURCE);
    integer(catalog.totalSnapshotBytes, 0, 2 * 1024 * 1024, SOURCE);
    const source = closed(catalog.source, ['manifestSha256', 'manifestBytes', 'head'], SOURCE);
    matches(source.manifestSha256, DIGEST, SOURCE);
    integer(source.manifestBytes, 1, 64 * 1024, SOURCE);
    const capturedHead = head(source.head), members = new Map();
    let supplementCount = 0, packetCount = 0;
    for (const value of list(catalog.members, 3, 11, SOURCE)) {
      const member = closed(value, ['evidenceId', 'originalName', 'textScope', 'bytes', 'sha256', 'chunkCount'], SOURCE);
      check(typeof member.evidenceId === 'string' && !members.has(member.evidenceId), SOURCE);
      if (member.evidenceId.startsWith('packet.')) {
        check(++packetCount <= 8, SOURCE);
        const fileName = matches(member.evidenceId.slice(7), FILE, SOURCE);
        check(member.originalName === `packet-file-${fileName}` && member.textScope === 'ORIGINAL_SYNTHETIC_PACKET_LOG_UNTRUSTED_DATA', SOURCE);
      } else if (member.evidenceId.startsWith('supplement.')) {
        matches(member.evidenceId.slice(11), SLUG, SOURCE);
        check(++supplementCount === 1 && member.originalName === 'review-supplement.log' && member.textScope === SUPPLEMENT_EVIDENCE_SCOPE, SOURCE);
        integer(member.bytes, 1, 16384, SOURCE);
      } else if (member.evidenceId === 'review-progress') {
        check(member.originalName === 'review-progress.json' && member.textScope === 'ORIGINAL_AUTHORED_APPLICATION_NOTES_RETAINED_ASSERTIONS', SOURCE);
      } else {
        check(member.evidenceId === 'case-summary' && member.originalName === 'summary.json' &&
          member.textScope === 'ORIGINAL_CASE_SUMMARY_WITH_RETAINED_SCOPE_AND_GRANT_ASSERTIONS', SOURCE);
      }
      integer(member.bytes, 0, 1024 * 1024, SOURCE);
      integer(member.chunkCount, 1, Math.max(1, member.bytes), SOURCE);
      matches(member.sha256, DIGEST, SOURCE);
      members.set(member.evidenceId, member);
    }
    check(packetCount >= 1 && members.has('case-summary') && members.has('review-progress'), SOURCE);
    return { caseId: config.caseId, actor: config.actor, manifestSha256: source.manifestSha256,
      head: capturedHead, members, read: snapshot.read };
  } catch { fail(SOURCE); }
}
function originalLineCount(config, member) {
  try {
    const index = member.chunkCount - 1;
    const chunk = closed(captureData(Reflect.apply(config.read, undefined, [member.evidenceId, index])),
      ['schemaVersion', 'caseId', 'evidenceId', 'originalName', 'content', 'byteOffset', 'byteCount', 'chunkSha256',
        'firstLine', 'lastLine', 'originalSha256', 'chunkIndex', 'chunkCount', 'source', 'scope'], SOURCE);
    check(chunk.schemaVersion === 'continuity-agent-evidence-chunk/1' && chunk.caseId === config.caseId &&
      chunk.evidenceId === member.evidenceId && chunk.originalName === member.originalName &&
      chunk.originalSha256 === member.sha256 && chunk.chunkIndex === index && chunk.chunkCount === member.chunkCount, SOURCE);
    const source = closed(chunk.source, ['manifestSha256', 'head'], SOURCE);
    check(source.manifestSha256 === config.manifestSha256, SOURCE);
    sameHead(source.head, config.head);
    integer(chunk.byteOffset, 0, member.bytes, SOURCE);
    integer(chunk.byteCount, member.bytes === 0 ? 0 : 1, 2048, SOURCE);
    check(chunk.byteOffset + chunk.byteCount === member.bytes && typeof chunk.content === 'string', SOURCE);
    const bytes = Buffer.from(chunk.content, 'utf8');
    check(bytes.length === chunk.byteCount && sha(bytes) === matches(chunk.chunkSha256, DIGEST, SOURCE), SOURCE);
    integer(chunk.firstLine, 1, Math.max(1, member.bytes + 1), SOURCE);
    integer(chunk.lastLine, chunk.firstLine, Math.max(1, member.bytes + 1), SOURCE);
    let newlines = 0;
    for (const byte of bytes) if (byte === 10) newlines++;
    check(chunk.lastLine === chunk.firstLine + newlines - (bytes.length > 0 && bytes[bytes.length - 1] === 10 ? 1 : 0), SOURCE);
    if (index === 0) check(chunk.byteOffset === 0 && chunk.firstLine === 1, SOURCE);
    return chunk.lastLine;
  } catch { fail(SOURCE); }
}
function proposalBytes(value) {
  check(value !== null && typeof value === 'object' && !types.isProxy(value) && Buffer.isBuffer(value));
  check(Object.getPrototypeOf(value) === Buffer.prototype);
  const length = Reflect.apply(bufferLength, value, []);
  integer(length, 1, 16384);
  check(!types.isSharedArrayBuffer(Reflect.apply(backingBuffer, value, [])));
  const keys = Reflect.ownKeys(value);
  check(keys.length === length && keys.every((key, index) => key === String(index)));
  // Integer-indexed Buffer elements cannot be accessors. Extra own properties
  // (including custom length/iteration/conversion hooks) have been refused.
  return Buffer.from(value);
}

/** No approval or authority is created. Approval binds these exact bytes. */
export function decodeProposal(bytes, options) {
  try {
    check(arguments.length === 2);
    const capturedBytes = proposalBytes(bytes);
    const value = closed(parseStrictJson(capturedBytes), ['schemaVersion', 'caseId', 'actor', 'snapshotManifestSha256',
      'action', 'rationale', 'evidence', 'unresolvedQuestions']);
    check(value.schemaVersion === 'continuity-work-proposal/1');
    matches(value.caseId, SLUG); check(value.actor === 'a' || value.actor === 'b');
    matches(value.snapshotManifestSha256, DIGEST);
    const actionInput = closed(value.action, ['kind', 'fileName', 'noteId', 'note']);
    check(actionInput.kind === 'record-review-note');
    const action = { kind: actionInput.kind, fileName: matches(actionInput.fileName, FILE),
      noteId: matches(actionInput.noteId, SLUG), note: text(actionInput.note, 1000) };
    const rationale = text(value.rationale, 800);
    const unresolvedQuestions = list(value.unresolvedQuestions, 1, 4).map(question => text(question, 300));
    const seen = new Set();
    const evidence = list(value.evidence, 1, 4).map(item => {
      const citation = closed(item, ['evidenceId', 'originalSha256', 'firstLine', 'lastLine']);
      check(typeof citation.evidenceId === 'string' && citation.evidenceId.length <= 87 &&
        (citation.evidenceId === 'case-summary' || citation.evidenceId === 'review-progress' ||
          (citation.evidenceId.startsWith('supplement.') && SLUG.test(citation.evidenceId.slice(11))) ||
          (citation.evidenceId.startsWith('packet.') && FILE.test(citation.evidenceId.slice(7)))) && !seen.has(citation.evidenceId));
      seen.add(citation.evidenceId);
      return { evidenceId: citation.evidenceId, originalSha256: matches(citation.originalSha256, DIGEST),
        firstLine: integer(citation.firstLine, 1), lastLine: integer(citation.lastLine, citation.firstLine) };
    });
    const target = `packet.${action.fileName}`;
    check(seen.has(target));
    const config = sourceConfig(options);
    check(value.caseId === config.caseId && value.actor === config.actor &&
      value.snapshotManifestSha256 === config.manifestSha256 && config.members.has(target), SOURCE);
    // Validate every proposal field before the first trusted in-memory read.
    for (const citation of evidence) {
      const member = config.members.get(citation.evidenceId);
      check(member !== undefined && member.sha256 === citation.originalSha256, SOURCE);
    }
    for (const citation of evidence) check(citation.lastLine <= originalLineCount(config, config.members.get(citation.evidenceId)), SOURCE);
    const proposalSha256 = sha(capturedBytes);
    const proposal = { schemaVersion: value.schemaVersion, caseId: value.caseId, actor: value.actor,
      snapshotManifestSha256: value.snapshotManifestSha256, action, rationale, evidence, unresolvedQuestions };
    const review = { status: 'UNAPPROVED', proposalSha256, caseId: config.caseId, actor: config.actor,
      snapshotManifestSha256: config.manifestSha256, head: config.head, action, rationale, evidence, unresolvedQuestions,
      scope: { proposalGrantsAuthority: false, source: 'PINNED_RETAINED_SNAPSHOT',
        operation: 'ONE_EXISTING_REVIEW_NOTE', incidentResolution: 'NOT_PROVEN' } };
    return freeze({ proposalSha256, proposal, review });
  } catch (error) {
    let code = INVALID;
    if (error !== null && typeof error === 'object' && !types.isProxy(error)) {
      const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
      if (descriptor && Object.hasOwn(descriptor, 'value') && descriptor.value === SOURCE) code = SOURCE;
    }
    fail(code);
  }
}
