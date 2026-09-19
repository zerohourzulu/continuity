import { reviewSnapshotDirectory } from '../../core-0.2-reference/src/review-snapshot-location.mjs';
// Read-only capture of an operator-pinned export. No application, signer,
// executor, store or Core verifier is imported or invoked by this module.
import { constants, lstatSync, fstatSync, openSync, closeSync, readSync, opendirSync } from 'node:fs';
import { isAbsolute, join, parse, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual, types } from 'node:util';
import { reviewSnapshotFromBytes, reviewSnapshotManifestRows } from './review-snapshot-bytes.mjs';

const MANIFEST_BYTES = 64 * 1024;
const ARTIFACT_BYTES = 1024 * 1024;
const TOTAL_BYTES = 2 * 1024 * 1024;
const PAYLOADS = 32;
const SLUG = /^[a-z][a-z0-9-]{0,31}$(?![\s\S])/;
const DIGEST = /^[0-9a-f]{64}$(?![\s\S])/;
const DEFAULT_CASES = fileURLToPath(new URL('../../core-0.2-reference/cases/', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const STATS = { bigint: true };
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function check(condition, code = 'SNAPSHOT_SOURCE_BINDING') { if (!condition) fail(code); }
function string(value, pattern, code = 'SNAPSHOT_SOURCE_BINDING') {
  check(typeof value === 'string' && pattern.test(value), code);
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
function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size &&
    left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs && left.nlink === right.nlink;
}
function captureDirectory(directory) {
  check(typeof directory === 'string' && directory.length > 0 && directory.length <= 4096 &&
    !directory.includes('\0') && isAbsolute(directory) && !directory.split(sep).includes('..') && resolve(directory) === directory, 'SNAPSHOT_DIRECTORY');
  const identities = [];
  const root = parse(directory).root;
  let current = root;
  for (const part of directory.slice(root.length).split(sep).filter(Boolean)) {
    current = join(current, part);
    const stat = lstatSync(current, STATS);
    check(stat.isDirectory() && !stat.isSymbolicLink(), 'SNAPSHOT_DIRECTORY');
    identities.push({ path: current, dev: stat.dev, ino: stat.ino });
  }
  return identities;
}
function directoryMembers(directory) {
  const handle = opendirSync(directory), names = [];
  try {
    for (let entry; (entry = handle.readSync()) !== null;) {
      names.push(entry.name);
      check(names.length <= PAYLOADS + 1, 'SNAPSHOT_MEMBER_LIMIT');
    }
  } finally { handle.closeSync(); }
  return names.sort();
}
function readRegular(path, maximum) {
  const named = lstatSync(path, STATS);
  check(named.isFile() && !named.isSymbolicLink() && named.nlink === 1n, 'SNAPSHOT_FILE_KIND');
  check(named.size >= 0n && named.size <= BigInt(maximum), 'SNAPSHOT_FILE_LIMIT');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = fstatSync(fd, STATS);
    check(opened.isFile() && opened.nlink === 1n && sameFile(named, opened), 'SNAPSHOT_FILE_CHANGED');
    const bytes = Buffer.alloc(Number(opened.size) + 1);
    let count = 0;
    while (count < bytes.length) {
      const read = readSync(fd, bytes, count, bytes.length - count, null);
      if (read === 0) break;
      count += read;
    }
    const after = fstatSync(fd, STATS), namedAfter = lstatSync(path, STATS);
    check(count === Number(opened.size) && after.isFile() && namedAfter.isFile() && !namedAfter.isSymbolicLink() && sameFile(opened, after) && sameFile(opened, namedAfter), 'SNAPSHOT_FILE_CHANGED');
    return { bytes: Buffer.from(bytes.subarray(0, count)), identity: namedAfter, path };
  } finally { closeSync(fd); }
}

/** Capture once. The optional absolute directory is a trusted JS/operator seam. */
export function loadReviewSnapshotBundle(options) {
  check(arguments.length === 1, 'SNAPSHOT_CONFIGURATION');
  const config = closed(options, ['caseId', 'expectedManifestSha256'], ['exportDirectory', 'snapshotId'], 'SNAPSHOT_CONFIGURATION');
  const caseId = string(config.caseId, SLUG, 'SNAPSHOT_CONFIGURATION');
  const expectedManifestSha256 = string(config.expectedManifestSha256, DIGEST, 'SNAPSHOT_CONFIGURATION');
  const named = Object.hasOwn(config, 'snapshotId');
  check(!(named && Object.hasOwn(config, 'exportDirectory')), 'SNAPSHOT_CONFIGURATION');
  if (named) string(config.snapshotId, SLUG, 'SNAPSHOT_CONFIGURATION');
  const exportDirectory = Object.hasOwn(config, 'exportDirectory') ? config.exportDirectory
    : named ? reviewSnapshotDirectory(join(DEFAULT_CASES, caseId), config.snapshotId) : join(DEFAULT_CASES, caseId, 'export');
  try {
    const directories = captureDirectory(exportDirectory);
    const manifestRecord = readRegular(join(exportDirectory, 'MANIFEST.json'), MANIFEST_BYTES);
    check(sha(manifestRecord.bytes) === expectedManifestSha256, 'SNAPSHOT_MANIFEST_IDENTITY');
    const rows = reviewSnapshotManifestRows(manifestRecord.bytes, caseId);
    const expectedNames = ['MANIFEST.json', ...rows.map(row => row.name)].sort();
    equal(directoryMembers(exportDirectory), expectedNames, 'SNAPSHOT_DIRECTORY_MEMBERSHIP');
    const retained = new Map(), aliases = new Set([`${manifestRecord.identity.dev}:${manifestRecord.identity.ino}`]);
    let totalBytes = manifestRecord.bytes.length;
    for (const row of rows) {
      check(totalBytes + row.bytes <= TOTAL_BYTES, 'SNAPSHOT_TOTAL_LIMIT');
      const record = readRegular(join(exportDirectory, row.name), Math.min(ARTIFACT_BYTES, TOTAL_BYTES - totalBytes));
      check(record.bytes.length === row.bytes && sha(record.bytes) === row.sha256, 'SNAPSHOT_ARTIFACT_IDENTITY');
      const alias = `${record.identity.dev}:${record.identity.ino}`;
      check(!aliases.has(alias), 'SNAPSHOT_FILE_ALIAS'); aliases.add(alias);
      totalBytes += record.bytes.length;
      retained.set(row.name, record);
    }
    // Verify named objects still identify the captured objects. Reads update
    // atime only; no lock/store file or writable descriptor is ever used.
    for (const record of [manifestRecord, ...retained.values()]) {
      const current = lstatSync(record.path, STATS);
      check(current.isFile() && !current.isSymbolicLink() && sameFile(record.identity, current), 'SNAPSHOT_FILE_CHANGED');
    }
    for (const directory of directories) {
      const current = lstatSync(directory.path, STATS);
      check(current.isDirectory() && !current.isSymbolicLink() && current.dev === directory.dev && current.ino === directory.ino, 'SNAPSHOT_DIRECTORY_CHANGED');
    }
    equal(directoryMembers(exportDirectory), expectedNames, 'SNAPSHOT_DIRECTORY_MEMBERSHIP');
    return reviewSnapshotFromBytes({ caseId, expectedManifestSha256,
      files: new Map([['MANIFEST.json', manifestRecord.bytes], ...[...retained].map(([name, record]) => [name, record.bytes])]) });
  } catch (error) {
    if (error && typeof error === 'object' && !types.isProxy(error)) {
      const code = Object.getOwnPropertyDescriptor(error, 'code');
      if (code && typeof code.value === 'string' && code.value.startsWith('SNAPSHOT_')) throw error;
    }
    // No host path, errno message, stack or arbitrary parser detail is public.
    fail('SNAPSHOT_UNAVAILABLE');
  }
}

export function loadReviewSnapshot(options) {
  check(arguments.length === 1, 'SNAPSHOT_CONFIGURATION');
  return loadReviewSnapshotBundle(options).snapshot;
}
