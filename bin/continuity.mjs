#!/usr/bin/env node
// Adapted contributed command vocabulary. Explicit local file access is an
// operator capability; the MCP surface separately permits only named sources.
import { resolve } from 'node:path';
import { runObservation } from '../lib/reader-runner.mjs';
import { OPERATIONS, ReaderError, fail } from '../lib/reader-contract.mjs';
const help = `Continuity retained-history reader (observation only)

node bin/continuity.mjs OPERATION --file HISTORY [options]
Operations: verify, status, check, why, responsible, survives, handover_report
For check/why/responsible: --actor ID --action NAME --resource ID [--amount DECIMAL]
For survives: --agent ID
All operations: --at DECIMAL (default: observed head time), --json

HISTORY is an explicit local file: canonical history.jsonl or a JSON event array.
Output identifies its observed head and time. ALLOW is not an execution capability.
No signing, writes, execution, chain access or model service. See docs/READER.md.
`;
try {
  const [operation, ...rest] = process.argv.slice(2);
  if (operation === undefined || ['--help', '-h'].includes(operation)) process.stdout.write(help);
  else {
    if (!OPERATIONS.includes(operation)) fail('UNKNOWN_OPERATION');
    const options = Object.create(null);
    for (let i = 0; i < rest.length; i++) {
      const flag = rest[i];
      if (!['--file', '--actor', '--action', '--resource', '--amount', '--agent', '--at', '--json'].includes(flag) || Object.hasOwn(options, flag.slice(2))) fail('INVALID_ARGUMENTS');
      if (flag === '--json') options.json = true;
      else {
        const val = rest[++i];
        if (!val || val.startsWith('--')) fail('INVALID_ARGUMENTS');
        options[flag.slice(2)] = val;
      }
    }
    const { file, json, ...args } = options;
    if (typeof file !== 'string' || file.length > 4096) fail('FILE_REQUIRED');
    const result = runObservation({ path: resolve(file), source: 'local-file', disclosure: 'evidence' }, operation, args);
    process.stdout.write(JSON.stringify(result, null, json ? undefined : 2) + '\n');
    if (result.decision === 'DENY') process.exitCode = 3;
    else if (result.decision === 'INDETERMINATE' || result.replayStatus !== 'ACCEPTED' || (result.result && result.result.epistemicStatus !== 'ESTABLISHED')) process.exitCode = 4;
  }
} catch (error) {
  process.stderr.write(JSON.stringify({ error: error instanceof ReaderError ? error.code : 'READER_FAILED' }) + '\n');
  process.exitCode = 2;
}
