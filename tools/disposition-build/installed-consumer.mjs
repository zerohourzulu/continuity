/** Executed from a clean installed consumer; all Continuity behavior uses public exports. */
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createLocalDomain,createLocalAttemptOwner,openLocalOwner} from '@ramex-labs/continuity/local';
import {openLocalAttemptRecorder,inspectContinuationAttempts} from '@ramex-labs/continuity/attempts';
import {openLocalDutyPolicy,inspectContinuationDutyPolicy} from '@ramex-labs/continuity/duties';
import {DirectoryHistoryStore,prepareMigration,stageMigration,activateMigration} from '@ramex-labs/continuity/history-store';
import {exportContinuationEvents} from '@ramex-labs/continuity/history';
import {openLocalExecution,PORTABLE_ADAPTER_POLICY_E5_HASH,REMOTE_SERVICE_REPORT_ADAPTER_ID,
  approvedPortableAdapterProfileForPolicy,derivePortableAdapterIdentity,hashCanonical,stateOf,canonicalEncode} from '@ramex-labs/continuity/adapter';

if(process.argv.length>4) throw new Error('Usage: consumer.mjs [create|reopen] [WORK_DIRECTORY]');
const [mode='create',workArgument='case']=process.argv.slice(2),work=resolve(workArgument);
const require=createRequire(process.env.CONTINUITY_TEST_SIGNER_PACKAGE_JSON);
const {privateKeyToAccount}=require('viem/accounts');
// Known-public synthetic test credential. Never deployment/account material.
const account=privateKeyToAccount('0x'+'11'.repeat(32));
let signatures=0,submissions=0;
const signHash=async hash=>{signatures++;return account.signMessage({message:{raw:hash}});};
const binding=join(work,'binding.json'),storePath=join(work,'history'),saved=join(work,'retry.json');
const results=[];
const check=(name,fn)=>{fn();results.push(name);};
const same=(actual,expected)=>assert.equal(canonicalEncode(actual),canonicalEncode(expected));
const moduleUrl=import.meta.resolve('@ramex-labs/continuity/duties');
assert.ok(fileURLToPath(moduleUrl).includes('/node_modules/@ramex-labs/continuity/'));

if(mode==='create') {
  mkdirSync(work,{recursive:true});
  const config={historyFile:join(work,'managed.jsonl'),domain:createLocalDomain(),owner:'owner',controller:'controller',now:()=>100};
  const owner=createLocalAttemptOwner(config);
  owner.createAgent({id:'worker'});owner.createRole({id:'role'});
  owner.appoint({agent:'worker',role:'role',tenure:'tenure',number:1});
  owner.admitRuntime({agent:'worker',session:'session',epoch:1,key:'key',address:account.address,expiresAt:10000});
  owner.grant({id:'execute',to:'worker',actions:['inspect'],resources:['incident'],expiresAt:1000,maxTransactions:1});
  owner.grant({id:'record',to:'worker',actions:['CREATE_ATTEMPT_DUTY'],resources:['job'],expiresAt:1000});
  const options={...config,session:'session',signHash};
  const unknown=input=>{const identity=derivePortableAdapterIdentity(input);return{status:'OUTCOME_UNKNOWN',idempotencyKey:identity.idempotencyKey,submissionFingerprint:identity.submissionFingerprint};};
  const runtime=openLocalExecution(options,{adapterProfile:approvedPortableAdapterProfileForPolicy(PORTABLE_ADAPTER_POLICY_E5_HASH,REMOTE_SERVICE_REPORT_ADAPTER_ID),
    submit:input=>{submissions++;return unknown(input);},reconcile:unknown},'REMOTE_REPORT');
  const execution=await runtime.run({id:'job',action:'inspect',resource:'incident',role:'role',tenure:'tenure',termsCommitment:hashCanonical({case:'synthetic'})});
  check('E5 admitted attempt remains externally unknown',()=>assert.equal(execution.invocation.status,'OUTCOME_UNKNOWN'));
  await openLocalAttemptRecorder(options).createDuty({id:'duty',intent:'job',description:'Investigate a synthetic unknown attempt',deadline:10000});
  const original=owner.exportHistory(),originalHead=stateOf(original).head;
  const planFile=join(work,'migration.json');
  prepareMigration({sourceFile:config.historyFile,targetDirectory:storePath,planFile,expectedHead:originalHead,configurationFiles:[binding],artifactFiles:[],quiesced:true});
  stageMigration(planFile,{quiesced:true});activateMigration(planFile,{quiesced:true});
  const live={domain:config.domain,owner:config.owner,controller:config.controller,now:()=>100,
    historyProfile:'continuity-segmented-local/1',historyBinding:binding,session:'session',signHash};
  const duties=openLocalDutyPolicy(live),store=new DirectoryHistoryStore(storePath);
  check('explicit migration preserves original event bytes/head',()=>{same(store.snapshot().history.head,originalHead);assert.equal(canonicalEncode(exportContinuationEvents(store.snapshot().history)),canonicalEncode(original));});
  const selected=duties.describe({duty:'duty',incidentSourceDigest:{algorithm:'sha256',value:'0x'+'a'.repeat(64)},attesterRole:'role'});
  openLocalOwner(live).grant({id:'activation',to:'worker',actions:[selected.activationAction],resources:[selected.activationResource],expiresAt:1000});
  const input={id:'activate',descriptor:selected.descriptor,activationAuthority:'activation'};
  const before=store.snapshot(),beforeSignatures=signatures;
  const result=await duties.activate(input),after=store.snapshot();
  check('activation signs exactly once and appends once',()=>{assert.equal(signatures,beforeSignatures+1);assert.equal(after.history.eventCount,before.history.eventCount+1);assert.equal(result.alreadyRecorded,false);});
  check('current policy view has explicit D1/head/outcome semantics',()=>{assert.equal(result.view.version,'continuity-attempt-duty-view/1');assert.equal(result.view.dutyDisposition,'OPEN');assert.equal(result.view.outstanding,true);assert.equal(result.view.externalOutcome,'NOT_PROVEN');same(result.view.observedHead,after.history.head);});
  check('activation adds six reserves and keeps prior lifecycle/control reserves',()=>{assert.equal(after.capacity.dutyReserved,6);assert.equal(after.capacity.lifecycleReserved,before.capacity.lifecycleReserved);assert.equal(after.capacity.controlReserved,before.capacity.controlReserved);});
  check('installed historical and attempt readers expose activation',()=>{assert.equal(inspectContinuationDutyPolicy(after.history,'duty').policy.policy.eventId,result.eventId);assert.ok(JSON.stringify(inspectContinuationAttempts(after.history)).includes('continuity-attempt-duty-view/1'));});
  const retried=await duties.activate(input);
  check('same-handle exact retry neither signs nor appends',()=>{assert.equal(retried.alreadyRecorded,true);assert.equal(signatures,beforeSignatures+1);same(store.snapshot().history.head,after.history.head);});
  check('activation does not dispatch the adapter',()=>assert.equal(submissions,1));
  const host=openLocalOwner(live),resource='duty:'+selected.descriptorHash;
  host.grant({id:'finding',to:'worker',actions:['ATTEST_DUTY_FINDING'],resources:[resource],expiresAt:1000});
  host.grant({id:'disposition',to:'worker',actions:['RECORD_DUTY_DISPOSITION'],resources:[resource],expiresAt:1000});
  const checklist=Object.fromEntries(['SOURCE_REVIEWED','HISTORY_REVIEWED','FINDING_RECORDED','CONTROL_REVIEWED'].map(k=>[k,{state:'SATISFIED',reason:'The synthetic investigation is complete; the outside result is not proven.'}]));
  const disposition={id:'complete',duty:'duty',disposition:'COMPLETED_UNDER_POLICY',checklist,reportDigest:{algorithm:'sha256',value:'0x'+'b'.repeat(64)},nextStep:null,attestationAuthority:'finding',dispositionAuthority:'disposition'};
  const prepared=duties.prepareDisposition(disposition),beforeFinding=signatures;
  check('preparing the finding is read-only',()=>{assert.equal(prepared.executionCapability,false);assert.equal(signatures,beforeFinding);});
  const completed=await duties.dispose(disposition);
  check('two signatures complete only the local investigation',()=>{assert.equal(signatures,beforeFinding+2);assert.equal(completed.view.dutyDisposition,'COMPLETED_UNDER_POLICY');assert.equal(completed.view.outstanding,false);assert.equal(completed.view.externalOutcome,'NOT_PROVEN');assert.equal(store.snapshot().capacity.dutyReserved,5);assert.equal(submissions,1);});
  const contest={id:'challenge',duty:'duty',targetDispositionId:completed.eventId,reason:'The report should be challenged.',reportDigest:{algorithm:'sha256',value:'0x'+'c'.repeat(64)},attestationAuthority:'finding',dispositionAuthority:'disposition'};
  const challenged=await duties.contest(contest);
  check('a signed contest reopens attention without erasing completion',()=>{assert.equal(challenged.view.dutyDisposition,'CONTESTED');assert.equal(challenged.view.outstanding,true);assert.equal(challenged.view.lastRecordedDisposition.eventId,completed.eventId);assert.equal(store.snapshot().capacity.dutyReserved,4);});
  const final=store.snapshot();
  writeFileSync(saved,JSON.stringify({domain:config.domain,input,disposition,contest,head:final.history.head,count:final.history.eventCount}));
} else if(mode==='reopen') {
  const prior=JSON.parse(readFileSync(saved,'utf8'));
  const options={domain:prior.domain,owner:'owner',controller:'controller',now:()=>1000,
    historyProfile:'continuity-segmented-local/1',historyBinding:binding,session:'session',signHash};
  const duties=openLocalDutyPolicy(options),store=new DirectoryHistoryStore(storePath);
  const retried=await duties.activate(prior.input);
  check('fresh-process retry after grant expiry returns original activation without signing',()=>{assert.equal(retried.alreadyRecorded,true);assert.equal(signatures,0);same(retried.head,prior.head);});
  check('reopened verified history/count/view remain exact',()=>{same(store.snapshot().history.head,prior.head);assert.equal(store.snapshot().history.eventCount,prior.count);assert.equal(duties.inspect('duty').policy.policy.eventId,'duty-policy:activate');});
  const dispositionRetry=await duties.dispose(prior.disposition),contestRetry=await duties.contest(prior.contest);
  check('fresh-process exact retries preserve the current contested view after expiry',()=>{assert.equal(dispositionRetry.alreadyRecorded,true);assert.equal(contestRetry.alreadyRecorded,true);assert.equal(signatures,0);assert.equal(dispositionRetry.view.dutyDisposition,'CONTESTED');same(store.snapshot().history.head,prior.head);});
  await assert.rejects(duties.dispose({...prior.disposition,id:'new-after-expiry'}));
  check('new work cannot use expired permission',()=>{assert.equal(signatures,0);same(store.snapshot().history.head,prior.head);});
} else throw new Error('Unknown consumer mode');
console.log(JSON.stringify({node:process.version,mode,moduleUrl,checks:results.length,signatures,submissions,results},null,2));
