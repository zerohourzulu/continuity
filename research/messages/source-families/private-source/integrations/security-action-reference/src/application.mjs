import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { core, sha, bytes, equal, assert, slug, ids, session, policyFor, event, replay, credentials, load, locked, append,
  administrative, reserveEvents, inspectBoundPacket, progressAuthorization, verifyProgressRecords, createInitialCase, writeNew } from './protocol.mjs';
import { readRegular, parseJson, readJson, safeDirectory } from './safe-io.mjs';
import { captureReview, createSnapshot, readSnapshot, assertReviewedCurrent } from './context.mjs';
import { DurableAdmissionCoordinator } from '../../../packages/core-0.2/src/sdk/durable-admission.ts';
import { DurableReceiptCoordinator } from '../../../packages/core-0.2/src/sdk/durable-receipt.ts';
import { initializeStore, openStore } from '../../synthetic-action-store/src/store.mjs';
import { createStateExecutor } from '../../synthetic-state-executor/src/executor.mjs';
import { parseReviewedAction } from '../../synthetic-state-executor/src/contract.mjs';
import { parseSupplementRequest, SUPPLEMENT_SOURCE_SCOPE } from '../../core-0.2-reference/src/review-supplement-format.mjs';
import { captureSupplementInput, readReviewSupplement, writeReviewSupplement } from '../../core-0.2-reference/src/review-supplement-storage.mjs';
import { validateProgressEntry } from '../../core-0.2-reference/src/review-progress.mjs';
const VERSION='0.2';
const inspectLoadedCase=c=>captureReview(c).summary;
const leases=new WeakMap();
export async function createCase(caseDirectory,caseId,inputDirectory) {
  const result=await createInitialCase(caseDirectory,caseId,inputDirectory);
  const store=initializeStore(join(result.path,'effect'),result.config.actionResource); store.close();return result;
}
export function inspectState(caseDirectory) {const s=openStore(join(safeDirectory(caseDirectory),'effect'),{readOnly:true});try{return s.inspect();}finally{s.close();}}
export async function inspectCase(caseDirectory) {return locked(caseDirectory,c=>({review:inspectLoadedCase(c),state:inspectState(caseDirectory)}));}
async function prepareRequest(c, handles, stale=false) {
  const intentId=stale?c.i['stale-intent']:c.i.intent, nonce=stale?c.i['stale-nonce']:c.i.nonce;
  assert(!c.state().intentDeclarations.has(intentId),'INTENT_ALREADY_DECLARED_RECONCILE_FIRST');
  const request={actorId:c.i.a,action:'collect-evidence-packet',resource:c.i.resource,claimedAt:c.now()+1,termsCommitment:c.config.termsCommitment};
  append(c,stale?'stale-declared':'declared','TRANSACTION_INTENT_DECLARED',{intentId,nonce,adapterProfile:c.config.adapterProfile,actorId:c.i.a,action:request.action,resource:request.resource,roleId:c.i.role,roleTenureId:c.i['tenure-a'],termsCommitment:request.termsCommitment});
  const events=c.store.readAll(), evaluationTime=c.advance(), binding={...session(c.config.caseId,'a'),roleId:c.i.role,roleTenureId:c.i['tenure-a'],intentId,nonce};
  const challenge=core.createPortableRuntimeAuthorizationChallenge({domain:c.config.domain,request,evaluationTime,policyVersion:policyFor(c.config.caseId),historyHead:replay(events).head,binding});
  const runtimeSignature=await handles.a.signHash(core.hashCanonical(challenge));
  return {operationVersion:core.PORTABLE_INTENT_ADMISSION_VERSION,events,expectedHistoryHead:replay(events).head,admissionEventId:`${c.config.caseId}:${stale?'stale-admission':'admission'}`,domain:c.config.domain,policyVersion:policyFor(c.config.caseId),request,evaluationTime,binding:{...binding,runtimeSignature}};
}
export async function collectCase(caseDirectory) {
  return locked(caseDirectory,async c=>{
    const caseId=c.config.caseId;
    assert(c.state().agents.get(c.i.a).currentControlEpoch===1 && c.state().agents.get(c.i.a).status!=='TERMINATED','OLD_WORKER_NO_LONGER_CURRENT');
    const handles=await credentials();
    const observedExecutor={
      adapterProfile:c.executor.adapterProfile,
      submit(submission) {
        const history=c.store.readAll(), head=replay(history).head;
        assert(history.at(-1)?.id===submission.admissionEvent.id,'ADMISSION_NOT_DURABLE_AT_EXECUTOR_ENTRY');
        writeNew(join(c.path,'before-effect.json'),bytes({phase:'BEFORE_EXECUTOR_ENTRY',history,head,admissionEventId:submission.admissionEvent.id,observedAt:new Date().toISOString()}));
        return c.executor.submit(submission);
      },
      reconcile:submission=>c.executor.reconcile(submission),
    };
    const coordinator=new DurableAdmissionCoordinator(c.store,observedExecutor,{authoritativeNow:c.now});
    if(c.state().intentAdmissions.has(c.i.intent)) {
      // A repeated command only reconciles the original attempt. It cannot issue a new effect.
      if(!c.state().intentConsumptions.has(c.i.intent)) reserveEvents(c,1);
      const result=await coordinator.reconcile(c.i.intent);
      return {caseId,status:'RECONCILIATION_ONLY',result,case:inspectLoadedCase(c)};
    }
    reserveEvents(c,6); // Declaration, admission, consumption, receipt, outcome and duty.
    const input=await prepareRequest(c,handles), prepared=coordinator.prepare(input), admitted=coordinator.admit(prepared);
    writeNew(join(c.path,'admission.json'),bytes({input,proposal:prepared.proposal,admission:admitted.status==='ADMITTED'?{status:admitted.status,result:admitted.result}:admitted}));
    assert(admitted.status==='ADMITTED',`ADMISSION_${admitted.status}`);
    c.advance();
    const invocation=await coordinator.invoke(admitted.capability);
    writeNew(join(c.path,'invocation.json'),bytes(invocation));
    if(invocation.status!=='SUBMITTED' || invocation.recorded!==true) return {caseId,status:'RECONCILIATION_REQUIRED',invocation,case:inspectLoadedCase(c)};
    const packet=inspectBoundPacket(c); assert(['PACKET_VERIFIED','SIMULATED_ACKNOWLEDGMENT_RECORDED'].includes(packet.status),'ACKNOWLEDGMENT_NOT_VERIFIED');
    const issuanceEvents=c.store.readAll();
    const receipt=await core.createPortableReceipt({events:issuanceEvents,intentId:c.i.intent,issuedAt:c.advance(),externalOutcome:c.config.adapterProfile.profileId===core.SIMULATED_ADAPTER_ID?'SIMULATED':'NOT_PROVEN'},{keyId:session(caseId,'a').credentialKeyId,signHash:handles.a.signHash});
    writeNew(join(c.path,'receipt.json'),bytes(receipt));
    const record=new DurableReceiptCoordinator(c.store).record({operationVersion:core.PORTABLE_RECEIPT_RECORD_ADMISSION_VERSION,artifact:receipt,events:issuanceEvents,expectedHistoryHead:replay(issuanceEvents).head,expectedDomain:c.config.domain,recordEventId:`case:${caseId}:receipt`});
    assert(record.status==='ADMITTED',`RECEIPT_${record.status}`);
    append(c,'outcome-unknown','TRANSACTION_OUTCOME_RECORDED',{intentId:c.i.intent,status:'OUTCOME_UNKNOWN',attesterId:c.config.adapterProfile.profileId,evidenceReference:{kind:'EXTERNAL',evidenceType:`continuity-local-review-pending/${VERSION}`,reference:`case:${caseId}:review-pending`,attesterId:c.config.adapterProfile.profileId}});
    const consumption=c.state().intentConsumptions.get(c.i.intent);
    const obligation={obligationId:c.i.obligation,sourceIntentId:c.i.intent,causalReceiptContentHash:receipt.contentHash,durableRoleId:c.i.role,creationRoleTenureId:c.i['tenure-a'],description:'Review the collected synthetic packet; account for the unresolved investigation.',trigger:consumption.eventId,deadline:1000,status:'OPEN',beneficiaryId:c.i.principal,termsCommitment:c.config.termsCommitment,performanceAssigneeId:c.i.a,successionRuleId:c.i.succession,transitionPolicies:[{fromStatus:'OPEN',toStatus:'OUTCOME_UNKNOWN',action:'record-collection-disposition',acceptedAttesterIds:[c.config.adapterProfile.profileId],requiredAuthorityIds:[c.i['review-authority']]}]};
    await administrative(c,'obligation','OBLIGATION_CREATED',{record:obligation,actorId:c.i.a},'a',handles);
    return inspectLoadedCase(c);
  });
}
export async function snapshotCase(caseDirectory,snapshotId) {
  return locked(caseDirectory,c=>createSnapshot(c,snapshotId));
}
export async function supplementCase(caseDirectory,request,inputPath) {
  const selected=parseSupplementRequest(request),source=captureSupplementInput(inputPath,selected.expectedSha256);
  return locked(caseDirectory,c=>{
    assert(readReviewSupplement(c.path)===null,'ACTION_SUPPLEMENT_EXISTS');
    const review=captureReview(c);
    const record={schemaVersion:'continuity-review-supplement/1',caseId:c.config.caseId,supplementId:selected.supplementId,
      fileName:selected.fileName,bytes:source.length,sha256:selected.expectedSha256,sourceLabel:selected.sourceLabel,
      sourceScope:SUPPLEMENT_SOURCE_SCOPE,importedAt:new Date().toISOString(),observedHistoryHead:review.summary.head,
      basePacketManifestSha256:review.summary.packet.manifestSha256};
    writeReviewSupplement(c.path,record,source);return captureReview(c).summary;
  });
}
export async function recordProgress(caseDirectory,who,fileName,noteId,note) {
  assert(who==='a'||who==='b','ACTION_ACTOR');slug(noteId);
  assert(typeof fileName==='string' && typeof note==='string','ACTION_NOTE_INPUT');
  return locked(caseDirectory,async c=>{
    const before=captureReview(c),check=progressAuthorization(c.config.caseId,c.config,before.events,c.i[who]);
    const file=c.config.selection.find(x=>x.name===fileName);assert(file,'ACTION_NOTE_FILE');
    const unsigned={schemaVersion:'continuity-review-progress/1',caseId:c.config.caseId,sequence:before.entries.length+1,
      noteId,actorId:c.i[who],runtimeSessionId:check.runtime.id,controlEpoch:check.runtime.controlEpoch,roleTenureId:check.tenureId,
      historyHead:check.state.head,packetManifestSha256:before.summary.packet.manifestSha256,fileName,fileSha256:file.sha256,note,
      status:'REVIEWED',previousRecordHash:before.summary.progress.lastRecordHash,authorizationProofHash:core.hashCanonical(check.authorization.proof)};
    validateProgressEntry({...unsigned,signature:'0x'+'0'.repeat(130)});
    const handles=await credentials(),signature=await handles[who].signHash(core.hashCanonical(unsigned));
    assertReviewedCurrent(c,before);
    const entry={...unsigned,signature};validateProgressEntry(entry);
    verifyProgressRecords(c.config.caseId,c.config,before.events,inspectBoundPacket(c),[...before.entries,entry]);
    mkdirSync(join(c.path,'review-progress'),{recursive:true,mode:0o700});
    writeNew(join(c.path,'review-progress',String(entry.sequence).padStart(3,'0')+'.json'),bytes(entry));
    return captureReview(c).summary;
  });
}
export async function grantAction(caseDirectory,grantId,who,action) {
  slug(grantId);assert(who==='a'||who==='b','ACTION_ACTOR');assert(action==='RELEASE'||action==='RESTORE','ACTION_KIND');
  return locked(caseDirectory,c=>append(c,'grant-'+grantId,'AUTHORITY_GRANTED',{grant:{kind:'PERMISSION',
    authorityId:'action-grant:'+c.config.caseId+':'+grantId,grantorId:c.i.principal,granteeId:c.i[who],
    rootAuthorityId:'action-grant:'+c.config.caseId+':'+grantId,independent:true,
    constraints:{actions:[action==='RELEASE'?'release-synthetic-endpoint':'restore-synthetic-hold'],resources:[c.config.actionResource],
      quantitative:false,maxDelegationDepth:0,requiredIntersectionIds:[]}}}));
}
export async function revokeAction(caseDirectory,grantId) {
  slug(grantId);return locked(caseDirectory,c=>append(c,'revoke-'+grantId,'AUTHORITY_REVOKED',
    {authorityId:'action-grant:'+c.config.caseId+':'+grantId,revokerId:c.i.principal}));
}
export async function takeoverCase(caseDirectory) {
  return locked(caseDirectory,async c=>{
    reserveEvents(c,5);
    const state=c.state();assert(state.agents.get(c.i.a).currentControlEpoch===1 && !state.agents.get(c.i.a).terminated &&
      state.obligations.get(c.i.obligation)?.status==='OPEN','ACTION_TAKEOVER_START');
    const handles=await credentials();
    const steps=[
      ['epoch','CONTROL_EPOCH_ADVANCED',{agentId:c.i.a,controllerId:c.i.controller,fromEpoch:1,toEpoch:2}],
      ['terminated','AGENT_TERMINATED',{agentId:c.i.a,principalId:c.i.principal,successionRuleId:c.i.succession,roleId:c.i.role,roleTenureId:c.i['tenure-a']}],
      ['transfer','ROLE_TRANSFERRED',{roleId:c.i.role,fromAgentId:c.i.a,fromRoleTenureId:c.i['tenure-a'],toAgentId:c.i.b,
        toRoleTenureId:c.i['tenure-b'],toTenureNumber:2,principalId:c.i.principal,transferKind:'SUCCESSION',successionRuleId:c.i.succession}],
      ['session-b','RUNTIME_SESSION_ADMITTED',{sessionId:session(c.config.caseId,'b').runtimeSessionId,agentId:c.i.b,
        controllerId:c.i.controller,controlEpoch:1,credentialKeyId:session(c.config.caseId,'b').credentialKeyId,
        credentialAddress:handles.b.address,expiresAt:10000}],
    ];
    for(const [suffix,type,data] of steps) append(c,suffix,type,data);
    await administrative(c,'assignment','OBLIGATION_PERFORMANCE_ASSIGNED',{obligationId:c.i.obligation,fromAgentId:c.i.a,
      toAgentId:c.i.b,successionRuleId:c.i.succession,actorId:c.i.b},'b',handles);
    return captureReview(c).summary;
  });
}
function actionInput(requestUtf8) {
  assert(typeof requestUtf8==='string' && Buffer.byteLength(requestUtf8)<=16384,'ACTION_REQUEST_INPUT');
  const value=parseJson(Buffer.from(requestUtf8),16384);
  assert(value && equal(Object.keys(value).sort(),['descriptorUtf8','proposalUtf8','snapshotId','snapshotManifestSha256'].sort()),
    'ACTION_REQUEST_FIELDS');
  slug(value.snapshotId);
  assert(typeof value.proposalUtf8==='string' && value.proposalUtf8.length>0 && Buffer.byteLength(value.proposalUtf8)<=4096 &&
    Buffer.from(value.proposalUtf8).toString('utf8')===value.proposalUtf8,'ACTION_PROPOSAL_BYTES');
  const descriptor=parseReviewedAction(value.descriptorUtf8);
  assert(sha(Buffer.from(value.proposalUtf8))===descriptor.proposalSha256 &&
    value.snapshotManifestSha256===descriptor.snapshotManifestSha256,'ACTION_PROPOSAL_BINDING');
  return {...value,descriptor};
}
export async function admitAction(caseDirectory,who,actionId,requestUtf8,{withholdAcknowledgment=false,approvalGuard}={}) {
  assert(who==='a'||who==='b','ACTION_ACTOR');slug(actionId);
  assert(typeof withholdAcknowledgment==='boolean','ACTION_WITHHOLD_OPTION');
  assert(approvalGuard===undefined || typeof approvalGuard==='function','ACTION_APPROVAL_GUARD_OPTION');
  // This is trusted application composition, never an agent-supplied policy callback.
  // Synchronous exact-true gates cannot defer approval beyond the mutation boundary.
  const checkApproval=phase=>{
    if(approvalGuard!==undefined) assert(approvalGuard(Object.freeze({phase,caseDirectory,who,actionId,requestUtf8}))===true,
      'ACTION_APPROVAL_GUARD_REFUSED');
  };
  const input=actionInput(requestUtf8);
  return locked(caseDirectory,async c=>{
    const snapshot=readSnapshot(c.path,input.snapshotId,input.snapshotManifestSha256),descriptor=input.descriptor;
    assert(descriptor.intentId==='action:'+c.config.caseId+':'+actionId && descriptor.resource===c.config.actionResource &&
      descriptor.reviewMaterialSha256===sha(bytes(snapshot.material)) && equal(descriptor.reviewHead,snapshot.summary.head),'ACTION_DESCRIPTOR_CONTEXT');
    try { assertReviewedCurrent(c,snapshot); }
    catch { return {status:'REFUSED',reason:'ACTION_REVIEW_CONTEXT_CHANGED',admitted:false,executorInvoked:false}; }
    const state=inspectState(c.path);
    assert(state.status==='OK','ACTION_STATE_UNAVAILABLE');
    if(state.state.revision!==descriptor.expectedRevision ||
      state.state.status!==(descriptor.action==='RELEASE'?'HELD':'RELEASED'))
      return {status:'REFUSED',reason:'ACTION_STATE_PRECONDITION',admitted:false,executorInvoked:false};
    reserveEvents(c,3); // Reserve the eventual consumption before declaring an action.
    checkApproval('BEFORE_DECLARATION');
    const actionPath=join(c.path,'actions',actionId);safeDirectory(join(c.path,'actions'));mkdirSync(actionPath,{mode:0o700});
    writeNew(join(actionPath,'request.json'),Buffer.from(requestUtf8));
    writeNew(join(actionPath,'descriptor.canonical.txt'),Buffer.from(core.canonicalEncode(descriptor)+'\n'));
    const request={actorId:c.i[who],action:descriptor.action==='RELEASE'?'release-synthetic-endpoint':'restore-synthetic-hold',
      resource:descriptor.resource,claimedAt:c.now()+1,termsCommitment:core.hashCanonical(descriptor)};
    const intentId=descriptor.intentId,nonce='nonce:'+c.config.caseId+':'+actionId;
    const declaration=append(c,'action-declare-'+actionId,'TRANSACTION_INTENT_DECLARED',{intentId,nonce,
      adapterProfile:core.approvedPortableAdapterProfileForPolicy(core.PORTABLE_ADAPTER_POLICY_E2_HASH,core.LOCAL_SYNTHETIC_ENDPOINT_STATE_ADAPTER_ID),
      actorId:request.actorId,action:request.action,resource:request.resource,roleId:c.i.role,roleTenureId:c.i['tenure-'+who],
      termsCommitment:request.termsCommitment});
    const events=c.store.readAll(),evaluationTime=c.advance(),binding={...session(c.config.caseId,who),roleId:c.i.role,
      roleTenureId:c.i['tenure-'+who],intentId,nonce};
    const challenge=core.createPortableRuntimeAuthorizationChallenge({domain:c.config.domain,request,evaluationTime,
      policyVersion:policyFor(c.config.caseId),historyHead:replay(events).head,binding});
    const handles=await credentials(),runtimeSignature=await handles[who].signHash(core.hashCanonical(challenge));
    assertReviewedCurrent(c,snapshot,[declaration]);
    checkApproval('BEFORE_ADMISSION');
    let admissionEvent,entryCount=0,guardCount=0;
    const executor=createStateExecutor({storeDirectory:join(c.path,'effect'),descriptorUtf8:input.descriptorUtf8,withholdAcknowledgment,
      beforeSubmit:({submission})=>{
        assert(admissionEvent && equal(submission.admissionEvent,admissionEvent),'ACTION_EXECUTOR_ADMISSION');
        assertReviewedCurrent(c,snapshot,[declaration,admissionEvent]);reserveEvents(c,1);
        checkApproval('BEFORE_EFFECT');guardCount++;return true;
      }});
    const adapter={adapterProfile:executor.adapterProfile,
      submit(submission){entryCount++;return executor.submit(submission);},reconcile:executor.reconcile};
    const coordinator=new DurableAdmissionCoordinator(c.store,adapter,{authoritativeNow:()=>replay(c.store.readAll()).head.canonicalTime});
    const admissionInput={operationVersion:core.PORTABLE_INTENT_ADMISSION_VERSION,events,expectedHistoryHead:replay(events).head,
      admissionEventId:c.config.caseId+':action-admit-'+actionId,domain:c.config.domain,policyVersion:policyFor(c.config.caseId),
      request,evaluationTime,binding:{...binding,runtimeSignature}};
    const prepared=coordinator.prepare(admissionInput),admission=coordinator.admit(prepared);
    writeNew(join(actionPath,'admission.json'),bytes({input:admissionInput,proposal:prepared.proposal,
      admission:admission.status==='ADMITTED'?{status:admission.status,result:admission.result}:admission}));
    if(admission.status!=='ADMITTED') return {status:'NOT_ADMITTED',admission,executorInvoked:false};
    admissionEvent=admission.result.admissionEvent;
    assert(equal(c.store.readAll(),[...snapshot.events,declaration,admissionEvent]) &&
      equal(replay(c.store.readAll()).head,admission.result.newHead),'ACTION_ADMISSION_SUFFIX');
    const handle=Object.freeze({intentId,actionId});
    leases.set(handle,{path:c.path,actionPath,coordinator,capability:admission.capability,snapshot,declaration,admissionEvent,
      entries:()=>entryCount,guards:()=>guardCount});
    return {status:'ADMITTED',intentId,handle,admission:admission.result};
  });
}
export async function invokeAction(caseDirectory,handle) {
  if(handle===null || typeof handle!=='object' || !leases.has(handle)) return {status:'INVALID_CAPABILITY',executorInvoked:false};
  const record=leases.get(handle);leases.delete(handle);
  assert(safeDirectory(caseDirectory)===record.path,'ACTION_CAPABILITY_CASE');
  return locked(caseDirectory,async c=>{
    try { assertReviewedCurrent(c,record.snapshot,[record.declaration,record.admissionEvent]); }
    catch {
      const result={status:'NOT_INVOKED',reason:'ACTION_REVIEW_CONTEXT_CHANGED',executorInvoked:false};
      writeNew(join(record.actionPath,'invocation.json'),bytes(result));return result;
    }
    reserveEvents(c,1);
    const invocation=await record.coordinator.invoke(record.capability);
    const result={...invocation,executorInvoked:record.entries()>0,contextGuardPassed:record.guards()>0};
    writeNew(join(record.actionPath,'invocation.json'),bytes(result));return result;
  });
}
export async function reconcileAction(caseDirectory,actionId) {
  slug(actionId);
  return locked(caseDirectory,async c=>{
    const actionPath=join(c.path,'actions',actionId),request=actionInput(readRegular(join(actionPath,'request.json'),16384).toString('utf8'));
    // Retained exact context is historical. It does not need to remain the current review for a read-only recovery.
    const snapshot=readSnapshot(c.path,request.snapshotId,request.snapshotManifestSha256);
    assert(request.descriptor.intentId==='action:'+c.config.caseId+':'+actionId &&
      request.descriptor.resource===c.config.actionResource && request.descriptor.reviewMaterialSha256===sha(bytes(snapshot.material)) &&
      equal(request.descriptor.reviewHead,snapshot.summary.head),'ACTION_RECOVERY_CONTEXT');
    const adapter=createStateExecutor({storeDirectory:join(c.path,'effect'),descriptorUtf8:request.descriptorUtf8,
      beforeSubmit:()=>{throw new Error('ACTION_RECOVERY_MUST_NOT_SUBMIT');}});
    const before=readRegular(join(c.path,'effect/effect.sqlite'),1048576);
    const events=c.store.readAll(),observed=core.inspectPortableAdmittedIntent(events,request.descriptor.intentId,replay(events).head.canonicalTime);
    assert(observed.status==='ADMITTED','ACTION_RECOVERY_ADMISSION');
    const submission={operationVersion:'continuity-adapter-submission/0.2',domain:c.config.domain,
      intentId:request.descriptor.intentId,admissionEvent:observed.admissionEvent,
      admittedHistory:events.slice(0,observed.admissionHead.position+1)};
    // The SDK's already-consumed branch is historical Core evidence. Independently inspect
    // the exact original local command on every recovery, including that branch.
    const retained=adapter.reconcile(submission);
    let result;
    if(retained.status!=='RETRY') result={status:'OUTCOME_UNKNOWN',reason:'ACTION_RETAINED_STATE_UNAVAILABLE'};
    else if(observed.consumption && !equal(observed.consumption.acknowledgment,retained.acknowledgment))
      result={status:'OUTCOME_UNKNOWN',reason:'ACTION_RETAINED_ACK_MISMATCH'};
    else if(!observed.consumption && events.length>=120)
      result={status:'OUTCOME_UNKNOWN',reason:'CASE_EVENT_LIMIT',retainedState:'VERIFIED_UNRECORDED'};
    else {
      const coordinator=new DurableAdmissionCoordinator(c.store,{adapterProfile:adapter.adapterProfile,
        submit:adapter.submit,reconcile:()=>retained},{authoritativeNow:()=>replay(c.store.readAll()).head.canonicalTime});
      result=await coordinator.reconcile(request.descriptor.intentId);
      if(result.status==='RETRY') assert(equal(result.disposition.acknowledgment,retained.acknowledgment),'ACTION_RECOVERY_ACK_MISMATCH');
    }
    assert(before.equals(readRegular(join(c.path,'effect/effect.sqlite'),1048576)),'ACTION_RECOVERY_CHANGED_STATE_STORE');
    writeNew(join(actionPath,'reconciliation.json'),bytes(result));return result;
  });
}
