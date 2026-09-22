// Convenience around the existing tutorial, preserving every prior case.
import { randomBytes } from 'node:crypto';
import { assertReady } from '../tools/environment.mjs';
import { run, inspect } from './cli.mjs';
try {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--deny-review', '--packet'].includes(arg)) || new Set(args).size !== args.length) throw Error('Use: node tutorial/start.mjs [--deny-review] [--packet]');
  assertReady('tutorial');
  const name = `demo-${randomBytes(6).toString('hex')}`;
  const opts = { name, mode: args.includes('--packet') ? 'packet' : 'simulated', successorReview: args.includes('--deny-review') ? 'deny' : 'allow' };
  const result = await run(opts);
  if (result.status !== 'PASS') throw Error('Tutorial did not complete successfully; retained evidence was not removed.');
  await inspect(name);
  console.log(`\nYour new case: ${name}\nInspect again: node tutorial/cli.mjs inspect ${name}\nRead permissions: node examples/read-investigation.mjs ${name}\nCompare a new denied-review case: node tutorial/start.mjs --deny-review\nBoth commands create separate histories. No earlier case is overwritten.`);
} catch (error) { console.error(`${error.message}\nExisting and partial cases are retained. See docs/TROUBLESHOOTING.md.`); process.exitCode = 1; }
