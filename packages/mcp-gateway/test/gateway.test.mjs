import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,existsSync,readdirSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {PortableFileEventStore,stateOf} from '@ramex-labs/continuity/adapter';
import {setup} from '../examples/setup.mjs';
import {recoverDeadHost} from '../src/operations.mjs';
import {createGateway,operationIdentity} from '../src/gateway.mjs';
const title={title:'Investigate incident 42'};
function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'continuity-gateway-test-')),f=setup(join(root,'case')),gateways=[];
 t.after(async()=>{for(const g of gateways)await g.close();rmSync(root,{recursive:true,force:true});});
 const dir=join(root,'case');
 return {...f,dir,
  control:(kind,value)=>writeFileSync(join(dir,kind+'.control.json'),JSON.stringify(value),{mode:0o600}),
  count:(kind)=>existsSync(join(dir,kind+'.calls.jsonl'))?readFileSync(join(dir,kind+'.calls.jsonl'),'utf8').trim().split('\n').length:0,
  state:()=>stateOf(new PortableFileEventStore(f.config.historyFile).readAll()),
  async open(extra={}){const g=await createGateway({...f.config,local:f.local,...extra});gateways.push(g);return g;},
 };
}
async function waitFor(predicate){for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}throw Error('Condition deadline');}

test('two upstreams perform ordinary MCP operations; exact repeats and restart never repeat effects',async t=>{
 const f=fixture(t),g=await f.open();
 writeFileSync(join(f.dir,'incident.txt'),'Test document bytes.');
 const read=await g.run('read_incident',{document:'incident'});assert.equal(read.status,'RESPONSE_RETAINED');assert.equal(read.upstreamResult.content[0].text,'Test document bytes.');
 const first=await g.run('create_incident_ticket',title);assert.equal(first.status,'RESPONSE_RETAINED');assert.equal(first.canonicalDisposition,'SUBMITTED');
 assert.equal((await g.run('create_incident_ticket',title)).status,'RECONCILIATION_ONLY');
 await g.close();const again=await f.open();
 assert.equal((await again.run('create_incident_ticket',title)).status,'RECONCILIATION_ONLY');
 assert.equal(again.status('create_incident_ticket').canonicalResponseRecorded,true);
 assert.equal(f.count('documents'),1);assert.equal(f.count('tickets'),1);assert.equal(JSON.parse(readFileSync(join(f.dir,'ticket-1.json'))).title,title.title);assert.equal(existsSync(join(f.dir,'ticket-2.json')),false);
});

test('client cannot choose actor, operation identity, paths or an unapproved job',async t=>{
 const f=fixture(t),g=await f.open();
 for(const extra of [{operationId:'fresh'},{businessKey:'fresh'},{actor:'operator'},{session:'other'},{path:'/etc/passwd'}])
  assert.equal((await g.run('create_incident_ticket',{...title,...extra})).reason,'INVALID_ARGUMENTS');
 assert.equal((await g.run('unknown',{})).reason,'UNKNOWN_TOOL');
 assert.equal(f.count('tickets'),0);assert.equal(f.state().intentAdmissions.size,0);
});

test('changed arguments or an alias renamed after restart cannot create a second business operation',async t=>{
 const f=fixture(t),g=await f.open();await g.run('create_incident_ticket',title);
 assert.equal((await g.run('create_incident_ticket',{title:'Changed work'})).reason,'OPERATION_CONFLICT');await g.close();
 const operations=structuredClone(f.config.operations);operations[1].name='renamed_ticket';const renamed=await f.open({operations});
 assert.equal((await renamed.run('renamed_ticket',title)).status,'RECONCILIATION_ONLY');
 assert.equal(f.count('tickets'),1);
});

test('revocation refuses a new job before spawning the upstream',async t=>{
 const f=fixture(t),g=await f.open();f.owner.revoke('write');
 assert.equal((await g.run('create_incident_ticket',title)).status,'DENIED');
 assert.equal(g.why('create_incident_ticket').decision,'DENY');assert.equal(f.count('tickets'),0);assert.equal(f.state().intentAdmissions.size,0);
});

test('revocation during asynchronous signing cannot cross the Core admission boundary',async t=>{
 const f=fixture(t);let first=true;
 const local={...f.local,async signHash(hash){if(first){first=false;f.owner.revoke('write');}return f.local.signHash(hash);}};
 const g=await f.open({local});const r=await g.run('create_incident_ticket',title);
 assert.equal(r.reason,'HISTORY_CONFLICT');assert.equal(f.count('tickets'),0);assert.equal(f.state().intentAdmissions.size,0);
});

test('retired worker stays connected but cannot run or inspect; explicitly authorized replacement only inspects',async t=>{
 const f=fixture(t),g=await f.open();await g.run('create_incident_ticket',title);f.owner.advanceEpoch({agent:'worker',from:1,to:2});
 assert.equal((await g.run('read_incident',{document:'incident'})).reason,'RUNTIME_NOT_CURRENT');
 assert.equal(g.status('create_incident_ticket').reason,'RUNTIME_NOT_CURRENT');
 const account=privateKeyToAccount(generatePrivateKey());f.owner.createAgent({id:'replacement'});f.owner.createRole({id:'reviewer'});
 f.owner.appoint({agent:'replacement',role:'reviewer',tenure:'review:1',number:1});
 f.owner.admitRuntime({agent:'replacement',session:'replacement:1',epoch:1,key:'replacement:key',address:account.address,expiresAt:Date.now()+60000});
 f.owner.grant({id:'replacement-inspect',to:'replacement',actions:['inspect-operation'],resources:['queue:incident'],expiresAt:Date.now()+60000});
 const operations=f.config.operations.map(j=>({...j,role:'reviewer',tenure:'review:1'}));
 const replacement=await f.open({operations,local:{...f.local,session:'replacement:1',signHash:h=>account.signMessage({message:{raw:h}})}});
 assert.equal(replacement.status('create_incident_ticket').status,'RESPONSE_RETAINED');
 assert.equal(replacement.status('read_incident').reason,'INSPECTION_DENIED');
 assert.equal((await replacement.run('create_incident_ticket',title)).reason,'OPERATION_CONFLICT');
 assert.equal(f.count('tickets'),1);
});

test('inspection permission is distinct from execution and is checked on repeats',async t=>{
 const f=fixture(t),g=await f.open();await g.run('create_incident_ticket',title);f.owner.revoke('inspect');
 assert.equal(g.status('create_incident_ticket').reason,'INSPECTION_DENIED');
 assert.equal(g.why('create_incident_ticket').reason,'INSPECTION_DENIED');
 assert.equal((await g.run('create_incident_ticket',title)).reason,'INSPECTION_DENIED');assert.equal(f.count('tickets'),1);
});

test('schema drift refuses before admission; no permission is inferred from discovery',async t=>{
 const f=fixture(t);f.control('tickets',{changed:true});const g=await f.open();
 assert.equal((await g.run('create_incident_ticket',title)).reason,'TOOL_CHANGED');assert.equal(f.state().intentAdmissions.size,0);assert.equal(f.count('tickets'),0);
});

test('lost upstream reply after durable effect remains UNKNOWN across repeats and restart',async t=>{
 const f=fixture(t);f.control('tickets',{crash:true});const g=await f.open();
 assert.equal((await g.run('create_incident_ticket',title)).status,'OUTCOME_UNKNOWN');
 assert.equal((await g.run('create_incident_ticket',title)).status,'OUTCOME_UNKNOWN');await g.close();
 const next=await f.open();assert.equal((await next.run('create_incident_ticket',title)).status,'OUTCOME_UNKNOWN');
 assert.equal(next.status('create_incident_ticket').dispatchPerformed,false);assert.equal(f.count('tickets'),1);
});

test('timeout is not cancellation or permission to resend',async t=>{
 const f=fixture(t);f.control('tickets',{delay:600});const g=await f.open({timeoutMs:300});
 const first=await g.run('create_incident_ticket',title);assert.equal(first.status,'OUTCOME_UNKNOWN');
 assert.equal((await g.run('create_incident_ticket',title)).status,'OUTCOME_UNKNOWN');assert.equal(f.count('tickets'),1);
});

test('late response after retirement is retained separately from canonical consumption',async t=>{
 const f=fixture(t);f.control('tickets',{delay:300});const g=await f.open();const pending=g.run('create_incident_ticket',title);
 await waitFor(()=>f.count('tickets')===1);f.owner.advanceEpoch({agent:'worker',from:1,to:2});
 const result=await pending;assert.equal(result.status,'RESPONSE_RETAINED');assert.equal(result.canonicalDisposition,'OUTCOME_UNKNOWN');
 assert.equal(f.state().intentConsumptions.size,0);assert.equal(f.count('tickets'),1);
});

test('upstream error is retained as an error report, not business success',async t=>{
 const f=fixture(t);f.control('tickets',{error:true});const g=await f.open();
 const result=await g.run('create_incident_ticket',title);assert.equal(result.upstreamResult.isError,true);assert.equal(result.externalOutcome,'NOT_PROVEN');
 assert.equal((await g.run('create_incident_ticket',title)).status,'RECONCILIATION_ONLY');assert.equal(f.count('tickets'),1);
});

test('header-mismatch response cannot trigger SDK automatic redelivery',async t=>{
 const f=fixture(t);f.control('tickets',{headerMismatch:true});const g=await f.open();
 const r=await g.run('create_incident_ticket',title);assert.equal(r.status,'OUTCOME_UNKNOWN');assert.equal(f.count('tickets'),1);
});

test('unsupported upstream content preserves uncertainty without retransmission',async t=>{
 const f=fixture(t);f.control('tickets',{invalidOutput:true});const g=await f.open();
 assert.equal((await g.run('create_incident_ticket',title)).status,'OUTCOME_UNKNOWN');
 assert.equal((await g.run('create_incident_ticket',title)).status,'OUTCOME_UNKNOWN');assert.equal(f.count('tickets'),1);
});

test('missing attempt storage consumes no downstream effect and cannot be repaired by automatic replay',async t=>{
 const f=fixture(t),g=await f.open();rmSync(f.config.storage,{recursive:true});
 assert.equal((await g.run('create_incident_ticket',title)).status,'OUTCOME_UNKNOWN');mkdirSync(f.config.storage,{mode:0o700});
 assert.equal((await g.run('create_incident_ticket',title)).status,'OUTCOME_UNKNOWN');assert.equal(f.count('tickets'),0);assert.equal(f.state().intentAdmissions.size,1);
});

test('corrupt retained bytes are refused despite existing canonical response digest',async t=>{
 const f=fixture(t),g=await f.open();await g.run('create_incident_ticket',title);
 const path=join(f.config.storage,readdirSync(f.config.storage).find(x=>x.endsWith('.report.json')));
 const report=JSON.parse(readFileSync(path));report.result.content[0].text='forged';writeFileSync(path,JSON.stringify(report));
 assert.equal((await g.run('create_incident_ticket',title)).status,'OUTCOME_UNKNOWN');assert.equal(g.status('create_incident_ticket').status,'OUTCOME_UNKNOWN');assert.equal(f.count('tickets'),1);
});

test('overlapping calls are explicitly BUSY; no second effect',async t=>{
 const f=fixture(t);f.control('tickets',{delay:300});const g=await f.open();
 const first=g.run('create_incident_ticket',title);await waitFor(()=>f.count('tickets')===1);
 assert.equal((await g.run('create_incident_ticket',title)).status,'BUSY');await first;assert.equal(f.count('tickets'),1);
});

test('duplicate aliases/business jobs and non-object schemas are not silently accepted',async t=>{
 const f=fixture(t);
 await assert.rejects(f.open({operations:[f.config.operations[0],f.config.operations[0]]}));
 const ops=structuredClone(f.config.operations);ops[0].approval.inputSchema={type:'array'};await assert.rejects(f.open({operations:ops}));
 assert.equal(operationIdentity(f.local.domain,'one'),operationIdentity(f.local.domain,'one'));
 assert.notEqual(operationIdentity(f.local.domain,'one'),operationIdentity(f.local.domain,'two'));
});

test('actual packaged CLI accepts modern and legacy clients and hides host identities',async t=>{
 const f=fixture(t);
 for(const mode of [{pin:'2026-07-28'},'legacy']){
  const client=new Client({name:'test-host',version:'1'},{versionNegotiation:{mode}});
  const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/cli.mjs',import.meta.url)),'--config',f.configFile],stderr:'pipe'});
  try{await client.connect(transport);assert.equal((await client.listTools()).tools.length,4);
   const result=await client.callTool({name:'read_incident',arguments:{document:'incident'}});
   assert.equal(result.isError,false);assert.equal(JSON.stringify(result).includes(f.config.keyFile),false);
   const why=await client.callTool({name:'continuity_why',arguments:{job:'read_incident'}});assert.equal(why.structuredContent.executionCapability,false);
  }finally{await client.close();}
 }
 assert.equal(f.count('documents'),1);
});


test('duplicate keys and oversized raw upstream frames are rejected before SDK interpretation',async t=>{
 for(const behavior of [{duplicate:true},{oversized:true}]){
  const f=fixture(t);f.control('tickets',behavior);const g=await f.open();
  assert.equal((await g.run('create_incident_ticket',title)).status,'OUTCOME_UNKNOWN');
  assert.equal((await g.run('create_incident_ticket',title)).status,'OUTCOME_UNKNOWN');assert.equal(f.count('tickets'),1);
 }
});

test('killing the gateway after an upstream effect does not cause replay after restart',async t=>{
 const f=fixture(t);f.control('tickets',{delay:300});
 const client=new Client({name:'crash-host',version:'1'},{versionNegotiation:{mode:{pin:'2026-07-28'}}});
 const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/cli.mjs',import.meta.url)),'--config',f.configFile],stderr:'pipe'});
 try{
  await client.connect(transport);
  const pending=client.callTool({name:'create_incident_ticket',arguments:title}).catch(()=>null);
  await waitFor(()=>f.count('tickets')===1);assert.ok(transport.pid);process.kill(transport.pid,'SIGKILL');await pending;
 }finally{await client.close();}
 recoverDeadHost(f.config.storage);const restarted=await f.open();assert.equal((await restarted.run('create_incident_ticket',title)).status,'OUTCOME_UNKNOWN');assert.equal(f.count('tickets'),1);
});

test('a wrong signing key cannot impersonate the configured runtime',async t=>{
 const f=fixture(t),wrong=privateKeyToAccount(generatePrivateKey()),g=await f.open({local:{...f.local,signHash:h=>wrong.signMessage({message:{raw:h}})}});
 const r=await g.run('create_incident_ticket',title);assert.notEqual(r.status,'RESPONSE_RETAINED');assert.equal(f.count('tickets'),0);assert.equal(f.state().intentAdmissions.size,0);
});

test('report-write failure never returns an unretained response as durable evidence',async t=>{
 const f=fixture(t),g=await f.open();
 const op=operationIdentity(f.local.domain,f.config.operations[1].businessKey);
 writeFileSync(join(f.config.storage,op.slice(4)+'.report.json'),'blocked',{mode:0o600});
 const r=await g.run('create_incident_ticket',title);assert.equal(r.status,'OUTCOME_UNKNOWN');assert.equal(r.upstreamResult,undefined);
 assert.equal((await g.run('create_incident_ticket',title)).status,'OUTCOME_UNKNOWN');assert.equal(f.count('tickets'),1);
});

test('permission checks do not mistake an expired grant for current authority',async t=>{
 const f=fixture(t),g=await f.open({local:{...f.local,now:()=>Date.now()+7200000}});
 assert.equal((await g.run('create_incident_ticket',title)).reason,'RUNTIME_NOT_CURRENT');assert.equal(f.count('tickets'),0);
});


test('an open upstream schema stays pinned while the gateway exposes and enforces a closed schema',async t=>{
 const f=fixture(t);f.control('tickets',{openSchema:true});const operations=structuredClone(f.config.operations);delete operations[1].approval.inputSchema.additionalProperties;
 const g=await f.open({operations});assert.equal(g.tools().find(t=>t.name==='create_incident_ticket').inputSchema.additionalProperties,false);
 assert.equal((await g.run('create_incident_ticket',{...title,session:'injected'})).reason,'INVALID_ARGUMENTS');assert.equal(f.count('tickets'),0);
 assert.equal((await g.run('create_incident_ticket',title)).status,'RESPONSE_RETAINED');assert.equal(f.count('tickets'),1);
});

test('explicit legacy upstream uses the same approval and no-redelivery controls',async t=>{
 const f=fixture(t),upstreams=f.config.upstreams.map(u=>({...u,protocol:'legacy'})),g=await f.open({upstreams});
 f.control('tickets',{headerMismatch:true});assert.equal((await g.run('create_incident_ticket',title)).status,'OUTCOME_UNKNOWN');
 assert.equal((await g.run('create_incident_ticket',title)).status,'OUTCOME_UNKNOWN');assert.equal(f.count('tickets'),1);
});
