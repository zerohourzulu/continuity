import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {cooperativeSetup} from './cooperative-helpers.mjs';
import {createCooperativeClient} from '../packages/remote-tools/client.mjs';
import {createCooperativeExecutor} from '../packages/remote-tools/executor.mjs';
const result=x=>x.result;
const state=async promise=>result(await promise).state;
const effectCount=s=>s.destination.inspect().effects.length;
const prepared=async s=>{const key=await s.admitOnly();assert.equal(await state(s.client.checkpoint(s.owner.exportHistory())),'CHECKPOINTED');assert.equal(await state(s.client.prepare(s.wire())),'PENDING');return key;};

test('cooperating destination executes an actual Core-admitted operation once and returns stable authenticated status',async t=>{
  const s=await cooperativeSetup(t),first=await s.executor.run(s.request);
  assert.equal(first.execution.invocation.status,'SUBMITTED');assert.equal(first.serviceReport.result.state,'APPLIED');assert.equal(effectCount(s),1);
  const again=await s.executor.run(s.request);assert.equal(again.execution.result.status,'RETRY');assert.equal(effectCount(s),1);
  assert.deepEqual(again.serviceReport.result,first.serviceReport.result);
  assert.equal(first.externalOutcome,'NOT_PROVEN');
});

test('checkpoint acknowledgement fences a queued old operation after grant revocation',async t=>{
  const s=await cooperativeSetup(t),key=await prepared(s);s.owner.revoke('tools');
  assert.equal(await state(s.client.checkpoint(s.owner.exportHistory())),'CHECKPOINTED');
  assert.equal(await state(s.client.commit(key)),'REFUSED');assert.equal(effectCount(s),0);
  assert.equal(await state(s.client.status(key)),'PENDING');
  assert.equal(await state(s.client.cancel(key)),'CANCELLED');assert.equal(await state(s.client.commit(key)),'CANCELLED');assert.equal(effectCount(s),0);
});

test('local revocation without its remote checkpoint is explicitly not a destination fence',async t=>{
  const s=await cooperativeSetup(t),key=await prepared(s);s.owner.revoke('tools');
  assert.equal(await state(s.client.commit(key)),'APPLIED');assert.equal(effectCount(s),1);
});

for(const expiry of ['grant','runtime'])test(`${expiry} expiry is checked at the destination before the effect`,async t=>{
  const s=await cooperativeSetup(t),key=await prepared(s);s.setTime(expiry==='grant'?500:1000);
  assert.equal(await state(s.client.commit(key)),'REFUSED');assert.equal(effectCount(s),0);
});

test('different-agent and role-tenure replacement fences old work and requires separate new powers',async t=>{
  const s=await cooperativeSetup(t),key=await prepared(s);
  s.owner.createAgent({id:'cam'});s.owner.declareSuccession({id:'succession',from:'bea',to:'cam',role:'operator'});
  s.owner.succeed({id:'handover',rule:'succession',fromAgent:'bea',fromTenure:'shift:1',toAgent:'cam',toTenure:'shift:2',role:'operator',number:2});
  const account=privateKeyToAccount(generatePrivateKey());s.owner.admitRuntime({agent:'cam',session:'session:cam',epoch:1,key:'key:cam',address:account.address,expiresAt:1000});
  await s.client.checkpoint(s.owner.exportHistory());assert.equal(await state(s.client.commit(key)),'REFUSED');
  const local={...s.local,session:'session:cam',signHash:h=>account.signMessage({message:{raw:h}})};
  const executor=createCooperativeExecutor({local,client:s.client,registry:s.registry,role:'operator',tenure:'shift:2'});
  const request={...s.request,operationId:'job:cam',businessKey:'case:cam'};
  assert.equal((await executor.run(request)).execution.status,'NOT_AUTHORIZED');
  s.owner.grant({id:'cam-tools',to:'cam',actions:['create-ticket'],resources:['queue:security'],expiresAt:500});
  assert.equal((await executor.run(request)).serviceReport.result.state,'APPLIED');assert.equal(effectCount(s),1);
  assert.equal(await state(s.client.commit(key)),'REFUSED');
});

test('a coordinator signature alone cannot substitute arguments or an unadmitted operation',async t=>{
  const s=await cooperativeSetup(t);await s.client.checkpoint(s.owner.exportHistory());
  assert.equal(await state(s.client.prepare(s.wire())),'REFUSED');const key=await prepared(s);
  assert.equal(await state(s.client.prepare({...s.wire(),arguments:{title:'Substitution'}})),'REFUSED');
  assert.equal(await state(s.client.prepare({...s.wire(),businessKey:'different'})),'REFUSED');
  assert.equal(effectCount(s),0);assert.equal(await state(s.client.commit(key)),'APPLIED');
});

test('application business identity prevents a fresh intent ID from silently repeating the action',async t=>{
  const s=await cooperativeSetup(t);await s.executor.run(s.request);
  const second={...s.request,operationId:'different-intent'};const key=await s.admitOnly(second);
  await s.client.checkpoint(s.owner.exportHistory());assert.equal(await state(s.client.prepare(s.wire(second))),'REFUSED');
  assert.equal(await state(s.client.commit(key)),'UNKNOWN');assert.equal(effectCount(s),1);
});

test('cancel and commit are ordered by one durable destination transaction',async t=>{
  const s=await cooperativeSetup(t),key=await prepared(s);
  const replies=await Promise.all([s.client.commit(key),s.client.cancel(key)]);
  const final=await s.client.status(key);assert.ok(['APPLIED','CANCELLED'].includes(final.result.state));
  assert.equal(effectCount(s),final.result.state==='APPLIED'?1:0);
  if(final.result.state==='APPLIED')assert.ok(replies.some(x=>x.result.state==='TOO_LATE'));
  assert.equal(await state(s.client.commit(key)),final.result.state);assert.equal(effectCount(s),final.result.state==='APPLIED'?1:0);
});

test('cancel-before-commit leaves a retained tombstone and cannot undo an already applied action',async t=>{
  const s=await cooperativeSetup(t),key=await prepared(s);assert.equal(await state(s.client.cancel(key)),'CANCELLED');
  assert.equal(await state(s.client.prepare(s.wire())),'CANCELLED');assert.equal(await state(s.client.commit(key)),'CANCELLED');
  assert.equal(await state(s.client.cancel('0x'+'f'.repeat(64))),'UNKNOWN');assert.equal(effectCount(s),0);
});

test('wrong coordinator or provider keys cannot produce a trusted response',async t=>{
  const s=await cooperativeSetup(t),wrong=generateKeyPairSync('ed25519');
  const before=s.destination.inspect().sequence;
  const fake=createCooperativeClient({url:s.destination.url,serviceId:s.serviceId,coordinatorPrivateKey:wrong.privateKey,servicePublicKey:s.provider.publicKey});
  await assert.rejects(fake.status('0x'+'f'.repeat(64)));assert.equal(s.destination.inspect().sequence,before);
  const confused=createCooperativeClient({url:s.destination.url,serviceId:s.serviceId,coordinatorPrivateKey:s.coordinator.privateKey,servicePublicKey:wrong.publicKey});
  await assert.rejects(confused.status('0x'+'f'.repeat(64)));assert.equal(effectCount(s),0);
});

test('checkpoint rollback, history fork and foreign domain are refused',async t=>{
  const s=await cooperativeSetup(t),prior=s.owner.exportHistory();await prepared(s);
  assert.equal(await state(s.client.checkpoint(prior)),'REFUSED');
  const fork=structuredClone(prior);fork[1].id+=':fork';assert.equal(await state(s.client.checkpoint(fork)),'REFUSED');
  const foreign=structuredClone(prior);foreign[0].data.domain.deploymentId+=':foreign';assert.equal(await state(s.client.checkpoint(foreign)),'REFUSED');
  assert.equal(effectCount(s),0);
});
