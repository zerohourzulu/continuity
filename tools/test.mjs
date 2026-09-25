/** Public verification entry; no downloads, fixture regeneration or live services. */
import { spawnSync } from 'node:child_process';
import { assertReady, ROOT } from './environment.mjs';
const args = process.argv.slice(2);
const nodeOnly = args.length === 1 && args[0] === '--node-only';
try {
  if (args.length && !nodeOnly) throw Error('Use: node tools/test.mjs [--node-only]');
  // Check all required prerequisites BEFORE any suite begins.
  assertReady(nodeOnly ? 'tutorial' : 'test');
} catch (error) { console.error(error.message); process.exit(2); }
const commands = [[process.execPath, ['--test', 'tests/*.test.mjs', 'tests/core-0.3/*.test.mjs', 'packages/core-0.2/test/*.test.mjs']]];
if (!nodeOnly) commands.push(['python3', ['-B', '-m', 'unittest', 'discover', '-s', 'conformance', '-p', 'test_runner.py', '-v']]);
// The combined continuation/duty suite exceeds the original ten-minute outer
// budget on hosted runners. Keep all tests; retain a bounded thirty-minute cap.
for (const [command, commandArgs] of commands) {
  const result = spawnSync(command, commandArgs, { cwd: ROOT, stdio: 'inherit', timeout: command === process.execPath ? 1800000 : 600000,
    env: { ...process.env, CONTINUITY_NODE: process.execPath, PYTHONDONTWRITEBYTECODE: '1' } });
  if (result.error || result.status !== 0) {
    console.error('Verification did not complete successfully:', result.error?.message ?? result.signal ?? `exit ${result.status}`);
    process.exit(result.status && result.status > 0 ? result.status : 2);
  }
}
console.log(nodeOnly ? 'Node-only subset passed. Python conformance checks were NOT run; this is not the complete suite.' : 'Selected local verification passed. This is not complete protocol certification or production assurance.');
