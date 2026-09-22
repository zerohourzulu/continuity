// Node-only read of a fixed public fixture, not a new tutorial execution.
import { fileURLToPath } from 'node:url';
import { assertReady } from '../tools/environment.mjs';
import { runObservation } from '../lib/reader-runner.mjs';
try {
  if (process.argv.length !== 2) throw Error('Use: node examples/recorded.mjs (no arguments).');
  assertReady('reader');
  console.log('RECORDED CASE — replaying bundled synthetic history; no new action is executed.');
  const source = { path: fileURLToPath(new URL('../tests/fixtures/handover-history.jsonl', import.meta.url)), source: 'bundled-example', disclosure: 'evidence' };
  for (const [label, action, resource] of [
    ['B may review the unfinished investigation', 'record-review-progress', 'obligation:first-look'],
    ['B may collect another evidence packet', 'collect-evidence-packet', 'resource:first-look'],
  ]) {
    const answer = runObservation(source, 'check', { actor: 'b:first-look', action, resource });
    if (answer.replayStatus !== 'ACCEPTED' || !['ALLOW','DENY'].includes(answer.decision)) throw Error('Recorded history could not establish this answer. No action was executed.');
    console.log(`${answer.decision} — ${label}.\n  Reason: ${answer.code ?? 'authorization established'}; history position ${answer.head.position}; evaluation time ${answer.evaluationTime}.`);
  }
  console.log('The duty survives; permission is checked separately. These observations are not permission to execute now.\nGenerate a new case: node tools/setup.mjs, then node tutorial/start.mjs');
} catch (error) { console.error(`Recorded example: ${error.code ?? error.message}\nFor local setup help: node tools/doctor.mjs --for reader`); process.exitCode = 2; }
