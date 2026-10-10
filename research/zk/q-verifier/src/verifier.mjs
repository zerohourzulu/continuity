import { createHash } from 'node:crypto';
import { open, mkdtemp, writeFile, rm, stat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseStrict, canonical, closed, hex, equal, fail, EvidenceError, snapshotPortable } from './strict.mjs';
import { deriveStatement } from './quantitative-statement.mjs';
import { classifyError } from './context.mjs';
const exec = promisify(execFile);
export async function readPortable(path, maxBytes = 8 * 1024 * 1024) {
  const f = await open(path, 'r');
  try {
    const info = await f.stat(); if (!info.isFile() || info.size > maxBytes) fail('INPUT_SIZE');
    const bytes = Buffer.alloc(Math.min(info.size + 1, maxBytes + 1));
    let size = 0;
    while (size < bytes.length) { const r = await f.read(bytes, size, bytes.length - size, null); if (!r.bytesRead) break; size += r.bytesRead; }
    const extra = Buffer.alloc(1); const rest = await f.read(extra, 0, 1, null);
    if (size > maxBytes || rest.bytesRead) fail('INPUT_SIZE');
    return parseStrict(bytes.subarray(0, size), { maxBytes });
  } finally { await f.close(); }
}
async function backendIdentity(backend) {
  closed(backend, ['path', 'sha256', 'suite', 'parametersDigest']);
  if (typeof backend.path !== 'string' || !isAbsolute(backend.path)) fail('BACKEND_CONFIG');
  hex(backend.sha256); hex(backend.parametersDigest);
  if (typeof backend.suite !== 'string' || !backend.suite.length || backend.suite.length > 200) fail('BACKEND_CONFIG');
  const info = await stat(backend.path);
  if (!info.isFile() || info.size > 256 * 1024 * 1024) fail('BACKEND_CONFIG');
  const hash = createHash('sha256').update(await readFile(backend.path)).digest('hex');
  if (hash !== backend.sha256) fail('BACKEND_IDENTITY');
}
// `backend` is trusted local installation configuration. It must never be
// accepted from the dossier or downloaded from a proof-supplied location.
export async function verifyCase({ expected, trust, dossier, proof, backend }) {
  let temp;
  try {
    expected = snapshotPortable(expected); trust = snapshotPortable(trust);
    dossier = snapshotPortable(dossier); proof = snapshotPortable(proof); backend = snapshotPortable(backend);
    const { checked, statement } = deriveStatement(expected, trust, dossier);
    await backendIdentity(backend);
    closed(proof, ['schema', 'suite', 'parametersDigest', 'statementDigest', 'chunks']);
    if (proof.schema !== 'continuity-quantitative-proof/1' || proof.suite !== backend.suite || proof.parametersDigest !== backend.parametersDigest) fail('PROOF_SUITE');
    temp = await mkdtemp(join(tmpdir(), 'continuity-case-verify-'));
    const s = join(temp, 'statement.json'), p = join(temp, 'proof.json');
    await writeFile(s, canonical(statement), { mode: 0o600 });
    await writeFile(p, canonical(proof), { mode: 0o600 });
    let response;
    try {
      const { stdout } = await exec(backend.path, ['verify', '--statement', s, '--proof', p], { maxBuffer: 65536, encoding: 'utf8', windowsHide: true });
      response = parseStrict(stdout, { maxBytes: 65536 });
    } catch (e) {
      if (e instanceof EvidenceError) throw e;
      if (e.killed || e.signal || e.code !== 1) return { status: 'UNVERIFIED', reason: 'BACKEND_UNAVAILABLE_OR_RESOURCE_LIMIT' };
      return { status: 'INVALID_EVIDENCE', reason: 'QUANTITATIVE_PROOF_REJECTED' };
    }
    // Bound to the exact verified statement. Field spelling is deliberately
    // checked here rather than treating exit(0) as sufficient evidence.
    if (response.scope !== 'ARITHMETIC_COMPONENT_ONLY' || response.status !== 'VERIFIED_ARITHMETIC' || response.statementDigest !== proof.statementDigest || response.statementDigest !== createHash('sha256').update(canonical(statement)).digest('hex') || response.parametersDigest !== backend.parametersDigest || !equal(response.endCarry, statement.endCarry)) fail('BACKEND_RESULT');
    return {
      schema: 'continuity.case.result.v1', status: 'VERIFIED_QUANTITATIVE_POLICY', profile: 'Q',
      contextDigest: checked.contextDigest, trustPolicyDigest: checked.trustPolicyDigest,
      inventoryCoverage: 'AUTHENTICATED_COMPLETE_EXPECTED_INTERVAL',
      policyBinding: checked.policyBinding, quantitativeRules: 'VERIFIED_ALL_REQUIRED_PREFIXES',
      corePolicyComputation: checked.corePolicyComputation, measurementTrust: checked.measurementTrust,
      enforcementCoverage: checked.enforcementCoverage, freshness: checked.freshness,
      outcomes: { unresolvedAttempts: checked.unresolvedAttempts, unknownOutcomes: checked.unknownOutcomes },
      serviceCompletion: checked.unresolvedAttempts ? 'UNRESOLVED_WORK_REMAINS' : 'NOT_ESTABLISHED_BY_THIS_PROOF',
      inventoryCount: checked.inventoryCount, chargedAdmissions: checked.admissionCount,
      permitsExecution: false,
    };
  } catch (error) {
    if (error instanceof EvidenceError && ['BACKEND_CONFIG', 'BACKEND_IDENTITY', 'BACKEND_RESULT'].includes(error.code)) return { status: 'UNVERIFIED', reason: error.code };
    return classifyError(error);
  } finally { if (temp) await rm(temp, { recursive: true, force: true }); }
}
