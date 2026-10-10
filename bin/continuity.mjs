#!/usr/bin/env node
// Adapted contributed command vocabulary. Explicit local file access is an
// operator capability; the MCP surface separately permits only named sources.
import { resolve } from 'node:path';
import { assertReady } from '../tools/environment.mjs';
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
    assertReady('reader');
    const result = runObservation({ path: resolve(file), source: 'local-file', disclosure: 'evidence' }, operation, args);
    process.stdout.write(JSON.stringify(result, null, json ? undefined : 2) + '\n');
    if (result.decision === 'DENY') process.exitCode = 3;
    else if (result.decision === 'INDETERMINATE' || result.replayStatus !== 'ACCEPTED' || (result.result && result.result.epistemicStatus !== 'ESTABLISHED')) process.exitCode = 4;
  }
} catch (error) {
  const code = error instanceof ReaderError ? error.code : 'READER_FAILED';
  const hints = {
    FILE_REQUIRED: 'A usable history path was not supplied: --file is missing, or its path is longer than 4,096 characters. Nothing was read. Supply a shorter valid path. To observe a bundled public example, run node examples/recorded.mjs.',
    SOURCE_UNAVAILABLE: 'The reader could not open or read the history file. Check the path and read permission. For a tutorial case, the history is integrations/core-0.2-reference/cases/<case name>/history.jsonl. You can also observe it by name with node tools/case.mjs status <case name>.',
    UNKNOWN_OPERATION: 'That is not a reader operation. Put the operation first: verify, status, check, why, responsible, survives or handover_report. Full usage: node bin/continuity.mjs --help.',
    INVALID_ARGUMENTS: 'One of the options was not accepted. Each option may appear only once. Every option except --json needs a value that does not start with --. Check the required options: node bin/continuity.mjs --help.',
    READER_FAILED: 'The reader could not finish. This does not judge the history invalid. No consequential action was executed. Check node tools/doctor.mjs --for reader. If it reports ready, the original cause is still unknown; possible causes include a helper failure, unreadable helper output or another unexpected local error. Give the command and error code to the maintainer without private history contents.',
    SOURCE_CHANGED: "The file changed or stopped providing the expected bytes while it was being read. This is not a verdict on the history. Keep the original file and ask its owner for a stable snapshot. Do not edit historical events or automatically replace trusted fingerprints.",
    SOURCE_NOT_REGULAR: "The history source is not a regular file with one link under this reader’s file checks. Choose the original regular history file. Symbolic links, special files and hard-linked files are refused by this reader.",
    SOURCE_BYTES_EXCEEDED: "The selected history exceeds this reader’s two-MiB input limit. Use a supported bounded history observation after discussing scope with the owner. A smaller prefix is a different observation and does not answer the original full-history question.",
    HISTORY_MALFORMED: "The source could not be decoded as this reader’s supported history representation. Compare its encoding with canonical history.jsonl or a JSON event array. Keep the original bytes; do not repair the journal by editing it. node bin/continuity.mjs --help lists the reader interface.",
    HISTORY_INTEGRITY: "The retained file-store record shape, chain or record digest failed this reader’s integrity checks. Preserve the original file and expected record hashes. Ask the history owner to reconcile the records; do not rewrite the journal or declare the entire external history false.",
    HISTORY_EMPTY: "No nonempty event array was decoded from the supplied history. Supply the intended supported history source. node examples/recorded.mjs observes a bundled public example without creating a tutorial case.",
    EVENT_LIMIT_EXCEEDED: "The supplied history has more than the reader’s 256-event limit. Keep the full source. Agree a supported bounded observation with the owner; a shorter history is a different scope, not a successful full-history check.",
    UNSUPPORTED_HISTORY_PROFILE: "The history uses a source-fence, binding, manifest or migration profile this reader does not support. Use a reader that explicitly supports that profile after source-owner diagnosis. Do not strip evidence fields or reinterpret the bytes as this reader’s supported history.",
    INVALID_EVALUATION_TIME: "The requested evaluation time is not a nonnegative safe-integer decimal. Use a decimal --at value within Number.MAX_SAFE_INTEGER; omitting --at selects the observed head time. This only requests an observation, not current external authority.",
    INVALID_AMOUNT: "The requested amount is not a supported nonnegative decimal within the uint256 range. Use a decimal --amount value within the documented request bounds. This reader never signs or sends a payment.",
    REQUEST_LIMIT_EXCEEDED: "The encoded observation request exceeds the reader’s configured input limit of 65,536 bytes. The observed encoded size is not included in this record. Reduce only unintended request text and use the documented operation fields. Changing the request changes what is observed; keep the original request for diagnosis.",
    READER_TIMEOUT: "The reader helper reached its configured default local time limit of 15 seconds. No completed observation was returned; this does not judge the history invalid. A trusted internal test can select a different timeout; this saved code alone does not report that selection. Keep the source and ask the maintainer to diagnose the bounded reader command. This read-only reader executes no consequential action; do not treat a smaller history as verification of the original one.",
    OUTPUT_LIMIT_EXCEEDED: "The observation output exceeded the reader’s configured 262,144-byte result limit or its 266,240-byte child-output capture bound. The observed size and which bound was reached are not included in this record. No complete result was returned. Keep the request and source; ask the maintainer to select a supported observation scope. The reader does not truncate required evidence into a successful answer.",
  };
  // Preserve the exact compact error envelope for explicit machine output.
  process.stderr.write(JSON.stringify({ error: code }) + '\n');
  if (!process.argv.slice(2).includes('--json')) process.stderr.write((hints[code] ?? 'See docs/READER.md and docs/TROUBLESHOOTING.md; no action was executed.') + '\n');
  process.exitCode = 2;
}
