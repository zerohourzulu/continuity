import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {createLocalDomain,createLocalOwner,openLocalOwner} from '../../packages/core-0.3/src/local-owner.ts';
import {openLocalSimulation,commitTerms} from '../../packages/core-0.3/src/simulation.ts';
import {openLocalRuntime} from '../../packages/core-0.3/src/runtime.ts';
import {PortableFileEventStore} from '../../packages/core-0.2/src/indexer/portable-file-event-store.ts';
const {generatePrivateKey,privateKeyToAccount}=createRequire(new URL('../../packages/core/package.json',import.meta.url))('viem/accounts');
const key=()=>{const a=privateKeyToAccount(generatePrivateKey());return {address:a.address,signHash:hash=>a.signMessage({message:{raw:hash}})}};
const code=value=>e=>e.code===value;
async function setup(t){const dir=mkdtempSync(join(tmpdir(),'continuity-handover-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));let tick=100;
 const config={historyFile:join(dir,'history.jsonl'),domain:createLocalDomain(),owner:'operations',controller:'operator',now:()=>tick};
 const owner=createLocalOwner(config),a=key(),b=key();for(const id of ['bea','alex'])owner.createAgent({id});
 owner.createRole({id:'reviewer'});owner.declareSuccession({id:'handover',from:'bea',to:'alex',role:'reviewer'});
 owner.appoint({agent:'bea',role:'reviewer',tenure:'shift:1',number:1,succession:'handover'});
 owner.admitRuntime({session:'session:bea',agent:'bea',epoch:1,key:'key:bea',address:a.address,expiresAt:200});
 owner.admitRuntime({session:'session:alex',agent:'alex',epoch:1,key:'key:alex',address:b.address,expiresAt:200});
 owner.grant({id:'collect',to:'bea',actions:['read','OBLIGATE'],resources:['incident:42'],expiresAt:180});
 owner.grant({id:'review',to:'alex',actions:['record-collection-disposition'],resources:['duty:42'],expiresAt:180});
 const options={...config,session:'session:bea',signHash:a.signHash};
 const op={id:'operation:42',action:'read',resource:'incident:42',role:'reviewer',tenure:'shift:1',termsCommitment:commitTerms({subject:'Synthetic incident review'})};
 const sim=openLocalSimulation(options),runtime=openLocalRuntime(options);
 const duty={id:'duty:42',operation:op.id,description:'Review the collected material.',deadline:170,succession:'handover',reviewAuthority:'review'};
 const handover={id:'handover:42',rule:'handover',fromAgent:'bea',fromTenure:'shift:1',toAgent:'alex',toTenure:'shift:2',role:'reviewer',number:2};
 return {owner,config,options,op,sim,runtime,duty,handover,a,b,now:n=>tick=n};}

test('a real simulated acknowledgment and signed receipt create a duty; succession grants no powers',async t=>{
 const {owner,config,options,op,sim,runtime,duty,handover,b}=await setup(t);
 await assert.rejects(runtime.obligate(duty),code('RECEIPT_UNAVAILABLE'));
 assert.equal((await sim.run(op)).invocation.status,'SUBMITTED');
 await assert.rejects(runtime.obligate(duty),code('RECEIPT_UNAVAILABLE'));
 assert.equal((await sim.recordReceipt(op)).recording.status,'ADMITTED');
 const created=await runtime.obligate(duty);assert.ok(created.eventId);
 const before=readFileSync(config.historyFile);assert.equal((await runtime.obligate(duty)).eventId,created.eventId);assert.deepEqual(readFileSync(config.historyFile),before);
 owner.succeed(handover);
 await assert.rejects(sim.run({...op,id:'old-process'}),code('RUNTIME_NOT_CURRENT'));
 assert.equal(owner.authorize({actor:'alex',action:'read',resource:'incident:42'}).decision,'DENY');
 const replacement=openLocalRuntime({...options,session:'session:alex',signHash:b.signHash});
 await assert.rejects(replacement.assign({id:'assign:42',obligation:duty.id}));
 owner.grant({id:'assign',to:'alex',actions:['ASSIGN_PERFORMANCE'],resources:[duty.id],expiresAt:180});
 const assigned=await replacement.assign({id:'assign:42',obligation:duty.id});
 const completed=readFileSync(config.historyFile);
 assert.equal((await replacement.assign({id:'assign:42',obligation:duty.id})).eventId,assigned.eventId);
 assert.equal(openLocalOwner(config).succeed(handover).status,'HANDOVER_RECORDED');
 assert.deepEqual(readFileSync(config.historyFile),completed);
 const events=owner.exportHistory();assert.equal(events.filter(e=>e.type==='OBLIGATION_CREATED').length,1);
 assert.equal(events.find(e=>e.type==='OBLIGATION_PERFORMANCE_ASSIGNED').data.toAgentId,'alex');
 assert.equal(events.find(e=>e.type==='OBLIGATION_CREATED').data.record.status,'OPEN');
 assert.equal(owner.survives('bea').epistemicStatus,'ESTABLISHED');
});
test('handover resumes after a failed second write and preserves retirement',async t=>{
 const {owner,config,handover}=await setup(t);const original=PortableFileEventStore.prototype.appendAtExpectedHead;
 PortableFileEventStore.prototype.appendAtExpectedHead=function(event,head){if(event.type==='ROLE_TRANSFERRED')throw Error('injected write failure');return original.call(this,event,head)};
 try {assert.throws(()=>owner.succeed(handover),code('WRITE_UNCONFIRMED'));}
 finally {PortableFileEventStore.prototype.appendAtExpectedHead=original}
 assert.equal(owner.exportHistory().at(-1).type,'AGENT_TERMINATED');
 assert.equal(openLocalOwner(config).succeed(handover).status,'HANDOVER_RECORDED');
 assert.equal(owner.exportHistory().filter(e=>e.type==='AGENT_TERMINATED').length,1);
 assert.equal(owner.exportHistory().filter(e=>e.type==='ROLE_TRANSFERRED').length,1);
 assert.throws(()=>owner.succeed({...handover,toTenure:'substituted'}),code('OPERATION_CONFLICT'));
});
test('invalid handover is fully validated before retirement',async t=>{
 const {owner,config,handover}=await setup(t);const before=readFileSync(config.historyFile);
 assert.throws(()=>owner.succeed({...handover,toAgent:'unregistered'}),code('TRANSITION_REJECTED'));
 assert.deepEqual(readFileSync(config.historyFile),before);
});
test('signed duty creation rejects changed data for the same durable identity',async t=>{
 const {sim,op,runtime,duty}=await setup(t);await sim.run(op);await sim.recordReceipt(op);await runtime.obligate(duty);
 await assert.rejects(runtime.obligate({...duty,description:'Different work'}),code('OPERATION_CONFLICT'));
});
test('revocation or expiry during duty signing cannot create the duty',async t=>{
 const {sim,op,options,a,owner,duty}=await setup(t);await sim.run(op);await sim.recordReceipt(op);
 const changed=openLocalRuntime({...options,signHash:async hash=>{owner.revoke('collect');return a.signHash(hash)}});
 await assert.rejects(changed.obligate(duty),code('HISTORY_CONFLICT'));
 assert.equal(owner.exportHistory().filter(e=>e.type==='OBLIGATION_CREATED').length,0);
});
test('administrative signing uses current policy after a slow signer returns',async t=>{
 const {sim,op,options,a,owner,duty,now}=await setup(t);await sim.run(op);await sim.recordReceipt(op);
 const slow=openLocalRuntime({...options,signHash:async hash=>{now(181);return a.signHash(hash)}});
 await assert.rejects(slow.obligate(duty));assert.equal(owner.exportHistory().filter(e=>e.type==='OBLIGATION_CREATED').length,0);
});
