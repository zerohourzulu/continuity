// PUBLIC DEVELOPMENT FIXTURE ONLY. This seed is intentionally public and provides no human authentication.
import { createPrivateKey,createPublicKey,sign,randomBytes } from 'node:crypto';
import { mkdirSync,writeFileSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCase,collectCase,grantAction,snapshotCase } from '../../security-action-reference/src/application.mjs';
import { openApprovalApplication } from '../src/application.mjs';
import { decisionText,sha } from '../src/contract.mjs';
export const json=v=>JSON.stringify(v)+'\n';
export const publicFixtureKey=createPrivateKey({key:Buffer.from('302e020100300506032b657004220420'+'07'.repeat(32),'hex'),format:'der',type:'pkcs8'});
export const publicFixtureHex=createPublicKey(publicFixtureKey).export({format:'der',type:'spki'}).subarray(-32).toString('hex');
export const write=(path,value)=>writeFileSync(path,typeof value==='string'?value:json(value),{flag:'wx',mode:0o600});
export async function fixture(base,name,{grants=true}={}) {
  const parent=join(base,name);mkdirSync(parent);const input=join(parent,'input');mkdirSync(input);
  write(join(input,'auth.log'),'SYNTHETIC 2026-09-12T18:00:00Z service account access requires investigation.\n');
  write(join(input,'endpoint.log'),'SYNTHETIC 2026-09-12T18:00:01Z endpoint remains HELD; release is reversible local exercise only.\n');
  const caseId='approval-'+name,path=join(parent,'case');await createCase(path,caseId,input);await collectCase(path);
  if(grants) {await grantAction(path,'release','a','RELEASE');await grantAction(path,'restore','a','RESTORE');}
  const approvalDirectory=join(parent,'approvals'),control=join(parent,'control');mkdirSync(approvalDirectory);mkdirSync(control);
  const policy={schemaVersion:'continuity-operator-policy/1',edition:'public-development-1',caseDirectory:path,approvalDirectory,
    instanceId:randomBytes(16).toString('hex'),operatorId:'operator:public-development',keyId:'operator-key:public-development-7',
    publicKeyHex:publicFixtureHex,resource:'synthetic-endpoint:'+caseId,actions:['RELEASE','RESTORE'],credentialClass:'PUBLIC_DEVELOPMENT_FIXTURE'};
  const policyPath=join(control,'policy.json');write(policyPath,policy);
  return {parent,path,caseId,approvalDirectory,policyPath,policy,app:openApprovalApplication({policyPath,caseDirectory:path})};
}
export async function request(f,id,action='RELEASE',revision=0,who='a') {
  const snap=await snapshotCase(f.path,id),proposalUtf8=json({synthetic:true,action,resource:f.policy.resource,
    rationale:'Review the complete synthetic evidence, retain the OPEN investigation duty, and permit only this exact reversible local action. Human presence is not proved by the public fixture.'});
  const descriptor={schemaVersion:'continuity-reviewed-state-action/1',intentId:'action:'+f.caseId+':'+id,resource:f.policy.resource,action,expectedRevision:revision,
    proposalSha256:sha(proposalUtf8),snapshotManifestSha256:snap.manifestSha256,reviewMaterialSha256:snap.materialSha256,reviewHead:snap.head};
  const requestUtf8=json({snapshotId:id,snapshotManifestSha256:snap.manifestSha256,proposalUtf8,descriptorUtf8:json(descriptor)});
  const review=await f.app.prepare(who,id,requestUtf8);return {...review,requestUtf8,descriptor,actionId:id};
}
export function signed(f,r,decision='APPROVE',reason='Public development fixture decision; provisional engineering exercise only.',key=publicFixtureKey) {
  const decisionUtf8=decisionText(r.challengeUtf8,f.policy.operatorId,f.policy.keyId,decision,reason);
  return json({decisionUtf8,signatureHex:sign(null,Buffer.from('continuity-operator-decision/1\n'+decisionUtf8),key).toString('hex')});
}
export async function approve(f,r) {const envelope=signed(f,r);await f.app.importDecision(r.challengeId,envelope);return envelope;}
export const history=f=>readFileSync(join(f.path,'history.jsonl'));
export const database=f=>readFileSync(join(f.path,'effect/effect.sqlite'));
