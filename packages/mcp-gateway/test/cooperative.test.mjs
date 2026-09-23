import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {PortableFileEventStore,stateOf} from '@ramex-labs/continuity/adapter';
import {inspectAttemptHistory} from '@ramex-labs/continuity/attempts';
import {createCooperativeGateway,cancellationIdentity} from '../src/cooperative.mjs';
import {serveGatewayHttp} from '../src/http.mjs';
import {cooperativeSetup} from '../examples/cooperative-setup.mjs';
import {lossyRelay} from '../examples/lossy-relay.mjs';
import {testIssuer} from '../examples/test-issuer.mjs';
const name='create_incident_ticket',args={title:'Synthetic recovery case'};

async function fixture(t,options={}){
 const root=mkdtempSync(join(tmpdir(),'continuity-cooperative-test-')),f=await cooperativeSetup(join(root,'case'),options),relay=await lossyRelay(f.destination.url),gateways=[],cleanup=[];
 f.config.destination.url=relay.url;
 t.after(async()=>{for(const fn of cleanup)await fn();await Promise.allSettled(gateways.map(g=>g.close()));await relay.close();await f.destination.close();rmSync(root,{recursive:true,force:true});});
 return {...f,root,relay,onCleanup:fn=>cleanup.push(fn),
  async open(extra={}){const g=await createCooperativeGateway({...f.config,...extra});gateways.push(g);return g;},
  state:()=>stateOf(new PortableFileEventStore(f.local.historyFile).readAll()),
  grant:(actions,grant='recovery')=>f.owner.grant({id:grant,to:'worker',actions,resources:[f.operationId],expiresAt:Date.now()+60000}),
 };
}
async function pending(f,g){f.relay.behavior.dropBefore='commit';const r=await g.run(name,args);assert.equal(r.status,'OUTCOME_UNKNOWN');assert.equal(f.destination.inspect().effects.length,0);assert.equal(f.destination.inspect().attempts[0].report.state,'PENDING');}

test('cooperating job uses shared Core and keeps one identity across alias changes/restart',async t=>{
 const f=await fixture(t),g=await f.open(),first=await g.run(name,args);assert.equal(first.status,'RESPONSE_RETAINED');assert.equal(first.serviceState,'APPLIED');
 assert.equal((await g.run(name,args)).status,'RECONCILIATION_ONLY');assert.equal(f.relay.counts.commit,1);await g.close();
 const operations=f.config.operations.map(j=>({...j,name:'renamed'})),next=await f.open({operations});
 assert.equal((await next.run('renamed',args)).status,'RECONCILIATION_ONLY');assert.equal(f.relay.counts.commit,1);assert.equal(f.destination.inspect().effects.length,1);
 assert.equal((await next.run('renamed',{title:'Different'})).reason,'OPERATION_CONFLICT');
});

test('lost applied reply is recovered through signed status without prepare or commit',async t=>{
 const f=await fixture(t),g=await f.open();f.relay.behavior.dropAfter='commit';
 assert.equal((await g.run(name,args)).status,'OUTCOME_UNKNOWN');assert.equal(f.destination.inspect().effects.length,1);
 await g.close();const next=await f.open(),recovered=await next.recover(name);
 assert.equal(recovered.status,'RECOVERED');assert.equal(recovered.serviceState,'APPLIED');assert.equal(recovered.dispatchPerformed,false);
 assert.equal(f.relay.counts.prepare,1);assert.equal(f.relay.counts.commit,1);
 assert.equal(f.state().intentConsumptions.has(f.operationId),false);
});

test('cancellation needs separate permission and its own Core admission; repeats never send again',async t=>{
 const f=await fixture(t),g=await f.open();await pending(f,g);
 assert.equal((await g.cancel(name)).reason,'INSPECTION_DENIED');assert.equal(f.relay.counts.cancel,0);
 f.grant(['cancel-operation']);const result=await g.cancel(name);assert.equal(result.status,'CANCELLATION_REPORTED');assert.equal(result.serviceState,'CANCELLED');
 const cancelId=cancellationIdentity(f.local.domain,f.config.operations[0].businessKey);
 assert.ok(f.state().intentAdmissions.has(cancelId));assert.ok(f.state().intentConsumptions.has(cancelId));assert.notEqual(cancelId,f.operationId);
 assert.equal(result.originalDispatchPerformed,false);assert.equal(result.cancellationRequestSent,true);
 assert.equal((await g.cancel(name)).cancellationRequestSent,false);assert.equal(f.relay.counts.cancel,1);
 await g.close();const next=await f.open();assert.equal((await next.cancel(name)).serviceState,'CANCELLED');assert.equal(f.relay.counts.cancel,1);
 assert.equal((await next.run(name,args)).serviceState,'CANCELLED');assert.equal(f.relay.counts.commit,1);assert.equal(f.destination.inspect().effects.length,0);
});

test('cancellation after an effect reports TOO_LATE without undoing the effect',async t=>{
 const f=await fixture(t),g=await f.open();await g.run(name,args);f.grant(['cancel-operation']);
 const result=await g.cancel(name);assert.equal(result.serviceState,'TOO_LATE');assert.equal(f.destination.inspect().effects.length,1);
 assert.equal((await g.recover(name)).serviceState,'APPLIED');assert.equal(f.relay.counts.commit,1);
});

test('a lost cancellation reply remains unknown; status can confirm cancelled without resending cancel',async t=>{
 const f=await fixture(t),g=await f.open();await pending(f,g);f.grant(['cancel-operation']);f.relay.behavior.dropAfter='cancel';
 assert.equal((await g.cancel(name)).status,'OUTCOME_UNKNOWN');assert.equal(f.destination.inspect().attempts[0].report.state,'CANCELLED');
 assert.equal((await g.cancel(name)).status,'OUTCOME_UNKNOWN');assert.equal(f.relay.counts.cancel,1);
 assert.equal((await g.recover(name)).serviceState,'CANCELLED');assert.equal(f.relay.counts.cancel,1);
 assert.equal((await g.observe(name)).reason,'INSPECTION_DENIED');
});

test('revocation while cancellation is signed prevents the cancellation request',async t=>{
 const f=await fixture(t),g=await f.open();await pending(f,g);f.grant(['cancel-operation'],'cancel');await g.close();
 let revoked=false;const local={...f.local,async signHash(h){if(!revoked){revoked=true;f.owner.revoke('cancel');}return f.local.signHash(h);}};
 const next=await f.open({local});const result=await next.cancel(name);assert.equal(result.status,'REFUSED');assert.equal(f.relay.counts.cancel,0);
 assert.equal(f.destination.inspect().attempts[0].report.state,'PENDING');
});

test('revocation after prepare cannot send commit from the gateway',async t=>{
 const f=await fixture(t),g=await f.open();f.relay.behavior.after=operation=>{if(operation==='prepare')f.owner.revoke('write');};
 assert.equal((await g.run(name,args)).status,'OUTCOME_UNKNOWN');assert.equal(f.relay.counts.prepare,1);assert.equal(f.relay.counts.commit,0);assert.equal(f.destination.inspect().effects.length,0);
 assert.equal((await g.recover(name)).serviceState,'PENDING');
});

test('a new grant cannot substitute for the revoked path that admitted pending work',async t=>{
 const f=await fixture(t),g=await f.open();
 f.relay.behavior.after=operation=>{if(operation==='prepare'){
  f.owner.revoke('write');f.owner.grant({id:'new-write',to:'worker',actions:['create-ticket'],resources:['queue:incident'],expiresAt:Date.now()+60000});
 }};
 const result=await g.run(name,args);assert.equal(result.status,'OUTCOME_UNKNOWN');assert.equal(f.relay.counts.commit,0);assert.equal(f.destination.inspect().effects.length,0);
});

test('an admitted job may use its own reservation without charging its quantitative limit twice',async t=>{
 const f=await fixture(t,{tools:[{id:'ticket.create',action:'create-ticket',resource:'queue:incident',fields:{title:'text',amount:'amount'},projection:{amount:'amount',unit:'items'}}]});
 f.owner.revoke('write');f.owner.grant({id:'bounded',to:'worker',actions:['create-ticket'],resources:['queue:incident'],expiresAt:Date.now()+60000,maxAmount:7n,maxCumulativeAmount:7n,maxTransactions:1});
 const g=await f.open(),result=await g.run(name,{...args,amount:'7'});assert.equal(result.serviceState,'APPLIED');assert.equal(f.destination.inspect().effects.length,1);
});

test('retired agent is denied; a separately authorized successor can observe without executing',async t=>{
 const f=await fixture(t),g=await f.open();f.relay.behavior.dropAfter='commit';await g.run(name,args);
 const account=privateKeyToAccount(generatePrivateKey());f.owner.createAgent({id:'replacement'});
 f.owner.declareSuccession({id:'rule',from:'worker',to:'replacement',role:'analyst'});
 f.owner.succeed({id:'handover',rule:'rule',fromAgent:'worker',fromTenure:'shift:1',toAgent:'replacement',toTenure:'shift:2',role:'analyst',number:2});
 f.owner.admitRuntime({agent:'replacement',session:'replacement:1',epoch:1,key:'replacement:key',address:account.address,expiresAt:Date.now()+60000});
 f.owner.grant({id:'replacement-inspect',to:'replacement',actions:['inspect-operation'],resources:['queue:incident'],expiresAt:Date.now()+60000});
 f.owner.grant({id:'replacement-observe',to:'replacement',actions:['OBSERVE_OUTCOME'],resources:[f.operationId],expiresAt:Date.now()+60000});
 assert.equal((await g.recover(name)).reason,'RUNTIME_NOT_CURRENT');
 const replacement=await f.open({local:{...f.local,session:'replacement:1',signHash:h=>account.signMessage({message:{raw:h}})},operations:f.config.operations.map(j=>({...j,tenure:'shift:2'}))});
 assert.equal((await replacement.recover(name)).serviceState,'APPLIED');const observed=await replacement.observe(name);assert.equal(observed.status,'OBSERVATION_RECORDED');
 const before=f.state().events.length;assert.equal((await replacement.observe(name)).status,'OBSERVATION_RECORDED');assert.equal(f.state().events.length,before);
 const attempt=inspectAttemptHistory(f.owner.exportHistory()).attempts.find(x=>x.intentId===f.operationId);assert.equal(attempt.originalActorId,'worker');assert.equal(attempt.observations[0].actorId,'replacement');
 assert.equal(f.state().intentConsumptions.has(f.operationId),false);assert.equal((await replacement.cancel(name)).reason,'INSPECTION_DENIED');
 assert.equal(f.owner.authorize({actor:'replacement',action:'create-ticket',resource:'queue:incident'}).decision,'DENY');assert.equal(f.relay.counts.commit,1);
});

test('observation requires separate power and an authenticated APPLIED report',async t=>{
 const f=await fixture(t),g=await f.open();await pending(f,g);f.grant(['OBSERVE_OUTCOME']);
 await g.recover(name);assert.equal((await g.observe(name)).reason,'REPORT_NOT_APPLIED');assert.equal(f.state().outcomeObservations?.size??0,0);
 const applied=await fixture(t),other=await applied.open();await other.run(name,args);assert.equal((await other.observe(name)).reason,'INSPECTION_DENIED');
 applied.grant(['OBSERVE_OUTCOME']);assert.equal((await other.observe(name)).status,'OBSERVATION_RECORDED');assert.equal((await other.observe(name)).dutyDischarged,false);
});

test('corrupt retained signed report is refused rather than converted into an observation',async t=>{
 const f=await fixture(t),g=await f.open();await g.run(name,args);f.grant(['OBSERVE_OUTCOME']);
 const file=readdirSync(f.config.storage).find(n=>n.includes('.status.')),path=join(f.config.storage,file),row=JSON.parse(readFileSync(path));row.reply.result.effectId='forged';writeFileSync(path,JSON.stringify(row));
 assert.equal((await g.observe(name)).status,'REFUSED');assert.equal(g.status(name).status,'REFUSED');assert.equal(f.relay.counts.commit,1);
});

test('caller input cannot choose job, business identity, credentials or recovery report',async t=>{
 const f=await fixture(t),g=await f.open();
 for(const extra of [{operationId:'new'},{businessKey:'new'},{session:'replacement'},{url:'http://evil'},{report:{state:'APPLIED'}}])assert.equal((await g.run(name,{...args,...extra})).reason,'INVALID_ARGUMENTS');
 assert.equal((await g.recover('other')).reason,'UNKNOWN_TOOL');assert.equal(f.relay.counts.prepare,0);
 assert.equal((await g.cancel(name)).status,'REFUSED');
});

test('revoked inspection blocks status, lookup, cancellation and observation without remote traffic',async t=>{
 const f=await fixture(t),g=await f.open();await g.run(name,args);f.grant(['cancel-operation','OBSERVE_OUTCOME']);f.owner.revoke('inspect');const counts={...f.relay.counts};
 for(const method of ['status','recover','cancel','observe'])assert.equal((await g[method](name)).reason,'INSPECTION_DENIED');assert.deepEqual(f.relay.counts,counts);
});

test('typed amount fields use exact decimal text and retain original arguments for recovery',async t=>{
 const f=await fixture(t,{tools:[{id:'ticket.create',action:'create-ticket',resource:'queue:incident',fields:{title:'text',amount:'amount'},projection:{amount:'amount',unit:'items'}}]}),g=await f.open();
 const amountArgs={...args,amount:'7'};assert.equal((await g.run(name,amountArgs)).serviceState,'APPLIED');
 assert.equal(f.destination.inspect().effects[0].arguments.amount,7n);assert.equal((await g.run(name,amountArgs)).status,'RECONCILIATION_ONLY');
 assert.equal((await g.run(name,{...args,amount:'07'})).reason,'INVALID_ARGUMENTS');assert.equal((await g.run(name,{...args,amount:7})).reason,'INVALID_ARGUMENTS');
});

test('actual HTTP MCP recovery tools bind the same agent, survive token renewal and reject expired cancellation',async t=>{
 const f=await fixture(t),issuer=await testIssuer();f.grant(['cancel-operation','OBSERVE_OUTCOME']);let active=true;const clients=[];
 const http=await serveGatewayHttp({issuer:issuer.issuer,keys:issuer.keys,allowTestIssuer:true,isActive:()=>active,
  bindings:[{kind:'cooperative',id:'agent-a',subject:'alice',clientId:'example-client',gateway:f.config}]});
 f.onCleanup(async()=>{await Promise.allSettled(clients.map(c=>c.close()));await http.close();await issuer.close();});
 const connect=async()=>{const token=await issuer.issue(http.resourceUrl),c=new Client({name:'test',version:'1'},{versionNegotiation:{mode:{pin:'2026-07-28'}}});clients.push(c);await c.connect(new StreamableHTTPClientTransport(new URL(http.resourceUrl),{requestInit:{headers:{authorization:'Bearer '+token}}}));return c;};
 const c=await connect(),{tools}=await c.listTools({cursor:''});const call=async(client,tool,args)=>(await client.callTool({name:tool,arguments:args},{toolDefinition:tools.find(t=>t.name===tool)})).structuredContent;
 f.relay.behavior.dropAfter='commit';assert.equal((await call(c,name,args)).status,'OUTCOME_UNKNOWN');
 active=false;await assert.rejects(call(c,'continuity_cancel',{job:name}));assert.equal(f.relay.counts.cancel,0);
 active=true;const replacementLogin=await connect();assert.equal((await call(replacementLogin,'continuity_recover',{job:name})).serviceState,'APPLIED');
 assert.equal((await call(replacementLogin,'continuity_cancel',{job:name})).serviceState,'TOO_LATE');
 assert.equal((await call(replacementLogin,'continuity_observe',{job:name})).status,'OBSERVATION_RECORDED');assert.equal(f.relay.counts.commit,1);
});


test('missing inspection permission stops a fresh job before admission or dispatch',async t=>{
 const f=await fixture(t),g=await f.open();f.owner.revoke('inspect');
 assert.equal((await g.run(name,args)).reason,'INSPECTION_DENIED');assert.equal(f.relay.counts.prepare,0);assert.equal(f.state().intentAdmissions.size,0);
});

test('corrupt cancellation report is refused on retry without another cancellation request',async t=>{
 const f=await fixture(t),g=await f.open();await pending(f,g);f.grant(['cancel-operation']);await g.cancel(name);
 const file=readdirSync(f.config.storage).find(n=>n.includes('.cancel.')),path=join(f.config.storage,file),row=JSON.parse(readFileSync(path));row.reply.result.key='forged';writeFileSync(path,JSON.stringify(row));
 assert.equal((await g.cancel(name)).status,'REFUSED');assert.equal(f.relay.counts.cancel,1);
});

test('request guard revoked during cancellation signing prevents remote cancellation',async t=>{
 const f=await fixture(t),g=await f.open();await pending(f,g);f.grant(['cancel-operation']);await g.close();let active=true;
 const next=await f.open({local:{...f.local,async signHash(h){const signed=await f.local.signHash(h);active=false;return signed;}}});
 const result=await next.cancel(name,{assertCurrent(){if(!active)throw new Error('revoked login');}});
 assert.equal(result.status,'REFUSED');assert.equal(f.relay.counts.cancel,0);
});
