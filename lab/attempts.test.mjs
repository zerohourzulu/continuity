import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {setup,disposition} from './helpers.mjs';
import * as core from '../packages/core-0.2/src/core/index.ts';
import {stateOf} from '../packages/core-0.3/src/local-store.ts';
import {openLocalAttemptRecorder,inspectAttemptHistory} from '../packages/core-0.3/src/attempts.ts';
import {createBroker} from './broker.mjs';
import {observeHistory} from '../packages/core-0.3/src/observation.ts';
const actions=['OBSERVE_OUTCOME','CREATE_ATTEMPT_DUTY','ASSIGN_ATTEMPT_DUTY'];
const grant=(s,to,id=to)=>s.owner.grant({id:`record:${id}`,to,actions,resources:['job:1'],expiresAt:9999});
const ack=(s,digest='0x'+'a'.repeat(64))=>core.createRemoteServiceReportAcknowledgment(stateOf(s.owner.exportHistory()).intentAdmissions.get('job:1').adapterIdentity,digest);
const view=s=>inspectAttemptHistory(s.owner.exportHistory()).attempts[0];
const duty={id:'investigate',intent:'job:1',description:'Determine what happened; escalate if evidence remains missing',deadline:2000};
function replace(s,from,to,number){
  const fromTenure=`shift:${number-1}`,toTenure=`shift:${number}`,rule=`rule:${number}`;
  s.owner.createAgent({id:to});
  s.owner.declareSuccession({id:rule,from,to,role:'operator'});
  s.owner.succeed({id:`handover:${number}`,rule,fromAgent:from,fromTenure,toAgent:to,toTenure,role:'operator',number});
  const account=privateKeyToAccount(generatePrivateKey());
  s.owner.admitRuntime({agent:to,session:`session:${to}`,epoch:1,key:`key:${to}`,address:account.address,expiresAt:10000});
  return {...s.options,session:`session:${to}`,tenure:toTenure,signHash:hash=>account.signMessage({message:{raw:hash}})};
}

test('late actual provider response is recorded by a separately authorized successor without consumption or another effect',async t=>{
  const s=await setup(t,'delayed-response');const running=s.broker.run(s.request);
  await s.service.waitForRequest();const next=replace(s,'bea','cam',2);s.service.release();
  const answer=await running;assert.equal(disposition(answer),'OUTCOME_UNKNOWN');
  assert.equal(answer.providerReportStatus,'UNRECORDED_REPORT');assert.equal(s.service.stats().effects,1);
  const digest='0x'+createHash('sha256').update(JSON.stringify(answer.providerReport)).digest('hex');
  const acknowledgment=ack(s,digest),recorder=openLocalAttemptRecorder(next);
  await assert.rejects(recorder.observe({id:'late',intent:'job:1',acknowledgment})); // role alone cannot record
  grant(s,'cam');const before=stateOf(s.owner.exportHistory()),stats=s.service.stats();
  await recorder.observe({id:'late',intent:'job:1',acknowledgment});
  const after=stateOf(s.owner.exportHistory());
  assert.equal(after.intentConsumptions.size,0);assert.equal(after.receiptCommitments.size,0);
  assert.deepEqual([...after.intentAdmissions],[...before.intentAdmissions]);
  assert.deepEqual([...after.intentOutcomeStates],[...before.intentOutcomeStates]);
  assert.deepEqual([...after.authorityUsage],[...before.authorityUsage]);
  assert.deepEqual([...after.nonceReservationsByActor],[...before.nonceReservationsByActor]);
  assert.deepEqual(s.service.stats(),stats);
  assert.equal(view(s).originalActorId,'bea');assert.equal(view(s).observations[0].actorId,'cam');
  assert.equal(view(s).externalOutcome,'NOT_PROVEN');assert.equal(view(s).reportStatus,'REPORT_RECORDED');
  const n=s.owner.exportHistory().length;
  await recorder.observe({id:'late',intent:'job:1',acknowledgment});assert.equal(s.owner.exportHistory().length,n);
  await assert.rejects(openLocalAttemptRecorder(s.options).observe({id:'old-agent',intent:'job:1',acknowledgment}));
  await assert.rejects(core.createPortableReceipt({events:s.owner.exportHistory(),intentId:'job:1',issuedAt:100,externalOutcome:'NOT_PROVEN'},
    {keyId:'key:1',signHash:s.options.signHash}));
  await assert.rejects(createBroker(next).run(s.request),e=>e.code==='OPERATION_CONFLICT');
  assert.equal(s.service.stats().requests,1);
  for(const who of ['bea','cam']){const q=s.owner.survives(who);assert.equal(q.epistemicStatus,'ESTABLISHED');
    assert.equal(q.answer.outcomeObservations.length,1);assert.equal(q.answer.outcomeObservations[0].externalOutcome,'NOT_PROVEN');}
  assert.equal(s.owner.survives('bea').answer.unresolvedIntents[0].intentId,'job:1');
});

test('an uncertain admission can carry a duty before any report, consumption or receipt',async t=>{
  const s=await setup(t,'pending');assert.equal(disposition(await s.broker.run(s.request)),'OUTCOME_UNKNOWN');
  grant(s,'bea');const recorder=openLocalAttemptRecorder(s.options),before=stateOf(s.owner.exportHistory());
  await recorder.createDuty(duty);const after=stateOf(s.owner.exportHistory()),item=view(s);
  assert.equal(item.reportStatus,'NO_RECORDED_REPORTS');assert.equal(item.duty.record.status,'OPEN');
  assert.equal(item.duty.creationActorId,'bea');assert.equal(item.duty.record.durableRoleId,'operator');
  assert.equal(item.duty.currentAssigneeId,'bea');assert.equal(after.intentConsumptions.size,0);assert.equal(after.receiptCommitments.size,0);
  assert.deepEqual([...after.authorityUsage],[...before.authorityUsage]);
  await recorder.createDuty(duty);assert.equal(stateOf(s.owner.exportHistory()).attemptDuties.size,1);
  await assert.rejects(recorder.createDuty({...duty,id:'second-duty'}));
  await assert.rejects(recorder.createDuty({...duty,description:'Replace the meaning'}));
  await assert.rejects(recorder.assignDuty({id:'self',duty:'investigate'}));
  const survives=s.owner.survives('bea');assert.equal(survives.epistemicStatus,'ESTABLISHED');
  assert.equal(survives.answer.attemptDuties[0].status,'OPEN');assert.equal(survives.answer.obligations.length,0);
  assert.equal(Object.hasOwn(survives.answer.attemptDuties[0],'description'),false); // minimal public projection
  assert.equal(view(s).duty.record.description,duty.description);
  assert.equal(s.service.stats().effects,0);assert.equal(s.service.stats().requests,1);
});

test('explicit assignments survive two role handovers while source, initial assignee and old powers stay unchanged',async t=>{
  const s=await setup(t,'pending');await s.broker.run(s.request);grant(s,'bea');
  const first=openLocalAttemptRecorder(s.options);await first.createDuty(duty);
  await first.observe({id:'initial-report',intent:'job:1',acknowledgment:ack(s)});
  const initial=view(s).duty.record;
  const cam=replace(s,'bea','cam',2),second=openLocalAttemptRecorder(cam);
  assert.equal(view(s).duty.currentAssigneeId,'bea'); // transfer alone does not silently assign work
  await assert.rejects(second.assignDuty({id:'to-cam',duty:'investigate'}));grant(s,'cam');
  await second.assignDuty({id:'to-cam',duty:'investigate'});
  const dee=replace(s,'cam','dee',3),third=openLocalAttemptRecorder(dee);grant(s,'dee');
  await third.assignDuty({id:'to-dee',duty:'investigate'});const item=view(s);
  assert.deepEqual(item.duty.record,initial);assert.equal(item.duty.currentAssigneeId,'dee');
  assert.deepEqual(item.duty.assignments.map(x=>[x.fromAgentId,x.toAgentId]),[['bea','cam'],['cam','dee']]);
  const before=s.owner.exportHistory().length;await second.assignDuty({id:'to-cam',duty:'investigate'});
  await first.createDuty(duty);assert.equal(s.owner.exportHistory().length,before); // historical exact reads
  await assert.rejects(second.assignDuty({id:'back-to-cam',duty:'investigate'}));
  for(const who of ['bea','cam','dee']){const q=s.owner.survives(who);assert.equal(q.epistemicStatus,'ESTABLISHED');
    assert.equal(q.answer.attemptDuties[0].currentAssigneeId,'dee');assert.equal(q.answer.outcomeObservations.length,1);}
  assert.equal(s.owner.authorize({actor:'dee',action:'create-ticket',resource:'queue:security'}).decision,'DENY');
  assert.equal(s.service.stats().effects,0);assert.equal(s.service.stats().requests,1);
});

test('all differently signed report digests remain visible and none closes the duty or supplies finality',async t=>{
  const s=await setup(t,'pending');await s.broker.run(s.request);grant(s,'bea');const recorder=openLocalAttemptRecorder(s.options);
  await recorder.createDuty(duty);
  await recorder.observe({id:'report-a',intent:'job:1',acknowledgment:ack(s)});
  await recorder.observe({id:'report-a-again',intent:'job:1',acknowledgment:ack(s)});
  assert.equal(view(s).reportStatus,'REPORT_RECORDED');assert.equal(view(s).observations.length,2);
  await recorder.observe({id:'report-b',intent:'job:1',acknowledgment:ack(s,'0x'+'b'.repeat(64))});
  assert.equal(view(s).reportStatus,'DIVERGENT_REPORTS');assert.equal(view(s).observations.length,3);
  assert.equal(view(s).duty.record.status,'OPEN');const q=s.owner.survives('bea');assert.equal(q.epistemicStatus,'ESTABLISHED');
  assert.equal(q.answer.outcomeObservations.length,3);assert.ok(q.answer.outcomeObservations.every(x=>x.reportStatus==='DIVERGENT_REPORTS'));
  assert.equal(stateOf(s.owner.exportHistory()).intentConsumptions.size,0);assert.equal(s.service.stats().effects,0);
});

test('untrusted read-only inspection is detached and rejects a forged history',async t=>{
  const s=await setup(t,'pending');await s.broker.run(s.request);grant(s,'bea');await openLocalAttemptRecorder(s.options).createDuty(duty);
  const state=stateOf(s.owner.exportHistory()),duties=state.attemptDuties;duties.clear();
  assert.equal(state.attemptDuties.size,1);assert.throws(()=>{view(s).duty.record.status='DISCHARGED';});
  const forged=structuredClone(s.owner.exportHistory());forged.at(-1).data.record.performanceAssigneeId='intruder';
  assert.throws(()=>inspectAttemptHistory(forged));assert.equal(view(s).duty.currentAssigneeId,'bea');
});

test('E4-only histories retain the original SURVIVES answer shape',async t=>{
  const s=await setup(t);const events=structuredClone(s.owner.exportHistory());
  events[0].data.adapterPolicyHash=core.PORTABLE_ADAPTER_POLICY_E4_HASH;
  const answer=observeHistory(events).survives('bea');assert.equal(answer.epistemicStatus,'ESTABLISHED');
  assert.equal(Object.hasOwn(answer.answer,'outcomeObservations'),false);assert.equal(Object.hasOwn(answer.answer,'attemptDuties'),false);
});
