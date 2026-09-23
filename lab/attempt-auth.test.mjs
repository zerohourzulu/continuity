import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import * as core from '../packages/core-0.2/src/core/index.ts';
import {PortableFileEventStore} from '../packages/core-0.2/src/indexer/portable-file-event-store.ts';
import {prepareAdministrativeEvent} from '../packages/core-0.2/src/administration/index.ts';
import {openLocalAttemptRecorder} from '../packages/core-0.3/src/attempts.ts';
import {openLocalOwner} from '../packages/core-0.3/src/local-owner.ts';
import {createBroker} from './broker.mjs';
import {setup,disposition} from './helpers.mjs';

const replay=events=>core.replayPortable({operationVersion:core.PORTABLE_REPLAY_VERSION,events});
const code=expected=>error=>error.code===expected;
const observation=(ack,id='review:1')=>({id,intent:'job:1',acknowledgment:ack});
const duty={id:'duty:1',intent:'job:1',description:'Resolve the original attempt',deadline:300};
const grant=(s,patch={})=>s.owner.grant({id:'observation',to:'bea',actions:['OBSERVE_OUTCOME'],resources:['job:1'],expiresAt:9999,...patch});
const append=(s,event)=>new PortableFileEventStore(s.options.historyFile).append(event);
const permission=(id,grantorId='operations',constraints={})=>({id:`grant:${id}`,type:'AUTHORITY_GRANTED',timestamp:100,data:{grant:{
  kind:'PERMISSION',authorityId:id,grantorId,granteeId:'bea',rootAuthorityId:id,independent:true,
  constraints:{actions:['OBSERVE_OUTCOME'],resources:['job:1'],quantitative:false,expiresAt:9999,maxDelegationDepth:0,requiredIntersectionIds:[],...constraints},
}}});
async function admitted(t) {
  const s=await setup(t);const answer=await s.broker.run(s.request);
  assert.equal(disposition(answer),'SUBMITTED');
  return {...s,ack:answer.result.invocation.disposition.acknowledgment};
}
function noAdministrativeAppend(s,before) {
  assert.deepEqual(readFileSync(s.options.historyFile),before);
  assert.equal(s.service.stats().requests,1);
  assert.equal(s.service.stats().effects,1);
}

test('role and original execution grant do not authorize observation or attempt-duty creation',async t=>{
  const s=await admitted(t);let signed=0;
  const recorder=openLocalAttemptRecorder({...s.options,signHash:async hash=>{signed++;return s.options.signHash(hash)}});
  const before=readFileSync(s.options.historyFile);
  await assert.rejects(recorder.observe(observation(s.ack)),code('POLICY_UNAVAILABLE'));
  await assert.rejects(recorder.createDuty(duty),code('POLICY_UNAVAILABLE'));
  assert.equal(signed,0);noAdministrativeAppend(s,before);
  grant(s);await recorder.observe(observation(s.ack));
  await assert.rejects(recorder.createDuty(duty),code('POLICY_UNAVAILABLE'));
});

for(const condition of ['revoked','expired']) test(`${condition} observation permission refuses a new record`,async t=>{
  const s=await admitted(t);grant(s,{expiresAt:150});
  if(condition==='revoked') s.owner.revoke('observation');
  const before=readFileSync(s.options.historyFile);
  const recorder=openLocalAttemptRecorder({...s.options,now:()=>condition==='expired'?150:100});
  await assert.rejects(recorder.observe(observation(s.ack)),code('POLICY_UNAVAILABLE'));
  noAdministrativeAppend(s,before);
});

test('a foreign principal grant cannot authorize recording for the source role owner',async t=>{
  const s=await admitted(t);
  append(s,{id:'principal:foreign',type:'PRINCIPAL_CREATED',timestamp:100,data:{principalId:'foreign'}});
  append(s,permission('foreign-observation','foreign'));
  assert.equal(s.owner.authorize({actor:'bea',action:'OBSERVE_OUTCOME',resource:'job:1'}).decision,'ALLOW');
  const before=readFileSync(s.options.historyFile);
  await assert.rejects(openLocalAttemptRecorder(s.options).observe(observation(s.ack)),code('POLICY_UNAVAILABLE'));
  noAdministrativeAppend(s,before);
});

test('a capped administrative winner cannot fall through to an uncapped alternative or consume capacity',async t=>{
  const s=await admitted(t);
  append(s,permission('a-capped','operations',{maxTransactions:1}));
  append(s,permission('z-uncapped'));
  const before=readFileSync(s.options.historyFile);
  await assert.rejects(openLocalAttemptRecorder(s.options).observe(observation(s.ack)),code('POLICY_UNAVAILABLE'));
  noAdministrativeAppend(s,before);
});

test('quantity-bearing permission is not an amount-free observation permission',async t=>{
  const s=await admitted(t);append(s,permission('quantitative','operations',{quantitative:true,maxAmount:1n}));
  const before=readFileSync(s.options.historyFile);
  await assert.rejects(openLocalAttemptRecorder(s.options).observe(observation(s.ack)),code('POLICY_UNAVAILABLE'));
  noAdministrativeAppend(s,before);
});

test('wrong signing key and stale current epoch cannot append an observation',async t=>{
  const s=await admitted(t);grant(s);
  const other=privateKeyToAccount(generatePrivateKey());
  let before=readFileSync(s.options.historyFile);
  await assert.rejects(openLocalAttemptRecorder({...s.options,signHash:h=>other.signMessage({message:{raw:h}})}).observe(observation(s.ack)),code('SIGNED_EVENT_REJECTED'));
  noAdministrativeAppend(s,before);
  s.owner.advanceEpoch({agent:'bea',from:1,to:2});before=readFileSync(s.options.historyFile);
  await assert.rejects(openLocalAttemptRecorder(s.options).observe(observation(s.ack)),code('SESSION_INVALID'));
  noAdministrativeAppend(s,before);
});

test('history change during signing refuses the previously signed observation',async t=>{
  const s=await admitted(t);grant(s);
  const recorder=openLocalAttemptRecorder({...s.options,signHash:async hash=>{
    s.owner.revoke('observation');return s.options.signHash(hash);
  }});
  await assert.rejects(recorder.observe(observation(s.ack)),code('HISTORY_CONFLICT'));
  assert.equal(s.owner.exportHistory().filter(e=>e.type==='OUTCOME_OBSERVATION_RECORDED').length,0);
  assert.equal(s.owner.exportHistory().at(-1).type,'AUTHORITY_REVOKED');
  assert.equal(s.service.stats().requests,1);
});

for(const expiry of ['grant','runtime']) test(`${expiry} expiry during signing is checked at fresh host time`,async t=>{
  const s=await admitted(t);grant(s,{expiresAt:expiry==='grant'?150:20000});let clock=100;
  const before=readFileSync(s.options.historyFile);
  const recorder=openLocalAttemptRecorder({...s.options,now:()=>clock,signHash:async hash=>{
    clock=expiry==='grant'?150:10000;return s.options.signHash(hash);
  }});
  await assert.rejects(recorder.observe(observation(s.ack)),code(expiry==='grant'?'POLICY_UNAVAILABLE':'SESSION_INVALID'));
  noAdministrativeAppend(s,before);
});

test('wrong acknowledgment, undeclared source, undefined extra field and wrong admission reference fail before signing',async t=>{
  const s=await admitted(t);grant(s);let signed=0;
  const recorder=openLocalAttemptRecorder({...s.options,signHash:async hash=>{signed++;return s.options.signHash(hash)}});
  const wrong=structuredClone(s.ack);wrong.intentId='other';
  await assert.rejects(recorder.observe(observation(wrong)),code('TRANSITION_REJECTED'));
  await assert.rejects(recorder.observe({...observation(s.ack),intent:'absent'}),code('TRANSITION_REJECTED'));
  await assert.rejects(recorder.observe({...observation(s.ack),extra:undefined}),code('INVALID_INPUT'));
  const events=s.owner.exportHistory(),head=replay(events).head;
  assert.throws(()=>prepareAdministrativeEvent({events,expectedDomain:s.options.domain,expectedHistoryHead:head,runtimeSessionId:'session:1',transition:{
    id:'wrong-admission',type:'OUTCOME_OBSERVATION_RECORDED',timestamp:100,
    data:{intentId:'job:1',sourceAdmissionEventId:'invented',acknowledgment:s.ack,actorId:'bea'},
  }}),code('INVALID_TRANSITION'));
  assert.equal(signed,0);
  assert.equal(s.owner.exportHistory().filter(e=>e.type==='OUTCOME_OBSERVATION_RECORDED').length,0);
});

test('raw replay rejects forged signed observation fields even when using an accepted source history',async t=>{
  const s=await admitted(t);grant(s);await openLocalAttemptRecorder(s.options).observe(observation(s.ack));
  const events=s.owner.exportHistory();assert.equal(replay(events).status,'ACCEPTED');
  const mutations=[
    e=>{e.id+=':substituted'}, e=>{e.timestamp++}, e=>{e.data.actorId='foreign'},
    e=>{e.data.sourceAdmissionEventId='invented'},
    e=>{e.data.acknowledgment.result.reportDigest.value='0x'+'a'.repeat(64)},
    e=>{e.data.administrativeAuthorization.runtimeSignature='0x'+'0'.repeat(130)},
    e=>{e.data.administrativeAuthorization.challenge.domain.deploymentId='foreign'},
    e=>{e.data.administrativeAuthorization.challenge.eventHistoryHash='0x'+'0'.repeat(64)},
    e=>{e.data.administrativeAuthorization.challenge.request.action='CREATE_ATTEMPT_DUTY'},
    e=>{e.data.administrativeAuthorization.challenge.controlEpoch=2},
    e=>{e.data.administrativeAuthorization.authorityProof.request.resource='different'},
    e=>{e.data.extra=undefined},
  ];
  for(const mutate of mutations){const altered=structuredClone(events);mutate(altered.at(-1));assert.equal(replay(altered).status,'REJECTED')}
  assert.equal(s.service.stats().requests,1);
});

test('an independently valid E4 remote history cannot be given E5 observation authority',async t=>{
  const s=await setup(t);const prefix=structuredClone(s.owner.exportHistory());
  prefix[0].data.adapterPolicyHash=core.PORTABLE_ADAPTER_POLICY_E4_HASH;
  const domain={...s.options.domain,deploymentId:s.options.domain.deploymentId+':e4'};
  prefix[0].data.domain=domain;
  const oldFile=join(s.dir,'old-policy.jsonl');new PortableFileEventStore(oldFile).appendAll(prefix);
  const options={...s.options,historyFile:oldFile,domain};const owner=openLocalOwner(options);
  owner.grant({id:'observation',to:'bea',actions:['OBSERVE_OUTCOME'],resources:['job:1'],expiresAt:9999});
  const answer=await createBroker(options).run(s.request);assert.equal(disposition(answer),'SUBMITTED');
  const events=owner.exportHistory();assert.equal(replay(events).status,'ACCEPTED');
  assert.throws(()=>openLocalAttemptRecorder(options),code('PROFILE_MISMATCH'));
  const ack=answer.result.invocation.disposition.acknowledgment;
  assert.throws(()=>prepareAdministrativeEvent({events,expectedDomain:options.domain,expectedHistoryHead:replay(events).head,runtimeSessionId:'session:1',transition:{
    id:'observation:forbidden',type:'OUTCOME_OBSERVATION_RECORDED',timestamp:100,
    data:{intentId:'job:1',sourceAdmissionEventId:events.find(e=>e.type==='TRANSACTION_INTENT_ADMITTED').id,acknowledgment:ack,actorId:'bea'},
  }}),code('POLICY_UNAVAILABLE'));
  const original=await s.broker.run(s.request);grant(s);
  await openLocalAttemptRecorder(s.options).observe(observation(original.result.invocation.disposition.acknowledgment));
  const transplant=s.owner.exportHistory().at(-1);
  assert.equal(replay([...events,transplant]).status,'REJECTED');
});
