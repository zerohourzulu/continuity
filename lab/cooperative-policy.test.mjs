import test from 'node:test';
import assert from 'node:assert/strict';
import {cooperativeSetup} from './cooperative-helpers.mjs';
import {stateOf,append,event,configuration} from '../packages/core-0.3/src/local-store.ts';
import {PortableFileEventStore} from '../packages/core-0.2/src/indexer/portable-file-event-store.ts';
import {openLocalExecution} from '../packages/core-0.3/src/execution.ts';
import * as core from '../packages/core-0.2/src/core/index.ts';

const typedTools=[{id:'credits.allocate',action:'allocate-credits',resource:'credits:synthetic',
  fields:{units:'amount',recipient:'identifier'},projection:{amount:'units',counterparty:'recipient',unit:'synthetic-credit'}}];
const request=(units=50n)=>({operationId:'allocation:1',businessKey:'business:allocation:1',tool:'credits.allocate',arguments:{units,recipient:'recipient:synthetic'}});
const replay=s=>stateOf(s.owner.exportHistory());
const usage=s=>replay(s).authorityUsage.get('limited');
const effects=s=>s.destination.inspect().effects.length;
const refused=answer=>{assert.equal(answer.result.state,'REFUSED');assert.equal(answer.result.code,'AUTHORIZATION_REFUSED');};
async function bounded(t,limits={maxAmount:50n,maxCumulativeAmount:50n,maxTransactions:1}){
  const s=await cooperativeSetup(t,typedTools);s.owner.revoke('tools');
  s.owner.grant({id:'limited',to:'bea',actions:['allocate-credits'],resources:['credits:synthetic'],expiresAt:500,...limits});
  return s;
}
function prohibit(s,{scope='ROOT',notBefore=100,rootAuthorityId='tools'}={}){
  const state=replay(s),grant={kind:'PROHIBITION',scope,authorityId:`block:${scope}:${notBefore}`,
    grantorId:scope==='GLOBAL'?state.genesis.globalPolicySourceId:s.local.owner,subjectActorId:'bea',
    ...(scope==='ROOT'?{rootAuthorityId}:{}),
    constraints:{actions:['create-ticket'],resources:['queue:security'],quantitative:false,
      notBefore,expiresAt:400,maxDelegationDepth:0,requiredIntersectionIds:[]}};
  // A trusted policy-source fixture appends a real, replay-validated prohibition;
  // this does not invent a public owner-facade prohibition method.
  append(new PortableFileEventStore(s.local.historyFile),configuration(s.local),event('AUTHORITY_GRANTED',s.local.now(),{grant}));
  return grant.authorityId;
}

async function admitMismatchedProjection(s,input,changed){
  const selected=s.registry.capture(s.wire(input));
  const adapter={adapterProfile:core.approvedPortableAdapterProfileForPolicy(core.PORTABLE_ADAPTER_POLICY_E5_HASH,core.REMOTE_SERVICE_REPORT_ADAPTER_ID),
    submit(submission){const identity=core.derivePortableAdapterIdentity(submission);return {status:'OUTCOME_UNKNOWN',idempotencyKey:identity.idempotencyKey,submissionFingerprint:identity.submissionFingerprint};},
    reconcile(){throw Error('No test reconciliation');}};
  await openLocalExecution(s.local,adapter,'REMOTE_REPORT').run({id:input.operationId,action:selected.action,resource:selected.resource,
    role:'operator',tenure:'shift:1',termsCommitment:selected.termsCommitment,...selected.quantities,...changed});
  const admission=replay(s).intentAdmissions.get(input.operationId);assert.ok(admission,'The mismatched opaque projection must be a real Core admission for this negative test');
  return admission.adapterIdentity.idempotencyKey;
}

test('a fresh alternative grant cannot rescue the original revoked admission proof at the latest checkpoint',async t=>{
  const s=await cooperativeSetup(t),key=await s.admitOnly();
  const admitted=replay(s).intentAdmissions.get(s.request.operationId);
  const proof=s.owner.exportHistory()[admitted.admissionEventPosition].data.authorizationProof;
  assert.equal(proof.permissionPath.at(-1).authorityId,'tools');
  s.owner.revoke('tools');s.owner.grant({id:'replacement-tools',to:'bea',actions:['create-ticket'],resources:['queue:security'],expiresAt:500});
  assert.equal((await s.client.checkpoint(s.owner.exportHistory())).result.state,'CHECKPOINTED');
  // First prepare occurs after the latest checkpoint, so refusal must come from
  // original-proof liveness, not from an old prepared checkpoint mismatch.
  refused(await s.client.prepare(s.wire()));assert.equal((await s.client.status(key)).result.state,'UNKNOWN');assert.equal(effects(s),0);
  const fresh={...s.request,operationId:'job:new-grant',businessKey:'case:new-grant'};
  const allowed=await s.executor.run(fresh);assert.equal(allowed.serviceReport.result.state,'APPLIED');assert.equal(effects(s),1);
  refused(await s.client.prepare(s.wire()));assert.equal(effects(s),1);
});

test('a fully reserved cumulative budget permits the admitted effect once without charging prepare, commit or reconciliation again',async t=>{
  const s=await bounded(t),input=request(),key=await s.admitOnly(input);
  assert.deepEqual(usage(s),{authorityId:'limited',admittedTransactionCount:1,admittedCumulativeAmount:50n});
  const declaration=replay(s).intentDeclarations.get(input.operationId).data;
  assert.equal(declaration.amount,50n);assert.equal(declaration.counterpartyId,'recipient:synthetic');
  const admitted=replay(s).intentAdmissions.get(input.operationId),proof=s.owner.exportHistory()[admitted.admissionEventPosition].data.authorizationProof;
  assert.equal(proof.request.amount,50n);assert.equal(proof.request.counterpartyId,'recipient:synthetic');
  assert.equal((await s.client.checkpoint(s.owner.exportHistory())).result.state,'CHECKPOINTED');
  assert.equal((await s.client.prepare(s.wire(input))).result.state,'PENDING');
  assert.equal((await s.client.prepare(s.wire(input))).result.state,'PENDING');
  assert.equal((await s.client.commit(key)).result.state,'APPLIED');assert.equal((await s.client.commit(key)).result.state,'APPLIED');
  assert.equal((await s.client.status(key)).result.state,'APPLIED');assert.equal((await s.executor.run(input)).serviceReport.result.state,'APPLIED');
  assert.equal(effects(s),1);assert.deepEqual(usage(s),{authorityId:'limited',admittedTransactionCount:1,admittedCumulativeAmount:50n});
  const second={...input,operationId:'allocation:2',businessKey:'business:allocation:2',arguments:{...input.arguments,units:1n}};
  const denied=await s.executor.run(second);assert.equal(denied.execution.status,'NOT_AUTHORIZED');
  assert.equal(replay(s).intentAdmissions.has(second.operationId),false);assert.equal(effects(s),1);
  assert.deepEqual(usage(s),{authorityId:'limited',admittedTransactionCount:1,admittedCumulativeAmount:50n});
});

test('cancelled typed work keeps its reservation and does not reopen a spent one-operation budget',async t=>{
  const s=await bounded(t),input=request(),key=await s.admitOnly(input);
  await s.client.checkpoint(s.owner.exportHistory());assert.equal((await s.client.prepare(s.wire(input))).result.state,'PENDING');
  assert.equal((await s.client.cancel(key)).result.state,'CANCELLED');assert.equal((await s.client.commit(key)).result.state,'CANCELLED');
  assert.equal(effects(s),0);assert.deepEqual(usage(s),{authorityId:'limited',admittedTransactionCount:1,admittedCumulativeAmount:50n});
  const second={...input,operationId:'allocation:cancelled-replacement',businessKey:'business:cancelled-replacement'};
  assert.equal((await s.executor.run(second)).execution.status,'NOT_AUTHORIZED');
  assert.equal(replay(s).intentAdmissions.has(second.operationId),false);assert.equal(effects(s),0);
});

test('typed prepared work is refused at grant expiry and its prior reservation remains consumed',async t=>{
  const s=await bounded(t),input=request(),key=await s.admitOnly(input);
  await s.client.checkpoint(s.owner.exportHistory());assert.equal((await s.client.prepare(s.wire(input))).result.state,'PENDING');
  s.setTime(500);refused(await s.client.commit(key));assert.equal(effects(s),0);
  assert.equal((await s.client.status(key)).result.state,'PENDING');
  assert.deepEqual(usage(s),{authorityId:'limited',admittedTransactionCount:1,admittedCumulativeAmount:50n});
});

for(const scope of ['ROOT','GLOBAL'])test(`a current ${scope} prohibition blocks an earlier admission at its first prepare`,async t=>{
  const s=await cooperativeSetup(t);let rootAuthorityId='tools';
  if(scope==='ROOT'){
    // Existing Core root-prohibition attenuation requires delegation headroom.
    // The convenience owner's nondelegable grant is intentionally not used.
    const source=replay(s).authorities.get('tools').grant;rootAuthorityId='prohibitable-root';
    s.owner.revoke('tools');
    append(new PortableFileEventStore(s.local.historyFile),configuration(s.local),event('AUTHORITY_GRANTED',s.local.now(),{
      grant:{...source,authorityId:rootAuthorityId,rootAuthorityId,constraints:{...source.constraints,maxDelegationDepth:1}}}));
  }
  const key=await s.admitOnly();prohibit(s,{scope,rootAuthorityId});
  assert.equal((await s.client.checkpoint(s.owner.exportHistory())).result.state,'CHECKPOINTED');
  refused(await s.client.prepare(s.wire()));assert.equal((await s.client.status(key)).result.state,'UNKNOWN');assert.equal(effects(s),0);
});

test('a scheduled prohibition becoming active blocks commit without requiring any newer checkpoint',async t=>{
  const s=await cooperativeSetup(t);prohibit(s,{scope:'GLOBAL',notBefore:150});
  const key=await s.admitOnly();await s.client.checkpoint(s.owner.exportHistory());
  assert.equal((await s.client.prepare(s.wire())).result.state,'PENDING');const head=s.destination.inspect().checkpoint.head;
  s.setTime(150);refused(await s.client.commit(key));assert.deepEqual(s.destination.inspect().checkpoint.head,head);
  assert.equal((await s.client.status(key)).result.state,'PENDING');assert.equal(effects(s),0);
});

for(const [name,changed] of [['amount',{amount:49n}],['counterparty',{counterparty:'recipient:different'}]])
test(`a real Core admission with registry terms but a mismatched declared ${name} cannot reach a destination effect`,async t=>{
  const s=await bounded(t),input=request(),key=await admitMismatchedProjection(s,input,changed),events=s.owner.exportHistory();
  assert.throws(()=>s.registry.validateOperation(events,s.wire(input),100),error=>error.code==='PROJECTION_MISMATCH');
  assert.equal((await s.client.checkpoint(events)).result.state,'CHECKPOINTED');refused(await s.client.prepare(s.wire(input)));
  assert.equal((await s.client.status(key)).result.state,'UNKNOWN');assert.equal(effects(s),0);
});
