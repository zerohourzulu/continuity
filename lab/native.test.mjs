import test from 'node:test';
import assert from 'node:assert/strict';
import {DynamicStructuredTool} from '@langchain/core/tools';
import {cooperativeSetup} from './cooperative-helpers.mjs';
import {createContinuityTool,createContinuityTools} from '../packages/remote-tools/langchain.mjs';
import {createCooperativeExecutor} from '../packages/remote-tools/executor.mjs';
import {REFERENCE_TOOLS,createToolRegistry} from '../packages/remote-tools/validation.mjs';
import {stateOf} from '../packages/core-0.3/src/local-store.ts';
import {canonicalDigest} from '../packages/remote-tools/wire.mjs';

const output=value=>JSON.parse(typeof value==='string'?value:value.content);
const invoke=async(tool,args)=>output(await tool.invoke(args));
const effects=s=>s.destination.inspect().effects;
const replay=s=>stateOf(s.owner.exportHistory());
const make=(s,tool='ticket.create',operationId='job:1',businessKey='case:1',executor=s.executor)=>createContinuityTool({registry:s.registry,executor,tool,operationId,businessKey});
const unitsTool={id:'credits.allocate',action:'allocate-credits',resource:'credits:synthetic',
  fields:{units:'amount',recipient:'identifier'},projection:{amount:'units',counterparty:'recipient',unit:'synthetic-credit'}};

test('actual LangChain tools perform configured text, enum and empty-input operations through Core and the destination',async t=>{
  const s=await cooperativeSetup(t),calls=[];
  const client=Object.fromEntries(['checkpoint','prepare','commit','status'].map(method=>[method,async(...args)=>{
    const call={method};calls.push(call);
    try {const reply=await s.client[method](...args);call.state=reply.result.state;return reply;}
    catch(error){call.error=error.name;call.cause=error.cause?.code;throw error;}
  }]));
  const executor=createCooperativeExecutor({local:s.local,client,registry:s.registry,role:'operator',tenure:'shift:1'});
  const cases=[['ticket.create',{title:'Investigate native invocation'}],['document.read',{}],
    ['document.access',{level:'reviewer'}],['incident.note',{note:'Native integration evidence'}]];
  for(const [index,[name,args]] of cases.entries()){
    const tool=make(s,name,`native:${index}`,`native-business:${index}`,executor);assert.ok(tool instanceof DynamicStructuredTool);
    assert.equal(tool.name,name.replaceAll('.','_'));let answer=await invoke(tool,args);
    if(answer.lastReportedServiceState==='REPORT_UNAVAILABLE') {
      t.diagnostic(`One status-only recovery for ${name}: ${JSON.stringify(calls)}`);
      const before=calls.length;
      // The same host-bound identity can reconcile, never dispatch another effect.
      answer=await invoke(tool,args);
      assert.deepEqual(calls.slice(before).map(call=>call.method),['status']);
    }
    assert.equal(answer.operationId,`native:${index}`);assert.equal(answer.lastReportedServiceState,'APPLIED');assert.equal(answer.externalOutcome,'NOT_PROVEN');
    assert.equal(effects(s).length,index+1);assert.equal(effects(s)[index].tool,name);assert.equal(canonicalDigest(effects(s)[index].arguments),canonicalDigest(args));
  }
});

test('model arguments cannot inject host-bound operation identity, business identity, endpoint or role',async t=>{
  const s=await cooperativeSetup(t),tool=make(s),before=s.owner.exportHistory().length;
  for(const injected of [{operationId:'model-selected'},{businessKey:'model-selected'},{endpoint:'http://127.0.0.1:9'},{role:'owner'},{tool:'document.access'}])
    await assert.rejects(tool.invoke({title:'Should not run',...injected}));
  assert.equal(s.owner.exportHistory().length,before);assert.equal(effects(s).length,0);
  // LangChain's own tool-call correlation ID is allowed and remains separate
  // from the application-bound operation ID.
  const answer=output(await tool.invoke({type:'tool_call',name:tool.name,id:'model-correlation-only',args:{title:'A permitted title'}}));
  assert.equal(answer.operationId,'job:1');assert.equal(effects(s).length,1);
  assert.equal(replay(s).intentAdmissions.has('model-correlation-only'),false);assert.equal(replay(s).intentAdmissions.has('job:1'),true);
});

test('repeated native invocation is stable and changed arguments cannot create a new dispatch under the same bound operation',async t=>{
  const s=await cooperativeSetup(t),tool=make(s),args={title:'Original title'};
  const first=await invoke(tool,args),again=await invoke(tool,args);assert.equal(first.lastReportedServiceState,'APPLIED');assert.equal(again.lastReportedServiceState,'APPLIED');
  assert.equal(effects(s).length,1);
  await assert.rejects(tool.invoke({title:'Changed title'}),error=>error.code==='OPERATION_CONFLICT');
  assert.equal(effects(s).length,1);assert.equal(effects(s)[0].arguments.title,'Original title');
});

test('a native tool cannot dispatch after its grant has been revoked and the destination acknowledged that checkpoint',async t=>{
  const s=await cooperativeSetup(t),tool=make(s);s.owner.revoke('tools');
  assert.equal((await s.client.checkpoint(s.owner.exportHistory())).result.state,'CHECKPOINTED');
  const answer=await invoke(tool,{title:'Revoked work'});assert.equal(answer.status,'NOT_AUTHORIZED');assert.equal(effects(s).length,0);
  assert.equal(replay(s).intentAdmissions.has('job:1'),false);
});

test('native decimal text projects exactly into bigint evidence and repeated invocation consumes the budget once',async t=>{
  const s=await cooperativeSetup(t,[unitsTool]);s.owner.revoke('tools');
  const exact=9007199254740993n;
  s.owner.grant({id:'native-budget',to:'bea',actions:['allocate-credits'],resources:['credits:synthetic'],expiresAt:500,
    maxAmount:exact,maxCumulativeAmount:exact,maxTransactions:1});
  const tool=make(s,'credits.allocate','native:units','business:units'),args={units:exact.toString(),recipient:'team:blue'};
  assert.equal((await invoke(tool,args)).lastReportedServiceState,'APPLIED');assert.equal((await invoke(tool,args)).lastReportedServiceState,'APPLIED');
  assert.equal(effects(s).length,1);assert.equal(effects(s)[0].arguments.units,exact);
  const declaration=replay(s).intentDeclarations.get('native:units').data;
  assert.equal(declaration.amount,exact);assert.equal(declaration.counterpartyId,'team:blue');
  assert.deepEqual(replay(s).authorityUsage.get('native-budget'),{authorityId:'native-budget',admittedTransactionCount:1,admittedCumulativeAmount:exact});
});

test('native quantity parsing refuses coercion, malformed decimals and uint256 overflow before any admission',async t=>{
  const s=await cooperativeSetup(t,[unitsTool]),tool=make(s,'credits.allocate','native:bad','business:bad'),before=s.owner.exportHistory().length;
  for(const units of ['', '-1','01','1.0','1e3','1,000',' 1',1,1n])await assert.rejects(tool.invoke({units,recipient:'team:blue'}));
  await assert.rejects(tool.invoke({units:(1n<<256n).toString(),recipient:'team:blue'}),error=>/2\^256 - 1/.test(error.message));
  assert.equal(s.owner.exportHistory().length,before);assert.equal(effects(s).length,0);
});

test('native compensation needs its own permission and links a separately recorded action to the original',async t=>{
  const close={id:'ticket.close',action:'close-ticket',resource:'queue:security',fields:{original:'identifier',reason:'text'},
    compensates:{tool:'ticket.create',businessKeyField:'original'}};
  const s=await cooperativeSetup(t,[...REFERENCE_TOOLS,close]);s.owner.revoke('tools');
  s.owner.grant({id:'create-only',to:'bea',actions:['create-ticket'],resources:['queue:security'],expiresAt:500});
  assert.equal((await invoke(make(s),{title:'Case needing resolution'})).lastReportedServiceState,'APPLIED');
  const tool=make(s,'ticket.close','native:close','business:close'),args={original:'case:1',reason:'Resolved'};
  assert.equal((await invoke(tool,args)).status,'NOT_AUTHORIZED');assert.equal(effects(s).length,1);
  s.owner.grant({id:'close-only',to:'bea',actions:['close-ticket'],resources:['queue:security'],expiresAt:500});
  assert.equal((await invoke(tool,args)).lastReportedServiceState,'APPLIED');assert.equal(effects(s).length,2);
  assert.equal(s.destination.inspect().attempts.find(x=>x.operation.businessKey==='case:1').report.state,'APPLIED');
});

for(const lost of ['prepare','commit'])test(`lost ${lost} reply remains uncertain through the native crossing without automatic redelivery`,async t=>{
  const s=await cooperativeSetup(t),calls={prepare:0,commit:0,status:0};
  const client={...s.client};
  for(const name of Object.keys(calls))client[name]=async(...args)=>{calls[name]++;const answer=await s.client[name](...args);
    if(name===lost&&calls[name]===1)throw Error(`Synthetic dropped ${name} reply`);return answer;};
  const executor=createCooperativeExecutor({local:s.local,client,registry:s.registry,role:'operator',tenure:'shift:1'});
  const tool=make(s,'ticket.create','job:1','case:1',executor),args={title:'Retry safely'};
  const first=await invoke(tool,args);assert.equal(first.invocation,'OUTCOME_UNKNOWN');
  assert.equal(effects(s).length,lost==='prepare'?0:1);
  const again=await invoke(tool,args);assert.equal(again.lastReportedServiceState,lost==='prepare'?'PENDING':'APPLIED');
  assert.deepEqual(calls,{prepare:1,commit:lost==='prepare'?0:1,status:1});assert.equal(effects(s).length,lost==='prepare'?0:1);
});

test('combined native tools reject default-name collisions and explicit unique names keep repeated tool operations separate',async t=>{
  const s=await cooperativeSetup(t),options={registry:s.registry,executor:s.executor},before=s.owner.exportHistory().length;
  const operations=[{tool:'ticket.create',operationId:'named:one',businessKey:'named-business:one'},
    {tool:'ticket.create',operationId:'named:two',businessKey:'named-business:two'}];
  assert.throws(()=>createContinuityTools({...options,operations}),error=>error.code==='DUPLICATE_TOOL_NAME');
  assert.equal(s.owner.exportHistory().length,before);assert.equal(effects(s).length,0);
  const tools=createContinuityTools({...options,operations:operations.map((operation,index)=>({...operation,name:`create_case_${index+1}`}))});
  assert.equal(Object.isFrozen(tools),true);assert.deepEqual(tools.map(tool=>tool.name),['create_case_1','create_case_2']);
  for(const [index,tool] of tools.entries()){
    const answer=await invoke(tool,{title:`Separately bound case ${index+1}`});
    assert.equal(answer.operationId,operations[index].operationId);assert.equal(answer.lastReportedServiceState,'APPLIED');
  }
  assert.equal(effects(s).length,2);assert.equal(s.destination.inspect().attempts[0].operation.businessKey,'named-business:one');
  assert.equal(s.destination.inspect().attempts[1].operation.businessKey,'named-business:two');
});

test('distinct registry IDs that normalize to the same framework name are refused before invocation',async t=>{
  const tools=[{id:'name.collision',action:'record-a',resource:'notes:synthetic',fields:{}},
    {id:'name_collision',action:'record-b',resource:'notes:synthetic',fields:{}}];
  const s=await cooperativeSetup(t,tools),before=s.owner.exportHistory().length;
  assert.throws(()=>createContinuityTools({registry:s.registry,executor:s.executor,
    operations:tools.map((tool,index)=>({tool:tool.id,operationId:`collision:${index}`,businessKey:`collision-business:${index}`}))}),
  error=>error.code==='DUPLICATE_TOOL_NAME');
  assert.equal(s.owner.exportHistory().length,before);assert.equal(effects(s).length,0);
});

test('native name and list validation refuses invalid defaults, invalid overrides, extra fields and unbounded batches',async t=>{
  const s=await cooperativeSetup(t,[...REFERENCE_TOOLS,{id:'non-provider:name',action:'record-special',resource:'notes:synthetic',fields:{}}]);
  const options={registry:s.registry,executor:s.executor},operation={tool:'ticket.create',operationId:'validated:one',businessKey:'validated-business:one'};
  for(const name of ['', 'space name','dot.name','colon:name','a'.repeat(65),'非ASCII'])
    assert.throws(()=>createContinuityTool({...options,...operation,name}),error=>error.code==='INVALID_TOOL_NAME');
  assert.throws(()=>createContinuityTool({...options,...operation,tool:'non-provider:name'}),error=>error.code==='INVALID_TOOL_NAME');
  assert.equal(createContinuityTool({...options,...operation,tool:'non-provider:name',name:'explicit_safe_name'}).name,'explicit_safe_name');
  assert.throws(()=>createContinuityTools({...options,operations:[]}));
  assert.throws(()=>createContinuityTools({...options,operations:Array.from({length:33},(_,index)=>({...operation,name:`name_${index}`}))}));
  assert.throws(()=>createContinuityTools({...options,operations:[{...operation,endpoint:'http://127.0.0.1:9'}]}));
  assert.equal(effects(s).length,0);assert.equal(replay(s).intentAdmissions.size,0);
});

test('native field schemas match registry control-character, identifier-length and negative-zero rules before executor entry',async()=>{
  const registry=createToolRegistry({serviceId:'schema-test',account:'synthetic',tools:[{
    id:'schema.inspect',action:'inspect',resource:'schema:synthetic',fields:{label:'text',subject:'identifier',count:'integer'}}]});
  let calls=0;
  const executor={run(){calls++;throw Error('Invalid input reached the executor');}};
  const tool=createContinuityTool({registry,executor,tool:'schema.inspect',operationId:'schema:one',businessKey:'schema-business:one'});
  const valid={label:'x'.repeat(1024),subject:'s'.repeat(128),count:0};
  assert.deepEqual(tool.schema.parse(valid),valid);
  assert.doesNotThrow(()=>registry.capture({intentId:'schema:one',businessKey:'schema-business:one',tool:'schema.inspect',arguments:valid,contractId:registry.contractId}));
  for(const changed of [{label:'line\nbreak'},{label:'delete\u007fcharacter'},{label:'x'.repeat(1025)},
    {subject:'nul\u0000character'},{subject:'s'.repeat(129)},{count:-0}])
    await assert.rejects(tool.invoke({...valid,...changed}));
  assert.equal(calls,0);
});
