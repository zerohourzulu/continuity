// Run with `npm run demo`. All effects and credentials are disposable fixtures.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { setup, disposition } from './helpers.mjs';
import { createBroker } from './broker.mjs';
import * as core from '../packages/core-0.2/src/core/index.ts';
import { stateOf } from '../packages/core-0.3/src/local-store.ts';
import { openLocalAttemptRecorder, inspectAttemptHistory } from '../packages/core-0.3/src/attempts.ts';

let cleanup;
try {
  const lab = await setup({ after: callback => { cleanup = callback; } }, 'delayed-response');
  const broker = createBroker({ ...lab.options, timeoutMs: 5000 });
  const running = broker.run(lab.request);
  await lab.service.waitForRequest();
  console.log('1. Bea sent one request. The service acted, but its reply is delayed.');

  lab.owner.createAgent({ id: 'cam' });
  lab.owner.declareSuccession({ id: 'next-shift', from: 'bea', to: 'cam', role: 'operator' });
  lab.owner.succeed({ id: 'next-shift', rule: 'next-shift', fromAgent: 'bea', fromTenure: 'shift:1',
    toAgent: 'cam', toTenure: 'shift:2', role: 'operator', number: 2 });
  const cam = privateKeyToAccount(generatePrivateKey());
  lab.owner.admitRuntime({ agent: 'cam', session: 'cam:session', epoch: 1, key: 'cam:key',
    address: cam.address, expiresAt: 10000 });
  lab.owner.grant({ id: 'cam:recording', to: 'cam',
    actions: ['OBSERVE_OUTCOME', 'CREATE_ATTEMPT_DUTY'], resources: ['job:1'], expiresAt: 9999 });
  const recorder = openLocalAttemptRecorder({ ...lab.options, session: 'cam:session',
    signHash: hash => cam.signMessage({ message: { raw: hash } }) });
  await recorder.createDuty({ id: 'resolve-ticket', intent: 'job:1',
    description: 'Find out whether the ticket was created and report any uncertainty.', deadline: 2000 });
  console.log('2. Cam takes over. A duty exists before a report or receipt exists.');

  lab.service.release();
  const reply = await running;
  assert.equal(disposition(reply), 'OUTCOME_UNKNOWN');
  assert.equal(reply.providerReportStatus, 'UNRECORDED_REPORT');
  // The trusted fixture validates the report against the original admission.
  // A real provider needs its own authenticated lookup/retention contract.
  const admission = stateOf(lab.owner.exportHistory()).intentAdmissions.get('job:1');
  const digest = '0x' + createHash('sha256').update(JSON.stringify(reply.providerReport)).digest('hex');
  const acknowledgment = core.createRemoteServiceReportAcknowledgment(admission.adapterIdentity, digest);
  await recorder.observe({ id: 'late-ticket-report', intent: 'job:1', acknowledgment });
  console.log('3. Cam records the late report. Bea is still retired; the action is not sent again.');

  const result = inspectAttemptHistory(lab.owner.exportHistory()).attempts[0];
  const state = stateOf(lab.owner.exportHistory());
  assert.equal(lab.service.stats().effects, 1);
  assert.equal(lab.service.stats().requests, 1);
  assert.equal(state.intentConsumptions.size, 0);
  assert.equal(result.duty.record.status, 'OPEN');
  assert.equal(lab.owner.authorize({ actor: 'cam', action: 'create-ticket', resource: 'queue:security' }).decision, 'DENY');
  console.log(JSON.stringify({
    originalActor: result.originalActorId,
    reportRecorder: result.observations[0].actorId,
    responsibleRole: result.durableRoleId,
    currentAssignee: result.duty.currentAssigneeId,
    reportStatus: result.reportStatus,
    dutyStatus: result.duty.record.status,
    externalOutcome: result.externalOutcome,
    actualFixtureRequests: lab.service.stats().requests,
    actualFixtureEffects: lab.service.stats().effects,
    newExecutionPermission: false,
  }, null, 2));
  console.log('A recorded report is evidence to investigate, not proof that the provider told the truth.');
} finally {
  await cleanup?.();
}
