import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PortableFileEventStore } from '../../packages/core-0.2/src/indexer/portable-file-event-store.ts';
import { createLocalDomain, createLocalOwner, openLocalOwner } from '../../packages/core-0.3/src/local-owner.ts';
import { observeHistory, ContinuityError } from '../../packages/core-0.3/src/index.ts';
import * as core from '../../packages/core-0.2/src/core/index.ts';
const q = {actor:'bea',action:'read',resource:'incident:42'};
function setup(t) {
  const dir=mkdtempSync(join(tmpdir(),'continuity-api-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));let tick=100;
  const config={historyFile:join(dir,'history.jsonl'),owner:'operations',controller:'operator',now:()=>tick,
    domain:{protocol:'continuity',version:'0.2',deploymentId:'own-case',chainId:'31337',verifyingContract:'0x0000000000000000000000000000000000000000'}};
  const c=createLocalOwner(config);c.createAgent({id:'bea'});c.createAgent({id:'alex'});return{c,config,now:n=>tick=n};
}
const grant=(c,extra={})=>c.grant({id:'access',to:'bea',actions:['read'],resources:['incident:42'],expiresAt:200,...extra});
const hasCode=code=>e=>e instanceof ContinuityError&&e.code===code;
function raw(c,action=q){const events=c.exportHistory();return {operationVersion:core.PORTABLE_AUTHORIZATION_VERSION,events,
  expectedHistoryHead:c.observe().head,domain:events[0].data.domain,policyVersion:events[0].data.policyVersion,
  rootRecognitionPolicy:core.PORTABLE_ROOT_RECOGNITION_POLICY,request:{actorId:action.actor,action:action.action,resource:action.resource,
    claimedAt:100,...(Object.hasOwn(action,'amount')?{amount:action.amount}:{})},evaluationTime:100,authoritative:true,consequential:false};}

test('fresh case grant/revoke and reopened history preserve withdrawal',t=>{
  const{c,config}=setup(t);assert.equal(c.authorize(q).decision,'DENY');grant(c);assert.equal(c.authorize(q).decision,'ALLOW');
  assert.equal(c.authorize({...q,resource:'incident:43'}).decision,'DENY');assert.equal(c.authorize({...q,actor:'alex'}).decision,'DENY');
  c.revoke('access');assert.equal(c.authorize(q).decision,'DENY');assert.equal(openLocalOwner(config).authorize(q).decision,'DENY');
  assert.equal(statSync(config.historyFile).mode&0o777,0o600);
});
test('appointment grants no permission; facade retains exact original decision and query evidence',t=>{
  const{c}=setup(t);c.createRole({id:'investigator'});c.appoint({agent:'bea',role:'investigator',tenure:'shift1',number:1});
  assert.equal(c.authorize(q).decision,'DENY');grant(c);const r=raw(c);assert.deepEqual(c.authorize(q).evidence,core.authorizePortable(r));
  for(const kind of ['why','responsible'])assert.deepEqual(c[kind](q),core[`${kind}Portable`]({operationVersion:core.PORTABLE_QUERY_VERSION,
    evaluationEvents:r.events,observedEvents:r.events,authorizationDomain:r.domain,request:r.request,evaluationTime:100,
    disclosure:core.portablePublicQueryDisclosure(kind.toUpperCase())}));
  assert.deepEqual(c.survives('bea'),core.survivesPortable({operationVersion:core.PORTABLE_QUERY_VERSION,observedEvents:r.events,
    targetAgentId:'bea',evaluationTime:100,disclosure:core.portablePublicQueryDisclosure('SURVIVES')}));
});
test('frozen observation stays historical while owner refreshes file and clock',t=>{
  const{c,now}=setup(t);grant(c);const snapshot=c.observe();c.revoke('access');
  assert.equal(snapshot.authorize(q).decision,'ALLOW');assert.equal(c.authorize(q).decision,'DENY');
  assert.equal(snapshot.authorize(q).executionCapability,false);assert.equal(snapshot.scope,'CAPTURED_HISTORY_ONLY');
  assert.notEqual(c.observe().head.hash,snapshot.head.hash);grant(c,{id:'second'});now(201);
  assert.equal(c.authorize(q).decision,'DENY');assert.equal(c.observe().authorize(q).decision,'ALLOW');
});
test('alternate grants remain effective after one withdrawal; notBefore and expiry apply',t=>{
  const{c,now}=setup(t);grant(c);grant(c,{id:'other',notBefore:101,expiresAt:150});c.revoke('access');
  assert.equal(c.authorize(q).decision,'DENY');now(101);assert.equal(c.authorize(q).decision,'ALLOW');now(151);assert.equal(c.authorize(q).decision,'DENY');
});
test('duplicate/malformed commands and mismatched identity/domain cannot append',t=>{
  const{c,config}=setup(t);grant(c);const before=readFileSync(config.historyFile);
  assert.throws(()=>grant(c),hasCode('TRANSITION_REJECTED'));
  assert.throws(()=>c.grant({id:'evil',to:'alex',actions:['read'],resources:['incident:42'],expiresAt:200,grantor:'other'}),hasCode('INVALID_INPUT'));
  assert.throws(()=>c.revoke('missing'),hasCode('TRANSITION_REJECTED'));
  assert.throws(()=>openLocalOwner({...config,owner:'intruder'}),hasCode('PROFILE_MISMATCH'));
  assert.throws(()=>openLocalOwner({...config,domain:{...config.domain,deploymentId:'elsewhere'}}),hasCode('PROFILE_MISMATCH'));
  assert.throws(()=>createLocalOwner(config),hasCode('HISTORY_EXISTS'));assert.deepEqual(readFileSync(config.historyFile),before);
});
test('accessors and proxies are rejected without invoking user code',t=>{
  const{c,config}=setup(t);let invoked=0;const before=readFileSync(config.historyFile);
  const malicious={...q};Object.defineProperty(malicious,'actor',{enumerable:true,get(){invoked++;return 'bea'}});
  assert.throws(()=>c.authorize(malicious),hasCode('INVALID_INPUT'));
  assert.throws(()=>c.createAgent(new Proxy({id:'danger'},{ownKeys(){invoked++;return ['id']}})),hasCode('INVALID_INPUT'));
  assert.equal(invoked,0);assert.deepEqual(readFileSync(config.historyFile),before);
});
test('captured history and returned evidence resist caller mutation',t=>{
  const{c}=setup(t);grant(c);const events=structuredClone(c.exportHistory()),snapshot=observeHistory(events);events.length=0;
  assert.equal(snapshot.authorize(q).decision,'ALLOW');assert.throws(()=>{snapshot.head.hash='0x00'},TypeError);
  assert.throws(()=>{snapshot.authorize(q).evidence.decision='DENY'},TypeError);
});
test('quantities retain bigint zero/absence; malformed values and extra control flags fail',t=>{
  const{c}=setup(t);grant(c);assert.equal(c.authorize(q).decision,'ALLOW');
  assert.deepEqual(c.authorize({...q,amount:0n}).evidence,core.authorizePortable(raw(c,{...q,amount:0n})));
  for(const amount of [0,'0',-1n,1n<<256n,undefined])assert.throws(()=>c.authorize({...q,amount}),hasCode('INVALID_INPUT'));
  assert.throws(()=>c.authorize({...q,consequential:true}),hasCode('INVALID_INPUT'));
});
test('bad clocks and rejected setup do not silently produce writes',t=>{
  const{c,config,now}=setup(t);const before=readFileSync(config.historyFile);now(99);
  assert.throws(()=>grant(c),hasCode('CLOCK_INVALID'));assert.deepEqual(readFileSync(config.historyFile),before);
  now(NaN);assert.throws(()=>c.authorize(q),hasCode('CLOCK_INVALID'));
  const path=config.historyFile+'-invalid';assert.throws(()=>createLocalOwner({...config,historyFile:path,now:()=>100,
    domain:{...config.domain,verifyingContract:'not-an-address'}}));assert.equal(existsSync(path),false);
});
test('invalid histories and option shapes cannot become ALLOW',t=>{
  const{c}=setup(t);const events=structuredClone(c.exportHistory());events[1].data.principalId='changed';
  assert.throws(()=>observeHistory(events),hasCode('INVALID_HISTORY'));assert.throws(()=>observeHistory([]),hasCode('HISTORY_LIMIT'));
  assert.throws(()=>observeHistory(c.exportHistory(),{at:-0}),hasCode('INVALID_INPUT'));
});

test('another writer advancing the head during clock lookup prevents stale append',t=>{
  const {config}=setup(t);let competingWrite;
  const first=openLocalOwner({...config,now:()=>{const f=competingWrite;competingWrite=undefined;f?.();return 100}});
  const second=openLocalOwner(config);competingWrite=()=>second.createAgent({id:'concurrent'});
  assert.throws(()=>grant(first),hasCode('HISTORY_CONFLICT'));
  assert.equal(first.authorize(q).decision,'DENY');
  assert.equal(first.exportHistory().filter(e=>e.type==='AGENT_CREATED'&&e.data.agentId==='concurrent').length,1);
  assert.equal(first.exportHistory().filter(e=>e.type==='AUTHORITY_GRANTED').length,0);
});
test('request shape bounds reject symbols, hidden fields, cycles and sparse lists',t=>{
  const {c,config}=setup(t);const before=readFileSync(config.historyFile);
  const hidden={id:'new'};Object.defineProperty(hidden,'hidden',{value:true});
  const cycle={id:'new'};cycle.extra=cycle;
  for(const input of [hidden,cycle,{id:'x'.repeat(129)},{id:'new',[Symbol('hidden')]:true}])
    assert.throws(()=>c.createAgent(input),hasCode('INVALID_INPUT'));
  const sparse=[];sparse.length=1;
  assert.throws(()=>grant(c,{actions:sparse}),hasCode('INVALID_INPUT'));
  assert.throws(()=>grant(c,{actions:['read','read']}),hasCode('INVALID_INPUT'));
  assert.throws(()=>c.createAgent({id:'new',owner:undefined}),hasCode('INVALID_INPUT'));
  const events=structuredClone(c.exportHistory());let calls=0;
  Object.defineProperty(events[0].data,'domain',{enumerable:true,get(){calls++;throw Error('must not run')}});
  assert.throws(()=>observeHistory(events),hasCode('INVALID_HISTORY'));assert.equal(calls,0);
  assert.deepEqual(readFileSync(config.historyFile),before);
});
test('captured historical handover retains original SURVIVES and assignment evidence',()=>{
  const path=new URL('../fixtures/handover-history.jsonl',import.meta.url);
  // Read the original fixture through its public store codec, without copying its semantics.
  const events=new PortableFileEventStore(fileURLToPath(path)).readAll();const observation=observeHistory(events);
  for(const agent of ['a:first-look','b:first-look'])assert.deepEqual(observation.survives(agent),core.survivesPortable({
    operationVersion:core.PORTABLE_QUERY_VERSION,observedEvents:events,targetAgentId:agent,evaluationTime:observation.evaluationTime,
    disclosure:core.portablePublicQueryDisclosure('SURVIVES')}));
});

test('fresh local namespaces work without configuring a chain and cannot reopen a different domain',t=>{
  const {config}=setup(t);const first=createLocalDomain(),second=createLocalDomain();
  assert.notEqual(first.deploymentId,second.deploymentId);
  const selected={...config,historyFile:config.historyFile+'-local',domain:first};
  const owner=createLocalOwner(selected);owner.createAgent({id:'bea'});grant(owner);
  assert.equal(openLocalOwner(selected).authorize(q).decision,'ALLOW');
  assert.throws(()=>openLocalOwner({...selected,domain:second}),hasCode('PROFILE_MISMATCH'));
});
