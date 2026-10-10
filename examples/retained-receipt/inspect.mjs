// Unexecuted read-only proposal: no signing, runtime execution or writes.
import {pathToFileURL} from 'node:url';
import {captureContinuationHistory,CONTINUATION_HISTORY_VERSION,verifyContinuationReceipt} from '@ramex-labs/continuity/history';
import {observeContinuationHistory} from '@ramex-labs/continuity';
import {readEnvelope,validateEnvelope,decodeEnvelope,replayHead,need,same} from './envelope.mjs';

export function inspectEnvelope(value){
 const v=validateEnvelope(value);
 need(same(replayHead(v.issuanceEvents),v.issuanceHead)&&same(replayHead(v.observedEvents),v.observedHead),'REPLAY_HEAD_BINDING');
 need(v.observedEvents.length>v.issuanceEvents.length&&v.issuanceEvents.every((event,i)=>same(event,v.observedEvents[i])),'COMPLETE_ISSUANCE_PREFIX');
 need(v.verifierTime>=v.observedHead.canonicalTime,'VERIFIER_TIME_BEHIND_OBSERVED_HEAD');
 const capture=(events,expectedHead)=>captureContinuationHistory({operationVersion:CONTINUATION_HISTORY_VERSION,events,expectedHead});
 const issuance=capture(v.issuanceEvents,v.issuanceHead),observed=capture(v.observedEvents,v.observedHead);
 const view=observeContinuationHistory(observed,{at:v.verifierTime});
 const survival=view.survives(v.subjects.predecessor);need(survival.epistemicStatus==='ESTABLISHED'&&survival.answer,'SURVIVAL_UNAVAILABLE');
 const duties=survival.answer.obligations.filter(d=>d.obligationId===v.subjects.duty);need(duties.length===1,'DUTY_REQUIRED');
 const permission=view.authorize({actor:v.subjects.successor,action:v.subjects.action,resource:v.subjects.resource});
 let receipt;
 if(v.artifact.availability==='UNAVAILABLE')receipt={status:'UNAVAILABLE',reason:'SIGNED_ARTIFACT_UNAVAILABLE',badReceiptInference:false};
 else{
  const artifact=v.artifact.value;
  need(same(artifact.payload?.issuance?.historyHead,v.issuanceHead)&&artifact.payload?.issuance?.issuedAt===v.issuedAt,'ARTIFACT_ISSUANCE_BINDING');
  // Bind the signed receipt's own lineage to this example's declared subjects.
  // These joins precede Core verification; they are not authenticity credit.
  need(artifact.payload?.intent?.intentId===v.subjects.operation&&
   artifact.payload?.intent?.actorId===v.subjects.predecessor&&
   artifact.payload?.issuer?.agentId===v.subjects.predecessor&&
   artifact.payload?.intent?.action===v.subjects.action&&
   artifact.payload?.intent?.resource===v.subjects.resource,'ARTIFACT_SUBJECT_INTENT_BINDING');
  receipt=verifyContinuationReceipt(issuance,observed,{artifact,expectedDomain:v.domain,verifierTime:v.verifierTime}).result;
 }
 const axes={};
 if(receipt.status==='EVALUATED')for(const k of ['contentIntegrity','signaturePossession','issuerAuthentication','historicalAuthorization','canonicalInclusion','finality','freshness','externalOutcome'])axes[k]=receipt[k];
 return {schema:'continuity.synthetic-retained-receipt-inspection/1',status:'READ_ONLY_INSPECTION',editionDeclared:v.edition,
  settings:{demo:'SYNTHETIC_EFFECT_FREE_PUBLIC_CORE',inspection:'HISTORICAL_RECEIPT',coreEdition:v.edition,issuanceHead:v.issuanceHead,observedHead:v.observedHead,
   zkProofMode:'NOT_APPLICABLE',liveActionAuthority:'NOT_SUPPLIED_BY_COMPANION'},
  receipt,receiptAxes:axes,freshReplay:{dutyStatus:duties[0].status,successorReadDecision:permission.decision,predecessorLifecycle:survival.answer.lifecycleStatus},
  producerReported:v.producerObserved,producerReportsIndependentlyAuthenticated:false,
  scope:'SUPPLIED_SYNTHETIC_HISTORY_LOCAL_REPLAY',currentAuthorityForExecution:'NOT_EVALUATED_BY_READ_ONLY_COMPANION',
  executionCapability:false,permitsExecution:false,proofOrQInvocations:0,acceptance:false};
}
export const inspectBytes=raw=>inspectEnvelope(decodeEnvelope(raw));
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{need(process.argv.length===3,'ABSOLUTE_ENVELOPE_PATH_REQUIRED');const result=inspectEnvelope(readEnvelope(process.argv[2]));console.log(JSON.stringify(result));
  if(result.receipt.status!=='EVALUATED'||!result.receipt.authentic||!result.receipt.historical||result.receipt.current)process.exitCode=2;
 }catch(error){console.error(JSON.stringify({status:error.code==='EVIDENCE_UNAVAILABLE'?'EVIDENCE_UNAVAILABLE':'INSPECTION_NOT_ESTABLISHED',reason:typeof error.code==='string'?error.code:'INSPECTOR_UNAVAILABLE',badReceiptInference:false,automaticRetry:false,permitsExecution:false}));process.exitCode=2;}
}
