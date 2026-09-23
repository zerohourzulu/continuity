import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {cooperativeSetup} from '../examples/cooperative-setup.mjs';
import {lossyRelay} from '../examples/lossy-relay.mjs';
import {testIssuer} from '../examples/test-issuer.mjs';
import {taskClient,pollTask} from '../examples/task-client.mjs';
import {recoverDeadHost} from '../src/operations.mjs';
import {serveGatewayHttp} from '../src/http.mjs';
const name='create_incident_ticket',args={title:'Synthetic long-running job'};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const latch=()=>{let release;const promise=new Promise(resolve=>release=resolve);return {promise,release};};
async function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'continuity-task-test-')),f=await cooperativeSetup(join(root,'case')),issuer=await testIssuer(),relay=await lossyRelay(f.destination.url);
 f.config.destination.url=relay.url;const hosts=[],cleanup=[];let access=true;
 t.after(async()=>{for(const fn of cleanup)await fn();await Promise.allSettled(hosts.map(h=>h.close()));await relay.close();await f.destination.close();await issuer.close();rmSync(root,{recursive:true,force:true});});
 const binding={id:'agent-a',subject:'alice',clientId:'example-client',kind:'cooperative',tasks:true,gateway:f.config};
 return {...f,root,issuer,relay,binding,onCleanup:fn=>cleanup.push(fn),
  setAccess:value=>access=value,
  grantCancel:()=>f.owner.grant({id:'cancel',to:'worker',actions:['cancel-operation'],resources:[f.operationId],expiresAt:Date.now()+60000}),
  async host(extra={}){const h=await serveGatewayHttp({issuer:issuer.issuer,keys:issuer.keys,allowTestIssuer:true,isActive:()=>access,bindings:[binding],...extra});hosts.push(h);return h;},
  async client(h,claims){return taskClient(h.resourceUrl,await issuer.issue(h.resourceUrl,claims));},
 };
}
const start=call=>call('tools/call',{name,arguments:args});

test('Tasks negotiation returns a durable handle, stage progress and a completed result',async t=>{
 const f=await fixture(t),hold=latch();f.onCleanup(()=>hold.release());f.relay.behavior.after=async op=>{if(op==='prepare')await hold.promise;};
 const h=await f.host(),call=await f.client(h),discovery=await call('server/discover',{});
 assert.deepEqual(discovery.capabilities.extensions['io.modelcontextprotocol/tasks'],{});
 const task=await start(call);assert.equal(task.resultType,'task');assert.equal(task.status,'working');
 const progress=await pollTask(call,task.taskId,{until:r=>r.statusMessage?.includes('Preparing')});assert.equal(progress.status,'working');
 assert.ok(readdirSync(f.config.storage).some(p=>p.includes('.request.json')&&p.startsWith('continuity-task:')));
 hold.release();const done=await pollTask(call,task.taskId);assert.equal(done.status,'completed');assert.equal(done.result.structuredContent.serviceState,'APPLIED');
 assert.equal(f.relay.counts.commit,1);assert.equal(f.destination.inspect().effects.length,1);
});

test('clients without task opt-in receive the ordinary result and no task',async t=>{
 const f=await fixture(t),h=await f.host(),call=await f.client(h);
 const r=await call('tools/call',{name,arguments:args},{meta:{'io.modelcontextprotocol/clientCapabilities':{}}});
 assert.notEqual(r.resultType,'task');assert.equal(r.structuredContent.serviceState,'APPLIED');
 assert.equal(readdirSync(f.config.storage).some(n=>n.startsWith('continuity-task:')),false);
});

test('duplicate and concurrent starts keep one handle; changed arguments cannot create new work',async t=>{
 const f=await fixture(t),h=await f.host(),call=await f.client(h);
 const pair=await Promise.all([start(call),start(call)]);assert.equal(pair[0].taskId,pair[1].taskId);
 await assert.rejects(call('tools/call',{name,arguments:{title:'changed'}}),/OPERATION_CONFLICT/);
 await pollTask(call,pair[0].taskId);assert.equal(f.relay.counts.commit,1);
});

test('lost commit reply is recovered by polling and does not repeat prepare or commit',async t=>{
 const f=await fixture(t),h=await f.host(),call=await f.client(h);f.relay.behavior.dropAfter='commit';
 const task=await start(call),done=await pollTask(call,task.taskId);assert.equal(done.result.structuredContent.serviceState,'APPLIED');
 assert.equal(f.relay.counts.prepare,1);assert.equal(f.relay.counts.commit,1);assert.ok(f.relay.counts.status>=1);
});

test('new login and gateway restart can retrieve the same terminal task',async t=>{
 const f=await fixture(t),h=await f.host(),call=await f.client(h),task=await start(call);await pollTask(call,task.taskId);await h.close();
 const next=await f.host(),other=await f.client(next),done=await other('tasks/get',{taskId:task.taskId});assert.equal(done.status,'completed');
 assert.equal((await start(other)).taskId,task.taskId);assert.equal(f.relay.counts.commit,1);
});

test('same business identity survives a trusted tool alias change',async t=>{
 const f=await fixture(t),h=await f.host(),call=await f.client(h),task=await start(call);await pollTask(call,task.taskId);await h.close();
 f.config.operations[0].name='renamed';const next=await f.host(),other=await f.client(next);
 assert.equal((await other('tools/call',{name:'renamed',arguments:args})).taskId,task.taskId);assert.equal(f.relay.counts.commit,1);
});

test('cancel during prepare stops commit and separately cancels the destination',async t=>{
 const f=await fixture(t);f.grantCancel();const hold=latch();f.onCleanup(()=>hold.release());f.relay.behavior.after=async op=>{if(op==='prepare')await hold.promise;};
 const h=await f.host(),call=await f.client(h),task=await start(call);await pollTask(call,task.taskId,{until:r=>r.statusMessage?.includes('Preparing')});
 assert.deepEqual(await call('tasks/cancel',{taskId:task.taskId}),{resultType:'complete'});hold.release();
 assert.equal((await pollTask(call,task.taskId)).status,'cancelled');assert.equal(f.relay.counts.commit,0);assert.equal(f.relay.counts.cancel,1);
 await call('tasks/cancel',{taskId:task.taskId});assert.equal(f.relay.counts.cancel,1);
});

test('cancellation without separate permission is refused and creates no cancellation marker',async t=>{
 const f=await fixture(t);f.relay.behavior.dropBefore='commit';const h=await f.host(),call=await f.client(h),task=await start(call);
 await assert.rejects(call('tasks/cancel',{taskId:task.taskId}),/INSPECTION_DENIED/);assert.equal(f.relay.counts.cancel,0);
 assert.equal(readdirSync(f.config.storage).some(n=>n.includes('cancel-request')),false);
});

test('lost cancellation acknowledgment is recovered as CANCELLED without sending cancellation twice',async t=>{
 const f=await fixture(t);f.grantCancel();f.relay.behavior.dropBefore='commit';const h=await f.host(),call=await f.client(h),task=await start(call);
 await pollTask(call,task.taskId,{until:r=>r.statusMessage?.includes('pending')});f.relay.behavior.dropAfter='cancel';
 await call('tasks/cancel',{taskId:task.taskId});assert.equal((await pollTask(call,task.taskId)).status,'cancelled');
 await call('tasks/cancel',{taskId:task.taskId});assert.equal(f.relay.counts.cancel,1);assert.equal(f.destination.inspect().effects.length,0);
});

test('cancellation racing with a completed effect reports completed, never a false rollback',async t=>{
 const f=await fixture(t);f.grantCancel();const hold=latch();f.onCleanup(()=>hold.release());f.relay.behavior.after=async op=>{if(op==='commit')await hold.promise;};
 const h=await f.host(),call=await f.client(h),task=await start(call);
 for(let i=0;i<50&&!f.destination.inspect().effects.length;i++)await delay(20);
 assert.equal(f.destination.inspect().effects.length,1);await call('tasks/cancel',{taskId:task.taskId});hold.release();
 assert.equal((await pollTask(call,task.taskId)).status,'completed');assert.equal(f.destination.inspect().effects.length,1);
});

test('revoked inspection and expired login cannot reveal task results; renewed login can',async t=>{
 const f=await fixture(t),h=await f.host(),call=await f.client(h),task=await start(call);await pollTask(call,task.taskId);
 f.setAccess(false);await assert.rejects(call('tasks/get',{taskId:task.taskId}),/HTTP 401/);
 f.setAccess(true);const renewed=await f.client(h);assert.equal((await renewed('tasks/get',{taskId:task.taskId})).status,'completed');
 f.owner.revoke('inspect');await assert.rejects(renewed('tasks/get',{taskId:task.taskId}),/INSPECTION_DENIED/);
});

test('current role membership is required even for a terminal task',async t=>{
 const f=await fixture(t),h=await f.host(),call=await f.client(h),task=await start(call);await pollTask(call,task.taskId);
 f.owner.advanceEpoch({agent:'worker',from:1,to:2});
 await assert.rejects(call('tasks/get',{taskId:task.taskId}),/RUNTIME_NOT_CURRENT/);
});

test('unknown handles, missing capability and wrong routing headers fail closed',async t=>{
 const f=await fixture(t),h=await f.host(),call=await f.client(h),task=await start(call);
 await assert.rejects(call('tasks/get',{taskId:'../history'}),/TASK_NOT_FOUND/);
 await assert.rejects(call('tasks/get',{taskId:task.taskId},{meta:{'io.modelcontextprotocol/clientCapabilities':{}}}),e=>e.code===-32021);
 await assert.rejects(call('tasks/get',{taskId:task.taskId},{headers:{'mcp-name':'wrong'}}),/Task request refused/);
 await assert.rejects(call('tasks/get',{taskId:task.taskId,session:'other'}),/Task request refused/);
});

test('unexpected task inputs are ignored and cannot grant power or alter arguments',async t=>{
 const f=await fixture(t),h=await f.host(),call=await f.client(h),task=await start(call);
 assert.deepEqual(await call('tasks/update',{taskId:task.taskId,inputResponses:{authority:{result:'grant all'}}}),{resultType:'complete'});
 await pollTask(call,task.taskId);assert.equal(f.relay.counts.commit,1);
});

test('a different binding cannot use a known task handle',async t=>{
 const f=await fixture(t),otherRoot=mkdtempSync(join(tmpdir(),'continuity-other-task-')),other=await cooperativeSetup(join(otherRoot,'case'));t.after(async()=>{await other.destination.close();rmSync(otherRoot,{recursive:true,force:true});});
 const h=await f.host({bindings:[f.binding,{...f.binding,id:'agent-b',subject:'bob',gateway:other.config}]});
 const call=await f.client(h),task=await start(call),bob=await f.client(h,{sub:'bob',continuity_binding:'agent-b'});
 await assert.rejects(bob('tasks/get',{taskId:task.taskId}),/TASK_NOT_FOUND/);
});

test('corrupt durable task metadata is refused after restart instead of rerunning the job',async t=>{
 const f=await fixture(t),h=await f.host(),call=await f.client(h),task=await start(call);await pollTask(call,task.taskId);await h.close();
 const path=join(f.config.storage,task.taskId+'.request.json'),row=JSON.parse(readFileSync(path));row.context='wrong';writeFileSync(path,JSON.stringify(row));
 const next=await f.host(),other=await f.client(next);await assert.rejects(other('tasks/get',{taskId:task.taskId}),/TASK_CONFLICT/);assert.equal(f.relay.counts.commit,1);
});

test('actual host SIGKILL after the effect resumes polling only, under the same handle',async t=>{
 const f=await fixture(t),hold=latch();f.onCleanup(()=>hold.release());f.relay.behavior.after=async op=>{if(op==='commit')await hold.promise;};
 const path=join(f.root,'host.json');writeFileSync(path,JSON.stringify({issuer:f.issuer.issuer,keys:f.issuer.keys,keyFile:join(f.root,'case','worker.key'),gateway:{...f.config,destination:{...f.config.destination,
  coordinatorPrivateKey:f.config.destination.coordinatorPrivateKey.export({format:'pem',type:'pkcs8'}),servicePublicKey:f.config.destination.servicePublicKey.export({format:'pem',type:'spki'})}}}),{mode:0o600});
 const spawn=async()=>{const child=fork(fileURLToPath(new URL('./fixtures/task-host.mjs',import.meta.url)),[path],{stdio:['ignore','ignore','ignore','ipc']});t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});const [msg]=await once(child,'message');return {child,resourceUrl:msg.url};};
 const first=await spawn(),call=await f.client(first),task=await start(call);
 for(let i=0;i<100&&!f.destination.inspect().effects.length;i++)await delay(20);
 assert.equal(f.destination.inspect().effects.length,1);const exited=once(first.child,'exit');first.child.kill('SIGKILL');await exited;hold.release();recoverDeadHost(f.config.storage);
 const next=await spawn(),after=await f.client(next),done=await pollTask(after,task.taskId);
 assert.equal(done.status,'completed');assert.equal(done.result.structuredContent.serviceState,'APPLIED');assert.equal(f.relay.counts.commit,1);assert.equal(f.relay.counts.prepare,1);
});


test('forged terminal cancellation cannot contradict the authenticated service result',async t=>{
 const f=await fixture(t),h=await f.host(),call=await f.client(h),task=await start(call);await pollTask(call,task.taskId);
 const path=join(f.config.storage,task.taskId+'.terminal.json'),row=JSON.parse(readFileSync(path));row.status='cancelled';delete row.result;writeFileSync(path,JSON.stringify(row));
 await assert.rejects(call('tasks/get',{taskId:task.taskId}),/TASK_CONFLICT/);assert.equal(f.relay.counts.commit,1);
});


test('cancel while the initial admission is signing stops the queued job without remote requests',async t=>{
 const f=await fixture(t);f.grantCancel();const hold=latch(),entered=latch();f.onCleanup(()=>hold.release());const original=f.config.local.signHash;
 f.config.local.signHash=async hash=>{entered.release();await hold.promise;return original(hash);};
 const h=await f.host(),call=await f.client(h),task=await start(call);await entered.promise;
 await call('tasks/cancel',{taskId:task.taskId});hold.release();assert.equal((await pollTask(call,task.taskId)).status,'cancelled');
 assert.equal(f.relay.counts.checkpoint,0);assert.equal(f.relay.counts.cancel,0);
});
