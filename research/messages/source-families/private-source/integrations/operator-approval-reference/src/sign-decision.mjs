// Detached, explicitly invoked CLI only. Never import from application/server/executor code.
import { constants, lstatSync, fstatSync, openSync, readSync, closeSync, writeSync, realpathSync } from 'node:fs';
import { dirname, resolve, isAbsolute, parse, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrivateKey, sign } from 'node:crypto';
import { parseStrictJson } from '../../retained-evidence-mcp/src/strict-json.mjs';
import { parseChallenge, decisionText, sha } from './contract.mjs';

const check = (value, code) => { if (!value) throw new Error(code); };
function directory(value) {
  check(typeof value === 'string' && value.length <= 4096 && !value.includes('\0') && isAbsolute(value)
    && resolve(value) === value && value.isWellFormed(), 'SIGNER_INVALID_PATH');
  let current = parse(value).root;
  for (const part of value.slice(current.length).split(sep).filter(Boolean)) {
    current = resolve(current, part);
    const stat = lstatSync(current); check(stat.isDirectory() && !stat.isSymbolicLink(), 'SIGNER_UNSAFE_DIRECTORY');
  }
  check(realpathSync(value) === value, 'SIGNER_UNSAFE_DIRECTORY');
}
function filePath(value) {
  check(typeof value === 'string' && value.length <= 4096 && !value.includes('\0') && isAbsolute(value)
    && resolve(value) === value && value.isWellFormed(), 'SIGNER_INVALID_PATH');
  directory(dirname(value));
}
const same = (a, b) => ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs'].every(key => a[key] === b[key]);
function readFile(value, maximum) {
  filePath(value);
  const before = lstatSync(value, { bigint: true });
  check(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n && before.size > 0n
    && before.size <= BigInt(maximum), 'SIGNER_UNSAFE_FILE');
  const fd = openSync(value, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    check(same(before, fstatSync(fd, { bigint: true })), 'SIGNER_FILE_CHANGED');
    const result = Buffer.alloc(Number(before.size) + 1); let offset = 0;
    while (offset < result.length) { const count = readSync(fd, result, offset, result.length - offset, offset); if (!count) break; offset += count; }
    check(offset === Number(before.size) && same(before, fstatSync(fd, { bigint: true }))
      && same(before, lstatSync(value, { bigint: true })), 'SIGNER_FILE_CHANGED');
    directory(dirname(value)); return result.subarray(0, offset);
  } finally { closeSync(fd); }
}
function utf8(data) {
  const result = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data);
  check(result.isWellFormed(), 'SIGNER_INVALID_UTF8'); return result;
}
function main(args) {
  check(args.length === 8, 'SIGNER_USAGE: CHALLENGE DISPLAY PKCS8_PRIVATE_KEY OPERATOR_ID KEY_ID APPROVE_OR_DENY REASON OUTPUT');
  const [challengePath, displayPath, keyPath, operatorId, keyId, decision, reason, outputPath] = args;
  for (const path of [challengePath, displayPath, keyPath, outputPath]) filePath(path);
  check(new Set([challengePath, displayPath, keyPath, outputPath]).size === 4, 'SIGNER_PATHS_MUST_DIFFER');
  const challengeUtf8 = utf8(readFile(challengePath, 64 * 1024)), challenge = parseChallenge(challengeUtf8);
  const displayBytes = readFile(displayPath, 4 * 1024 * 1024), displayUtf8 = utf8(displayBytes);
  parseStrictJson(displayBytes);
  check(sha(displayBytes) === challenge.reviewDisplaySha256, 'SIGNER_DISPLAY_MISMATCH');
  const decisionUtf8 = decisionText(challengeUtf8, operatorId, keyId, decision, reason);
  // Print losslessly escaped JSON strings: terminal control bytes in untrusted evidence cannot execute/display-hide content.
  writeSync(1, 'DETACHED OPERATOR DECISION — key control is not proof of human presence.\n');
  writeSync(1, JSON.stringify({ challengeUtf8, requestUtf8: challenge.requestUtf8, displayUtf8, decisionUtf8 }) + '\n');
  const privateBytes = readFile(keyPath, 16 * 1024); let key;
  try {
    const pem = privateBytes.subarray(0, 27).toString('ascii').startsWith('-----BEGIN ' + 'PRIVATE KEY-----');
    key = createPrivateKey({ key: privateBytes, format: pem ? 'pem' : 'der', type: 'pkcs8' });
  } finally { privateBytes.fill(0); }
  check(key.asymmetricKeyType === 'ed25519', 'SIGNER_REQUIRES_ED25519');
  const signatureHex = sign(null, Buffer.from('continuity-operator-decision/1\n' + decisionUtf8, 'utf8'), key).toString('hex');
  const output = Buffer.from(JSON.stringify({ decisionUtf8, signatureHex }) + '\n');
  check(output.length <= 256 * 1024, 'SIGNER_ENVELOPE_LIMIT');
  const fd = openSync(outputPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { let offset = 0; while (offset < output.length) { const count = writeSync(fd, output, offset, output.length - offset); check(count > 0, 'SIGNER_WRITE_FAILED'); offset += count; } }
  finally { closeSync(fd); }
  writeSync(1, 'Decision file created. Import verifies enrollment, exact context and current policy; no effect was invoked.\n');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    const code = typeof error?.message === 'string' && /^(?:SIGNER_|OPERATOR_)[A-Z_ :]+$/.test(error.message)
      ? error.message : 'SIGNER_FAILED';
    // Never echo input paths, private-key parser errors or key material.
    writeSync(2, code + '\n'); process.exitCode = 1;
  }
}
