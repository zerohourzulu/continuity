// Explicit network step: installs locked dependencies, never a global manager.
import { spawnSync } from 'node:child_process';
import { dirname, delimiter } from 'node:path';
import { assertReady, ROOT } from './environment.mjs';
try {
  if (process.argv.length !== 2) throw Error('Use: node tools/setup.mjs (no arguments). See docs/QUICKSTART.md for the manual install command.');
  assertReady('setup');
  console.log('Installing locked tutorial dependencies with pinned pnpm. Registry access is required; install scripts are disabled.');
  const result = spawnSync('npm', ['exec', '--yes', '--ignore-scripts', '--package=pnpm@11.19.0', '--', 'pnpm', 'install', '--frozen-lockfile', '--ignore-scripts'], {
    cwd: ROOT, stdio: 'inherit', timeout: 180000,
    env: { ...process.env, PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ''}`, npm_config_ignore_scripts: 'true' },
  });
  if (result.error || result.status !== 0) throw Error('Installation did not finish. Check npm/registry access and free disk space, then rerun this command. Keep the lockfile and scripts-disabled options; no tutorial was started. See docs/TROUBLESHOOTING.md.');
  assertReady('tutorial');
  console.log('Setup complete. Next: node tutorial/start.mjs\nTo inspect recorded evidence without tutorial dependencies: node examples/recorded.mjs');
} catch (error) { console.error(error.message); process.exitCode = 2; }
