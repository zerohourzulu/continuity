import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PortableFileEventStore,capacityOf} from '@ramex-labs/continuity/adapter';
import {openLocalAttemptRecorder} from '@ramex-labs/continuity/attempts';
import {createGateway} from '../src/gateway.mjs';
import {createCooperativeGateway} from '../src/cooperative.mjs';
import {inspectCase} from '../src/operations.mjs';
import {setup} from '../examples/setup.mjs';
import {cooperativeSetup} from '../examples/cooperative-setup.mjs';
import {lossyRelay} from '../examples/lossy-relay.mjs';
function fill(f){const store=new PortableFileEventStore(f.local.historyFile),events=store.readAll(),n=capacityOf(events).unreservedEvents;store.appendAll(Array.from({length:n},(_,i)=>({id:'padding:'+i,type:'AGENT_CREATED',timestamp:Date.now(),data:{agentId:'padding:'+i,principalId:f.local.owner,controllerId:f.local.controller,initialControlEpoch:1}})));}
test('ordinary gateway refuses new work during drain but retains the original reply',async t=>{
 const root=mkdtempSync(join(tmpdir(),'continuity-gateway-capacity-')),f=setup(join(root,'case'));let g=createGateway({...f.config,local:f.local});g=await g;
 t.after(async()=>{await g.close();rmSync(root,{recursive:true,force:true});});
 assert.equal((await g.run('create_incident_ticket',{title:'Synthetic drain test'})).status,'RESPONSE_RETAINED');fill(f);
 const before=readFileSync(f.local.historyFile);assert.equal((await g.run('read_incident',{document:'incident'})).reason,'CAPACITY_RESERVED');assert.deepEqual(readFileSync(f.local.historyFile),before);
 assert.equal((await g.run('create_incident_ticket',{title:'Synthetic drain test'})).status,'RECONCILIATION_ONLY');
 const diagnostic=inspectCase({historyFile:f.local.historyFile,storage:f.config.storage});assert.equal(diagnostic.capacity.mode,'DRAINING');assert.equal(diagnostic.capacity.canDeclareJob,false);assert.ok(diagnostic.remainingCoreEvents>0);
 await g.close();g=await createGateway({...f.config,local:f.local});assert.equal((await g.run('read_incident',{document:'incident'})).reason,'CAPACITY_RESERVED');
});
test('cooperating unknown job retains recovery, observation and duty room; cancellation needs its own budget',async t=>{
 const root=mkdtempSync(join(tmpdir(),'continuity-cooperative-capacity-')),f=await cooperativeSetup(join(root,'case')),relay=await lossyRelay(f.destination.url);f.config.destination.url=relay.url;
 f.owner.grant({id:'recovery-budget-test',to:'worker',actions:['OBSERVE_OUTCOME','CREATE_ATTEMPT_DUTY','cancel-operation'],resources:[f.operationId],expiresAt:Date.now()+3600000});
 let g=await createCooperativeGateway(f.config);t.after(async()=>{await g.close();await relay.close();await f.destination.close();rmSync(root,{recursive:true,force:true});});
 relay.behavior.dropAfter='commit';assert.equal((await g.run('create_incident_ticket',{title:'Synthetic recovery'})).status,'OUTCOME_UNKNOWN');fill(f);
 await g.close();g=await createCooperativeGateway(f.config);const counts={...relay.counts};assert.equal((await g.recover('create_incident_ticket')).status,'RECOVERED');
 assert.equal((await g.observe('create_incident_ticket')).status,'OBSERVATION_RECORDED');
 await openLocalAttemptRecorder(f.local).createDuty({id:'follow-up',intent:f.operationId,description:'Check the actual business outcome',deadline:Date.now()+3600000});
 const before=readFileSync(f.local.historyFile);assert.equal((await g.cancel('create_incident_ticket')).reason,'CAPACITY_RESERVED');assert.deepEqual(readFileSync(f.local.historyFile),before);
 assert.equal(relay.counts.prepare,counts.prepare);assert.equal(relay.counts.commit,counts.commit);assert.equal(relay.counts.cancel??0,0);assert.equal(f.destination.inspect().effects.length,1);
 assert.ok(capacityOf(new PortableFileEventStore(f.local.historyFile).readAll()).compatible);
});
