import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,unlinkSync,mkdirSync,copyFileSync,readdirSync} from 'node:fs';
import {join,basename} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {cooperativeSetup} from './cooperative-helpers.mjs';
import {createCooperativeClient} from '../packages/remote-tools/client.mjs';
import {createCooperativeExecutor} from '../packages/remote-tools/executor.mjs';
import {inspectDestinationLock,recoverDestinationLock} from '../packages/remote-tools/durable-store.mjs';
import {decodeTransport,encodeTransport} from '../packages/remote-tools/wire.mjs';

const evidenceDirectory=process.env.CONTINUITY_RECOVERY_EVIDENCE;
if(evidenceDirectory)mkdirSync(evidenceDirectory,{recursive:true});
const save=(name,value)=>{if(evidenceDirectory)writeFileSync(join(evidenceDirectory,name),encodeTransport(value));};
const retain=(name,file)=>{if(evidenceDirectory)copyFileSync(file,join(evidenceDirectory,name));};
const snapshot=s=>decodeTransport(readFileSync(join(s.directory,'snapshot.bin'))).state;
const alive=child=>child.exitCode===null&&child.signalCode===null;

async function childDestination(s,children){
  const child=spawn(process.execPath,[new URL('./fixtures/cooperative-destination-child.mjs',import.meta.url).pathname,s.childConfig],
    {stdio:['ignore','pipe','pipe','ipc']});children.push(child);
  let text='',errors='',exit,failed;const messages=[],waiters=[];
  const drain=()=>{
    for(let i=waiters.length-1;i>=0;i--){
      const waiter=waiters[i],index=messages.findIndex(value=>value.type===waiter.type||value.type==='ERROR');
      if(index>=0){const value=messages.splice(index,1)[0];waiters.splice(i,1);clearTimeout(waiter.timer);
        if(value.type==='ERROR')waiter.reject(Object.assign(Error(value.message),{code:value.code}));else waiter.resolve(value);
      }else if(exit||failed){waiters.splice(i,1);clearTimeout(waiter.timer);waiter.reject(failed??Error(`Destination child exited: ${JSON.stringify(exit)} ${errors}`));}
    }
  };
  child.stdout.on('data',bytes=>{text+=bytes;for(;;){const end=text.indexOf('\n');if(end<0)break;const line=text.slice(0,end);text=text.slice(end+1);try{messages.push(JSON.parse(line));}catch(error){failed=error;}drain();}});
  child.stderr.on('data',bytes=>errors+=bytes);child.on('error',error=>{failed=error;drain();});child.on('exit',(code,signal)=>{exit={code,signal};drain();});
  const waitFor=type=>new Promise((resolve,reject)=>{
    const waiter={type,resolve,reject,timer:setTimeout(()=>{const index=waiters.indexOf(waiter);if(index>=0)waiters.splice(index,1);reject(Error(`Timed out waiting for ${type}: ${errors}`));},10000)};
    waiters.push(waiter);drain();
  });
  const ready=await waitFor('READY');
  const client=createCooperativeClient({url:ready.url,serviceId:s.serviceId,coordinatorPrivateKey:s.coordinator.privateKey,
    servicePublicKey:s.provider.publicKey,timeoutMs:10000});
  return {child,client,waitFor,
    async arm(phase){child.send({operation:'arm',phase});assert.equal((await waitFor('ARMED')).phase,phase);},
    async kill(){if(alive(child)){const done=once(child,'exit');child.kill('SIGKILL');await done;}},
    async close(){if(alive(child)){child.send({operation:'close'});await waitFor('CLOSED');const done=alive(child)?once(child,'exit'):null;if(done)await done;}},
  };
}
async function setup(t){
  const cleanups=[],children=[];
  t.after(async()=>{for(const child of children){if(alive(child)){const done=once(child,'exit');child.kill('SIGKILL');await done;}}
    for(const cleanup of cleanups.reverse())await cleanup();});
  const s=await cooperativeSetup({after:cleanup=>cleanups.push(cleanup)});
  await s.destination.close();
  const childConfig=join(s.dir,'destination-child.json');
  writeFileSync(childConfig,JSON.stringify({directory:s.directory,domain:s.local.domain,serviceId:s.serviceId,now:100,
    coordinatorPublicKey:s.coordinator.publicKey.export({type:'spki',format:'pem'}),
    servicePrivateKey:s.provider.privateKey.export({type:'pkcs8',format:'pem'})}),{mode:0o600});
  const config={...s,childConfig};
  return {...config,start:()=>childDestination(config,children),
    executorFor:client=>createCooperativeExecutor({local:s.local,client,registry:s.registry,role:'operator',tenure:'shift:1'})};
}
async function prepare(s,d){
  const key=await s.admitOnly();assert.equal((await d.client.checkpoint(s.owner.exportHistory())).result.state,'CHECKPOINTED');
  assert.equal((await d.client.prepare(s.wire())).result.state,'PENDING');return key;
}
async function recover(s,d){
  const expectedLock=inspectDestinationLock({directory:s.directory});assert.equal(expectedLock.pid,d.child.pid);
  await d.kill();const recovered=recoverDestinationLock({directory:s.directory,expectedLock});
  assert.equal(recovered.recovered,true);assert.equal(existsSync(recovered.retainedLock),true);return recovered;
}

for(const phase of ['before-rename','after-directory-fsync'])test(`destination death ${phase} retains a recoverable outcome and never causes automatic re-execution`,async t=>{
  const s=await setup(t),d=await s.start(),key=await prepare(s,d),before=snapshot(s);
  assert.equal(before.effects.length,0);await d.arm(phase);
  const failedCall=d.client.commit(key).then(value=>({ok:true,value}),error=>({ok:false,error:error.message}));
  const fault=await d.waitFor('FAULT');assert.equal(fault.phase,phase);
  const disk=snapshot(s);retain(`${phase}-committed.bin`,join(s.directory,'snapshot.bin'));
  if(phase==='before-rename'){
    assert.equal(disk.sequence,before.sequence);assert.equal(disk.attempts[0].report.state,'PENDING');assert.equal(disk.effects.length,0);
    assert.equal(existsSync(fault.temporary),true);retain(`${phase}-orphan.bin`,fault.temporary);
    const pending=decodeTransport(readFileSync(fault.temporary)).state;
    assert.equal(pending.sequence,before.sequence+1);assert.equal(pending.attempts[0].report.state,'APPLIED');assert.equal(pending.effects.length,1);
  }else{
    assert.equal(disk.sequence,before.sequence+1);assert.equal(disk.attempts[0].report.state,'APPLIED');assert.equal(disk.effects.length,1);
    assert.equal(existsSync(fault.temporary),false);
  }
  const recovered=await recover(s,d);assert.equal((await failedCall).ok,false);
  const restarted=await s.start(),status=await restarted.client.status(key);
  assert.equal(status.result.state,phase==='before-rename'?'PENDING':'APPLIED');
  const execution=await s.executorFor(restarted.client).run(s.request);
  assert.equal(snapshot(s).effects.length,phase==='before-rename'?0:1);
  assert.equal((await restarted.client.status(key)).result.state,status.result.state);
  if(phase==='before-rename'){
    assert.equal(existsSync(fault.temporary),true);assert.equal(snapshot(s).sequence,before.sequence);
    assert.equal(execution.serviceReport.result.state,'PENDING');
  }else{
    assert.equal(execution.serviceReport.result.state,'APPLIED');
    assert.equal((await restarted.client.commit(key)).result.state,'APPLIED');assert.equal(snapshot(s).effects.length,1);
  }
  save(`${phase}-recovered.bin`,{status,sequence:snapshot(s).sequence,effectCount:snapshot(s).effects.length,retainedLock:basename(recovered.retainedLock)});
  t.diagnostic(`${phase}: exact disk transition asserted; original caller lost its reply; restart status ${status.result.state}; effects ${snapshot(s).effects.length}`);
});

test('death after durable prepare but before its reply leaves pending work; executor reconciliation never commits it',async t=>{
  const s=await setup(t),d=await s.start(),key=await s.admitOnly();
  await d.client.checkpoint(s.owner.exportHistory());const before=snapshot(s);await d.arm('after-directory-fsync');
  const failedCall=d.client.prepare(s.wire()).then(()=>true,()=>false);
  const fault=await d.waitFor('FAULT');assert.equal(fault.phase,'after-directory-fsync');
  const disk=snapshot(s);assert.equal(disk.sequence,before.sequence+1);assert.equal(disk.attempts[0].report.state,'PENDING');assert.equal(disk.effects.length,0);
  retain('prepare-lost-reply-committed.bin',join(s.directory,'snapshot.bin'));
  await recover(s,d);assert.equal(await failedCall,false);
  const restarted=await s.start(),executor=s.executorFor(restarted.client);
  for(let i=0;i<2;i++)assert.equal((await executor.run(s.request)).serviceReport.result.state,'PENDING');
  assert.equal((await restarted.client.status(key)).result.state,'PENDING');assert.equal(snapshot(s).sequence,disk.sequence);assert.equal(snapshot(s).effects.length,0);
});

test('cancellation with a lost reply survives process death as a tombstone and keeps its business binding',async t=>{
  const s=await setup(t),d=await s.start(),key=await prepare(s,d);await d.arm('after-directory-fsync');
  const failedCall=d.client.cancel(key).then(()=>true,()=>false);await d.waitFor('FAULT');
  assert.equal(snapshot(s).attempts[0].report.state,'CANCELLED');assert.equal(snapshot(s).effects.length,0);
  retain('cancel-lost-reply-committed.bin',join(s.directory,'snapshot.bin'));
  await recover(s,d);assert.equal(await failedCall,false);
  const restarted=await s.start();assert.equal((await restarted.client.status(key)).result.state,'CANCELLED');
  assert.equal((await restarted.client.commit(key)).result.state,'CANCELLED');
  const replacement={...s.request,operationId:'fresh-intent-same-business'};await s.admitOnly(replacement);
  assert.equal((await restarted.client.checkpoint(s.owner.exportHistory())).result.state,'CHECKPOINTED');
  const attempted=await restarted.client.prepare(s.wire(replacement));assert.equal(attempted.result.state,'REFUSED');assert.equal(attempted.result.code,'BUSINESS_KEY_CONFLICT');
  assert.equal(snapshot(s).attempts.length,1);assert.equal(snapshot(s).effects.length,0);
});

test('a surviving destination refuses a rolled-back broker checkpoint and fences its previously prepared work',async t=>{
  const s=await setup(t),d=await s.start(),key=await prepare(s,d),oldBytes=readFileSync(s.local.historyFile);
  s.owner.revoke('tools');const current=s.owner.exportHistory();assert.equal((await d.client.checkpoint(current)).result.state,'CHECKPOINTED');
  const fenced=snapshot(s);writeFileSync(s.local.historyFile,oldBytes);
  const rollback=await d.client.checkpoint(s.owner.exportHistory());assert.equal(rollback.result.state,'REFUSED');assert.equal(rollback.result.code,'CHECKPOINT_CONFLICT');
  assert.equal((await d.client.commit(key)).result.code,'CHECKPOINT_CHANGED');
  const retry=await s.executorFor(d.client).run(s.request);assert.equal(retry.serviceReport.result.state,'PENDING');
  assert.equal(snapshot(s).effects.length,0);assert.equal(snapshot(s).sequence,fenced.sequence);
  save('broker-rollback-refused.bin',{rollback,retainedHead:snapshot(s).checkpoint.head,effectCount:0});
});

test('documented unsupported counterexample: restoring an old valid destination snapshot after shutdown loses its newer outcome',async t=>{
  const s=await setup(t),d=await s.start(),key=await prepare(s,d),path=join(s.directory,'snapshot.bin'),old=readFileSync(path);
  const applied=await d.client.commit(key);assert.equal(applied.result.state,'APPLIED');assert.equal(snapshot(s).effects.length,1);await d.close();
  writeFileSync(path,old);
  const restarted=await s.start(),restored=await restarted.client.status(key);
  assert.equal(restored.result.state,'PENDING');assert.equal(snapshot(s).effects.length,0);
  save('unsupported-destination-rollback.bin',{priorApplied:applied,restoredStatus:restored,claim:'SNAPSHOT_ROLLBACK_AFTER_SHUTDOWN_IS_UNSUPPORTED'});
  t.diagnostic('Outside the single-host anchor: a valid old snapshot is not freshness-authenticated by an unchanged identity marker. No safe-redelivery claim follows.');
});

for(const broken of ['missing-snapshot','missing-identity','corrupt-snapshot'])test(`destination restart refuses ${broken} without replacing retained state`,async t=>{
  const s=await setup(t),d=await s.start(),key=await prepare(s,d);assert.equal((await d.client.commit(key)).result.state,'APPLIED');await d.close();
  const path=join(s.directory,broken==='missing-identity'?'identity.bin':'snapshot.bin'),original=readFileSync(path);
  if(broken==='corrupt-snapshot')writeFileSync(path,original.subarray(0,Math.floor(original.length/2)));else unlinkSync(path);
  const retained=existsSync(path)?readFileSync(path):null;
  await assert.rejects(s.start());
  if(retained===null)assert.equal(existsSync(path),false);else assert.deepEqual(readFileSync(path),retained);
  assert.equal(existsSync(join(s.directory,'destination.lock')),false);
  save(`${broken}-refusal.bin`,{kind:broken,files:readdirSync(s.directory),remainingBytes:retained===null?null:retained.length});
});
