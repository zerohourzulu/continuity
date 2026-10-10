// Unexecuted proposal. One new synthetic composition, no network or real effect.
import {mkdirSync,openSync,closeSync,writeSync,fsyncSync,realpathSync} from 'node:fs';
import {isAbsolute,normalize,dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {createLocalDomain,createLocalOwner} from '@ramex-labs/continuity/local';
import {openLocalRuntime} from '@ramex-labs/continuity/runtime';
import {openLocalSimulation,commitTerms} from '@ramex-labs/continuity/simulation';
import {SCHEMA,EDITION,encodeEnvelope,replayHead,need,same} from './envelope.mjs';

function saveExclusive(path,bytes){
 const fd=openSync(path,'wx',0o600);try{let offset=0;while(offset<bytes.length){const n=writeSync(fd,bytes,offset);need(n>0,'OUTPUT_SHORT_WRITE');offset+=n;}fsyncSync(fd);}finally{closeSync(fd);}
}
async function main(){
 need(process.argv.length===3,'FRESH_OUTPUT_DIRECTORY_REQUIRED');const folder=process.argv[2];
 need(isAbsolute(folder)&&normalize(folder)===folder&&realpathSync(dirname(folder))===dirname(folder),'OUTPUT_ABSOLUTE_REAL_PARENT');
 mkdirSync(folder,{mode:0o700}); // Refuse any existing output, never overwrite/retry.
 const config={historyFile:join(folder,'history.jsonl'),domain:createLocalDomain(),owner:'operations',controller:'operator',now:()=>100};
 const owner=createLocalOwner(config),deadline=10000;
 const credential=()=>{const account=privateKeyToAccount(generatePrivateKey());return {address:account.address,signHash:hash=>account.signMessage({message:{raw:hash}})};};
 const bea=credential(),alex=credential();
 for(const [id,key]of [['bea',bea],['alex',alex]]){
  owner.createAgent({id});owner.admitRuntime({session:`session:${id}`,agent:id,epoch:1,key:`key:${id}`,address:key.address,expiresAt:deadline});
 }
 owner.createRole({id:'reviewer'});owner.declareSuccession({id:'replacement',from:'bea',to:'alex',role:'reviewer'});
 owner.appoint({agent:'bea',role:'reviewer',tenure:'first-shift',number:1,succession:'replacement'});
 owner.grant({id:'collect',to:'bea',actions:['read','OBLIGATE'],resources:['incident:42'],expiresAt:deadline});
 owner.grant({id:'review',to:'alex',actions:['record-collection-disposition'],resources:['review:42'],expiresAt:deadline});
 const first={...config,session:'session:bea',signHash:bea.signHash},simulation=openLocalSimulation(first);
 const operation={id:'collect:42',action:'read',resource:'incident:42',role:'reviewer',tenure:'first-shift',termsCommitment:commitTerms({work:'Collect synthetic material for review.'})};
 const action=await simulation.run(operation);need(action.invocation?.status==='SUBMITTED','SIMULATION_REQUIRED');
 const issuanceEvents=owner.exportHistory(),issuanceHead=replayHead(issuanceEvents);
 const receipt=await simulation.recordReceipt(operation);need(receipt.recording?.status==='ADMITTED'&&receipt.artifact,'SIGNED_RECEIPT_REQUIRED');
 need(same(receipt.artifact.payload.issuance.historyHead,issuanceHead),'EXACT_ISSUANCE_HEAD');
 need(receipt.artifact.payload.issuance.issuedAt===100,'EXACT_ISSUANCE_TIME');
 // Hold the actual first artifact in memory. Publish its envelope after the
 // complete handover; a later failure does not earn durable artifact custody.
 const before={schema:SCHEMA,edition:EDITION,encoding:'continuity-canonical/0.2',domain:config.domain,
  issuedAt:100,verifierTime:100,issuanceHead,issuanceEvents,observedHead:replayHead(owner.exportHistory()),observedEvents:owner.exportHistory(),
  artifact:{availability:'AVAILABLE',value:receipt.artifact},subjects:{predecessor:'bea',successor:'alex',duty:'review:42',action:'read',resource:'incident:42',operation:'collect:42'}};
 await openLocalRuntime(first).obligate({id:'review:42',operation:operation.id,description:'Review the material and account for unresolved questions.',deadline,succession:'replacement',reviewAuthority:'review'});
 owner.succeed({id:'replace:42',rule:'replacement',fromAgent:'bea',fromTenure:'first-shift',toAgent:'alex',toTenure:'second-shift',role:'reviewer',number:2});
 let stale=null;try{await simulation.run({...operation,id:'obsolete:42'});}catch(error){need(error.code==='RUNTIME_NOT_CURRENT','STALE_FAILURE_CLASS');stale=error.code;}
 need(stale==='RUNTIME_NOT_CURRENT','STALE_PROCESS_REQUIRED');
 const successorRead=owner.authorize({actor:'alex',action:'read',resource:'incident:42'}).decision;need(successorRead==='DENY','SUCCESSOR_READ_DENY');
 owner.grant({id:'assignment',to:'alex',actions:['ASSIGN_PERFORMANCE'],resources:['review:42'],expiresAt:deadline});
 await openLocalRuntime({...config,session:'session:alex',signHash:alex.signHash}).assign({id:'assign:42',obligation:'review:42'});
 const duty=owner.survives('bea').answer.obligations.find(d=>d.obligationId==='review:42');need(duty?.status==='OPEN','SURVIVING_DUTY_OPEN');
 const prior=owner.exportHistory(),repeat=await openLocalSimulation(first).run(operation);need(repeat.status==='RECONCILIATION_ONLY'&&same(prior,owner.exportHistory()),'RECONCILIATION_WITHOUT_NEW_HISTORY');
 const observedEvents=owner.exportHistory();const envelope={...before,observedEvents,observedHead:replayHead(observedEvents),
  producerObserved:{simulation:'SUBMITTED',receiptRecording:'ADMITTED',staleLiveProcess:stale,successorRead,duty:duty.status,repeatedOperation:repeat.status}};
 const bytes=encodeEnvelope(envelope),path=join(folder,'receipt-envelope.canonical.json');saveExclusive(path,bytes);
 // Persist a directory entry as supported by the selected local platform.
 const directory=openSync(folder,'r');try{fsyncSync(directory);}finally{closeSync(directory);}
 console.log(JSON.stringify({status:'SYNTHETIC_RECEIPT_RETAINED',settings:{demo:'SYNTHETIC_EFFECT_FREE_PUBLIC_CORE',inspection:'HISTORICAL_RECEIPT',coreEdition:EDITION,observedHead:envelope.observedHead,
  zkProofMode:'NOT_APPLICABLE',liveActionAuthority:'NOT_SUPPLIED_BY_COMPANION'},envelope:path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),
  producerObserved:envelope.producerObserved,keyMaterialExported:false,externalEffect:'NONE_SIMULATED',proofOrQInvocations:0,acceptance:false}));
}
main().catch(error=>{console.error(JSON.stringify({status:'PRODUCER_NOT_COMPLETED',reason:typeof error.code==='string'?error.code:'PRODUCER_UNAVAILABLE',automaticRetry:false,acceptance:false}));process.exitCode=2;});
