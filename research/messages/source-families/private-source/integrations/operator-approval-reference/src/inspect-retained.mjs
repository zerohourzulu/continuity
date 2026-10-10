// Detached historical inspection, including relocated package copies. No gate, signer, submit or policy update.
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readRegular,parseJson,list,safeDirectory } from '../../security-action-reference/src/safe-io.mjs';
import { parsePolicy,parseChallenge,verifyDecision,sha } from './contract.mjs';
import { readSnapshot } from '../../security-action-reference/src/context.mjs';
import { inspectState } from '../../security-action-reference/src/application.mjs';
import { inspectActionEvidence } from '../../security-action-reader/src/verifier.mjs';
import { parseReviewedAction } from '../../synthetic-state-executor/src/contract.mjs';
import { PortableFileEventStore } from '../../../packages/core-0.2/src/indexer/portable-file-event-store.ts';
import { core,ids,session } from '../../security-action-reference/src/protocol.mjs';
const utf8=(path,max=262144)=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(readRegular(path,max));
const read=(path,max)=>parseJson(Buffer.from(utf8(path,max)),max);
const equal=(a,b)=>core.canonicalEncode(a)===core.canonicalEncode(b);
export function inspectRetained(root) {
  safeDirectory(root);const run=read(join(root,'RUN.json')),results=read(join(root,'RESULTS.json'),1048576);
  assert.equal(run.schemaVersion,'continuity-operator-actual/1');assert.equal(run.caseRelative,'run-20260912/case');assert.equal(run.policyRelative,'run-20260912/control/policy.json');assert.equal(run.approvalsRelative,'run-20260912/approvals');
  const caseDirectory=join(root,run.caseRelative),approvals=join(root,run.approvalsRelative),policyUtf8=utf8(join(root,run.policyRelative),16384),policy=parsePolicy(policyUtf8);
  assert.equal(policy.caseDirectory,run.originalCaseDirectory);assert.equal(policy.credentialClass,'PUBLIC_DEVELOPMENT_FIXTURE');
  assert.equal(results.rows.length,6);assert.deepEqual(list(approvals,32),results.rows.map(r=>r.challengeId).sort());
  const decisions=[],approved=new Map();
  for(const row of results.rows) {
    assert.match(row.challengeId,/^[0-9a-f]{32}$/);const dir=join(approvals,row.challengeId),challengeUtf8=utf8(join(dir,'challenge.json'),65536),ch=parseChallenge(challengeUtf8);
    assert.equal(ch.challengeId,row.challengeId);assert.equal(ch.actionId,row.actionId);assert.equal(ch.caseId,run.caseId);
    const decision=verifyDecision(utf8(join(dir,'decision.json')),challengeUtf8,policyUtf8),displayUtf8=utf8(join(dir,'display.json'),4*1024*1024),display=parseJson(Buffer.from(displayUtf8),4*1024*1024);
    assert.equal(sha(displayUtf8),ch.reviewDisplaySha256);assert.equal(display.requestUtf8,ch.requestUtf8);assert.ok(equal(display.actorBinding,ch.actorBinding));
    const request=parseJson(Buffer.from(ch.requestUtf8),16384),descriptor=parseReviewedAction(request.descriptorUtf8),snapshot=readSnapshot(caseDirectory,request.snapshotId,request.snapshotManifestSha256);
    assert.equal(request.snapshotManifestSha256,descriptor.snapshotManifestSha256);assert.equal(ch.caseId,snapshot.config.caseId);
    assert.ok(equal(ch.domain,snapshot.config.domain));const expectedIds=ids(ch.caseId);
    assert.ok(equal(ch.actorBinding,{actorId:expectedIds[ch.who],...session(ch.caseId,ch.who),roleId:expectedIds.role,roleTenureId:expectedIds['tenure-'+ch.who]}));
    assert.equal(sha(request.proposalUtf8),descriptor.proposalSha256);assert.equal(descriptor.intentId,'action:'+run.caseId+':'+row.actionId);
    assert.equal(descriptor.resource,policy.resource);assert.ok(policy.actions.includes(descriptor.action));
    assert.equal(descriptor.reviewMaterialSha256,sha(JSON.stringify(snapshot.material)+'\n'));assert.ok(equal(descriptor.reviewHead,snapshot.summary.head));
    assert.ok(equal(display.summary,snapshot.summary)&&equal(display.material,snapshot.material)&&equal(display.progress,snapshot.entries));
    assert.equal(display.originals.length,snapshot.originals.size);const names=[];
    for(const original of display.originals) {assert.ok(!names.includes(original.path));names.push(original.path);const raw=snapshot.originals.get(original.path);assert.ok(raw);assert.equal(original.bytes,raw.length);assert.equal(original.sha256,sha(raw));
      const represented=original.utf8===null?Buffer.from(original.base64,'base64'):Buffer.from(original.utf8);assert.ok(raw.equals(represented));}
    if(decision.decision==='APPROVE') approved.set(descriptor.intentId,{requestUtf8:ch.requestUtf8,challengeUtf8,dir,envelopeUtf8:utf8(join(dir,'decision.json'))});
    decisions.push({actionId:row.actionId,challengeSha256:sha(challengeUtf8),decision:decision.decision,signature:'ENROLLED_PUBLIC_FIXTURE_KEY_VERIFIED'});
  }
  const historyPath=join(caseDirectory,'history.jsonl'),historyBytes=readRegular(historyPath,2*1024*1024);
  const events=new PortableFileEventStore(historyPath).readAll(),state=inspectState(caseDirectory);
  assert.ok(historyBytes.equals(readRegular(historyPath,2*1024*1024)));
  assert.equal(state.status,'OK');assert.deepEqual(state.state,{revision:2,status:'HELD'});assert.equal(state.records.length,2);
  const records=state.records.map(r=>{const actionId=r.transition.identity.intentId.split(':').at(-1),requestUtf8=utf8(join(caseDirectory,'actions',actionId,'request.json'),16384),request=parseJson(Buffer.from(requestUtf8));
    const selection=approved.get(r.transition.identity.intentId);assert.ok(selection);assert.equal(selection.requestUtf8,requestUtf8);
    const reservationUtf8=utf8(join(selection.dir,'reservation.json')),reservation=read(join(selection.dir,'reservation.json'));
    assert.ok(equal(reservation,{schemaVersion:'continuity-operator-reservation/1',challengeId:parseChallenge(selection.challengeUtf8).challengeId,challengeSha256:sha(selection.challengeUtf8),decisionSha256:sha(selection.envelopeUtf8),requestSha256:sha(requestUtf8)}));
    assert.ok(equal(read(join(selection.dir,'effect-claim.json')),{schemaVersion:'continuity-operator-effect-claim/1',reservationSha256:sha(reservationUtf8)}));
    return {descriptorUtf8:request.descriptorUtf8,commandUtf8:r.commandUtf8,transitionUtf8:JSON.stringify(r.transition)+'\n'};});
  const reader=inspectActionEvidence({events,records});assert.equal(reader.status,'VERIFIED');assert.equal(reader.actions.length,2);
  for(const action of reader.actions) {
    const selection=approved.get(action.intentId),challenge=parseChallenge(selection.challengeUtf8),authority=action.historicalAuthority;
    assert.ok(equal(challenge.domain,reader.history.domain));
    const admission=events.find(e=>e.id===authority.admissionEventId);assert.ok(admission);
    assert.ok(equal(challenge.actorBinding,{actorId:authority.actorId,runtimeSessionId:authority.runtimeSessionId,credentialKeyId:admission.data.authorizationProof.credentialKeyId,controlEpoch:authority.controlEpoch,roleId:authority.roleId,roleTenureId:authority.roleTenureId}));
  }
  assert.equal(reader.duties.length,1);const duty=reader.duties[0];assert.equal(duty.status,'OPEN');assert.equal(duty.performer,'b:'+run.caseId);
  const final=read(join(root,'VIEW-FINAL.json'),4*1024*1024);assert.ok(equal(final.current.state,state));assert.equal(final.current.duties[0].status,'OPEN');assert.equal(final.current.duties[0].performanceAssigneeId,'b:'+run.caseId);
  return {schemaVersion:'continuity-operator-retained-report/1',caseId:run.caseId,decisions,eventCount:events.length,transitions:state.records.length,state:state.state,
    duty:{status:duty.status,assignee:duty.performer},historicalCore:reader.status,operatorCredential:'PUBLIC_DEVELOPMENT_FIXTURE',humanPresence:'NOT_PROVEN',
    currentTrust:'NOT_EVALUATED',currentAuthority:'NOT_EVALUATED',effectScope:'LOCAL_SYNTHETIC_ONLY',sourceTruth:'NOT_PROVEN',pathPins:'HISTORICAL_ORIGINAL_PATH_ASSERTIONS_NOT_REUSABLE_AT_RELOCATED_PATH'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length,3);process.stdout.write(JSON.stringify(inspectRetained(resolve(process.argv[2])))+'\n');
}
