// Root-selected one-time synthetic demonstration. Never rerun a completed output directory.
import assert from 'node:assert/strict';
import { mkdirSync,realpathSync,readFileSync,writeFileSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fixture,request,publicFixtureKey,write,json,database } from '../test/fixtures.mjs';
import { grantAction,recordProgress,takeoverCase,inspectState } from '../../security-action-reference/src/application.mjs';
import { inspectRetained } from './inspect-retained.mjs';
assert.equal(process.argv.length,3);const output=realpathSync(resolve(process.argv[2]));
const startedAt=new Date().toISOString(),f=await fixture(output,'run-20260912',{grants:false}),rows=[];
const signing=join(output,'detached-signing');mkdirSync(signing);
const publicKeyPath=join(signing,'PUBLIC-DEVELOPMENT-KEY.pem');
write(publicKeyPath,publicFixtureKey.export({type:'pkcs8',format:'pem'}));
write(join(output,'RUN.json'),{schemaVersion:'continuity-operator-actual/1',caseRelative:'run-20260912/case',policyRelative:'run-20260912/control/policy.json',
  approvalsRelative:'run-20260912/approvals',originalCaseDirectory:f.path,caseId:f.caseId,credentialClass:'PUBLIC_DEVELOPMENT_FIXTURE',humanPresence:'NOT_PROVEN'});
function child(label,argv) {
  const begin=new Date().toISOString(),result=spawnSync(process.execPath,argv,{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024});
  write(join(output,label+'.stdout'),result.stdout??'');write(join(output,label+'.stderr'),result.stderr??'');
  write(join(output,label+'-process.json'),{argv,startedAt:begin,completedAt:new Date().toISOString(),status:result.status,signal:result.signal,errorCode:result.error?.code??null});
  assert.equal(result.status,0);return result.stdout;
}
async function select(r,decision) {
  const dir=join(signing,r.actionId);mkdirSync(dir);const challenge=join(dir,'challenge.json'),display=join(dir,'display.json'),envelope=join(dir,'decision.json');
  write(challenge,r.challengeUtf8);write(display,r.displayUtf8);
  child('sign-'+r.actionId,[fileURLToPath(new URL('./sign-decision.mjs',import.meta.url)),challenge,display,publicKeyPath,f.policy.operatorId,f.policy.keyId,
    decision,'Public development fixture: root provisional engineering selection of this exact synthetic action and evidence.',envelope]);
  return f.app.importDecision(r.challengeId,readFileSync(envelope,'utf8'));
}
async function record(r,title,result) {const view=await f.app.view(r.challengeId);const row={challengeId:r.challengeId,actionId:r.actionId,title,result,approval:view.approval,
  state:view.current.state.state,duties:view.current.duties.map(d=>({status:d.status,assignee:d.performanceAssigneeId}))};rows.push(row);write(join(output,r.actionId+'-view.json'),view);return row;}
const deny=await request(f,'operator-denies');await select(deny,'DENY');await assert.rejects(f.app.admit(deny.challengeId),/APPROVAL_NOT_APPROVED/);
await record(deny,'Signed operator DENY causes no declaration or effect',{status:'REFUSED',reason:'APPROVAL_NOT_APPROVED'});
const noPower=await request(f,'operator-no-power');await select(noPower,'APPROVE');const denied=await f.app.admit(noPower.challengeId);assert.equal(denied.status,'NOT_ADMITTED');
await record(noPower,'Operator approval does not give A a Core permission',denied);
await grantAction(f.path,'a-release','a','RELEASE');
const stale=await request(f,'operator-stale');await select(stale,'APPROVE');
await recordProgress(f.path,'a','auth.log','later-review','The synthetic authentication evidence has a later signed investigation note. The earlier operator selection must not authorize it.');
const refused=await f.app.admit(stale.challengeId);assert.equal(refused.status,'REFUSED');
await record(stale,'A later signed evidence note invalidates the exact earlier selection',refused);
await takeoverCase(f.path);
const successor=await request(f,'operator-successor','RELEASE',0,'b');await select(successor,'APPROVE');const successorDenied=await f.app.admit(successor.challengeId);assert.equal(successorDenied.status,'NOT_ADMITTED');
await record(successor,'B receives the OPEN duty; an operator signature still cannot supply missing release power',successorDenied);
await grantAction(f.path,'b-release','b','RELEASE');await grantAction(f.path,'b-restore','b','RESTORE');
const release=await request(f,'operator-release','RELEASE',0,'b');await select(release,'APPROVE');
const admitted=await f.app.admit(release.challengeId,{withholdAcknowledgment:true});assert.equal(admitted.status,'ADMITTED');
const invoked=await f.app.invoke(release.challengeId);assert.equal(invoked.status,'OUTCOME_UNKNOWN');assert.equal(inspectState(f.path).state.revision,1);
const before=database(f),recovered=JSON.parse(child('original-recovery',[fileURLToPath(new URL('./recover-child.mjs',import.meta.url)),f.policyPath,f.path,release.challengeId]));
assert.equal(recovered.status,'RETRY');assert.equal(recovered.recorded,true);assert.ok(database(f).equals(before));
await record(release,'Separately approved B release commits once; a fresh process recovers the original result without resubmission',{admitted,invoked,recovered});
const restore=await request(f,'operator-restore','RESTORE',1,'b');await select(restore,'APPROVE');const restoreAdmitted=await f.app.admit(restore.challengeId);assert.equal(restoreAdmitted.status,'ADMITTED');
const restored=await f.app.invoke(restore.challengeId);assert.equal(restored.status,'SUBMITTED');
await record(restore,'A distinct signed selection and independent Core permission authorize restoration',{admitted:restoreAdmitted,invoked:restored});
const final=await f.app.view(restore.challengeId);assert.deepEqual(final.current.state.state,{revision:2,status:'HELD'});assert.equal(final.current.state.records.length,2);
assert.equal(final.current.duties[0].status,'OPEN');assert.equal(final.current.duties[0].performanceAssigneeId,'b:'+f.caseId);
write(join(output,'VIEW-FINAL.json'),final);write(join(output,'RESULTS.json'),{startedAt,completedAt:new Date().toISOString(),rows,finalState:final.current.state.state,
  transitions:final.current.state.records.length,duties:final.current.duties.map(d=>({status:d.status,assignee:d.performanceAssigneeId})),credentialClass:f.policy.credentialClass,humanPresence:'NOT_PROVEN'});
const inspection=inspectRetained(output);write(join(output,'INSPECTION.json'),inspection);process.stdout.write(json(inspection));
