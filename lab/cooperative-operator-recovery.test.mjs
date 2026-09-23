import test from 'node:test';
import assert from 'node:assert/strict';
import {cooperativeSetup} from './cooperative-helpers.mjs';
import {createCooperativeRecovery} from '../packages/remote-tools/recovery.mjs';
import {createCooperativeExecutor} from '../packages/remote-tools/executor.mjs';

const executor=(s,client)=>createCooperativeExecutor({local:s.local,client,registry:s.registry,role:'operator',tenure:'shift:1'});
const recovery=(s,client=s.client)=>createCooperativeRecovery({local:s.local,client,registry:s.registry});

test('lost prepare reply leaves pending work; ordinary retry only looks it up, and an operator can cancel',async t=>{
  const s=await cooperativeSetup(t);
  const client={...s.client,async prepare(op){await s.client.prepare(op);throw Error('Connection lost');}};
  const first=await executor(s,client).run(s.request);
  assert.equal(first.execution.invocation.status,'OUTCOME_UNKNOWN');
  const retry=await s.executor.run(s.request);
  assert.equal(retry.serviceReport.result.state,'PENDING');assert.equal(s.destination.inspect().effects.length,0);
  const r=recovery(s);const lookup=await r.lookup(s.request);
  assert.equal(lookup.dispatchPerformed,false);assert.equal(lookup.serviceReport.result.state,'PENDING');
  assert.equal((await r.cancel(s.request)).serviceReport.result.state,'CANCELLED');
  assert.equal((await s.executor.run(s.request)).serviceReport.result.state,'CANCELLED');
  assert.equal(s.destination.inspect().effects.length,0);
});

test('lost commit reply survives destination restart and old grant revocation without redelivery',async t=>{
  const s=await cooperativeSetup(t);
  const client={...s.client,async commit(key){await s.client.commit(key);throw Error('Connection lost after effect');}};
  assert.equal((await executor(s,client).run(s.request)).execution.invocation.status,'OUTCOME_UNKNOWN');
  s.owner.revoke('tools');await s.restart();
  const r=recovery(s);assert.equal((await r.lookup(s.request)).serviceReport.result.state,'APPLIED');
  assert.equal((await r.cancel(s.request)).serviceReport.result.state,'TOO_LATE');
  assert.equal(s.destination.inspect().effects.length,1);
  assert.equal((await executor(s,s.client).run(s.request)).execution.result.status,'RETRY');
  assert.equal(s.destination.inspect().effects.length,1);
});

test('recovery requires the exact recorded business operation but no current execution grant',async t=>{
  const s=await cooperativeSetup(t);await s.executor.run(s.request);s.owner.revoke('tools');
  const r=recovery(s);assert.equal((await r.lookup(s.request)).externalOutcome,'NOT_PROVEN');
  await assert.rejects(r.lookup({...s.request,arguments:{title:'Different request'}}),/OPERATION_CONFLICT/);
  await assert.rejects(r.lookup({...s.request,operationId:'unadmitted'}),/ADMISSION_REQUIRED/);
  assert.equal(s.destination.inspect().effects.length,1);
});

test('mismatched provider report is rejected and never returned as the matching service report',async t=>{
  const s=await cooperativeSetup(t);
  await executor(s,{...s.client,async commit(key){await s.client.commit(key);throw Error('Lost original report');}}).run(s.request);
  const client={...s.client,async status(key){const reply=await s.client.status(key);return {...reply,result:{...reply.result,intentId:'different'}};}};
  await assert.rejects(recovery(s,client).lookup(s.request),/REPORT_MISMATCH/);
  const result=await executor(s,client).run(s.request);
  assert.equal(result.execution.result.status,'OUTCOME_UNKNOWN');assert.equal(result.serviceReport,null);
  assert.equal(s.destination.inspect().effects.length,1);
});

test('expiry refusal persists a clock floor; backward clock cannot revive pending authority',async t=>{
  const s=await cooperativeSetup(t),key=await s.admitOnly();
  await s.client.checkpoint(s.owner.exportHistory());await s.client.prepare(s.wire());
  s.setTime(501);assert.equal((await s.client.commit(key)).result.state,'REFUSED');
  s.setTime(101);assert.equal((await s.client.commit(key)).result.state,'REFUSED');
  assert.equal(s.destination.inspect().lastTime,501);assert.equal(s.destination.inspect().effects.length,0);
  s.setTime(NaN);assert.equal((await s.client.cancel(key)).result.state,'CANCELLED');
});
