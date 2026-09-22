import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,realpathSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createLocalDomain,createLocalOwner} from '../../packages/core-0.3/src/local-owner.ts';
import {openLocalEvidenceTool,selectEvidence} from '../../packages/core-0.3/src/evidence.ts';
import {openLocalExecution,commitTerms} from '../../packages/core-0.3/src/execution.ts';
import {createPacketExecutor} from '../../packages/core-0.3/src/adapters/packet-executor.mjs';
const {generatePrivateKey,privateKeyToAccount}=createRequire(new URL('../../packages/core/package.json',import.meta.url))('viem/accounts');
const code=value=>e=>e.code===value;
function setup(t){const dir=realpathSync(mkdtempSync(join(tmpdir(),'continuity-evidence-')));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const inputDirectory=join(dir,'source'),outputDirectory=join(dir,'packets');mkdirSync(inputDirectory,{mode:0o700});mkdirSync(outputDirectory,{mode:0o700});
 writeFileSync(join(inputDirectory,'incident.txt'),'Synthetic event: review this.\n',{mode:0o600});
 const account=privateKeyToAccount(generatePrivateKey()),config={historyFile:join(dir,'history.jsonl'),domain:createLocalDomain(),owner:'operations',controller:'operator',now:()=>100};
 const owner=createLocalOwner(config);owner.createAgent({id:'bea'});owner.createRole({id:'reviewer'});owner.appoint({agent:'bea',role:'reviewer',tenure:'shift',number:1});
 owner.admitRuntime({session:'session',agent:'bea',epoch:1,key:'key',address:account.address,expiresAt:200});
 owner.grant({id:'collect',to:'bea',actions:['collect-evidence-packet'],resources:['incident:42'],expiresAt:200});
 const options={...config,session:'session',signHash:hash=>account.signMessage({message:{raw:hash}}),inputDirectory,outputDirectory,
  selection:selectEvidence(inputDirectory),resource:'incident:42',role:'reviewer',tenure:'shift'};
 const tool=openLocalEvidenceTool(options),request={operationId:'collect:42',resource:'incident:42'};
 return {tool,owner,options,request,config};}

test('protected file collection has durable typed acknowledgment and restart reconciliation',async t=>{
 const {tool,request,options,config}=setup(t);const answer=await tool.collect(request);
 assert.equal(answer.result.status,'EXECUTION_RESULT');assert.equal(answer.result.invocation.status,'SUBMITTED');assert.equal(answer.packet.status,'PACKET_VERIFIED');
 const folder=join(options.outputDirectory,createHash('sha256').update(request.operationId).digest('hex'));
 assert.deepEqual(readFileSync(join(folder,'packet/files/incident.txt')),readFileSync(join(options.inputDirectory,'incident.txt')));
 const before=readFileSync(config.historyFile),again=await openLocalEvidenceTool(options).collect(request);
 assert.equal(again.result.status,'RECONCILIATION_ONLY');assert.equal(again.packet.status,'PACKET_VERIFIED');assert.deepEqual(readFileSync(config.historyFile),before);
 assert.equal((await tool.recordReceipt(request)).recording.status,'ADMITTED');
});
test('denial, caller paths and resource substitution cannot copy or create attempt directories',async t=>{
 const {tool,owner,request,options}=setup(t);owner.revoke('collect');
 assert.equal((await tool.collect(request)).result.status,'NOT_AUTHORIZED');
 await assert.rejects(tool.collect({...request,resource:'incident:other'}),code('INVALID_INPUT'));
 await assert.rejects(tool.collect({...request,inputDirectory:'/etc'}),code('INVALID_INPUT'));
 assert.deepEqual(readdirSync(options.outputDirectory),[]);
});
test('old still-live tool is fenced and input changes do not silently change the selected work',async t=>{
 const {tool,owner,request,options}=setup(t);writeFileSync(join(options.inputDirectory,'incident.txt'),'Changed');
 const changed=await tool.collect(request);assert.equal(changed.result.invocation.status,'OUTCOME_UNKNOWN');
 assert.notEqual(changed.packet.status,'PACKET_VERIFIED');owner.advanceEpoch({agent:'bea',from:1,to:2});
 await assert.rejects(tool.collect({...request,operationId:'next'}),code('RUNTIME_NOT_CURRENT'));
 assert.equal((await tool.collect(request)).result.status,'RECONCILIATION_ONLY');
});
test('retirement cannot interleave the synchronous protected effect; a late original ack remains recoverable',async t=>{
 const {options,owner}=setup(t),operationId='late:42',out=join(options.outputDirectory,'late');mkdirSync(out,{mode:0o700});
 const termsCommitment=commitTerms({work:'late acknowledgement test'});
 const packet=createPacketExecutor({...options,outputDirectory:out,termsCommitment,intentId:operationId});let retirementDuringEffect=false;
 const adapter={adapterProfile:packet.adapterProfile,submit(submission){
  try {owner.advanceEpoch({agent:'bea',from:1,to:2});}
  catch(error){assert.equal(error.code,'HISTORY_CONFLICT');retirementDuringEffect=true;}
  return packet.submit(submission).then(result=>{owner.advanceEpoch({agent:'bea',from:1,to:2});return result});
 },reconcile:submission=>packet.reconcile(submission)};
 const runtime=openLocalExecution(options,adapter,'LOCAL_PACKET');
 const operation={id:operationId,action:'collect-evidence-packet',resource:options.resource,role:options.role,tenure:options.tenure,termsCommitment};
 const result=await runtime.run(operation);assert.equal(retirementDuringEffect,true);assert.equal(result.invocation.status,'OUTCOME_UNKNOWN');
 assert.equal(packet.inspect().status,'PACKET_VERIFIED');const ack=readFileSync(join(out,'ack.json'));
 assert.equal((await runtime.run(operation)).status,'RECONCILIATION_ONLY');assert.deepEqual(readFileSync(join(out,'ack.json')),ack);
 assert.equal(owner.exportHistory().filter(e=>e.type==='TRANSACTION_INTENT_CONSUMED').length,0);
});
