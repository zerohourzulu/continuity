import test from 'node:test';
import assert from 'node:assert/strict';
import {cooperativeSetup} from './cooperative-helpers.mjs';
import {createToolRegistry,REFERENCE_TOOLS} from '../packages/remote-tools/validation.mjs';

const tools=[...REFERENCE_TOOLS,{id:'ticket.close',action:'close-ticket',resource:'queue:security',
  fields:{original:'identifier',reason:'text'},compensates:{tool:'ticket.create',businessKeyField:'original'}}];
const closeRequest={operationId:'close:1',businessKey:'case:1:close',tool:'ticket.close',arguments:{original:'case:1',reason:'Investigation resolved'}};

test('compensation requires its own permission and preserves the original applied record',async t=>{
  const s=await cooperativeSetup(t,tools);s.owner.revoke('tools');
  s.owner.grant({id:'create-only',to:'bea',actions:['create-ticket'],resources:['queue:security'],expiresAt:500});
  assert.equal((await s.executor.run(s.request)).serviceReport.result.state,'APPLIED');
  assert.equal((await s.executor.run(closeRequest)).execution.status,'NOT_AUTHORIZED');
  assert.equal(s.destination.inspect().effects.length,1);
  s.owner.grant({id:'close-only',to:'bea',actions:['close-ticket'],resources:['queue:security'],expiresAt:500});
  assert.equal((await s.executor.run(closeRequest)).serviceReport.result.state,'APPLIED');
  const state=s.destination.inspect();assert.equal(state.effects.length,2);
  assert.equal(state.attempts.find(x=>x.operation.businessKey==='case:1').report.state,'APPLIED');
  assert.equal(state.effects[1].arguments.original,'case:1');
  await s.executor.run(closeRequest);assert.equal(s.destination.inspect().effects.length,2);
});

test('compensation refuses a missing, pending or differently typed source despite its own grant',async t=>{
  const s=await cooperativeSetup(t,tools);
  const pending=await s.admitOnly();await s.client.checkpoint(s.owner.exportHistory());await s.client.prepare(s.wire());
  const refusal=await s.executor.run(closeRequest);assert.notEqual(refusal.serviceReport?.result.state,'APPLIED');
  assert.equal(s.destination.inspect().effects.length,0);
  assert.equal((await s.client.status(pending)).result.state,'PENDING');
  const missing={...closeRequest,operationId:'close:missing',businessKey:'close:missing',arguments:{...closeRequest.arguments,original:'missing'}};
  assert.notEqual((await s.executor.run(missing)).serviceReport?.result.state,'APPLIED');
  const note={operationId:'note:1',businessKey:'note:1',tool:'incident.note',arguments:{note:'Different source type'}};
  assert.equal((await s.executor.run(note)).serviceReport.result.state,'APPLIED');
  const wrong={...closeRequest,operationId:'close:wrong',businessKey:'close:wrong',arguments:{...closeRequest.arguments,original:'note:1'}};
  assert.notEqual((await s.executor.run(wrong)).serviceReport?.result.state,'APPLIED');
  assert.equal(s.destination.inspect().effects.length,1);
});

test('typed extraction commits its unit, rejects implicit conversions and captures immutable tool configuration',()=>{
  const tool={id:'credit.reserve',action:'reserve-credit',resource:'account:synthetic',fields:{units:'amount',recipient:'identifier'},
    projection:{amount:'units',counterparty:'recipient',unit:'credits'}};
  const registry=createToolRegistry({serviceId:'s',account:'a',tools:[tool]});
  tool.projection.unit='dollars';
  const capture=args=>registry.capture({intentId:'i',businessKey:'b',tool:'credit.reserve',arguments:args,contractId:registry.contractId});
  assert.deepEqual(capture({units:5n,recipient:'team:blue'}).quantities,{amount:5n,counterparty:'team:blue'});
  assert.throws(()=>capture({units:'5',recipient:'team:blue'}));assert.throws(()=>capture({units:5,recipient:'team:blue'}));
  assert.throws(()=>capture({units:1n<<256n,recipient:'team:blue'}));
  assert.throws(()=>createToolRegistry({serviceId:'s',account:'a',tools:[tool,{...tool,id:'other',projection:{...tool.projection,unit:'other-unit'}}]}),/MIXED_AMOUNT_UNITS/);
  assert.notEqual(registry.contractId,createToolRegistry({serviceId:'s',account:'a',tools:[tool]}).contractId);
  assert.throws(()=>createToolRegistry({serviceId:'s',account:'a',tools:[{...tool,projection:{amount:'units'}}]}));
});
