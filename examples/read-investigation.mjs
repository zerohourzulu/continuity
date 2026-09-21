// Compact public reader example. It only inspects an explicit local history.
// Run from the package root: node examples/read-investigation.mjs first-look
import { fileURLToPath } from 'node:url';
import { runObservation } from '../lib/reader-runner.mjs';
const name = process.argv[2];
if (process.argv.length !== 3 || typeof name !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(name)) {
  console.error('Use: node examples/read-investigation.mjs CASE_NAME');
  process.exitCode = 2;
} else {
  try {
    const path = fileURLToPath(new URL(`../integrations/core-0.2-reference/cases/${name}/history.jsonl`, import.meta.url));
    const source = { path, source: 'local-file', disclosure: 'evidence' };
    // Each request captures independently; show the head for every result.
    // For one composite snapshot use handover_report, as the operator guide does.
    for (const [action, resource] of [['record-review-progress', 'obligation'], ['collect-evidence-packet', 'resource']]) {
      const result = runObservation(source, 'check', { actor: `b:${name}`, action, resource: `${resource}:${name}` });
      console.log(JSON.stringify({ actor: `b:${name}`, action, decision: result.decision,
        code: result.code, head: result.head, evaluationTime: result.evaluationTime, scopeNote: result.scopeNote }));
    }
  } catch (error) {
    console.error(JSON.stringify({ error: error.code ?? 'READER_FAILED' }));
    process.exitCode = 2;
  }
}
