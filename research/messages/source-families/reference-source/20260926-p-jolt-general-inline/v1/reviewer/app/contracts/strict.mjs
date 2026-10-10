// Portable evidence is data. Bound and validate it before cryptographic work.
import { createHash } from 'node:crypto';
import { types } from 'node:util';
export class EvidenceError extends Error {
  constructor(code, message = code) { super(message); this.code = code; }
}
export const fail = (code) => { throw new EvidenceError(code); };
export function closed(value, keys, code = 'SCHEMA') {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) fail(code);
  return value;
}
export function text(value, max = 128) {
  if (typeof value !== 'string' || !value.length || value.length > max || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)) fail('IDENTIFIER');
  return value;
}
export function hex(value, bytes = 32) {
  if (typeof value !== 'string' || value.length !== 2 * bytes || !/^[0-9a-f]+$/.test(value)) fail('HEX_ENCODING');
  return value;
}
export function uint(value, max = (1n << 64n) - 1n) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,19})$/.test(value)) fail('INTEGER_ENCODING');
  const n = BigInt(value); if (n > max) fail('INTEGER_BOUND'); return n;
}
export function array(value, max, min = 0) {
  if (!Array.isArray(value) || value.length > max || value.length < min) fail('ARRAY_BOUND'); return value;
}
export function unique(values, code = 'DUPLICATE') {
  if (new Set(values).size !== values.length) fail(code); return values;
}
export function equal(a, b) { return canonical(a) === canonical(b); }
export function scalarString(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) { const d = s.charCodeAt(++i); if (!(d >= 0xdc00 && d <= 0xdfff)) fail('UNICODE'); }
    else if (c >= 0xdc00 && c <= 0xdfff) fail('UNICODE');
  }
  return s;
}
// The public contract permits only safe integer JSON numbers. u64 quantities use
// decimal strings. For this closed subset, ECMAScript serialization + UTF-16 key
// ordering is RFC8785 canonicalization. No generalized float canonicalizer.
export function canonical(v, depth = 0) {
  if (depth > 32) fail('DEPTH');
  if (v === null || typeof v === 'boolean') return JSON.stringify(v);
  if (typeof v === 'string') return JSON.stringify(scalarString(v));
  if (typeof v === 'number') { if (!Number.isSafeInteger(v) || Object.is(v, -0)) fail('NUMBER'); return String(v); }
  if (Array.isArray(v)) return '[' + v.map(x => canonical(x, depth + 1)).join(',') + ']';
  if (v && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)) {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(scalarString(k)) + ':' + canonical(v[k], depth + 1)).join(',') + '}';
  }
  fail('VALUE_TYPE');
}
export const digest = (domain, value) => createHash('sha256').update(domain + '\0', 'utf8').update(canonical(value), 'utf8').digest('hex');
export function parseStrict(input, { maxBytes = 8 * 1024 * 1024, maxNodes = 400000 } = {}) {
  if (!(typeof input === 'string' || Buffer.isBuffer(input) || input instanceof Uint8Array)) fail('INPUT_TYPE');
  if (typeof input !== 'string') {
    if (input.byteLength > maxBytes) fail('INPUT_SIZE');
    try { input = new TextDecoder('utf-8', { fatal: true }).decode(input); } catch { fail('UTF8'); }
  }
  if (Buffer.byteLength(input) > maxBytes) fail('INPUT_SIZE');
  scalarString(input);
  let p = 0, nodes = 0;
  const ws = () => { while (p < input.length && /[\x20\t\r\n]/.test(input[p])) p++; };
  function string() {
    const start = p++;
    while (p < input.length) {
      const c = input[p++];
      if (c === '"') {
        try { return scalarString(JSON.parse(input.slice(start, p))); } catch { fail('STRING'); }
      }
      if (c === '\\') p++;
    }
    fail('STRING');
  }
  function val(depth) {
    if (++nodes > maxNodes) fail('NODE_BOUND'); if (depth > 32) fail('DEPTH'); ws();
    const c = input[p];
    if (c === '"') return string();
    if (c === '{') {
      p++; const out = Object.create(null); ws(); if (input[p] === '}') { p++; return out; }
      while (true) {
        ws(); if (input[p] !== '"') fail('JSON'); const k = string(); ws();
        if (Object.hasOwn(out, k)) fail('DUPLICATE_KEY'); if (input[p++] !== ':') fail('JSON'); out[k] = val(depth + 1); ws();
        const sep = input[p++]; if (sep === '}') return out; if (sep !== ',') fail('JSON');
      }
    }
    if (c === '[') {
      p++; const out = []; ws(); if (input[p] === ']') { p++; return out; }
      while (true) { out.push(val(depth + 1)); ws(); const sep = input[p++]; if (sep === ']') return out; if (sep !== ',') fail('JSON'); }
    }
    for (const [word, v] of [['true', true], ['false', false], ['null', null]]) {
      if (input.startsWith(word, p)) { p += word.length; return v; }
    }
    const m = /^-?(?:0|[1-9][0-9]*)/.exec(input.slice(p));
    if (!m) fail('JSON'); p += m[0].length;
    const n = Number(m[0]); if (!Number.isSafeInteger(n) || Object.is(n, -0)) fail('NUMBER'); return n;
  }
  const result = val(0); ws(); if (p !== input.length) fail('TRAILING_OR_NONINTEGER'); return result;
}

// Capture caller-owned library arguments before any asynchronous work. Wire
// JSON is already data-only, but a JS caller can otherwise mutate shared rows
// between arithmetic verification and a later witnessed-prefix check.
export function snapshotPortable(input, { maxBytes = 8 * 1024 * 1024, maxNodes = 400000 } = {}) {
  let nodes = 0, approximateBytes = 0; const active = new WeakSet();
  function visit(value, depth) {
    if (++nodes > maxNodes || depth > 32) fail('SNAPSHOT_BOUND');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') { scalarString(value); approximateBytes += Buffer.byteLength(value); if (approximateBytes > maxBytes) fail('INPUT_SIZE'); return value; }
    if (typeof value === 'number') { if (!Number.isSafeInteger(value) || Object.is(value,-0)) fail('NUMBER'); return value; }
    if (!value || typeof value !== 'object' || types.isProxy(value)) fail('NON_DATA_INPUT');
    if (active.has(value)) fail('NON_DATA_INPUT'); active.add(value);
    const list = Array.isArray(value), proto = Object.getPrototypeOf(value);
    if (list ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) fail('NON_DATA_INPUT');
    const keys = Reflect.ownKeys(value); if (keys.length > maxNodes - nodes + 1 || keys.some(k=>typeof k !== 'string')) fail('NON_DATA_INPUT');
    let result;
    if (list) {
      const length = Object.getOwnPropertyDescriptor(value,'length')?.value;
      if (!Number.isSafeInteger(length) || length < 0 || length > maxNodes || keys.length !== length + 1) fail('NON_DATA_INPUT');
      result = [];
      for(let i=0;i<length;i++) { const d=Object.getOwnPropertyDescriptor(value,String(i)); if(!d?.enumerable || !Object.hasOwn(d,'value')) fail('NON_DATA_INPUT'); result.push(visit(d.value,depth+1)); }
    } else {
      result = Object.create(null);
      for(const key of keys) { const d=Object.getOwnPropertyDescriptor(value,key); if(!d?.enumerable || !Object.hasOwn(d,'value')) fail('NON_DATA_INPUT'); scalarString(key); approximateBytes += Buffer.byteLength(key); if(approximateBytes>maxBytes)fail('INPUT_SIZE'); result[key]=visit(d.value,depth+1); }
    }
    active.delete(value); return Object.freeze(result);
  }
  const captured=visit(input,0); if(Buffer.byteLength(canonical(captured))>maxBytes)fail('INPUT_SIZE'); return captured;
}
