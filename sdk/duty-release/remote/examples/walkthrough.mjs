import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  createToolRegistry, REFERENCE_TOOLS, createCooperativeDestination,
  createCooperativeClient, createCooperativeExecutor, createCooperativeRecovery,
} from '@ramex-labs/continuity-remote';
import { createLocalDomain, createLocalReviewOwner } from '@ramex-labs/continuity-remote/local';
import { openLocalAttemptRecorder, inspectAttemptHistory } from '@ramex-labs/continuity-remote/attempts';

// All effects stay in the supplied synthetic service on 127.0.0.1.
// Fresh private keys stay in memory; no key or credential is printed or saved.
const directory = realpathSync(mkdtempSync(join(tmpdir(), 'continuity-walkthrough-')));
let destination;
try {
  const now = () => Math.floor(Date.now() / 1000);
  const expiresAt = now() + 3600;
  const coordinator = generateKeyPairSync('ed25519');
  const provider = generateKeyPairSync('ed25519');
  const firstKey = privateKeyToAccount(generatePrivateKey());
  const replacementKey = privateKeyToAccount(generatePrivateKey());
  const serviceId = `synthetic:${randomUUID()}`;
  const registry = createToolRegistry({ serviceId, account: 'example',
    tools: REFERENCE_TOOLS.filter(tool => tool.id === 'ticket.create') });
  const local = { historyFile: join(directory, 'history.jsonl'), domain: createLocalDomain(),
    owner: 'operations', controller: 'example-application', now,
    session: 'session:first', signHash: hash => firstKey.signMessage({ message: { raw: hash } }) };

  // The application owner creates the role, runtime and narrowly scoped power.
  const owner = createLocalReviewOwner(local); // Explicit E6 review-enabled history.
  owner.createAgent({ id: 'first' });
  owner.createRole({ id: 'operator' });
  owner.appoint({ agent: 'first', role: 'operator', tenure: 'shift:1', number: 1 });
  owner.admitRuntime({ agent: 'first', session: local.session, epoch: 1,
    key: 'key:first', address: firstKey.address, expiresAt });
  owner.grant({ id: 'ticket-power', to: 'first', actions: ['create-ticket'],
    resources: ['queue:security'], expiresAt });

  const destinationDirectory = join(directory, 'destination');
  mkdirSync(destinationDirectory, { mode: 0o700 });
  destination = await createCooperativeDestination({ directory: destinationDirectory,
    domain: local.domain, serviceId, coordinatorPublicKey: coordinator.publicKey,
    servicePrivateKey: provider.privateKey, now, validateOperation: registry.validateOperation });
  const client = createCooperativeClient({ url: destination.url, serviceId,
    coordinatorPrivateKey: coordinator.privateKey, servicePublicKey: provider.publicKey, timeoutMs: 10000 });
  const dispatchCalls = { prepare: 0, commit: 0 };
  const lostReplyClient = { ...client,
    async prepare(operation) { dispatchCalls.prepare++; return client.prepare(operation); },
    async commit(key) {
      dispatchCalls.commit++;
      await client.commit(key); // The real synthetic destination commits its effect.
      throw new Error('Simulated lost reply after destination commit');
    },
  };
  const executor = createCooperativeExecutor({ local, client: lostReplyClient, registry, role: 'operator', tenure: 'shift:1' });
  const request = { operationId: 'ticket:1', businessKey: 'case:1', tool: 'ticket.create',
    arguments: { title: 'Review this synthetic incident' } };

  const first = await executor.run(request);
  assert.equal(first.execution.invocation.status, 'OUTCOME_UNKNOWN');
  assert.equal(first.serviceReport, null);
  assert.equal(destination.inspect().effects.length, 1);
  assert.deepEqual(dispatchCalls, { prepare: 1, commit: 1 });
  console.log('1. The synthetic ticket was created, but its reply was lost: OUTCOME_UNKNOWN.');

  owner.revoke('ticket-power');
  assert.equal((await executor.checkpoint()).result.state, 'CHECKPOINTED');
  const refused = await executor.run({ ...request, operationId: 'ticket:2', businessKey: 'case:2' });
  assert.equal(refused.execution.status, 'NOT_AUTHORIZED');
  assert.equal(destination.inspect().effects.length, 1);
  console.log('2. Revocation was acknowledged by the destination; a new operation was refused.');

  // Investigating an old attempt is a separate permission from creating tickets.
  owner.grant({ id: 'first-investigation', to: 'first', actions: ['CREATE_ATTEMPT_DUTY'],
    resources: [request.operationId], expiresAt });
  const firstRecorder = openLocalAttemptRecorder(local);
  await firstRecorder.createDuty({ id: 'investigation', intent: request.operationId,
    description: 'Review the retained report and document what remains unproven', deadline: expiresAt });

  owner.createAgent({ id: 'replacement' });
  owner.declareSuccession({ id: 'handover-rule', from: 'first', to: 'replacement', role: 'operator' });
  owner.succeed({ id: 'handover', rule: 'handover-rule', fromAgent: 'first', fromTenure: 'shift:1',
    toAgent: 'replacement', toTenure: 'shift:2', role: 'operator', number: 2 });
  owner.admitRuntime({ agent: 'replacement', session: 'session:replacement', epoch: 1,
    key: 'key:replacement', address: replacementKey.address, expiresAt });
  owner.grant({ id: 'replacement-investigation', to: 'replacement',
    actions: ['ASSIGN_ATTEMPT_DUTY', 'OBSERVE_OUTCOME', 'CLOSE_ATTEMPT_DUTY'],
    resources: [request.operationId], expiresAt });
  assert.equal(owner.authorize({ actor: 'replacement', action: 'create-ticket', resource: 'queue:security' }).decision, 'DENY');

  const replacementLocal = { ...local, session: 'session:replacement',
    signHash: hash => replacementKey.signMessage({ message: { raw: hash } }) };
  const replacement = openLocalAttemptRecorder(replacementLocal);
  await replacement.assignDuty({ id: 'take-investigation', duty: 'investigation' });

  // After retirement, repeating the old operation only reconciles; it cannot
  // regain execution power or record a new execution acknowledgment.
  const repeated = await executor.run(request);
  assert.equal(repeated.execution.status, 'RECONCILIATION_ONLY');
  assert.equal(repeated.execution.result.status, 'OUTCOME_UNKNOWN');
  assert.deepEqual(dispatchCalls, { prepare: 1, commit: 1 });
  assert.equal(destination.inspect().effects.length, 1);

  // Recovery asks for authenticated retained status. It never resends the tool.
  const recovery = createCooperativeRecovery({ local: replacementLocal, client, registry });
  const recovered = await recovery.lookup(request);
  assert.equal(recovered.serviceReport.result.state, 'APPLIED');
  assert.equal(recovered.dispatchPerformed, false);
  assert.equal(recovered.externalOutcome, 'NOT_PROVEN');
  const acknowledgment = recovered.observationAcknowledgment;
  assert.equal(acknowledgment.result.kind, 'REMOTE_SERVICE_REPORTED');
  await replacement.observe({ id: 'late-retained-report', intent: request.operationId, acknowledgment });
  const summary = 'Reviewed the retained synthetic service report; business fulfillment remains unproven.';
  const summaryDigest = `0x${createHash('sha256').update(summary).digest('hex')}`;
  await replacement.reviewDuty({ id: 'review:1', duty: 'investigation', summaryDigest });

  const attempt = inspectAttemptHistory(owner.exportHistory()).attempts.find(item => item.intentId === request.operationId);
  assert.equal(attempt.originalActorId, 'first');
  assert.equal(attempt.observations[0].actorId, 'replacement');
  assert.deepEqual(attempt.observations[0].acknowledgment, acknowledgment);
  assert.equal(attempt.duty.currentAssigneeId, 'replacement');
  assert.equal(attempt.duty.reviewStatus, 'REVIEW_CLOSED');
  assert.equal(attempt.duty.record.status, 'OPEN');
  assert.equal(attempt.externalOutcome, 'NOT_PROVEN');
  assert.equal(destination.inspect().effects.length, 1);
  assert.deepEqual(dispatchCalls, { prepare: 1, commit: 1 });
  console.log('3. After handover, the replacement recovered and recorded the report; no operation was resent.');
  console.log('4. Review: REVIEW_CLOSED. Duty record: OPEN. External outcome: NOT_PROVEN.');
  console.log('All assertions passed; no LLM or real external service was used.');
} finally {
  try { await destination?.close(); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}
