import { DatabaseSync } from 'node:sqlite';
import { closeSync, lstatSync, openSync, realpathSync } from 'node:fs';
import { isAbsolute, join, parse, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { parseStrictJson } from '../../retained-evidence-mcp/src/strict-json.mjs';

const VERSION = 'continuity-synthetic-action-store/1';
const COMMAND = 'continuity-synthetic-state-command/1';
const TRANSITION = 'continuity-synthetic-state-transition/1';
const RESOURCE = /^synthetic-endpoint:[a-z0-9-]{1,128}$/;
const HEX = /^[a-f0-9]{64}$/;
const ID = /^0x[a-f0-9]{64}$/;
const keys = ['schemaVersion', 'resource', 'intentId', 'idempotencyKey', 'submissionFingerprint', 'expectedRevision', 'action', 'proposalSha256', 'snapshotManifestSha256', 'reviewMaterialSha256', 'reviewHead'];
const result = status => ({ status });
const fail = () => { throw new Error('STORE_UNAVAILABLE'); };
const integer = (n, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(n) && !Object.is(n, -0) && n >= 0 && n <= max;
// Require the entire value: JavaScript's $ also matches before a final newline.
const matches = (pattern, value) => typeof value === 'string' && pattern.exec(value)?.[0] === value;
const closed = (value, fields) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every(k => Object.hasOwn(value, k));
const digest = text => createHash('sha256').update(text, 'utf8').digest('hex');

function boundedJson(text, max) {
  if (typeof text !== 'string' || text.length === 0 || text.length > max || !text.isWellFormed()) throw new Error('INVALID_COMMAND');
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length > max) throw new Error('INVALID_COMMAND');
  return parseStrictJson(bytes);
}

function command(text) {
  const c = boundedJson(text, 4096);
  if (!closed(c, keys) || c.schemaVersion !== COMMAND || !matches(RESOURCE, c.resource) || !matches(/^[\x21-\x7e]{1,256}$/, c.intentId)
    || !matches(ID, c.idempotencyKey) || !matches(ID, c.submissionFingerprint) || !integer(c.expectedRevision, 31)
    || !['RELEASE', 'RESTORE'].includes(c.action) || !matches(HEX, c.proposalSha256) || !matches(HEX, c.snapshotManifestSha256)
    || !matches(HEX, c.reviewMaterialSha256) || !closed(c.reviewHead, ['hash', 'position', 'canonicalTime'])
    || !matches(ID, c.reviewHead.hash) || !integer(c.reviewHead.position) || !integer(c.reviewHead.canonicalTime)) throw new Error('INVALID_COMMAND');
  return c;
}

function transition(c, text, before) {
  return {
    schemaVersion: TRANSITION, resource: c.resource,
    identity: { intentId: c.intentId, idempotencyKey: c.idempotencyKey, submissionFingerprint: c.submissionFingerprint },
    commandSha256: digest(text), before: { ...before },
    after: { revision: before.revision + 1, status: c.action === 'RELEASE' ? 'RELEASED' : 'HELD' },
  };
}

function directoryPath(directory) {
  if (typeof directory !== 'string' || !isAbsolute(directory) || resolve(directory) !== directory) fail();
  let at = parse(directory).root;
  for (const part of directory.slice(at.length).split('/').filter(Boolean)) {
    at = join(at, part);
    const stat = lstatSync(at);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail();
  }
  if (realpathSync(directory) !== directory) fail();
  return join(directory, 'effect.sqlite');
}

function regularFile(file) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) fail();
}

function connect(file, readOnly) {
  const db = new DatabaseSync(file, { readOnly, timeout: 200, allowExtension: false, enableDoubleQuotedStringLiterals: false });
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=200;');
    if (!readOnly) db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;');
    if (db.prepare('PRAGMA journal_mode').get().journal_mode !== 'delete') fail();
    return db;
  } catch { db.close(); fail(); }
}

// Read all evidence within the caller's transaction. The fixed schema and host
// are cooperative; these bounds do not make arbitrary SQLite files safe imports.
function retained(db) {
  const meta = db.prepare('SELECT singleton, version, resource FROM metadata LIMIT 2').all();
  if (meta.length !== 1 || meta[0].singleton !== 1 || meta[0].version !== VERSION || !matches(RESOURCE, meta[0].resource)) fail();
  const rows = db.prepare('SELECT singleton, revision, status FROM state LIMIT 2').all();
  if (rows.length !== 1 || rows[0].singleton !== 1 || !integer(rows[0].revision, 32) || !['HELD', 'RELEASED'].includes(rows[0].status)) fail();
  const sizes = db.prepare('SELECT sequence, length(CAST(command_utf8 AS BLOB)) AS command_bytes, length(CAST(transition_json AS BLOB)) AS transition_bytes FROM records ORDER BY sequence LIMIT 33').all();
  if (sizes.length > 32 || sizes.some((r, i) => r.sequence !== i + 1 || !integer(r.command_bytes, 4096) || r.command_bytes < 1 || !integer(r.transition_bytes, 4096) || r.transition_bytes < 1)) fail();
  const stored = db.prepare('SELECT sequence, command_utf8, transition_json FROM records ORDER BY sequence LIMIT 33').all();
  let expected = { revision: 0, status: 'HELD' };
  const records = [], intents = new Set(), ids = new Set(), fingerprints = new Set();
  for (const row of stored) {
    const c = command(row.command_utf8), t = boundedJson(row.transition_json, 4096);
    if (c.resource !== meta[0].resource || c.expectedRevision !== expected.revision || (c.action === 'RELEASE' ? 'HELD' : 'RELEASED') !== expected.status
      || intents.has(c.intentId) || ids.has(c.idempotencyKey) || fingerprints.has(c.submissionFingerprint)
      || !isDeepStrictEqual(t, transition(c, row.command_utf8, expected))) fail();
    intents.add(c.intentId); ids.add(c.idempotencyKey); fingerprints.add(c.submissionFingerprint);
    records.push({ commandUtf8: row.command_utf8, transition: t });
    expected = t.after;
  }
  const state = { revision: rows[0].revision, status: rows[0].status };
  if (!isDeepStrictEqual(state, expected)) fail();
  return { resource: meta[0].resource, state, records };
}

function store(db, readOnly) {
  let closedStore = false;
  function rollback() { try { db.exec('ROLLBACK'); } catch {} }
  function read(fn) {
    try {
      if (closedStore) fail();
      db.exec('BEGIN');
      const value = fn(retained(db));
      db.exec('COMMIT');
      return value;
    } catch { rollback(); return result('STORE_UNAVAILABLE'); }
  }
  return Object.freeze({
    commit(commandUtf8) {
      let c;
      try { c = command(commandUtf8); } catch { return result('INVALID_COMMAND'); }
      if (readOnly) return result('READ_ONLY');
      let commitAttempted = false;
      try {
        if (closedStore) fail();
        db.exec('BEGIN IMMEDIATE');
        const data = retained(db);
        const collisions = data.records.filter(r => r.transition.identity.idempotencyKey === c.idempotencyKey || r.transition.identity.submissionFingerprint === c.submissionFingerprint || r.transition.identity.intentId === c.intentId);
        let output;
        if (collisions.length) {
          const prior = collisions[0];
          output = collisions.length === 1 && prior.commandUtf8 === commandUtf8 ? { status: 'ALREADY_RECORDED', ...prior } : result('IDENTITY_CONFLICT');
        } else if (data.records.length >= 32) output = result('RECORD_LIMIT');
        else if (c.resource !== data.resource || c.expectedRevision !== data.state.revision || (c.action === 'RELEASE' ? 'HELD' : 'RELEASED') !== data.state.status) output = result('PRECONDITION_FAILED');
        else {
          const t = transition(c, commandUtf8, data.state);
          db.prepare('INSERT INTO records(sequence, command_utf8, transition_json) VALUES (?, ?, ?)').run(t.after.revision, commandUtf8, JSON.stringify(t));
          db.prepare('UPDATE state SET revision=?, status=? WHERE singleton=1').run(t.after.revision, t.after.status);
          output = { status: 'APPLIED', commandUtf8, transition: t };
        }
        // Even refusals close the acquired transaction before returning.
        commitAttempted = true;
        db.exec('COMMIT');
        return output;
      } catch {
        rollback();
        return result(commitAttempted ? 'OUTCOME_UNKNOWN' : 'STORE_UNAVAILABLE');
      }
    },
    reconcile(idempotencyKey, submissionFingerprint) {
      if (!matches(ID, idempotencyKey) || !matches(ID, submissionFingerprint)) return result('INVALID_COMMAND');
      return read(data => {
        const byKey = data.records.find(r => r.transition.identity.idempotencyKey === idempotencyKey);
        const byFingerprint = data.records.find(r => r.transition.identity.submissionFingerprint === submissionFingerprint);
        if (byKey && byKey === byFingerprint) return { status: 'RETAINED', ...byKey };
        if (byKey || byFingerprint) return result('IDENTITY_CONFLICT');
        return result('ABSENT');
      });
    },
    inspect() { return read(data => ({ status: 'OK', ...data })); },
    close() { if (!closedStore) { closedStore = true; try { db.close(); } catch { fail(); } } },
  });
}

export function initializeStore(directory, resource) {
  if (!matches(RESOURCE, resource)) throw new Error('INVALID_COMMAND');
  let db;
  try {
    const file = directoryPath(directory);
    closeSync(openSync(file, 'wx', 0o600));
    regularFile(file);
    db = connect(file, false);
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE metadata (singleton INTEGER PRIMARY KEY CHECK(singleton=1), version TEXT NOT NULL, resource TEXT NOT NULL);
      CREATE TABLE state (singleton INTEGER PRIMARY KEY REFERENCES metadata(singleton), revision INTEGER NOT NULL, status TEXT NOT NULL);
      CREATE TABLE records (sequence INTEGER PRIMARY KEY, command_utf8 TEXT NOT NULL, transition_json TEXT NOT NULL);`);
    db.prepare('INSERT INTO metadata VALUES (1, ?, ?)').run(VERSION, resource);
    db.exec("INSERT INTO state VALUES (1, 0, 'HELD'); COMMIT;");
    return store(db, false);
  } catch { if (db) { try { db.close(); } catch {} } fail(); }
}

export function openStore(directory, { readOnly = false } = {}) {
  let db;
  try {
    if (typeof readOnly !== 'boolean') fail();
    const file = directoryPath(directory);
    regularFile(file);
    db = connect(file, readOnly);
    db.exec('BEGIN');
    retained(db);
    db.exec('COMMIT');
    return store(db, readOnly);
  } catch { if (db) { try { db.close(); } catch {} } fail(); }
}
