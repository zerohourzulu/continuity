// Application-only approval composition. No private key or signer is loaded here.
import { mkdirSync, lstatSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { planSnapshot, validateFreshInput } from './preparation.mjs';
import { summarizeReview, projectDuty } from './desk.mjs';
import { compareSelections } from './comparison.mjs';
import { parsePolicy, parseChallenge, verifyDecision, sha } from './contract.mjs';
import { safeDirectory, readRegular, parseJson, list } from '../../security-action-reference/src/safe-io.mjs';
import { core, bytes, equal, assert, slug, session, policyFor, locked, load, writeNew } from '../../security-action-reference/src/protocol.mjs';
import { captureReview, createSnapshot, readSnapshot, assertReviewedCurrent } from '../../security-action-reference/src/context.mjs';
import { parseReviewedAction } from '../../synthetic-state-executor/src/contract.mjs';
import { admitAction, invokeAction, reconcileAction, inspectState } from '../../security-action-reference/src/application.mjs';
const LIMIT=4*1024*1024;
const allowed=new Set(['challenge.json','display.json','decision.json','reservation.json','effect-claim.json','admission-result.json','invocation-result.json','reconciliation-result.json','failure.json','recovery-started.json','preparation.json']);
const inside=(path,base)=>path===base || path.startsWith(base+sep);
const encoded=value=>bytes(value).toString('utf8');
const utf8=data=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(data);
const readText=(path,max)=>utf8(readRegular(path,max));
function optional(path,max=262144) { try {lstatSync(path);} catch(e) {if(e.code==='ENOENT') return null;throw e;}return readText(path,max); }
function input(requestUtf8) {
  assert(typeof requestUtf8==='string'&&Buffer.byteLength(requestUtf8)<=16384&&Buffer.from(requestUtf8).toString('utf8')===requestUtf8,'APPROVAL_REQUEST_BYTES');
  const r=parseJson(Buffer.from(requestUtf8),16384);
  assert(r&&equal(Object.keys(r).sort(),['descriptorUtf8','proposalUtf8','snapshotId','snapshotManifestSha256'].sort()),'APPROVAL_REQUEST_FIELDS');
  slug(r.snapshotId); const descriptor=parseReviewedAction(r.descriptorUtf8);
  assert(typeof r.proposalUtf8==='string'&&Buffer.byteLength(r.proposalUtf8)>0&&Buffer.byteLength(r.proposalUtf8)<=4096&&Buffer.from(r.proposalUtf8).toString('utf8')===r.proposalUtf8,'APPROVAL_PROPOSAL_BYTES');
  assert(sha(r.proposalUtf8)===descriptor.proposalSha256&&r.snapshotManifestSha256===descriptor.snapshotManifestSha256,'APPROVAL_REQUEST_BINDING');
  return {...r,descriptor};
}
function binding(c,who) {return {actorId:c.i[who],...session(c.config.caseId,who),roleId:c.i.role,roleTenureId:c.i['tenure-'+who]};}
function snapshotFor(c,ch) {
  const r=input(ch.requestUtf8),snapshot=readSnapshot(c.path,r.snapshotId,r.snapshotManifestSha256);
  assert(ch.caseId===c.config.caseId&&equal(ch.domain,c.config.domain)&&equal(ch.actorBinding,binding(c,ch.who))&&
    r.descriptor.intentId==='action:'+c.config.caseId+':'+ch.actionId&&r.descriptor.resource===c.config.actionResource&&
    r.descriptor.reviewMaterialSha256===sha(bytes(snapshot.material))&&equal(r.descriptor.reviewHead,snapshot.summary.head),'APPROVAL_CONTEXT_BINDING');
  return {r,snapshot};
}
function current(c,ch,suffix=[]) {
  const {r,snapshot}=snapshotFor(c,ch);assertReviewedCurrent(c,snapshot,suffix);
  const state=inspectState(c.path);assert(state.status==='OK'&&state.state.revision===r.descriptor.expectedRevision&&
    state.state.status===(r.descriptor.action==='RELEASE'?'HELD':'RELEASED'),'APPROVAL_STATE_CHANGED');
  return {r,snapshot,state};
}
function actorCurrent(s,b) {
  const a=s.agents.get(b.actorId),runtime=s.runtimeSessions.get(b.runtimeSessionId),tenure=s.tenures.get(b.roleTenureId);
  return !!(a&&!a.terminated&&a.currentControlEpoch===b.controlEpoch&&runtime&&runtime.agentId===b.actorId&&
    runtime.credentialKeyId===b.credentialKeyId&&runtime.controlEpoch===b.controlEpoch&&
    (runtime.expiresAt===undefined||s.head.canonicalTime<runtime.expiresAt)&&tenure&&!tenure.closed&&s.roles.get(b.roleId)?.currentTenureId===b.roleTenureId);
}
function permission(c,ch,r) {
  const s=c.state(),b=ch.actorBinding,controlCurrent=actorCurrent(s,b);
  const result=core.authorizePortable({operationVersion:core.PORTABLE_AUTHORIZATION_VERSION,events:c.store.readAll(),expectedHistoryHead:s.head,
    domain:c.config.domain,policyVersion:policyFor(c.config.caseId),rootRecognitionPolicy:core.PORTABLE_ROOT_RECOGNITION_POLICY,
    request:{actorId:b.actorId,action:r.descriptor.action==='RELEASE'?'release-synthetic-endpoint':'restore-synthetic-hold',resource:r.descriptor.resource,
      claimedAt:s.head.canonicalTime,termsCommitment:core.hashCanonical(r.descriptor)},evaluationTime:s.head.canonicalTime,authoritative:true,consequential:false});
  return {decision:controlCurrent?result.decision:'DENY',controlStatus:controlCurrent?'CURRENT':'NOT_CURRENT',scopeAssurance:result.scopeAssurance,
    controllingAuthorityIds:result.proof?.controllingAuthorityIds??[],explanation:'Read-only observation at the displayed head. Core independently checks actual admission and use.'};
}
function displayFor(snapshot,requestUtf8,actorBinding) {
  return {schemaVersion:'continuity-operator-review-display/1',requestUtf8,actorBinding,summary:snapshot.summary,material:snapshot.material,
        progress:snapshot.entries,originals:[...snapshot.originals].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([path,data])=>{
          const text=data.toString('utf8'),utf8=Buffer.from(text).equals(data)?text:null;
          return {path,bytes:data.length,sha256:sha(data),utf8,base64:utf8===null?data.toString('base64'):null};}),
        limitations:['Synthetic local evidence only; source truth and external effect are not proved.','Operator signature establishes enrolled key control, not human presence or comprehension.','Approval cannot create an agent permission or discharge the investigation duty.']};
}
export function openApprovalApplication({policyPath,caseDirectory}) {
  safeDirectory(dirname(policyPath));const policyUtf8=readText(policyPath,16384),policy=parsePolicy(policyUtf8);
  const selectedCase=safeDirectory(caseDirectory),approvalDirectory=safeDirectory(policy.approvalDirectory);
  assert(selectedCase===policy.caseDirectory&&!inside(policyPath,selectedCase)&&!inside(approvalDirectory,selectedCase)&&
    !inside(selectedCase,approvalDirectory)&&!inside(policyPath,approvalDirectory),'APPROVAL_TRUST_BOUNDARY');
  const initial=load(selectedCase);assert(policy.resource===initial.config.actionResource,'APPROVAL_POLICY_RESOURCE');
  const handles=new Map();
  const trust=()=>{assert(readRegular(policyPath,16384).equals(Buffer.from(policyUtf8)),'APPROVAL_POLICY_CHANGED');
    assert(safeDirectory(selectedCase)===policy.caseDirectory&&safeDirectory(approvalDirectory)===policy.approvalDirectory,'APPROVAL_PATH_CHANGED');return true;};
  const reviewPath=id=>{assert(typeof id==='string'&&/^[a-f0-9]{32}$/.test(id),'APPROVAL_CHALLENGE_ID');return safeDirectory(join(approvalDirectory,id));};
  function read(id,{includePreparation=true}={}) {
    const path=reviewPath(id);assert(list(path,12).every(n=>allowed.has(n)),'APPROVAL_LEDGER_MEMBERSHIP');
    const challengeUtf8=readText(join(path,'challenge.json'),65536),ch=parseChallenge(challengeUtf8);
    assert(ch.challengeId===id&&ch.instanceId===policy.instanceId&&ch.policySha256===sha(policyUtf8),'APPROVAL_CHALLENGE_BINDING');
    const displayUtf8=readText(join(path,'display.json'),LIMIT);
    assert(sha(displayUtf8)===ch.reviewDisplaySha256,'APPROVAL_DISPLAY_CHANGED');
    const display=parseJson(Buffer.from(displayUtf8),LIMIT),envelopeUtf8=optional(join(path,'decision.json'));
    const selected=input(ch.requestUtf8);
    assert(policy.actions.includes(selected.descriptor.action)&&selected.descriptor.resource===policy.resource,'APPROVAL_POLICY_SCOPE');
    assert(display.requestUtf8===ch.requestUtf8&&equal(display.actorBinding,ch.actorBinding),'APPROVAL_DISPLAY_BINDING');
    const historical=snapshotFor(load(selectedCase),ch);
    assert(displayUtf8===encoded(displayFor(historical.snapshot,ch.requestUtf8,ch.actorBinding)),'APPROVAL_DISPLAY_RECONSTRUCTION');
    const decision=envelopeUtf8===null?null:verifyDecision(envelopeUtf8,challengeUtf8,policyUtf8);
    const reservationUtf8=optional(join(path,'reservation.json')),claimUtf8=optional(join(path,'effect-claim.json'));
    const expected=encoded({schemaVersion:'continuity-operator-reservation/1',challengeId:id,challengeSha256:sha(challengeUtf8),decisionSha256:envelopeUtf8===null?null:sha(envelopeUtf8),requestSha256:sha(ch.requestUtf8)});
    if(reservationUtf8!==null) assert(decision?.decision==='APPROVE'&&reservationUtf8===expected,'APPROVAL_RESERVATION_CHANGED');
    if(claimUtf8!==null) assert(reservationUtf8!==null&&claimUtf8===encoded({schemaVersion:'continuity-operator-effect-claim/1',reservationSha256:sha(reservationUtf8)}),'APPROVAL_EFFECT_CLAIM_CHANGED');
    const recoveryUtf8=optional(join(path,'recovery-started.json'));
    if(recoveryUtf8!==null) assert(reservationUtf8!==null&&recoveryUtf8===encoded({schemaVersion:'continuity-operator-recovery-started/1',reservationSha256:sha(reservationUtf8)}),'APPROVAL_RECOVERY_MARKER_CHANGED');
    // A direct-pair comparison verifies its child's link; the parent's own ancestry is outside that comparison.
    const preparationUtf8=includePreparation?optional(join(path,'preparation.json'),4096):null;let preparation=null;
    if(preparationUtf8!==null) {
      preparation=parseJson(Buffer.from(preparationUtf8),4096);
      assert(preparation&&typeof preparation.parentChallengeId==='string'&&/^[a-f0-9]{32}$/.exec(preparation.parentChallengeId)?.[0]===preparation.parentChallengeId&&preparation.parentChallengeId!==id,'APPROVAL_PREPARATION_CHANGED');
      const parentUtf8=readText(join(reviewPath(preparation.parentChallengeId),'challenge.json'),65536),parent=parseChallenge(parentUtf8);
      assert(parent.challengeId===preparation.parentChallengeId&&parent.instanceId===ch.instanceId&&parent.policySha256===ch.policySha256&&parent.caseId===ch.caseId,'APPROVAL_PREPARATION_CHANGED');
      assert(preparationUtf8===encoded({schemaVersion:'continuity-operator-preparation/1',parentChallengeId:parent.challengeId,
        parentChallengeSha256:sha(parentUtf8),childChallengeSha256:sha(challengeUtf8)}),'APPROVAL_PREPARATION_CHANGED');
    }
    const outcome={};for(const name of ['admission','invocation','reconciliation']) {const text=optional(join(path,name+'-result.json'));outcome[name]=text===null?null:parseJson(Buffer.from(text));}
    assert((!outcome.admission&&!outcome.invocation&&!outcome.reconciliation)||reservationUtf8!==null,'APPROVAL_OUTCOME_WITHOUT_RESERVATION');
    return {path,ch,challengeUtf8,displayUtf8,display,envelopeUtf8,decision,reservationUtf8,claimUtf8,recoveryUtf8,expected,outcome,preparation,r:selected};
  }
  function checkSelected(record,facts) {
    assert(facts.caseDirectory===selectedCase&&facts.who===record.ch.who&&facts.actionId===record.ch.actionId&&facts.requestUtf8===record.ch.requestUtf8,'APPROVAL_ATTEMPT_BINDING');
    trust();const now=read(record.ch.challengeId);
    assert(now.challengeUtf8===record.challengeUtf8&&now.envelopeUtf8===record.envelopeUtf8&&now.decision?.decision==='APPROVE','APPROVAL_DECISION_CHANGED');
    return now;
  }
  function planReview(c,who,actionId,requestUtf8,snapshot) {
    const ch={schemaVersion:'continuity-operator-challenge/1',challengeId:randomBytes(16).toString('hex'),instanceId:policy.instanceId,
      policySha256:sha(policyUtf8),caseId:c.config.caseId,actionId,who,domain:c.config.domain,actorBinding:binding(c,who),requestUtf8,reviewDisplaySha256:'0'.repeat(64)};
    const displayUtf8=encoded(displayFor(snapshot,requestUtf8,ch.actorBinding));
    assert(Buffer.byteLength(displayUtf8)<=LIMIT,'APPROVAL_DISPLAY_LIMIT');ch.reviewDisplaySha256=sha(displayUtf8);
    const challengeUtf8=encoded(ch);parseChallenge(challengeUtf8);return {ch,challengeUtf8,displayUtf8};
  }
  function persistReview(plan,preparation=null) {
    const path=join(approvalDirectory,plan.ch.challengeId);mkdirSync(path,{mode:0o700});
    writeNew(join(path,'display.json'),Buffer.from(plan.displayUtf8));
    if(preparation!==null) writeNew(join(path,'preparation.json'),bytes(preparation));
    writeNew(join(path,'challenge.json'),Buffer.from(plan.challengeUtf8));
    return {challengeId:plan.ch.challengeId,challengeUtf8:plan.challengeUtf8,displayUtf8:plan.displayUtf8};
  }
  async function prepare(who,actionId,requestUtf8) {
    assert(who==='a'||who==='b','APPROVAL_ACTOR');slug(actionId);
    return locked(selectedCase,c=>{
      trust();assert(list(approvalDirectory,33).length<32,'APPROVAL_REVIEW_LIMIT');
      const r=input(requestUtf8);assert(policy.actions.includes(r.descriptor.action)&&r.descriptor.resource===policy.resource,'APPROVAL_POLICY_SCOPE');
      const ch={caseId:c.config.caseId,actionId,who,domain:c.config.domain,actorBinding:binding(c,who),requestUtf8};
      const {snapshot}=current(c,ch);return persistReview(planReview(c,who,actionId,requestUtf8,snapshot));
    });
  }
  async function prepareFresh(parentId,who,actionId,proposalUtf8) {
    validateFreshInput(who,actionId,proposalUtf8);
    return locked(selectedCase,c=>{
      trust();const parent=read(parentId),parentView=viewUnlocked(c,parentId);
      assert(parent.reservationUtf8===null&&parentView.current.contextStatus==='STALE','APPROVAL_FRESH_PARENT_REQUIRED');
      assert(actorCurrent(c.state(),binding(c,who)),'APPROVAL_FRESH_ACTOR_NOT_CURRENT');
      const original=input(parent.ch.requestUtf8),state=inspectState(selectedCase);
      assert(state.status==='OK'&&state.state.status===(original.descriptor.action==='RELEASE'?'HELD':'RELEASED')&&state.state.revision<=31,'APPROVAL_FRESH_STATE_REQUIRED');
      const names=list(approvalDirectory,32),snapshots=list(join(selectedCase,'snapshots'),32);
      assert(names.length<32&&snapshots.length<32,'APPROVAL_FRESH_CAPACITY');
      assert(names.every(id=>/^[a-f0-9]{32}$/.exec(id)?.[0]===id),'APPROVAL_DESK_MEMBERSHIP');
      assert(names.every(id=>read(id).ch.actionId!==actionId)&&!snapshots.includes(actionId)&&
        !c.state().intentDeclarations.has('action:'+c.config.caseId+':'+actionId),'APPROVAL_FRESH_NAME_IN_USE');
      try {lstatSync(join(selectedCase,'actions',actionId));assert(false,'APPROVAL_FRESH_NAME_IN_USE');}catch(error){if(error.code!=='ENOENT') throw error;}
      const captured=captureReview(c),planned=planSnapshot(captured,actionId);
      const descriptor={schemaVersion:'continuity-reviewed-state-action/1',intentId:'action:'+c.config.caseId+':'+actionId,
        resource:original.descriptor.resource,action:original.descriptor.action,expectedRevision:state.state.revision,proposalSha256:sha(proposalUtf8),
        snapshotManifestSha256:planned.manifestSha256,reviewMaterialSha256:planned.materialSha256,reviewHead:planned.head};
      const requestUtf8=encoded({snapshotId:actionId,snapshotManifestSha256:planned.manifestSha256,proposalUtf8,descriptorUtf8:encoded(descriptor)});
      input(requestUtf8);const candidate=planReview(c,who,actionId,requestUtf8,captured);
      const preparation={schemaVersion:'continuity-operator-preparation/1',parentChallengeId:parentId,
        parentChallengeSha256:sha(parent.challengeUtf8),childChallengeSha256:sha(candidate.challengeUtf8)};
      // All deterministic construction/reader limits passed before the first write.
      const snapshot=createSnapshot(c,actionId);assert(equal(snapshot,planned),'APPROVAL_FRESH_CAPTURE_CHANGED');
      current(c,candidate.ch);trust();
      assert(read(parentId).challengeUtf8===parent.challengeUtf8,'APPROVAL_FRESH_PARENT_CHANGED');
      return {status:'PREPARED',parentChallengeId:parentId,...persistReview(candidate,preparation)};
    });
  }
  async function importDecision(id,envelopeUtf8) {
    return locked(selectedCase,c=>{
      trust();const r=read(id);verifyDecision(envelopeUtf8,r.challengeUtf8,policyUtf8);
      if(r.envelopeUtf8!==null) {assert(envelopeUtf8===r.envelopeUtf8,'APPROVAL_DECISION_CONFLICT');return {status:'IDENTICAL_REIMPORT',spent:r.reservationUtf8!==null};}
      assert(r.reservationUtf8===null,'APPROVAL_ALREADY_SPENT');current(c,r.ch);
      writeNew(join(r.path,'decision.json'),Buffer.from(envelopeUtf8));return {status:'ACCEPTED',decision:read(id).decision.decision};
    });
  }
  async function admit(id,{withholdAcknowledgment=false}={}) {
    const selected=read(id);trust();assert(selected.decision?.decision==='APPROVE','APPROVAL_NOT_APPROVED');
    assert(selected.reservationUtf8===null,'APPROVAL_ALREADY_SPENT');
    const guard=facts=>{
      const record=checkSelected(selected,facts);
      if(facts.phase==='BEFORE_DECLARATION') {
        assert(record.reservationUtf8===null,'APPROVAL_ALREADY_SPENT');writeNew(join(record.path,'reservation.json'),Buffer.from(record.expected));
      } else {
        assert(record.reservationUtf8===record.expected,'APPROVAL_RESERVATION_REQUIRED');
        if(facts.phase==='BEFORE_EFFECT') {assert(record.recoveryUtf8===null,'APPROVAL_RECOVERY_RETIRED_CAPABILITY');assert(record.claimUtf8===null,'APPROVAL_EFFECT_ALREADY_CLAIMED');
          writeNew(join(record.path,'effect-claim.json'),bytes({schemaVersion:'continuity-operator-effect-claim/1',reservationSha256:sha(record.reservationUtf8)}));}
        else assert(facts.phase==='BEFORE_ADMISSION','APPROVAL_GUARD_PHASE');
      }
      return true;
    };
    try {
      const result=await admitAction(selectedCase,selected.ch.who,selected.ch.actionId,selected.ch.requestUtf8,{withholdAcknowledgment,approvalGuard:guard});
      // A precondition refusal before reservation remains nonexecuting and needs a fresh current review.
      if(read(id).reservationUtf8!==null) writeNew(join(selected.path,'admission-result.json'),bytes(result));
      if(result.status==='ADMITTED') handles.set(id,result.handle);
      const {handle,...publicResult}=result;return publicResult;
    } catch(error) {
      const now=read(id);if(now.reservationUtf8!==null&&optional(join(now.path,'failure.json'))===null)
        writeNew(join(now.path,'failure.json'),bytes({phase:'ADMISSION',code:String(error.code??error.message).slice(0,256)}));
      throw error;
    }
  }
  async function invoke(id) {
    const r=read(id),handle=handles.get(id);assert(handle,'APPROVAL_NO_LIVE_CAPABILITY');handles.delete(id);
    // Core's executor guard rereads the decision and trust under its writer immediately before effect.
    const result=await invokeAction(selectedCase,handle);writeNew(join(r.path,'invocation-result.json'),bytes(result));return result;
  }
  async function reconcile(id) {
    const r=await locked(selectedCase,()=>{
      const r=read(id);assert(r.reservationUtf8!==null&&r.outcome.admission?.status==='ADMITTED','APPROVAL_ORIGINAL_ADMISSION_REQUIRED');
      assert(r.outcome.reconciliation===null,'APPROVAL_ORIGINAL_RECOVERY_ALREADY_RECORDED');
      handles.delete(id);
      if(r.recoveryUtf8===null) writeNew(join(r.path,'recovery-started.json'),bytes({schemaVersion:'continuity-operator-recovery-started/1',reservationSha256:sha(r.reservationUtf8)}));
      return r;
    });
    const result=await reconcileAction(selectedCase,r.ch.actionId);writeNew(join(r.path,'reconciliation-result.json'),bytes(result));return result;
  }
  function viewUnlocked(c,id) {
      const r=read(id),{r:request}=snapshotFor(c,r.ch);let trustStatus='CURRENT',contextStatus='CURRENT';
      try {trust();}catch{trustStatus='CHANGED_OR_UNAVAILABLE';}
      try {
        let suffix=[];
        if(r.outcome.admission?.status==='ADMITTED') {
          const events=c.store.readAll(),at=request.descriptor.reviewHead.position+1,declaration=events[at],admission=r.outcome.admission.admission.admissionEvent;
          assert(declaration?.id===r.ch.caseId+':action-declare-'+r.ch.actionId&&declaration.type==='TRANSACTION_INTENT_DECLARED'&&
            declaration.data.intentId===request.descriptor.intentId&&declaration.data.termsCommitment===core.hashCanonical(request.descriptor),'APPROVAL_OWN_DECLARATION_REQUIRED');
          suffix=[declaration,admission];
        }
        current(c,r.ch,suffix);
      }catch{contextStatus=r.reservationUtf8===null?'STALE':'HISTORICAL_AFTER_ATTEMPT';}
      const p=permission(c,r.ch,request),state=inspectState(selectedCase),s=c.state();
      let status=r.reservationUtf8!==null?'SPENT':r.decision?.decision==='DENY'?'DENIED':r.decision?'APPROVED':'PENDING';
      if(r.reservationUtf8===null&&(trustStatus!=='CURRENT'||contextStatus!=='CURRENT')) status='STALE';
      return {schemaVersion:'continuity-operator-workbench/1',scope:{syntheticOnly:true,credentialClass:policy.credentialClass,humanPresence:'NOT_PROVEN',
        limitations:['Cooperative local host; same-path rollback and hostile-host isolation are outside this claim.','No wall-clock expiry. Exact context, policy edition and once-only use govern this application.','Source truth, production custody and external endpoint outcome are not proved.']},
        challenge:{challengeId:id,sha256:sha(r.challengeUtf8),policySha256:sha(policyUtf8),operatorId:policy.operatorId,keyId:policy.keyId,publicKeyHex:policy.publicKeyHex},
        selection:{caseId:r.ch.caseId,actionId:r.ch.actionId,requestUtf8:r.ch.requestUtf8,descriptor:request.descriptor,proposalUtf8:request.proposalUtf8,
          snapshotId:request.snapshotId,snapshotManifestSha256:request.snapshotManifestSha256,reviewHead:request.descriptor.reviewHead,actorBinding:r.ch.actorBinding,evidenceDisplay:r.display},
        current:{head:s.head,state,permission:p,duties:[...s.obligations.values()],contextStatus,trustStatus},
        approval:{status,decision:r.decision?.decision??null,reason:r.decision?.reason??null,signatureStatus:r.decision?'ENROLLED_KEY_SIGNATURE_VERIFIED':'ABSENT'},
        preparation:r.preparation===null?null:{...r.preparation,assurance:'UNSIGNED_APPLICATION_PROVENANCE_ONLY'},
        outcome:r.outcome,available:{prepareFresh:status==='STALE'&&trustStatus==='CURRENT'&&state.status==='OK'&&state.state.revision<=31&&state.state.status===(request.descriptor.action==='RELEASE'?'HELD':'RELEASED'),importDecision:status==='PENDING',admit:status==='APPROVED'&&p.decision==='ALLOW',
          invoke:handles.has(id)&&r.recoveryUtf8===null&&trustStatus==='CURRENT'&&contextStatus==='CURRENT',reconcile:!handles.has(id)&&r.outcome.admission?.status==='ADMITTED'&&r.outcome.reconciliation===null}};
  }
  async function view(id) { return locked(selectedCase,c=>viewUnlocked(c,id)); }
  async function comparison(id) {
    assert(typeof id==='string'&&/^[a-f0-9]{32}$/.exec(id)?.[0]===id,'APPROVAL_CHALLENGE_ID');
    return locked(selectedCase,c=>{
      const base={schemaVersion:'continuity-operator-comparison/1',childChallengeId:id,
        scope:{observation:'READ_ONLY_DIRECT_PAIR',authority:'NONE',provenance:'UNSIGNED_APPLICATION_PROVENANCE_ONLY',
          limitations:['Historical selection comparison, not a new approval or permission.','Only the direct preparation link is checked; earlier ancestry is not evaluated.','Cooperative local case lock; no hostile-host or cross-process atomicity claim.']}};
      try {
        const child=read(id);
        if(child.preparation===null) return {...base,status:'NO_PARENT'};
        const parent=read(child.preparation.parentChallengeId,{includePreparation:false});
        let trustStatus='CURRENT';try {trust();}catch {trustStatus='CHANGED_OR_UNAVAILABLE';}
        const identity=r=>({challengeId:r.ch.challengeId,challengeSha256:sha(r.challengeUtf8),displaySha256:sha(r.displayUtf8),
          decision:r.decision?.decision??null,signatureStatus:r.decision?'ENROLLED_KEY_SIGNATURE_VERIFIED':'ABSENT',spent:r.reservationUtf8!==null});
        return {...base,status:'COMPARABLE',parent:identity(parent),child:identity(child),
          differences:compareSelections(parent,child),
          currentObservation:{head:c.state().head,trustStatus,parentPermission:permission(c,parent.ch,parent.r),childPermission:permission(c,child.ch,child.r),
            duties:[...c.state().obligations.values()].map(projectDuty),state:inspectState(selectedCase)}};
      } catch {return {...base,status:'UNAVAILABLE',reason:'DIRECT_REVIEW_EVIDENCE_UNAVAILABLE'};}
    });
  }
  async function desk() {
    return locked(selectedCase,c=>{
      const names=list(approvalDirectory,32);
      assert(names.every(id=>/^[a-f0-9]{32}$/.test(id)),'APPROVAL_DESK_MEMBERSHIP');
      const s=c.state(),state=inspectState(selectedCase);
      let trustStatus='CURRENT';try {trust();}catch{trustStatus='CHANGED_OR_UNAVAILABLE';}
      const reviews=names.map(id=>{
        try {return summarizeReview(viewUnlocked(c,id));}
        catch {return {challengeId:id,readStatus:'UNREADABLE',attention:'UNREADABLE'};}
      });
      return {schemaVersion:'continuity-operator-desk/1',caseId:c.config.caseId,
        scope:{syntheticOnly:true,credentialClass:policy.credentialClass,humanPresence:'NOT_PROVEN',
          observation:'Cooperative case lock; approval sidecars are not a cross-process transaction. Refresh explicitly; actions recheck authority.'},
        current:{head:s.head,state,trustStatus,duties:[...s.obligations.values()].map(projectDuty)},
        coverage:{status:reviews.some(r=>r.readStatus!=='READABLE')?'INCOMPLETE':'COMPLETE',total:reviews.length,limit:32},reviews};
    });
  }
  return Object.freeze({prepare,prepareFresh,importDecision,admit,invoke,reconcile,view,desk,comparison,
    downloadChallenge:id=>read(id).challengeUtf8,downloadDisplay:id=>read(id).displayUtf8});
}
