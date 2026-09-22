import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {createLocalDomain,createLocalOwner,openLocalOwner} from '../../packages/core-0.3/src/local-owner.ts';
import {openLocalSimulation,commitTerms} from '../../packages/core-0.3/src/simulation.ts';
const {generatePrivateKey,privateKeyToAccount}=createRequire(new URL('../../packages/core/package.json',import.meta.url))('viem/accounts');
const credential=()=>{const a=privateKeyToAccount(generatePrivateKey());return {address:a.address,signHash:hash=>a.signMessage({message:{raw:hash}})}};
const code=value=>e=>e.code===value;
function setup(t){const dir=mkdtempSync(join(tmpdir(),'continuity-runtime-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));let tick=100;
 const config={historyFile:join(dir,'history.jsonl'),domain:createLocalDomain(),owner:'operations',controller:'operator',now:()=>tick};
 const owner=createLocalOwner(config);owner.createAgent({id:'bea'});owner.createRole({id:'reviewer'});
 owner.appoint({agent:'bea',role:'reviewer',tenure:'shift:1',number:1});
 const key=credential();owner.admitRuntime({session:'session:1',agent:'bea',epoch:1,key:'key:1',address:key.address,expiresAt:200});
 owner.grant({id:'read',to:'bea',actions:['read'],resources:['incident:42'],expiresAt:180});
 const options={...config,session:'session:1',signHash:key.signHash};
 const runtime=openLocalSimulation(options);
 const op={id:'operation:42',action:'read',resource:'incident:42',role:'reviewer',tenure:'shift:1',termsCommitment:commitTerms({subject:'Synthetic incident review'})};
 return {owner,config,key,options,runtime,op,now:n=>tick=n};}

test('fresh signing, simulation, signed receipt and restarted retry need no fixture keys',async t=>{
 const {owner,config,runtime,op,options}=setup(t);const first=await runtime.run(op);
 assert.equal(first.status,'SIMULATION_RESULT');assert.equal(first.invocation.status,'SUBMITTED');
 assert.equal(first.externalEffect,'NONE_SIMULATED');assert.equal(first.admission.status,'ADMITTED');
 assert.equal('capability' in first.admission,false);
 const receipt=await runtime.recordReceipt(op);assert.equal(receipt.status,'RECEIPT_RESULT');assert.equal(receipt.recording.status,'ADMITTED');
 const before=readFileSync(config.historyFile);const reopened=openLocalSimulation(options);
 assert.equal((await reopened.run(op)).status,'RECONCILIATION_ONLY');
 assert.equal((await reopened.recordReceipt(op)).status,'ALREADY_RECORDED');assert.deepEqual(readFileSync(config.historyFile),before);
 assert.equal(openLocalOwner(config).exportHistory().length,owner.exportHistory().length);
});
test('wrong key cannot admit; changing resource or role under an operation ID is refused',async t=>{
 const {runtime,options,op,owner}=setup(t);const wrong=openLocalSimulation({...options,signHash:credential().signHash});
 const denied=await wrong.run(op);assert.equal(denied.status,'NOT_ADMITTED');
 assert.equal(owner.exportHistory().filter(e=>e.type==='TRANSACTION_INTENT_ADMITTED').length,0);
 await assert.rejects(runtime.run({...op,resource:'incident:43'}),code('OPERATION_CONFLICT'));
 await assert.rejects(runtime.run({...op,tenure:'other'}),code('OPERATION_CONFLICT'));
 assert.equal((await runtime.run(op)).invocation.status,'SUBMITTED');
});
test('role gives no power and denied input creates no declaration',async t=>{
 const {runtime,op,owner,config}=setup(t);owner.revoke('read');const before=readFileSync(config.historyFile);
 assert.equal((await runtime.run(op)).status,'NOT_AUTHORIZED');assert.deepEqual(readFileSync(config.historyFile),before);
});
test('retiring a live session fences it; fresh session needs a fresh key and operation ID',async t=>{
 const {runtime,op,owner,options,config,key}=setup(t);await runtime.run(op);
 owner.advanceEpoch({agent:'bea',from:1,to:2});
 await assert.rejects(runtime.run({...op,id:'second'}),code('RUNTIME_NOT_CURRENT'));
 assert.equal((await runtime.run(op)).status,'RECONCILIATION_ONLY');
 assert.throws(()=>owner.admitRuntime({session:'session:2',agent:'bea',epoch:2,key:'key:2',address:key.address,expiresAt:200}),code('TRANSITION_REJECTED'));
 const fresh=credential();owner.admitRuntime({session:'session:2',agent:'bea',epoch:2,key:'key:2',address:fresh.address,expiresAt:200});
 const next=openLocalSimulation({...options,session:'session:2',signHash:fresh.signHash});
 await assert.rejects(next.run(op),code('OPERATION_CONFLICT'));
 assert.equal((await next.run({...op,id:'second'})).invocation.status,'SUBMITTED');
 assert.equal(openLocalOwner(config).exportHistory().filter(e=>e.type==='CONTROL_EPOCH_ADVANCED').length,1);
});
test('history change during signing refuses admission; original operation can be inspected and retried',async t=>{
 const {options,op,owner,key,runtime}=setup(t);let once=true;
 const slow=openLocalSimulation({...options,signHash:async hash=>{if(once){once=false;owner.revoke('read')}return key.signHash(hash)}});
 await assert.rejects(slow.run(op),code('HISTORY_CONFLICT'));
 assert.equal((await runtime.run(op)).status,'NOT_AUTHORIZED');
 assert.equal(owner.exportHistory().filter(e=>e.type==='TRANSACTION_INTENT_ADMITTED').length,0);
});
test('expiry during asynchronous signing blocks dispatch',async t=>{
 const {options,op,key,now,owner}=setup(t);
 const slow=openLocalSimulation({...options,signHash:async hash=>{now(181);return key.signHash(hash)}});
 assert.equal((await slow.run(op)).status,'NOT_AUTHORIZED');
 assert.equal(owner.exportHistory().filter(e=>e.type==='TRANSACTION_INTENT_ADMITTED').length,0);
});
test('retirement during signing is a conflict; expired session cannot issue a new receipt',async t=>{
 const {options,op,key,owner,runtime,now}=setup(t);
 const slow=openLocalSimulation({...options,signHash:async hash=>{owner.advanceEpoch({agent:'bea',from:1,to:2});return key.signHash(hash)}});
 await assert.rejects(slow.run(op),code('HISTORY_CONFLICT'));
 await assert.rejects(runtime.recordReceipt(op),code('RECEIPT_UNAVAILABLE'));
 now(201);await assert.rejects(runtime.run({...op,id:'second'}),code('RUNTIME_NOT_CURRENT'));
});
test('overlapping same-operation requests produce one admission and one acknowledgment',async t=>{
 const {runtime,op,owner}=setup(t);const results=await Promise.allSettled([runtime.run(op),runtime.run(op)]);
 assert.equal(results.filter(r=>r.status==='fulfilled'&&r.value.status==='SIMULATION_RESULT').length,1);
 assert.equal(owner.exportHistory().filter(e=>e.type==='TRANSACTION_INTENT_ADMITTED').length,1);
 assert.equal(owner.exportHistory().filter(e=>e.type==='TRANSACTION_INTENT_CONSUMED').length,1);
});
test('mutation while signing cannot replace the captured request',async t=>{
 const {options,op,key}=setup(t);let saved;
 const selected={...op};const runtime=openLocalSimulation({...options,signHash:async hash=>{saved=hash;selected.resource='incident:43';return key.signHash(hash)}});
 const result=await runtime.run(selected);assert.equal(result.invocation.status,'SUBMITTED');assert.match(saved,/^0x[0-9a-f]{64}$/);
 assert.equal(result.admission.admissionEvent.data.authorizationProof.request.resource,'incident:42');
});
test('bad data and signing exceptions do not admit or leak signer errors',async t=>{
 const {options,op,owner}=setup(t);let gets=0;const malicious={...op};Object.defineProperty(malicious,'resource',{enumerable:true,get(){gets++;return 'incident:42'}});
 const runtime=openLocalSimulation({...options,signHash:async()=>{throw Error('private signer detail')}});
 await assert.rejects(runtime.run(malicious),code('INVALID_INPUT'));assert.equal(gets,0);
 await assert.rejects(runtime.run({...op,termsCommitment:undefined}),code('INVALID_INPUT'));
 await assert.rejects(runtime.run(op),code('SIGNER_FAILED'));
 assert.equal(owner.exportHistory().filter(e=>e.type==='TRANSACTION_INTENT_ADMITTED').length,0);
});
test('receipt signing does not ignore a concurrent history change',async t=>{
 const {runtime,options,op,key,owner}=setup(t);await runtime.run(op);
 const changed=openLocalSimulation({...options,signHash:async hash=>{owner.advanceEpoch({agent:'bea',from:1,to:2});return key.signHash(hash)}});
 await assert.rejects(changed.recordReceipt(op),code('HISTORY_CONFLICT'));
 assert.equal(owner.exportHistory().filter(e=>e.type==='RECEIPT_RECORDED').length,0);
});
test('restart after admission without an acknowledgment preserves UNKNOWN and never resubmits',async t=>{
 const {DurableAdmissionCoordinator}=await import('../../packages/core-0.2/src/sdk/durable-admission.ts');
 const {runtime,options,op,owner,config}=setup(t);const invoke=DurableAdmissionCoordinator.prototype.invoke;
 DurableAdmissionCoordinator.prototype.invoke=async()=>({status:'OUTCOME_UNKNOWN',reason:'Injected interruption before invocation'});
 try {assert.equal((await runtime.run(op)).invocation.status,'OUTCOME_UNKNOWN');}
 finally {DurableAdmissionCoordinator.prototype.invoke=invoke}
 const before=readFileSync(config.historyFile),result=await openLocalSimulation(options).run(op);
 assert.equal(result.status,'RECONCILIATION_ONLY');assert.equal(result.result.status,'OUTCOME_UNKNOWN');
 assert.deepEqual(readFileSync(config.historyFile),before);
 assert.equal(owner.exportHistory().filter(e=>e.type==='TRANSACTION_INTENT_CONSUMED').length,0);
 await assert.rejects(runtime.recordReceipt(op),code('RECEIPT_UNAVAILABLE'));
});
test('runtime expiration while a receipt signer waits prevents recording',async t=>{
 const {runtime,options,op,key,now,owner}=setup(t);await runtime.run(op);
 const slow=openLocalSimulation({...options,signHash:async hash=>{now(201);return key.signHash(hash)}});
 await assert.rejects(slow.recordReceipt(op),code('RUNTIME_NOT_CURRENT'));
 assert.equal(owner.exportHistory().filter(e=>e.type==='RECEIPT_RECORDED').length,0);
});
