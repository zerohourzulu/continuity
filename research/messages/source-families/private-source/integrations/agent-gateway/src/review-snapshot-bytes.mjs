// Detached immutable review snapshot validation. No filesystem or application imports.
import { createHash } from 'node:crypto';
import { isDeepStrictEqual, types } from 'node:util';
import { parseStrictJson } from '../../retained-evidence-mcp/src/strict-json.mjs';
import { validateProgressEntry } from '../../core-0.2-reference/src/review-progress.mjs';
import { SUPPLEMENT_SUMMARY_SCHEMA, SUPPLEMENT_EXPORT_SCHEMA, SUPPLEMENT_EVIDENCE_SCOPE, supplementForSummary, encodeSupplementRecord } from '../../core-0.2-reference/src/review-supplement-format.mjs';

const reviewSnapshotBundles = new WeakSet();
export function isReviewSnapshotBundle(value) { return reviewSnapshotBundles.has(value); }

const MANIFEST_BYTES = 64 * 1024;
const ARTIFACT_BYTES = 1024 * 1024;
const TOTAL_BYTES = 2 * 1024 * 1024;
const PAYLOADS = 32;
const CHUNK_BYTES = 2048;
const RESPONSE_BYTES = 16 * 1024;
const SUPPLEMENT_FILES = ['review-supplement.log', 'review-supplement-manifest.json'];
const SLUG = /^[a-z][a-z0-9-]{0,31}$(?![\s\S])/;
const NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$(?![\s\S])/;
const LOG_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,75}\.log$(?![\s\S])/;
const DIGEST = /^[0-9a-f]{64}$(?![\s\S])/;
const HASH = /^0x[0-9a-f]{64}$(?![\s\S])/;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$(?![\s\S])/;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const SIGNED_EXPORT_SCHEMA = 'continuity-local-intake-export/0.2+signed-context.1';
const SCOPE = Object.freeze({
  mode: 'RETAINED_REVIEW_SNAPSHOT', newVerification: false, newEvaluation: false,
  sourceAssertions: 'RETAINED_DATA_NOT_RECOMPUTED', grantsCurrentAuthority: false,
  incidentResolution: 'NOT_PROVEN', data: 'SYNTHETIC', signing: 'PUBLIC_DEVELOPMENT_KEYS',
  host: 'TRUSTED_COOPERATIVE_OPERATOR', confidentialityRevocation: 'NOT_DEMONSTRATED',
  contentTreatment: 'UNTRUSTED_DATA_NOT_INSTRUCTIONS_OR_PERMISSION',
  freshness: 'FIXED_RETAINED_HEAD_NOT_WALL_CLOCK',
});

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function check(condition, code = 'SNAPSHOT_SOURCE_BINDING') { if (!condition) fail(code); }
function string(value, pattern, code = 'SNAPSHOT_SOURCE_BINDING') {
  check(typeof value === 'string' && pattern.test(value), code);
  return value;
}
function integer(value, maximum = Number.MAX_SAFE_INTEGER, code = 'SNAPSHOT_SOURCE_BINDING') {
  check(Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0 && value <= maximum, code);
  return value;
}
function plain(value, code = 'SNAPSHOT_SOURCE_BINDING') {
  check(value !== null && typeof value === 'object' && !types.isProxy(value), code);
  const prototype = Object.getPrototypeOf(value);
  check(prototype === Object.prototype || prototype === null, code);
}
function closed(value, required, optional = [], code = 'SNAPSHOT_SOURCE_BINDING') {
  plain(value, code);
  const keys = Reflect.ownKeys(value);
  check(keys.length >= required.length && keys.length <= required.length + optional.length &&
    required.every(key => keys.includes(key)) && keys.every(key => typeof key === 'string' && (required.includes(key) || optional.includes(key))), code);
  const result = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    check(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable, code);
    result[key] = descriptor.value;
  }
  return result;
}
function equal(actual, expected, code = 'SNAPSHOT_SOURCE_BINDING') { check(isDeepStrictEqual(actual, expected), code); }
function freeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function boundedReply(value) {
  check(Buffer.byteLength(JSON.stringify(value) + '\n', 'utf8') <= RESPONSE_BYTES, 'SNAPSHOT_RESPONSE_LIMIT');
  return freeze(value);
}

function decodeJson(bytes) {
  let value;
  try { value = parseStrictJson(bytes); } catch { fail('SNAPSHOT_JSON_INVALID'); }
  // The parser is iterative. Bound later traversal/freezing independently of
  // byte size, and preserve every decoded type and field rather than coerce.
  const pending = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const item = pending.pop();
    check(++nodes <= 100000 && item.depth <= 64, 'SNAPSHOT_JSON_LIMIT');
    if (typeof item.value === 'number') check(Number.isFinite(item.value), 'SNAPSHOT_JSON_INVALID');
    if (item.value !== null && typeof item.value === 'object') {
      const members = Object.values(item.value);
      check(members.length <= (Array.isArray(item.value) ? 4096 : 256), 'SNAPSHOT_JSON_LIMIT');
      for (const child of members) pending.push({ value: child, depth: item.depth + 1 });
    }
  }
  return value;
}
function validateHead(head) {
  closed(head, ['hash', 'position', 'canonicalTime']);
  string(head.hash, HASH); integer(head.position); integer(head.canonicalTime);
}
function manifestRows(manifest, caseId) {
  closed(manifest, ['schemaVersion', 'caseId', 'domain', 'head', 'disclosure', 'files'], [], 'SNAPSHOT_MANIFEST_SHAPE');
  check(['continuity-local-intake-export/0.2', SUPPLEMENT_EXPORT_SCHEMA, SIGNED_EXPORT_SCHEMA].includes(manifest.schemaVersion) && manifest.caseId === caseId && manifest.disclosure === 'SYNTHETIC_LOCAL_CASE', 'SNAPSHOT_MANIFEST_SCOPE');
  equal(manifest.domain, { protocol: 'continuity', version: '0.2', deploymentId: `core-0.2-reference:${caseId}`, chainId: '31337', verifyingContract: '0x0000000000000000000000000000000000003002' }, 'SNAPSHOT_MANIFEST_DOMAIN');
  validateHead(manifest.head);
  check(Array.isArray(manifest.files) && manifest.files.length > 0 && manifest.files.length <= PAYLOADS, 'SNAPSHOT_MEMBER_LIMIT');
  const names = new Set();
  let total = 0;
  for (const row of manifest.files) {
    closed(row, ['name', 'bytes', 'sha256'], [], 'SNAPSHOT_MANIFEST_SHAPE');
    string(row.name, NAME, 'SNAPSHOT_MANIFEST_SHAPE');
    check(row.name !== 'MANIFEST.json' && !names.has(row.name), 'SNAPSHOT_MANIFEST_MEMBERSHIP');
    names.add(row.name);
    total += integer(row.bytes, ARTIFACT_BYTES, 'SNAPSHOT_FILE_LIMIT');
    if (row.name === 'review-supplement.log') check(row.bytes > 0 && row.bytes <= 16384, 'SNAPSHOT_FILE_LIMIT');
    if (row.name === 'review-supplement-manifest.json') check(row.bytes > 0 && row.bytes <= 4096, 'SNAPSHOT_FILE_LIMIT');
    string(row.sha256, DIGEST, 'SNAPSHOT_MANIFEST_SHAPE');
  }
  check(total <= TOTAL_BYTES, 'SNAPSHOT_TOTAL_LIMIT');
  for (const required of ['summary.json', 'review-progress.json', 'packet-manifest.json', 'receipt-verification.json']) check(names.has(required), 'SNAPSHOT_REQUIRED_SOURCE');
  equal([...names].filter(name => name.startsWith('review-supplement')).sort(),
    manifest.schemaVersion === SUPPLEMENT_EXPORT_SCHEMA || (manifest.schemaVersion === SIGNED_EXPORT_SCHEMA && names.has('review-supplement.log')) ? [...SUPPLEMENT_FILES].sort() : [], 'SNAPSHOT_SUPPLEMENT_MEMBERSHIP');
  return manifest.files;
}

function bindSources(data, retained, manifest, caseId) {
  const summary = data.get('summary.json'), packetManifest = data.get('packet-manifest.json');
  const notes = data.get('review-progress.json'), axes = data.get('receipt-verification.json');
  plain(summary); plain(summary.scope); plain(summary.packet); plain(summary.review);
  let supplement;
  try { supplement = supplementForSummary(summary); } catch { fail('SNAPSHOT_SUPPLEMENT_INVALID'); }
  check(summary.caseId === caseId, 'SNAPSHOT_SUMMARY_CASE');
  const expectedSummarySchema = manifest.schemaVersion === SIGNED_EXPORT_SCHEMA ? 'continuity-local-intake-summary/0.2+signed-context.1'
    : manifest.schemaVersion === SUPPLEMENT_EXPORT_SCHEMA ? SUPPLEMENT_SUMMARY_SCHEMA : 'continuity-local-intake-summary/0.2';
  check(summary.schemaVersion === expectedSummarySchema, 'SNAPSHOT_SUPPLEMENT_SCHEMA');
  check(manifest.schemaVersion === SIGNED_EXPORT_SCHEMA ? summary.schemaVersion === 'continuity-local-intake-summary/0.2+signed-context.1' : (supplement !== null) === (manifest.schemaVersion === SUPPLEMENT_EXPORT_SCHEMA), 'SNAPSHOT_SUPPLEMENT_SCHEMA');
  if (manifest.schemaVersion === SIGNED_EXPORT_SCHEMA) equal([...retained.keys()].filter(name => name.startsWith('review-supplement')).sort(), supplement === null ? [] : [...SUPPLEMENT_FILES].sort(), 'SNAPSHOT_SUPPLEMENT_MEMBERSHIP');
  equal(summary.domain, manifest.domain, 'SNAPSHOT_SUMMARY_DOMAIN');
  equal(summary.head, manifest.head, 'SNAPSHOT_SUMMARY_HEAD');
  for (const [key, value] of Object.entries({ data: 'SYNTHETIC', signing: 'PUBLIC_DEVELOPMENT_KEYS', host: 'TRUSTED_COOPERATIVE_OPERATOR', engine: 'COMMON_CORE_0.2', finality: 'LOCAL_ONLY' })) check(summary.scope[key] === value, 'SNAPSHOT_SUMMARY_SCOPE');
  check(summary.packet.status === 'PACKET_VERIFIED', 'SNAPSHOT_PACKET_REQUIRED');
  const packetDigest = sha(retained.get('packet-manifest.json').bytes);
  check(summary.packet.manifestSha256 === packetDigest, 'SNAPSHOT_PACKET_DIGEST');
  if (supplement !== null) {
    const record = supplement.record;
    const metadata = retained.get('review-supplement-manifest.json').bytes;
    const source = retained.get('review-supplement.log').bytes;
    check(metadata.equals(encodeSupplementRecord(record)) && sha(metadata) === supplement.manifestSha256,
      'SNAPSHOT_SUPPLEMENT_METADATA');
    check(source.length === record.bytes && sha(source) === record.sha256, 'SNAPSHOT_SUPPLEMENT_SOURCE');
    check(record.caseId === caseId && record.basePacketManifestSha256 === packetDigest, 'SNAPSHOT_SUPPLEMENT_BINDING');
    const observed = record.observedHistoryHead;
    check(observed.position <= manifest.head.position && observed.canonicalTime <= manifest.head.canonicalTime, 'SNAPSHOT_SUPPLEMENT_HEAD');
    if (observed.position === manifest.head.position) equal(observed, manifest.head, 'SNAPSHOT_SUPPLEMENT_HEAD');
  }
  equal(summary.packet.manifest, packetManifest, 'SNAPSHOT_PACKET_MANIFEST');
  check(packetManifest.schemaVersion === 'continuity-local-packet-manifest/0.2' && packetManifest.intentId === `intent:${caseId}`, 'SNAPSHOT_PACKET_CASE');
  plain(packetManifest.adapterIdentity);
  equal(packetManifest.adapterIdentity.domain, manifest.domain, 'SNAPSHOT_PACKET_DOMAIN');
  check(packetManifest.adapterIdentity.intentId === `intent:${caseId}`, 'SNAPSHOT_PACKET_CASE');
  const acknowledgment = summary.packet.acknowledgment;
  plain(acknowledgment); plain(acknowledgment.result); plain(acknowledgment.result.manifestDigest);
  check(acknowledgment.schemaVersion === 'continuity-adapter-acknowledgment/0.2' && acknowledgment.intentId === `intent:${caseId}` && acknowledgment.result.kind === 'LOCAL_PACKET_CREATED' && acknowledgment.result.manifestDigest.algorithm === 'sha256' && acknowledgment.result.manifestDigest.value === `0x${packetDigest}`, 'SNAPSHOT_PACKET_ACK_BINDING');
  equal(acknowledgment.domain, manifest.domain, 'SNAPSHOT_PACKET_DOMAIN');
  check(Array.isArray(summary.packet.files) && summary.packet.files.length > 0 && summary.packet.files.length <= 8, 'SNAPSHOT_PACKET_FILES');
  const files = [], seen = new Set();
  for (const file of summary.packet.files) {
    closed(file, ['name', 'bytes', 'sha256']);
    string(file.name, LOG_NAME); integer(file.bytes, ARTIFACT_BYTES); string(file.sha256, DIGEST);
    check(!seen.has(file.name), 'SNAPSHOT_PACKET_FILES'); seen.add(file.name);
    const originalName = `packet-file-${file.name}`, record = retained.get(originalName);
    check(record && record.bytes.length === file.bytes && sha(record.bytes) === file.sha256, 'SNAPSHOT_PACKET_FILE_IDENTITY');
    files.push({ evidenceId: `packet.${file.name}`, originalName, file });
  }
  equal(packetManifest.selection, summary.packet.files, 'SNAPSHOT_PACKET_SELECTION');
  equal([...retained.keys()].filter(name => name.startsWith('packet-file-')).sort(), files.map(file => file.originalName).sort(), 'SNAPSHOT_PACKET_MEMBERSHIP');
  check(Array.isArray(notes) && notes.length <= 32, 'SNAPSHOT_REVIEW_LIMIT');
  const latest = new Map(), noteIds = new Set();
  let priorPosition = -1;
  for (let index = 0; index < notes.length; index++) {
    const note = notes[index];
    plain(note);
    if (note.schemaVersion === 'continuity-review-progress/2') {
      check(manifest.schemaVersion === SIGNED_EXPORT_SCHEMA, 'SNAPSHOT_REVIEW_CASE');
      try { validateProgressEntry(note); } catch { fail('SNAPSHOT_REVIEW_CASE'); }
      check(Buffer.byteLength(JSON.stringify(note) + '\n', 'utf8') <= 32768, 'SNAPSHOT_FILE_LIMIT');
    } else closed(note, ['schemaVersion', 'caseId', 'sequence', 'noteId', 'actorId', 'runtimeSessionId', 'controlEpoch', 'roleTenureId', 'historyHead', 'packetManifestSha256', 'fileName', 'fileSha256', 'note', 'status', 'previousRecordHash', 'authorizationProofHash', 'signature']);
    check(['continuity-review-progress/1', 'continuity-review-progress/2'].includes(note.schemaVersion) && note.caseId === caseId && note.status === 'REVIEWED' && note.sequence === index + 1, 'SNAPSHOT_REVIEW_CASE');
    string(note.noteId, SLUG); check(!noteIds.has(note.noteId), 'SNAPSHOT_REVIEW_DUPLICATE'); noteIds.add(note.noteId);
    const actor = note.actorId === `a:${caseId}` ? 'a' : note.actorId === `b:${caseId}` ? 'b' : null;
    check(actor !== null && note.runtimeSessionId === `session:${caseId}:${actor}` && note.roleTenureId === `tenure-${actor}:${caseId}`, 'SNAPSHOT_REVIEW_ACTOR');
    integer(note.controlEpoch); validateHead(note.historyHead);
    check(note.historyHead.position >= priorPosition && note.historyHead.position <= manifest.head.position && note.historyHead.canonicalTime <= manifest.head.canonicalTime, 'SNAPSHOT_REVIEW_HEAD');
    priorPosition = note.historyHead.position;
    check(note.packetManifestSha256 === packetDigest, 'SNAPSHOT_REVIEW_PACKET');
    const file = summary.packet.files.find(file => file.name === note.fileName);
    check(file && file.sha256 === note.fileSha256, 'SNAPSHOT_REVIEW_FILE');
    check(typeof note.note === 'string' && note.note.length <= 1000 && Buffer.byteLength(note.note, 'utf8') <= 1000, 'SNAPSHOT_REVIEW_NOTE');
    if (note.previousRecordHash !== null) string(note.previousRecordHash, HASH);
    string(note.authorizationProofHash, HASH); string(note.signature, SIGNATURE);
    latest.set(note.fileName, note);
  }
  check(summary.review.scope === 'APPLICATION_RECORDED_WORK' && summary.review.incidentResolution === 'NOT_PROVEN' && summary.review.recordCount === notes.length && summary.review.reviewedCount === latest.size && summary.review.totalFiles === files.length, 'SNAPSHOT_REVIEW_SUMMARY');
  const expectedReviewFiles = summary.packet.files.map(file => {
    const note = latest.get(file.name);
    return { ...file, reviewed: note !== undefined, latestNoteId: note?.noteId ?? null, latestActorId: note?.actorId ?? null, latestNote: note?.note ?? null };
  });
  equal(summary.review.files, expectedReviewFiles, 'SNAPSHOT_REVIEW_SUMMARY');
  equal(summary.review.remainingFiles, expectedReviewFiles.filter(file => !file.reviewed).map(file => file.name), 'SNAPSHOT_REVIEW_SUMMARY');
  plain(axes); plain(axes.externalOutcome); plain(axes.finality);
  check(axes.operationVersion === 'continuity-receipt-verification/0.2' && axes.status === 'EVALUATED', 'SNAPSHOT_RECEIPT_AXES');
  for (const key of ['valid', 'authentic', 'historical', 'current']) check(typeof axes[key] === 'boolean', 'SNAPSHOT_RECEIPT_AXES');
  for (const axis of [axes.externalOutcome, axes.finality]) {
    check(['PASS', 'FAIL', 'UNVERIFIED', 'INDETERMINATE'].includes(axis.status), 'SNAPSHOT_RECEIPT_AXES');
    string(axis.primaryCode, /^[A-Z][A-Z0-9_]{0,63}$(?![\s\S])/, 'SNAPSHOT_RECEIPT_AXES');
  }
  return { summary, files, axes, supplement };
}

function chunksFor(bytes) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { fail('SNAPSHOT_UTF8_INVALID'); }
  check(Buffer.from(text, 'utf8').equals(bytes), 'SNAPSHOT_UTF8_ROUNDTRIP');
  const chunks = [];
  let byteOffset = 0, firstLine = 1;
  do {
    let end = Math.min(byteOffset + CHUNK_BYTES, bytes.length);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    check(end > byteOffset || bytes.length === 0, 'SNAPSHOT_CHUNK_BOUNDARY');
    const part = bytes.subarray(byteOffset, end);
    const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(part);
    check(Buffer.from(content, 'utf8').equals(part), 'SNAPSHOT_UTF8_ROUNDTRIP');
    let newlines = 0;
    for (const byte of part) if (byte === 10) newlines++;
    const lastLine = firstLine + newlines - (part.length > 0 && part[part.length - 1] === 10 ? 1 : 0);
    chunks.push({ content, byteOffset, byteCount: part.length, chunkSha256: sha(part), firstLine, lastLine });
    firstLine += newlines;
    byteOffset = end;
  } while (byteOffset < bytes.length);
  return chunks;
}

/** Pure detached capture: manifest and every named payload are independently checked. */
export function reviewSnapshotFromBytes(options) {
  check(arguments.length === 1, 'SNAPSHOT_CONFIGURATION');
  const config = closed(options, ['caseId', 'expectedManifestSha256', 'files'], [], 'SNAPSHOT_CONFIGURATION');
  const caseId = string(config.caseId, SLUG, 'SNAPSHOT_CONFIGURATION');
  const expectedManifestSha256 = string(config.expectedManifestSha256, DIGEST, 'SNAPSHOT_CONFIGURATION');
  const input = config.files;
  check(input !== null && typeof input === 'object' && !types.isProxy(input) && Object.getPrototypeOf(input) === Map.prototype && Reflect.ownKeys(input).length === 0, 'SNAPSHOT_CONFIGURATION');
  const count = Object.getOwnPropertyDescriptor(Map.prototype, 'size').get.call(input);
  check(count > 0 && count <= PAYLOADS + 1, 'SNAPSHOT_MEMBER_LIMIT');
  const capturedFiles = new Map();
  const typed = Object.getPrototypeOf(Uint8Array.prototype);
  const lengthOf = Object.getOwnPropertyDescriptor(typed, 'length').get;
  const bufferOf = Object.getOwnPropertyDescriptor(typed, 'buffer').get;
  let capturedTotal = 0;
  for (const [name, bytes] of Map.prototype.entries.call(input)) {
    string(name, NAME, 'SNAPSHOT_MANIFEST_MEMBERSHIP');
    check(bytes !== null && typeof bytes === 'object' && !types.isProxy(bytes) && Buffer.isBuffer(bytes) && Object.getPrototypeOf(bytes) === Buffer.prototype, 'SNAPSHOT_CONFIGURATION');
    const length = lengthOf.call(bytes), backing = bufferOf.call(bytes);
    check(!types.isSharedArrayBuffer(backing) && Reflect.ownKeys(bytes).length === length, 'SNAPSHOT_CONFIGURATION');
    check(length <= (name === 'MANIFEST.json' ? MANIFEST_BYTES : ARTIFACT_BYTES), 'SNAPSHOT_FILE_LIMIT');
    capturedTotal += length;
    check(capturedTotal <= TOTAL_BYTES, 'SNAPSHOT_TOTAL_LIMIT');
    capturedFiles.set(name, { bytes: Buffer.from(bytes) });
  }
  const manifestRecord = capturedFiles.get('MANIFEST.json');
  check(manifestRecord && sha(manifestRecord.bytes) === expectedManifestSha256, 'SNAPSHOT_MANIFEST_IDENTITY');
  const manifest = decodeJson(manifestRecord.bytes), rows = manifestRows(manifest, caseId);
  equal([...capturedFiles.keys()].sort(), ['MANIFEST.json', ...rows.map(row => row.name)].sort(), 'SNAPSHOT_DIRECTORY_MEMBERSHIP');
  const retained = new Map();
  let totalBytes = manifestRecord.bytes.length;
  for (const row of rows) {
    const record = capturedFiles.get(row.name);
    check(record.bytes.length === row.bytes && sha(record.bytes) === row.sha256, 'SNAPSHOT_ARTIFACT_IDENTITY');
    totalBytes += record.bytes.length;
    retained.set(row.name, record);
  }
    const data = new Map();
    // All payload digests have passed before any payload is parsed.
    for (const [name, record] of retained) if (name.endsWith('.json')) data.set(name, decodeJson(record.bytes));
    const { summary, files, axes, supplement } = bindSources(data, retained, manifest, caseId);
    const source = freeze({ manifestSha256: expectedManifestSha256, manifestBytes: manifestRecord.bytes.length, head: manifest.head });
    const selection = [...files.map(file => ({ evidenceId: file.evidenceId, originalName: file.originalName, textScope: 'ORIGINAL_SYNTHETIC_PACKET_LOG_UNTRUSTED_DATA' })),
      { evidenceId: 'review-progress', originalName: 'review-progress.json', textScope: 'ORIGINAL_AUTHORED_APPLICATION_NOTES_RETAINED_ASSERTIONS' },
      { evidenceId: 'case-summary', originalName: 'summary.json', textScope: 'ORIGINAL_CASE_SUMMARY_WITH_RETAINED_SCOPE_AND_GRANT_ASSERTIONS' }];
    if (supplement !== null) selection.push({ evidenceId: `supplement.${supplement.record.supplementId}`,
      originalName: 'review-supplement.log', textScope: SUPPLEMENT_EVIDENCE_SCOPE });
    check(selection.length <= 11, 'SNAPSHOT_MEMBER_LIMIT');
    const captured = new Map();
    const members = selection.map(member => {
      const bytes = retained.get(member.originalName).bytes;
      const chunks = chunksFor(bytes), originalSha256 = sha(bytes);
      const metadata = { ...member, bytes: bytes.length, sha256: originalSha256, chunkCount: chunks.length };
      captured.set(member.evidenceId, { metadata, chunks });
      return metadata;
    });
    const axesBytes = retained.get('receipt-verification.json').bytes;
    const catalog = boundedReply({ schemaVersion: 'continuity-agent-evidence-catalog/1', caseId, source,
      payloadCount: rows.length, totalSnapshotBytes: totalBytes, members,
      receiptAxes: { source: { originalName: 'receipt-verification.json', bytes: axesBytes.length, sha256: sha(axesBytes) },
        valid: axes.valid, authentic: axes.authentic, historical: axes.historical, current: axes.current,
        externalOutcome: { status: axes.externalOutcome.status, primaryCode: axes.externalOutcome.primaryCode },
        finality: { status: axes.finality.status, primaryCode: axes.finality.primaryCode }, newVerification: false },
      lineConvention: 'ONE_BASED_LF; FINAL_LF_BELONGS_TO_PRECEDING_LINE; EMPTY_TEXT_LINE_1', scope: SCOPE });
    const statusSource = freeze(summary);
    function read(evidenceId, chunkIndex) {
      check(arguments.length === 2 && typeof evidenceId === 'string' && Number.isSafeInteger(chunkIndex) && !Object.is(chunkIndex, -0) && chunkIndex >= 0, 'READ_ARGUMENTS');
      const item = captured.get(evidenceId);
      check(item !== undefined, 'READ_EVIDENCE_NOT_SELECTED');
      check(chunkIndex < item.chunks.length, 'READ_CHUNK_RANGE');
      return boundedReply({ schemaVersion: 'continuity-agent-evidence-chunk/1', caseId, evidenceId,
        originalName: item.metadata.originalName, ...item.chunks[chunkIndex], originalSha256: item.metadata.sha256,
        chunkIndex, chunkCount: item.chunks.length, source: { manifestSha256: expectedManifestSha256, head: manifest.head }, scope: SCOPE });
    }
    const snapshot = Object.freeze({ catalog, statusSource, read });
    const history = data.get('history.json');
    const bundle = Object.freeze({ snapshot, history: history === undefined ? undefined : freeze(history), notes: freeze(data.get('review-progress.json')) });
    reviewSnapshotBundles.add(bundle);
    return bundle;
}

export function reviewSnapshotManifestRows(bytes, caseId) {
  check(arguments.length === 2, 'SNAPSHOT_CONFIGURATION');
  string(caseId, SLUG, 'SNAPSHOT_CONFIGURATION');
  check(bytes !== null && typeof bytes === 'object' && !types.isProxy(bytes) && Buffer.isBuffer(bytes) &&
    Object.getPrototypeOf(bytes) === Buffer.prototype, 'SNAPSHOT_CONFIGURATION');
  const typed = Object.getPrototypeOf(Uint8Array.prototype);
  const length = Object.getOwnPropertyDescriptor(typed, 'length').get.call(bytes);
  const backing = Object.getOwnPropertyDescriptor(typed, 'buffer').get.call(bytes);
  check(!types.isSharedArrayBuffer(backing) && Reflect.ownKeys(bytes).length === length, 'SNAPSHOT_CONFIGURATION');
  check(length <= MANIFEST_BYTES, 'SNAPSHOT_FILE_LIMIT');
  return freeze(manifestRows(decodeJson(Buffer.from(bytes)), caseId));
}
