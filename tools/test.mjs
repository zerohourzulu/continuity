/** Public verification entry; no downloads, fixture regeneration or live services. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
if (Number(process.versions.node.split('.')[0]) !== 24) {
  console.error('Use Node24, the supported evaluation runtime.');
  process.exit(2);
}
for (const [command, args] of [
  [process.execPath, ['--test', 'tests/*.test.mjs', 'packages/core-0.2/test/*.test.mjs']],
  ['python3', ['-B', '-m', 'unittest', 'discover', '-s', 'conformance', '-p', 'test_runner.py', '-v']],
]) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', timeout: 600000,
    env: { ...process.env, CONTINUITY_NODE: process.execPath, PYTHONDONTWRITEBYTECODE: '1' } });
  if (result.error || result.status !== 0) {
    console.error('Verification did not complete successfully:', result.error?.message ?? result.signal ?? `exit ${result.status}`);
    process.exit(result.status && result.status > 0 ? result.status : 2);
  }
}
console.log('Selected local verification passed. This is not complete protocol certification or production assurance.');
