// Saved preparation observations and exact signature/provenance bytes only; no live case authority.
import { readFileSync,existsSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { parseChallenge,verifyDecision,sha } from './contract.mjs';
export function inspectPreparationRecording(directory) {
  const text=name=>readFileSync(join(directory,name),'utf8'),json=name=>JSON.parse(text(name));
  const run=json('SCENARIO.json'),desk=json('FINAL.json'),ids=[run.parentId,run.childId,run.grandchildId];
  assert.equal(new Set(ids).size,3);assert.deepEqual(desk.reviews.map(r=>r.challengeId).sort(),[...ids].sort());
  assert.equal(desk.coverage.status,'COMPLETE');assert.equal(desk.coverage.total,3);
  assert.deepEqual(desk.current.state.state,{revision:0,status:'HELD'});
  assert.equal(desk.current.duties[0].status,'OPEN');assert.equal(desk.current.duties[0].performanceAssigneeId,'b:'+desk.caseId);
  const views=ids.map(id=>json('VIEW-'+id+'.json')),challenges=ids.map(id=>text('CHALLENGE-'+id+'.json'));
  for(let i=0;i<ids.length;i++) {
    const ch=parseChallenge(challenges[i]),v=views[i],display=text('DISPLAY-'+ids[i]+'.json');
    assert.equal(ch.challengeId,ids[i]);assert.equal(ch.caseId,desk.caseId);assert.equal(sha(display),ch.reviewDisplaySha256);
    assert.equal(v.challenge.sha256,sha(challenges[i]));assert.equal(v.selection.requestUtf8,ch.requestUtf8);assert.deepEqual(v.current.head,desk.current.head);
  }
  const decision=verifyDecision(text('DECISION-'+run.parentId+'.json'),challenges[0],text('POLICY.json'));
  assert.equal(decision.decision,'DENY');assert.equal(views[0].approval.decision,'DENY');assert.equal(views[0].approval.status,'STALE');
  for(let i=1;i<3;i++) {
    const v=views[i];assert.equal(v.approval.decision,null);assert.equal(v.approval.signatureStatus,'ABSENT');assert.equal(v.available.admit,false);
    assert.equal(existsSync(join(directory,'DECISION-'+ids[i]+'.json')),false);
    assert.equal(v.preparation.parentChallengeId,ids[i-1]);assert.equal(v.preparation.parentChallengeSha256,sha(challenges[i-1]));
    assert.equal(v.preparation.childChallengeSha256,sha(challenges[i]));assert.equal(v.preparation.assurance,'UNSIGNED_APPLICATION_PROVENANCE_ONLY');
  }
  assert.equal(views[1].approval.status,'STALE');assert.equal(views[2].approval.status,'PENDING');assert.equal(views[2].current.permission.decision,'ALLOW');
  const first=json('FIRST-CHILD.json');assert.equal(first.challenge.challengeId,run.childId);assert.equal(first.approval.status,'PENDING');assert.equal(first.current.permission.decision,'DENY');
  return {status:'RETAINED_PREPARATION_OBSERVATIONS_INSPECTED',caseId:desk.caseId,reviews:3,oldDecision:'DENY',newDecisions:'ABSENT',
    firstPreparationPermission:'DENY',latestObservedPermission:'ALLOW',latestAdmissionAvailable:false,
    retainedState:desk.current.state.state,retainedDuty:desk.current.duties[0],currentAuthority:'NOT_EVALUATED',
    verification:'Saved observation consistency, exact challenge/display hashes and retained parent signature. Preparation provenance is unsigned; no new Core replay or live authority.'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(inspectPreparationRecording(resolve(process.argv[2]))));
