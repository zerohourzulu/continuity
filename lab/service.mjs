/** Loopback-only synthetic effect service. Its durable audit is the lab oracle. */
import http from 'node:http';
import { createHash } from 'node:crypto';
import {
  mkdirSync, existsSync, readFileSync, openSync, writeSync, fsyncSync, closeSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const MODES = new Set([
  'normal', 'drop-after-effect', 'error-after-effect', 'delayed-effect',
  'delayed-response', 'wrong-fingerprint', 'oversized-response', 'redirect',
  'pending', 'fenced-delayed-effect',
]);
const TOOLS = new Set(['ticket.create', 'access.set', 'payment.send', 'document.read']);
const LIMIT = 16 * 1024;

function requestBody(request) {
  return new Promise((resolveBody, reject) => {
    let size = 0, chunks = [], settled = false;
    const fail = code => {
      if (settled) return;
      settled = true;
      chunks = [];
      reject(Object.assign(new Error(code), { code }));
    };
    request.on('data', chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > LIMIT) { fail('BODY_LIMIT'); return; }
      chunks.push(chunk);
    });
    request.on('aborted', () => fail('BODY_ABORTED'));
    request.on('error', () => fail('BODY_UNAVAILABLE'));
    request.on('end', () => {
      if (settled) return;
      settled = true;
      try {
        const raw = Buffer.concat(chunks);
        const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
        resolveBody(captureRequest(value));
      } catch { reject(Object.assign(new Error('INVALID_BODY'), { code: 'INVALID_BODY' })); }
    });
  });
}

function captureRequest(value) {
  const fields = ['key', 'fingerprint', 'tool', 'arguments', 'epoch'];
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key))) {
    throw Error('INVALID_REQUEST');
  }
  for (const key of ['key', 'fingerprint']) {
    if (typeof value[key] !== 'string' || !value[key] || value[key].length > 256 ||
        /[\u0000-\u001f\u007f]/.test(value[key])) throw Error('INVALID_ID');
  }
  if (!TOOLS.has(value.tool) || !Number.isSafeInteger(value.epoch) ||
      value.epoch < 0 || Object.is(value.epoch, -0)) throw Error('INVALID_OPERATION');
  if (!value.arguments || typeof value.arguments !== 'object' || Array.isArray(value.arguments)) {
    throw Error('INVALID_ARGUMENTS');
  }
  let nodes = 0;
  const pending = [[value, 0]];
  while (pending.length) {
    const [node, depth] = pending.pop();
    if (++nodes > 2048 || depth > 16) throw Error('ARGUMENT_LIMIT');
    if (typeof node === 'number' && (!Number.isFinite(node) || Object.is(node, -0))) throw Error('INVALID_NUMBER');
    if (node && typeof node === 'object') {
      for (const item of Object.values(node)) pending.push([item, depth + 1]);
    }
  }
  // The JSON decoder has already detached the value from any caller objects.
  return value;
}

function respond(response, status, body, headers = {}) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'content-type': 'application/json', ...headers });
  response.end(JSON.stringify(body));
}

export async function createService({ directory }) {
  if (typeof directory !== 'string' || !directory) throw Error('DIRECTORY_REQUIRED');
  directory = resolve(directory);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const auditFile = join(directory, 'audit.jsonl');
  if (!existsSync(auditFile)) {
    const fd = openSync(auditFile, 'wx', 0o600);
    try { fsyncSync(fd); } finally { closeSync(fd); }
    const dir = openSync(directory, 'r');
    try { fsyncSync(dir); } finally { closeSync(dir); }
  }
  const audit = () => {
    const text = readFileSync(auditFile, 'utf8');
    if (text && !text.endsWith('\n')) throw Error('INCOMPLETE_SERVICE_AUDIT');
    return text ? text.trimEnd().split('\n').map(line => JSON.parse(line)) : [];
  };
  let sequence = audit().length, mode = 'normal', closing = false;
  let currentFence = audit().filter(item => item.kind === 'FENCE').at(-1)?.epoch ?? 0;
  let requestSignals = 0;
  const observers = [], held = new Set(), sockets = new Set();
  const append = record => {
    const entry = { sequence: ++sequence, ...record };
    const bytes = Buffer.from(JSON.stringify(entry) + '\n');
    const fd = openSync(auditFile, 'a');
    try {
      let offset = 0;
      while (offset < bytes.length) {
        const count = writeSync(fd, bytes, offset, bytes.length - offset);
        if (!count) throw Error('AUDIT_WRITE_FAILED');
        offset += count;
      }
      fsyncSync(fd);
    } finally { closeSync(fd); }
    return entry;
  };
  const signal = () => {
    if (observers.length) observers.shift()();
    else requestSignals++;
  };
  const hold = async () => {
    // Install the release waiter before waking the test driver.
    const pending = new Promise(resolveHeld => held.add(resolveHeld));
    signal();
    await pending;
  };
  const release = () => {
    for (const resolveHeld of held) resolveHeld();
    held.clear();
  };
  const lastReport = key => audit().filter(item => item.report?.key === key).at(-1)?.report;
  const apply = request => {
    const effectId = `effect:${sequence + 1}`;
    const report = {
      key: request.key, fingerprint: request.fingerprint,
      state: 'APPLIED', effectId, tool: request.tool,
    };
    // There is deliberately no key deduplication: a second dispatch is visible.
    append({ kind: 'APPLIED', request, report });
    return report;
  };

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname.startsWith('/operations/')) {
        const key = decodeURIComponent(url.pathname.slice('/operations/'.length));
        if (!key || key.length > 256) { respond(response, 400, { error: 'INVALID_KEY' }); return; }
        append({ kind: 'LOOKUP', key });
        respond(response, 200, lastReport(key) ?? { key, state: 'NOT_FOUND' });
        return;
      }
      if (request.method !== 'POST' || url.pathname !== '/execute') {
        append({ kind: 'UNEXPECTED', method: request.method, path: url.pathname });
        respond(response, 404, { error: 'UNEXPECTED_ENDPOINT' });
        return;
      }
      let operation;
      try { operation = await requestBody(request); }
      catch (error) {
        append({ kind: 'REQUEST', valid: false });
        signal();
        respond(response, error.code === 'BODY_LIMIT' ? 413 : 400, { error: error.code ?? 'INVALID_BODY' });
        return;
      }
      const selected = mode;
      append({ kind: 'REQUEST', request: operation, mode: selected, valid: true });
      if (selected === 'redirect') {
        signal();
        respond(response, 307, { error: 'REDIRECT' }, { location: '/unexpected' });
        return;
      }
      if (selected === 'pending') {
        const report = { key: operation.key, fingerprint: operation.fingerprint, state: 'PENDING' };
        append({ kind: 'PENDING', request: operation, report });
        signal();
        respond(response, 202, report);
        return;
      }
      if (selected === 'delayed-effect' || selected === 'fenced-delayed-effect') await hold();
      if (closing) return;
      if (selected === 'fenced-delayed-effect' && operation.epoch < currentFence) {
        const report = { key: operation.key, fingerprint: operation.fingerprint, state: 'REJECTED' };
        append({ kind: 'REJECTED', request: operation, fence: currentFence, report });
        respond(response, 409, report);
        return;
      }
      const report = apply(operation);
      if (selected === 'delayed-response') await hold();
      else if (selected !== 'delayed-effect' && selected !== 'fenced-delayed-effect') signal();
      if (closing) return;
      if (selected === 'drop-after-effect') { request.socket.destroy(); return; }
      if (selected === 'error-after-effect') { respond(response, 500, { error: 'AFTER_EFFECT' }); return; }
      if (selected === 'wrong-fingerprint') {
        respond(response, 200, { ...report, fingerprint: createHash('sha256').update(operation.fingerprint + ':wrong').digest('hex') });
        return;
      }
      if (selected === 'oversized-response') {
        respond(response, 200, { ...report, padding: 'x'.repeat(256 * 1024) });
        return;
      }
      respond(response, 200, report);
    } catch {
      respond(response, 500, { error: 'SERVICE_UNAVAILABLE' });
    }
  });
  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolveListen(); });
  });
  const address = server.address();
  return Object.freeze({
    url: `http://127.0.0.1:${address.port}`,
    async close() {
      if (closing) return;
      closing = true;
      release();
      while (observers.length) observers.shift()();
      for (const socket of sockets) socket.destroy();
      await new Promise(resolveClosed => server.close(resolveClosed));
    },
    setMode(next) { if (!MODES.has(next)) throw Error('UNSUPPORTED_MODE'); mode = next; },
    waitForRequest() {
      if (requestSignals) { requestSignals--; return Promise.resolve(); }
      if (closing) return Promise.resolve();
      return new Promise(resolveObserved => observers.push(resolveObserved));
    },
    release,
    stats() {
      const records = audit(), reports = new Map();
      for (const item of records) if (item.report) reports.set(item.report.key, item.report);
      return {
        requests: records.filter(item => item.kind === 'REQUEST').length,
        effects: records.filter(item => item.kind === 'APPLIED').length,
        lookups: records.filter(item => item.kind === 'LOOKUP').length,
        unexpected: records.filter(item => item.kind === 'UNEXPECTED').length,
        reports: [...reports.values()], audit: records,
      };
    },
    fence(epoch) {
      if (!Number.isSafeInteger(epoch) || epoch < currentFence || Object.is(epoch, -0)) throw Error('INVALID_FENCE');
      append({ kind: 'FENCE', epoch });
      currentFence = epoch;
      return currentFence;
    },
  });
}
