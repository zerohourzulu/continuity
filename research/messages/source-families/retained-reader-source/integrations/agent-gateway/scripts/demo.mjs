import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { openOperatorGateway } from '../src/operator-connection.mjs';

// Trusted operator orchestrates lifecycle and pipe delivery; the agent interface
// itself never receives this launch function, filesystem access, or CLI authority.
const [flag, caseId, ...extra] = process.argv.slice(2);
assert(flag === '--case' && typeof caseId === 'string' && /^[a-z][a-z0-9-]{0,31}$(?![\s\S])/.test(caseId) && !extra.length, 'Use --case NEW_CASE_ID');
const appRoot = fileURLToPath(new URL('../../core-0.2-reference/', import.meta.url));
const caseRoot = join(appRoot, 'cases', caseId);
assert(!existsSync(caseRoot), 'Fresh case required; this driver never retries or overwrites a prior case');
const emit = value => process.stdout.write(JSON.stringify({ recordedAt: new Date().toISOString(), ...value }) + '\n');
const identities = () => {
  const out = [];
  function visit(dir, prefix = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
      const relative = prefix + entry.name;
      assert(!entry.isSymbolicLink(), 'Unexpected case link');
      if (entry.isDirectory()) visit(join(dir, entry.name), relative + '/');
      else { const bytes = readFileSync(join(dir, entry.name)); out.push({ path: relative, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }); }
    }
  }
  visit(caseRoot);
  return out;
};
async function operator(command, ...args) {
  const child = spawn(process.execPath, [join(appRoot, 'src/cli.mjs'), command, caseId, ...args], { env: { PATH: dirname(process.execPath) }, stdio: ['ignore', 'pipe', 'pipe'] });
  const pieces = [[], []]; let total = 0;
  for (const [i, stream] of [child.stdout, child.stderr].entries()) stream.on('data', bytes => { total += bytes.length; if (total > 1024 * 1024) child.kill(); else pieces[i].push(bytes); });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  const stdout = Buffer.concat(pieces[0]).toString('utf8'), stderr = Buffer.concat(pieces[1]).toString('utf8');
  emit({ kind: 'OPERATOR', command, pid: child.pid, exitCode: code, stdout, stderr });
  assert.equal(code, 0, 'Operator command failed; no automatic retry');
  return stdout;
}
async function call(channel, label, tool, args = {}, { ok = true, unchanged = false } = {}) {
  const before = unchanged ? identities() : undefined;
  const response = await channel.agent.request(tool, args);
  const after = unchanged ? identities() : undefined;
  emit({ kind: 'AGENT_REQUEST', label, serverPid: channel.serverPid, tool, args, response, ...(unchanged ? { allCaseFilesUnchanged: JSON.stringify(before) === JSON.stringify(after), before, after } : {}) });
  assert.equal(response.ok, ok, `${label}: unexpected success/refusal`);
  if (unchanged) assert.deepEqual(after, before, `${label}: unexpected retained case mutation`);
  return response;
}
let a, b;
try {
  emit({ kind: 'START', caseId, driverPid: process.pid, scope: 'DETERMINISTIC_SYNTHETIC_MCP_CLIENT; trusted operator lifecycle; no model reasoning claim' });
  await operator('create', join(appRoot, 'fixtures/synthetic-logs'), 'packet');
  a = await openOperatorGateway(caseId, 'a');
  b = await openOperatorGateway(caseId, 'b');
  assert(a.serverPid !== b.serverPid && a.serverPid !== process.pid && b.serverPid !== process.pid, 'Separate trusted server processes required');
  emit({ kind: 'PROCESS_BOUNDARY', driverPid: process.pid, aServerPid: a.serverPid, bServerPid: b.serverPid, aTools: await a.agent.listTools(), bTools: await b.agent.listTools() });
  await call(a, 'initial-status', 'gateway.status');
  await call(a, 'actor-switch-argument-refused', 'gateway.collect', { actor: 'b' }, { ok: false, unchanged: true });
  await call(a, 'a-cannot-use-b-disposition', 'gateway.disposition', {}, { ok: false, unchanged: true });
  await call(a, 'collect-once', 'gateway.collect');
  await call(a, 'repeat-collection-reconciles-only', 'gateway.collect', {}, { unchanged: true });
  await call(b, 'b-cannot-collect', 'gateway.collect', {}, { ok: false, unchanged: true });
  await call(b, 'b-has-no-active-session-yet', 'gateway.note', { fileName: 'auth.log', noteId: 'early-b', note: 'Synthetic early request.' }, { ok: false, unchanged: true });
  const noteA = { fileName: 'agent.log', noteId: 'review-a', note: 'Synthetic request history reviewed; unresolved export observation retained for the successor.' };
  await call(a, 'a-records-progress', 'gateway.note', noteA);
  await call(a, 'identical-note-does-not-write-again', 'gateway.note', noteA, { unchanged: true });
  await operator('handover');
  await call(a, 'stale-a-cannot-collect', 'gateway.collect', {}, { ok: false, unchanged: true });
  await call(a, 'stale-a-cannot-add-progress', 'gateway.note', { fileName: 'auth.log', noteId: 'stale-a', note: 'Synthetic stale request.' }, { ok: false, unchanged: true });
  await call(b, 'successor-sees-inherited-work', 'gateway.status');
  await call(b, 'b-continues-progress', 'gateway.note', { fileName: 'auth.log', noteId: 'review-b', note: 'Synthetic authentication log reviewed under independent successor authority; investigation remains unresolved.' });
  await call(b, 'b-records-unknown-disposition', 'gateway.disposition');
  const final = JSON.parse(await operator('status', '--json'));
  assert.equal(final.packet.status, 'PACKET_VERIFIED');
  assert.equal(final.packet.files.length, 2);
  assert.equal(final.review.recordCount, 2);
  assert.equal(final.duty.status, 'OUTCOME_UNKNOWN');
  assert.equal(final.duty.performer, `b:${caseId}`);
  assert.equal(final.head.position + 1, 25);
  await operator('export');
  emit({ kind: 'COMPLETE', caseId, final, identities: identities(), limits: ['No autonomous model investigation', 'No hostile OS-user isolation or secret key custody', 'No sudden crash or lost-response recovery demonstrated', 'Incident unresolved; receipt is historical after handover'] });
} finally {
  if (a) await a.close();
  if (b) await b.close();
}
