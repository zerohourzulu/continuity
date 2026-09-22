import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, supportedNode } from '../tools/environment.mjs';

const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'continuity-onboarding-')));
const excluded = new Set(['node_modules', '.git', 'runs', 'integrations/core-0.2-reference/cases', 'integrations/document-release-native/build']);
cpSync(ROOT, scratch, { recursive: true, filter: path => !excluded.has(relative(ROOT, path)) });
let clean = false;
process.on('exit', code => { if (clean && code === 0) rmSync(scratch, { recursive: true, force: true }); else console.error(`Onboarding failure evidence retained: ${scratch}`); });
function invoke(args, env = process.env) {
  return spawnSync(process.execPath, args, { cwd: scratch, env, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
}

test('onboarding: minimum runtime policy excludes older and unknown future releases', () => {
  for (const v of ['22.18.0','22.23.2','24.0.0','24.21.0','26.0.0']) assert.equal(supportedNode(v), true, v);
  for (const v of ['20.19.0','22.17.0','23.0.0','25.0.0','27.0.0','24.0.0-rc.1','invalid']) assert.equal(supportedNode(v), false, v);
});
test('onboarding: recorded answers and help need no installed dependencies', () => {
  assert(!existsSync(join(scratch,'node_modules')));
  const doctor = invoke(['tools/doctor.mjs','--for','reader']);
  assert.equal(doctor.status, 0, doctor.stderr);
  const read = invoke(['examples/recorded.mjs']);
  assert.equal(read.status, 0, read.stderr);
  assert.match(read.stdout, /RECORDED CASE/);
  assert.match(read.stdout, /ALLOW — B may review/);
  assert.match(read.stdout, /DENY — B may collect/);
  assert(!existsSync(join(scratch,'runs')));
  assert.equal(invoke(['tutorial/cli.mjs','--help']).status, 0);
});
test('onboarding: missing dependencies fail before a case is created', () => {
  const p = invoke(['tutorial/start.mjs']);
  assert.equal(p.status, 1); assert.match(p.stderr, /node tools\/setup.mjs/);
  assert(!existsSync(join(scratch,'runs')));
  assert(!existsSync(join(scratch,'integrations/core-0.2-reference/cases')));
});
test('onboarding: local hints preserve explicit JSON error envelopes', () => {
  const human = invoke(['bin/continuity.mjs','check']);
  assert.equal(human.status, 2); assert.match(human.stderr, /--file PATH/);
  const machine = invoke(['bin/continuity.mjs','check','--json']);
  assert.equal(machine.status, 2); assert.deepEqual(JSON.parse(machine.stderr), {error:'FILE_REQUIRED'});
});
test('onboarding: setup rejects unknown arguments and missing npm without starting a tutorial', () => {
  const invalid = invoke(['tools/setup.mjs','--erase']);
  assert.equal(invalid.status, 2); assert.match(invalid.stderr, /no arguments/);
  const missing = invoke(['tools/setup.mjs'], {...process.env, PATH:''});
  assert.equal(missing.status, 2); assert.match(missing.stderr, /npm unavailable/);
  assert(!existsSync(join(scratch,'runs')));
});
test('onboarding: immutable-package diagnosis is concise and does not rewrite the index', () => {
  const index = readFileSync(join(scratch,'PACKAGE-FILES.json'));
  writeFileSync(join(scratch,'notes.txt'),'An intentional local edit.\n');
  const check = invoke(['tools/verify-package.mjs']);
  assert.equal(check.status, 1); assert.match(check.stderr, /notes.txt/);
  assert.match(check.stderr, /intentional development changes/); assert(check.stderr.length < 2000);
  assert.deepEqual(readFileSync(join(scratch,'PACKAGE-FILES.json')), index);
  rmSync(join(scratch,'notes.txt'));
});
test('onboarding: missing Python is caught before any Node tests start', () => {
  symlinkSync(join(ROOT,'node_modules'),join(scratch,'node_modules'),'dir');
  const check = invoke(['tools/test.mjs'], {...process.env, PATH:''});
  assert.equal(check.status, 2); assert.match(check.stderr, /Python 3.9\+ unavailable/);
  assert.match(check.stderr, /--node-only/); assert.equal(check.stdout, '');
});
test('onboarding: repeat starter runs preserve prior evidence and print usable inspection commands', () => {
  const one = invoke(['tutorial/start.mjs']);
  assert.equal(one.status, 0, one.stderr);
  const name = /Your new case: (demo-[a-f0-9]+)/.exec(one.stdout)?.[1]; assert(name);
  const historyPath = join(scratch,'integrations/core-0.2-reference/cases',name,'history.jsonl');
  const before = readFileSync(historyPath);
  assert.equal(invoke(['tutorial/cli.mjs','inspect',name]).status,0);
  const two = invoke(['tutorial/start.mjs','--deny-review','--packet']);
  assert.equal(two.status, 0, two.stderr); assert.match(two.stdout, /note write is refused/);
  const next = /Your new case: (demo-[a-f0-9]+)/.exec(two.stdout)?.[1]; assert(next && name !== next);
  assert.deepEqual(readFileSync(historyPath),before);
  assert.equal(readdirSync(join(scratch,'runs')).length,2);
  const collision = invoke(['tutorial/cli.mjs','run','--case',name]);
  assert.equal(collision.status,1); assert.match(collision.stderr,/Inspect it:/);
  assert.deepEqual(readFileSync(historyPath),before);
  const missing = invoke(['tutorial/cli.mjs','inspect','absent']);
  assert.equal(missing.status,1); assert.match(missing.stderr,/No completed result/);
  clean = true;
});
