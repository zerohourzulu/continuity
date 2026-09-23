import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { privateKeyToAccount } from 'viem/accounts';
import * as core from '../packages/core-0.2/src/core/index.ts';
import { evaluatePortableReceiptPolicy } from '../packages/core-0.2/src/core/portable-authority-engine.ts';
import { portableAdmissionControlIsCurrent } from '../packages/core-0.2/src/core/portable-replay.ts';
import { PortableFileEventStore } from '../packages/core-0.2/src/indexer/portable-file-event-store.ts';
import { createLocalAttemptOwner as createLocalOwner, createLocalDomain } from '../packages/core-0.3/src/local-owner.ts';
import { openLocalSimulation, commitTerms } from '../packages/core-0.3/src/simulation.ts';
import { openLocalExecution } from '../packages/core-0.3/src/execution.ts';
import { stateOf } from '../packages/core-0.3/src/local-store.ts';

// Fixed, known-public signing material and effect-free adapters only.
const account = privateKeyToAccount(`0x${'11'.repeat(32)}`);
const maximum = (1n << 256n) - 1n;
const baseGrant = { id: 'budget', to: 'buyer', actions: ['spend'], resources: ['synthetic-ledger'], expiresAt: 150 };
function fixture(t, limits = {}, additionalPolicy) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'continuity-amount-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const config = { historyFile: join(dir, 'history.jsonl'), domain: createLocalDomain(), owner: 'owner', controller: 'controller', now: () => 100 };
  const owner = createLocalOwner(config);
  owner.createAgent({ id: 'buyer' }); owner.createRole({ id: 'buyer-role' });
  owner.appoint({ agent: 'buyer', role: 'buyer-role', tenure: 'tenure:1', number: 1 });
  owner.admitRuntime({ agent: 'buyer', session: 'session:1', epoch: 1, key: 'key:1', address: account.address, expiresAt: 1000 });
  owner.grant({ ...baseGrant, ...limits });
  const options = { ...config, session: 'session:1', signHash: hash => account.signMessage({ message: { raw: hash } }),
    ...(additionalPolicy ? { additionalPolicy } : {}) };
  return { dir, config, owner, options, simulation: openLocalSimulation(options), state: () => stateOf(owner.exportHistory()) };
}
const operation = (id, fields = {}) => ({ id, action: 'spend', resource: 'synthetic-ledger', role: 'buyer-role', tenure: 'tenure:1',
  termsCommitment: commitTerms({ currency: 'SYNTHETIC_UNITS', agreement: 'fixture' }), ...fields });
const code = expected => error => error.code === expected;
const usage = s => s.state().authorityUsage.get('budget');
const proofFor = (state, id) => state.events[state.intentAdmissions.get(id).admissionEventPosition].data.authorizationProof;
function pendingExecution(s) {
  let submissions = 0;
  const unknown = input => {
    const identity = core.derivePortableAdapterIdentity(input);
    return { status: 'OUTCOME_UNKNOWN', idempotencyKey: identity.idempotencyKey, submissionFingerprint: identity.submissionFingerprint };
  };
  const adapter = { adapterProfile: core.approvedPortableAdapterProfile(core.SIMULATED_ADAPTER_ID),
    async submit(input) { submissions++; return unknown(input); }, reconcile: unknown };
  return { run: openLocalExecution(s.options, adapter, 'SIMULATION').run, submissions: () => submissions };
}

test('two synthetic amounts reserve the exact budget and bind counterparty into declaration and signed request', async t => {
  const s = fixture(t, { maxAmount: 60n, maxCumulativeAmount: 100n, maxTransactions: 2 });
  for (const [id, amount] of [['purchase:1', 60n], ['purchase:2', 40n]]) {
    const op = operation(id, { amount, counterparty: 'vendor:fixture' });
    const result = await s.simulation.run(op);
    assert.equal(result.status, 'SIMULATION_RESULT'); assert.equal(result.invocation.status, 'SUBMITTED');
    const state = s.state(), declaration = state.intentDeclarations.get(id).data, proof = proofFor(state, id);
    assert.equal(declaration.amount, amount); assert.equal(declaration.counterpartyId, 'vendor:fixture');
    assert.equal(proof.request.amount, amount); assert.equal(proof.request.counterpartyId, 'vendor:fixture');
    assert.equal(proof.request.termsCommitment, op.termsCommitment);
  }
  assert.equal(usage(s).admittedCumulativeAmount, 100n); assert.equal(usage(s).admittedTransactionCount, 2);
  const before = readFileSync(s.config.historyFile);
  const denied = await s.simulation.run(operation('purchase:3', { amount: 1n, counterparty: 'vendor:fixture' }));
  assert.equal(denied.status, 'NOT_AUTHORIZED'); assert.equal(denied.evidence.code, 'CUMULATIVE_AMOUNT_EXCEEDED');
  assert.deepEqual(readFileSync(s.config.historyFile), before);
  assert.equal((await s.simulation.run(operation('purchase:1', { amount: 60n, counterparty: 'vendor:fixture' }))).status, 'RECONCILIATION_ONLY');
  await assert.rejects(s.simulation.run(operation('purchase:1', { amount: 59n, counterparty: 'vendor:fixture' })), code('OPERATION_CONFLICT'));
  await assert.rejects(s.simulation.run(operation('purchase:1', { amount: 60n, counterparty: 'another-vendor' })), code('OPERATION_CONFLICT'));
  assert.equal(usage(s).admittedCumulativeAmount, 100n); assert.equal(usage(s).admittedTransactionCount, 2);
});

test('quantity-bearing grants require amount; zero and exact uint256 maximum remain representable', async t => {
  const zero = fixture(t, { maxAmount: 0n, maxCumulativeAmount: 0n, maxTransactions: 1 });
  const missing = await zero.simulation.run(operation('missing'));
  assert.equal(missing.status, 'NOT_AUTHORIZED'); assert.equal(missing.evidence.code, 'AMOUNT_REQUIRED');
  const positive = await zero.simulation.run(operation('positive', { amount: 1n }));
  assert.equal(positive.evidence.code, 'AMOUNT_EXCEEDED');
  assert.equal((await zero.simulation.run(operation('zero', { amount: 0n }))).invocation.status, 'SUBMITTED');
  const large = fixture(t, { maxAmount: maximum, maxCumulativeAmount: maximum, maxTransactions: 1 });
  assert.equal((await large.simulation.run(operation('maximum', { amount: maximum }))).invocation.status, 'SUBMITTED');
  assert.equal(usage(large).admittedCumulativeAmount, maximum);
});

test('a count-only grant stays nonquantitative and neither a zero quota nor exhaustion permits admission', async t => {
  const s = fixture(t, { maxTransactions: 1 });
  assert.equal(s.state().authorities.get('budget').grant.constraints.quantitative, false);
  assert.equal((await s.simulation.run(operation('first'))).invocation.status, 'SUBMITTED');
  const denied = await s.simulation.run(operation('second'));
  assert.equal(denied.evidence.code, 'TRANSACTION_COUNT_EXCEEDED');
  const zero = fixture(t, { maxTransactions: 0 });
  assert.equal((await zero.simulation.run(operation('never'))).evidence.code, 'TRANSACTION_COUNT_EXCEEDED');
});

test('malformed amount, counterparty and limit fields fail before any history write', async t => {
  const s = fixture(t);
  const before = readFileSync(s.config.historyFile);
  for (const amount of [-1n, 1n << 256n, 1, 0.1, '1', undefined]) {
    await assert.rejects(s.simulation.run(operation('invalid', { amount })), code('INVALID_INPUT'));
    assert.deepEqual(readFileSync(s.config.historyFile), before);
  }
  for (const counterparty of ['', 123, undefined]) {
    await assert.rejects(s.simulation.run(operation('invalid', { counterparty })), code('INVALID_INPUT'));
  }
  for (const field of ['maxAmount', 'maxCumulativeAmount']) {
    for (const value of [-1n, 1n << 256n, 1, undefined]) {
      assert.throws(() => s.owner.grant({ ...baseGrant, id: 'invalid', [field]: value }), code('INVALID_INPUT'));
    }
  }
  for (const maxTransactions of [-1, -0, 1n, 0.5, Number.MAX_SAFE_INTEGER + 1, undefined]) {
    assert.throws(() => s.owner.grant({ ...baseGrant, id: 'invalid', maxTransactions }), code('INVALID_INPUT'));
  }
  assert.deepEqual(readFileSync(s.config.historyFile), before);
});

test('additional policy receives amount and counterparty in its exact request hash', async t => {
  const seen = [], audit = [];
  const additionalPolicy = { identity: 'business-policy', evaluate(request) {
    seen.push(request); const { requestHash, ...body } = request;
    assert.equal(requestHash, core.hashCanonical(body));
    return { identity: request.identity, requestHash, decision: 'ALLOW', diagnostics: [] };
  }, record: evidence => audit.push(evidence) };
  const s = fixture(t, { maxAmount: 50n }, additionalPolicy);
  assert.equal((await s.simulation.run(operation('policy', { amount: 40n, counterparty: 'vendor' }))).invocation.status, 'SUBMITTED');
  assert.equal(seen.length, 1); assert.equal(seen[0].amount, 40n); assert.equal(seen[0].counterparty, 'vendor');
  assert.equal(audit[0].request.requestHash, seen[0].requestHash);
});

test('a fresh new-request authorization double-counts an already reserved attempt, while original-path liveness does not mutate reservations', async t => {
  const s = fixture(t, { maxAmount: 50n, maxCumulativeAmount: 50n, maxTransactions: 1 });
  const pending = pendingExecution(s), op = operation('pending', { amount: 50n, counterparty: 'vendor' });
  assert.equal((await pending.run(op)).invocation.status, 'OUTCOME_UNKNOWN');
  const state = s.state(), proof = proofFor(state, op.id), before = readFileSync(s.config.historyFile);
  const fresh = core.authorizePortable({ operationVersion: core.PORTABLE_AUTHORIZATION_VERSION,
    events: state.events, expectedHistoryHead: state.head, domain: s.config.domain,
    policyVersion: state.genesis.policyVersion, rootRecognitionPolicy: core.PORTABLE_ROOT_RECOGNITION_POLICY,
    request: proof.request, evaluationTime: 100, authoritative: true, consequential: false });
  assert.equal(fresh.decision, 'DENY'); assert.equal(fresh.code, 'CUMULATIVE_AMOUNT_EXCEEDED');
  assert.equal(evaluatePortableReceiptPolicy(state, proof, 100).live, true);
  assert.equal(portableAdmissionControlIsCurrent(state, op.id, 100), true);
  assert.equal(evaluatePortableReceiptPolicy(state, proof, 99).live, false);
  assert.equal(evaluatePortableReceiptPolicy(state, proof, 150).live, false);
  assert.deepEqual(readFileSync(s.config.historyFile), before);
  assert.equal((await pending.run(op)).status, 'RECONCILIATION_ONLY'); assert.equal(pending.submissions(), 1);
  assert.equal(usage(s).admittedCumulativeAmount, 50n); assert.equal(usage(s).admittedTransactionCount, 1);
  s.owner.revoke('budget');
  s.owner.grant({ ...baseGrant, id: 'replacement-grant', maxAmount: 500n, maxCumulativeAmount: 500n, maxTransactions: 10 });
  assert.equal(s.owner.authorize({ actor: 'buyer', action: 'spend', resource: 'synthetic-ledger', amount: 50n }).decision, 'ALLOW');
  const after = s.state();
  const liveness = evaluatePortableReceiptPolicy(after, proofFor(after, op.id), 100);
  assert.equal(liveness.live, false); assert.ok(liveness.decisiveAuthorityIds.includes('budget'));
  assert.equal(usage(s).admittedCumulativeAmount, 50n);
});

test('original-path liveness observes new global prohibitions and separately requires current control', async t => {
  const s = fixture(t, { maxAmount: 50n, maxCumulativeAmount: 50n, maxTransactions: 1 });
  await pendingExecution(s).run(operation('pending', { amount: 50n }));
  const store = new PortableFileEventStore(s.config.historyFile);
  store.append({ id: 'prohibit:spend', type: 'AUTHORITY_GRANTED', timestamp: 100, data: { grant: {
    kind: 'PROHIBITION', scope: 'GLOBAL', authorityId: 'stop-spend', grantorId: s.state().genesis.globalPolicySourceId, subjectActorId: 'buyer',
    constraints: { actions: ['spend'], resources: ['synthetic-ledger'], quantitative: false, expiresAt: 150, maxDelegationDepth: 0, requiredIntersectionIds: [] },
  } } });
  const blocked = s.state(), result = evaluatePortableReceiptPolicy(blocked, proofFor(blocked, 'pending'), 100);
  assert.equal(result.live, false); assert.ok(result.checkedProhibitionIds.includes('stop-spend'));
  assert.ok(result.decisiveAuthorityIds.includes('stop-spend'));
  assert.equal(portableAdmissionControlIsCurrent(blocked, 'pending', 100), true);
  assert.throws(() => s.owner.revoke('stop-spend'), code('TRANSITION_REJECTED'));
  store.append({ id: 'revoke:stop-spend', type: 'AUTHORITY_REVOKED', timestamp: 100,
    data: { authorityId: 'stop-spend', revokerId: blocked.genesis.globalPolicySourceId } });
  s.owner.advanceEpoch({ agent: 'buyer', from: 1, to: 2 });
  const fenced = s.state();
  assert.equal(evaluatePortableReceiptPolicy(fenced, proofFor(fenced, 'pending'), 100).live, true);
  assert.equal(portableAdmissionControlIsCurrent(fenced, 'pending', 100), false);
  assert.equal(usage(s).admittedCumulativeAmount, 50n); assert.equal(usage(s).admittedTransactionCount, 1);
});
