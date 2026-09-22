// Local setup checks only. No downloads, event writes or authority decisions.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export const ROOT = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
export const NODE_RANGE = 'Node 22.18+ (22.x), 24.x or 26.x';
export const TARGETS = ['reader', 'tutorial', 'test', 'setup'];
export function supportedNode(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const [, major, minor] = match.map(Number);
  return major === 22 ? minor >= 18 : major === 24 || major === 26;
}
function command(name, args) {
  const r = spawnSync(name, args, { cwd: ROOT, encoding: 'utf8', timeout: 5000, maxBuffer: 4096 });
  return !r.error && r.status === 0 ? r.stdout.trim() : null;
}
export function checks(target) {
  if (!TARGETS.includes(target)) throw Error('Choose reader, tutorial, test or setup.');
  const rows = [
    { id: 'node', ok: supportedNode(process.versions.node), detail: `Node ${process.versions.node}`, fix: `Use ${NODE_RANGE}; prefer the latest patch of your chosen release.` },
    { id: 'platform', ok: ['darwin', 'linux'].includes(process.platform), detail: process.platform, fix: 'This edition supports macOS and Linux. Native Windows is not yet validated.' },
  ];
  if (['tutorial', 'test'].includes(target)) {
    let installed = false;
    try { createRequire(new URL('../packages/core/package.json', import.meta.url)).resolve('viem/accounts'); installed = true; } catch {}
    rows.push({ id: 'dependencies', ok: installed, detail: installed ? 'Tutorial dependencies found' : 'Tutorial dependencies missing', fix: 'Run: node tools/setup.mjs' });
  }
  if (target === 'setup') {
    const version = command('npm', ['--version']);
    rows.push({ id: 'npm', ok: version !== null, detail: version ? `npm ${version}` : 'npm unavailable', fix: 'Install a standard supported Node distribution, which includes npm; then open a new terminal. Global pnpm is not required.' });
  }
  if (target === 'test') {
    const version = command('python3', ['-c', 'import sys; print("%d.%d.%d" % sys.version_info[:3]); sys.exit(0 if sys.version_info >= (3,9) else 1)']);
    rows.push({ id: 'python', ok: version !== null, detail: version ? `Python ${version}` : 'Python 3.9+ unavailable', fix: 'Install Python 3.9+ as python3 for the complete suite. For the Node-only subset: node tools/test.mjs --node-only' });
  }
  return rows;
}
export function assertReady(target) {
  const failed = checks(target).filter(row => !row.ok);
  if (failed.length) throw Error(failed.map(row => `${row.detail}. ${row.fix}`).join('\n'));
}
