import { constants, lstatSync, fstatSync, realpathSync, openSync, readSync, closeSync, opendirSync } from 'node:fs';
import { dirname, isAbsolute, resolve, parse, join, sep } from 'node:path';
import { parseStrictJson } from '../../retained-evidence-mcp/src/strict-json.mjs';

function check(ok) { if (!ok) throw new Error('ACTION_FILE_UNAVAILABLE_OR_CHANGED'); }
export function safeDirectory(path) {
  check(typeof path === 'string' && path.length <= 4096 && isAbsolute(path) && resolve(path) === path && !path.includes('\0'));
  let current = parse(path).root;
  for (const part of path.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, part);
    const s = lstatSync(current); check(s.isDirectory() && !s.isSymbolicLink());
  }
  check(realpathSync(path) === path); return path;
}
function same(a,b) {
  return ['dev','ino','mode','nlink','size','mtimeNs','ctimeNs'].every(key => a[key] === b[key]);
}
export function readRegular(path, maximum = 65536) {
  safeDirectory(dirname(path));
  const before = lstatSync(path, {bigint:true});
  check(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n && before.size <= BigInt(maximum));
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    check(same(before, fstatSync(fd, {bigint:true})));
    const buffer = Buffer.alloc(Number(before.size) + 1); let offset = 0;
    while (offset < buffer.length) {
      const n = readSync(fd, buffer, offset, buffer.length-offset, offset);
      if (n === 0) break; offset += n;
    }
    check(offset === Number(before.size) && same(before,fstatSync(fd,{bigint:true})) && same(before,lstatSync(path,{bigint:true})));
    safeDirectory(dirname(path)); return Buffer.from(buffer.subarray(0,offset));
  } finally { closeSync(fd); }
}
export function readJson(path, maximum = 65536) { return parseStrictJson(readRegular(path,maximum)); }
export function parseJson(bytes, maximum = 2*1024*1024) {
  check(Buffer.isBuffer(bytes) && bytes.length <= maximum); return parseStrictJson(bytes);
}
export function list(path, maximum) {
  safeDirectory(path); const before = lstatSync(path,{bigint:true}),handle=opendirSync(path),result=[];
  try {
    for (;;) { const entry=handle.readSync(); if(entry===null) break; result.push(entry.name); check(result.length<=maximum); }
  } finally { handle.closeSync(); }
  check(same(before,lstatSync(path,{bigint:true}))); return result.sort();
}
export function presentDirectory(path) {
  try { lstatSync(path); safeDirectory(path); return true; }
  catch (error) { if(error.code==='ENOENT') return false; throw error; }
}
