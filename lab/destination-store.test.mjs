import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,readFileSync,writeFileSync,unlinkSync,renameSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {openDestinationStore,inspectDestinationLock,recoverDestinationLock} from '../packages/remote-tools/durable-store.mjs';

const hash=character=>'0x'+character.repeat(64);
const initial=()=>({version:'continuity-cooperative-destination/1',domain:{protocol:'continuity',version:'0.2',deploymentId:'store-test',chainId:'31337',verifyingContract:'0x'+'0'.repeat(40)},
  serviceId:'synthetic-service',coordinatorKey:hash('a'),serviceKey:hash('b'),sequence:0,lastTime:0,checkpoint:null,attempts:[],businessKeys:[],effects:[]});
const code=expected=>error=>error.code===expected;
const cleanupByDirectory=new Map();
function directory(t){
  const root=realpathSync(mkdtempSync(join(tmpdir(),'continuity-destination-store-'))),cleanups=[];cleanupByDirectory.set(root,cleanups);
  t.after(async()=>{try{for(const cleanup of cleanups.reverse())await cleanup()}finally{cleanupByDirectory.delete(root);rmSync(root,{recursive:true,force:true})}});return root;
}
const open=root=>{const store=openDestinationStore({directory:root,initial:initial()});cleanupByDirectory.get(root).push(()=>store.close());return store};
function attempt(){return {key:hash('c'),fingerprint:hash('d'),intentId:'intent:1',operation:{intentId:'intent:1'},normalized:{intentId:'intent:1'},checkpointHead:{hash:hash('e'),position:0,canonicalTime:10},preparedAt:10,
  report:{state:'PENDING',key:hash('c'),fingerprint:hash('d'),intentId:'intent:1',tool:'ticket.create',businessKey:'business:1',contractId:'ticket/1',checkpointHash:hash('e')}}}

test('destination store persists immutable identity, bigint data and store-owned monotonic sequence',t=>{
  const root=directory(t),store=open(root);
  assert.equal(store.read().sequence,0);assert.equal(Object.isFrozen(store.read()),true);
  assert.throws(()=>open(root),code('DESTINATION_LOCKED'));
  const updated=store.transact(state=>{state.lastTime=10;state.checkpoint={head:{hash:hash('e'),position:0,canonicalTime:10},events:[{amount:1n,literal:{$bigint:'1'}}]};return {state,result:{ok:true}}});
  assert.equal(updated.state.sequence,1);assert.equal(updated.result.ok,true);
  assert.equal(updated.state.checkpoint.events[0].amount,1n);
  assert.equal(updated.state.checkpoint.events[0].literal.$bigint,'1');
  assert.equal(store.transact(state=>({state,result:'unchanged'})).state.sequence,1);
  store.close();const reopened=open(root);
  assert.equal(reopened.read().sequence,1);assert.equal(reopened.read().lastTime,10);
  assert.equal(reopened.read().checkpoint.events[0].amount,1n);
  assert.throws(()=>store.read(),code('DESTINATION_STORE_CLOSED'));
});

test('transaction callbacks cannot supply sequence, lower time, go asynchronous or execute accessors',t=>{
  const root=directory(t),store=open(root);
  store.transact(state=>{state.lastTime=20;return {state,result:null}});
  assert.throws(()=>store.transact(state=>{state.sequence++;return {state,result:null}}),code('DESTINATION_SEQUENCE_OWNED_BY_STORE'));
  assert.throws(()=>store.transact(state=>{state.lastTime=19;return {state,result:null}}),code('DESTINATION_TIME_ROLLBACK'));
  assert.throws(()=>store.transact(async state=>({state,result:null})),code('DESTINATION_ASYNC_TRANSACTION'));
  let touched=0;
  assert.throws(()=>store.transact(state=>({state,get result(){touched++;return null}})));
  assert.equal(touched,0);assert.equal(store.read().sequence,1);
  assert.throws(()=>store.transact(state=>{store.read();return {state,result:null}}),code('DESTINATION_STORE_BUSY'));
  assert.equal(store.read().sequence,1);
});

test('attempts, business keys, terminal reports and effects cannot be pruned or rewritten',t=>{
  const root=directory(t),store=open(root);
  store.transact(state=>{state.lastTime=10;state.attempts.push(attempt());state.businessKeys.push({businessKey:'business:1',key:hash('c'),intentId:'intent:1'});return {state,result:null}});
  store.transact(state=>{state.attempts[0].report={...state.attempts[0].report,state:'APPLIED',effectId:'effect:1'};
    state.effects.push({effectId:'effect:1',key:hash('c'),fingerprint:hash('d'),tool:'ticket.create',arguments:{title:'Synthetic'},businessKey:'business:1',contractId:'ticket/1'});return {state,result:null}});
  assert.throws(()=>store.transact(state=>{state.attempts=[];state.businessKeys=[];state.effects=[];return {state,result:null}}),code('DESTINATION_PRUNING_FORBIDDEN'));
  assert.throws(()=>store.transact(state=>{state.attempts[0].fingerprint=hash('f');return {state,result:null}}),code('DESTINATION_ATTEMPT_IDENTITY_CHANGED'));
  assert.throws(()=>store.transact(state=>{state.attempts[0].report.state='PENDING';return {state,result:null}}),code('DESTINATION_TERMINAL_CHANGED'));
  assert.throws(()=>store.transact(state=>{state.effects[0].effectId='replaced';return {state,result:null}}),code('DESTINATION_RETAINED_RECORD_CHANGED'));
  assert.equal(store.read().sequence,2);assert.equal(store.read().effects.length,1);
});

test('checkpoint prefix cannot be shortened or replaced',t=>{
  const root=directory(t),store=open(root);
  store.transact(state=>{state.lastTime=10;state.checkpoint={head:{hash:hash('e'),position:0,canonicalTime:10},events:[{id:'event:1'}]};return {state,result:null}});
  assert.throws(()=>store.transact(state=>{state.checkpoint=null;return {state,result:null}}),code('DESTINATION_CHECKPOINT_ROLLBACK'));
  assert.throws(()=>store.transact(state=>{state.checkpoint.events[0]={id:'substituted'};return {state,result:null}}),code('DESTINATION_CHECKPOINT_FORK'));
  assert.equal(store.read().sequence,1);
});

for(const missing of ['snapshot.bin','identity.bin']) test(`missing ${missing} never bootstraps over a retained identity`,t=>{
  const root=directory(t);open(root).close();unlinkSync(join(root,missing));
  assert.throws(()=>open(root),code('DESTINATION_STATE_MISSING'));
  assert.equal(existsSync(join(root,missing)),false);
});

test('old evidence in an otherwise empty directory prevents implicit initialization',t=>{
  const root=directory(t);writeFileSync(join(root,'recovered-evidence.lock'),'old evidence');
  assert.throws(()=>open(root),code('DESTINATION_INITIALIZATION_REFUSED'));
  assert.equal(existsSync(join(root,'identity.bin')),false);
});

test('changed configured keys or corrupt snapshot fail closed without overwrite',t=>{
  const root=directory(t);open(root).close();const path=join(root,'snapshot.bin'),original=readFileSync(path);
  assert.throws(()=>openDestinationStore({directory:root,initial:{...initial(),serviceKey:hash('f')}}),code('DESTINATION_IDENTITY_MISMATCH'));
  assert.deepEqual(readFileSync(path),original);
  writeFileSync(path,original.subarray(0,Math.floor(original.length/2)));
  assert.throws(()=>open(root));assert.deepEqual(readFileSync(path),original.subarray(0,Math.floor(original.length/2)));
});

test('an uncertain commit poisons the handle and preserves its lifetime lock',t=>{
  const root=directory(t),store=open(root),path=join(root,'snapshot.bin');
  assert.throws(()=>store.transact(state=>{
    state.lastTime=1;renameSync(path,join(root,'snapshot-before-fault.bin'));mkdirSync(path);return {state,result:null};
  }),code('DESTINATION_COMMIT_UNCERTAIN'));
  assert.throws(()=>store.read(),code('DESTINATION_STORE_UNCERTAIN'));
  assert.throws(()=>store.transact(state=>({state,result:null})),code('DESTINATION_STORE_UNCERTAIN'));
  store.close();assert.equal(existsSync(join(root,'destination.lock')),true);
  assert.ok(readdirSync(root).some(name=>name.endsWith('.tmp')));
});

test('exact local dead-child lock recovery retains evidence and permits restart without resetting state',async t=>{
  const root=directory(t),moduleUrl=new URL('../packages/remote-tools/durable-store.mjs',import.meta.url).href;
  const source=`import {openDestinationStore} from ${JSON.stringify(moduleUrl)}; const store=openDestinationStore({directory:process.argv[1],initial:JSON.parse(process.argv[2])}); store.transact(state=>{state.lastTime=7;return {state,result:null}}); process.stdout.write('READY\\n'); setInterval(()=>{},1000);`;
  const child=spawn(process.execPath,['--input-type=module','-e',source,root,JSON.stringify(initial())],{stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',bytes=>stderr+=bytes);cleanupByDirectory.get(root).push(async()=>{if(child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill('SIGKILL');await done}});
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error(stderr||'child exited before ready')})]);
  const lock=inspectDestinationLock({directory:root});assert.equal(lock.pid,child.pid);
  assert.throws(()=>recoverDestinationLock({directory:root,expectedLock:lock}),code('DESTINATION_LOCK_OWNER_ALIVE'));
  const exited=once(child,'exit');child.kill('SIGKILL');await exited;
  assert.throws(()=>open(root),code('DESTINATION_LOCKED'));
  assert.throws(()=>recoverDestinationLock({directory:root,expectedLock:{...lock,instance:'00000000-0000-0000-0000-000000000000'}}),code('DESTINATION_LOCK_CHANGED'));
  const recovered=recoverDestinationLock({directory:root,expectedLock:lock});
  assert.equal(recovered.recovered,true);assert.equal(existsSync(recovered.retainedLock),true);
  const restarted=open(root);assert.equal(restarted.read().sequence,1);assert.equal(restarted.read().lastTime,7);
});
