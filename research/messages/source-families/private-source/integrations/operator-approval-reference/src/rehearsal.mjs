import { humanOperatorCommandError } from './human-command-error.mjs';
// Explicit local synthetic rehearsal. Create prepares data; a separate process serves the desk.
import { mkdirSync,lstatSync,writeFileSync } from 'node:fs';
import { dirname,join,resolve,isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { safeDirectory,readJson } from '../../security-action-reference/src/safe-io.mjs';
import { openApprovalApplication } from './application.mjs';
import { startWorkbench } from './server.mjs';
const check=(ok,code)=>{if(!ok)throw new Error(code);};
const json=value=>JSON.stringify(value)+'\n';
const write=(path,value)=>writeFileSync(path,typeof value==='string'?value:json(value),{flag:'wx',mode:0o600});
const quoted=value=>"'"+value.replaceAll("'","'\"'\"'")+"'";
export function newRehearsalDirectory(output) {
  check(typeof output==='string'&&output.length<=2048&&output.isWellFormed()&&!output.includes('\0')&&isAbsolute(output)&&resolve(output)===output,'REHEARSAL_CANONICAL_NEW_DIRECTORY_REQUIRED');
  safeDirectory(dirname(output));
  try {lstatSync(output);throw new Error('REHEARSAL_DIRECTORY_ALREADY_EXISTS');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  return output;
}
export async function createRehearsal(output) {
  newRehearsalDirectory(output);mkdirSync(output,{mode:0o700});
  // Only the setup process loads the explicitly public development operator key.
  const {fixture,request,publicFixtureKey}=await import('../test/fixtures.mjs');
  const {recordProgress,takeoverCase,grantAction}=await import('../../security-action-reference/src/application.mjs');
  const runRelative='rehearsal-'+randomBytes(6).toString('hex');
  const f=await fixture(output,runRelative,{grants:false});
  const parent=await request(f,'initial-release');
  await recordProgress(f.path,'a','auth.log','later-evidence','SYNTHETIC rehearsal update: preserve this later review note and re-evaluate the release proposal after independent handover.');
  await takeoverCase(f.path);
  await grantAction(f.path,'b-rehearsal-release','b','RELEASE');
  const operator=join(output,'operator');mkdirSync(operator,{mode:0o700});
  write(join(operator,'PUBLIC-DEVELOPMENT-KEY.pem'),publicFixtureKey.export({type:'pkcs8',format:'pem'}));
  const run={schemaVersion:'continuity-operator-rehearsal/1',createdAt:new Date().toISOString(),runRelative,caseId:f.caseId,
    originalCaseDirectory:f.path,parentChallengeId:parent.challengeId,credentialClass:'PUBLIC_DEVELOPMENT_FIXTURE',humanPresence:'NOT_PROVEN',fault:'WITHHOLD_ACKNOWLEDGMENT'};
  write(join(output,'RUN.json'),run);
  write(join(output,'INITIAL-DESK.json'),await f.app.desk());
  const signer=fileURLToPath(new URL('./sign-decision.mjs',import.meta.url));
  write(join(output,'START-HERE.md'),`# Local operator rehearsal\n\nSynthetic data and public development key only. Setup creates a stale unsigned A review, later evidence, an independent B takeover and a separate B RELEASE grant. Duty remains OPEN. No operator decision or state release is created during setup.\n\n1. Open the exact loopback URL printed by the service. Select initial-release.\n2. Prepare a fresh review with Agent B, name fresh-release, and your explicit proposal.\n3. Compare it with its parent and inspect the selected evidence and current permission.\n4. Download its exact challenge/display pair. Follow the handoff using the detached signer at ${signer}. The public rehearsal key is ${join(operator,'PUBLIC-DEVELOPMENT-KEY.pem')}. Choose APPROVE or DENY and a reason explicitly in the terminal.\n5. Import only the resulting envelope. An APPROVE plus current permission allows admission, then invocation.\n6. This rehearsal deliberately withholds the ACK. The synthetic store may have changed even when the reply is OUTCOME_UNKNOWN. Do not create another release. Stop the service with Ctrl-C.\n7. Start a fresh service using the command below, select the same fresh-release review and recover the original result. Recovery does not resubmit. The exercise leaves RELEASED revision1 and OPEN duty; restoration would be a separate action outside this rehearsal.\n\nResume the existing rehearsal without recreating it:\n\n\`\`\`sh\n${quoted(process.execPath)} ${quoted(fileURLToPath(import.meta.url))} serve ${quoted(output)}\n\`\`\`\n\nNever use the public key operationally. Signatures establish fixture key control, not human presence or source truth. The browser has no signer or key input; the separate HTTP worker does not import the setup fixture/operator key module. No network endpoint outside the local synthetic store is controlled.\n`);
  return run;
}
export function loadRehearsal(output) {
  safeDirectory(output);const run=readJson(join(output,'RUN.json'),16384);
  check(run.schemaVersion==='continuity-operator-rehearsal/1'&&typeof run.runRelative==='string'&&/^rehearsal-[0-9a-f]{12}$/.exec(run.runRelative)?.[0]===run.runRelative,'REHEARSAL_INVALID_RECORD');
  check(run.credentialClass==='PUBLIC_DEVELOPMENT_FIXTURE'&&run.humanPresence==='NOT_PROVEN'&&run.fault==='WITHHOLD_ACKNOWLEDGMENT','REHEARSAL_SYNTHETIC_SCOPE_REQUIRED');
  const caseDirectory=join(output,run.runRelative,'case'),policyPath=join(output,run.runRelative,'control/policy.json');
  check(run.originalCaseDirectory===caseDirectory,'REHEARSAL_ORIGINAL_PATH_REQUIRED');
  const policy=readJson(policyPath,16384);
  check(policy.credentialClass==='PUBLIC_DEVELOPMENT_FIXTURE'&&policy.caseDirectory===caseDirectory&&policy.approvalDirectory===join(output,run.runRelative,'approvals'),'REHEARSAL_POLICY_SCOPE_REQUIRED');
  return {run,caseDirectory,policyPath};
}
export async function serveRehearsal(output) {
  const {run,caseDirectory,policyPath}=loadRehearsal(output);
  const application=openApprovalApplication({policyPath,caseDirectory});
  const server=await startWorkbench({application:{...application,admit:id=>application.admit(id,{withholdAcknowledgment:true})},desk:true});
  process.stdout.write(json({status:'REHEARSAL_READY',url:server.url,pid:process.pid,parentPid:process.ppid,output,caseId:run.caseId,parentChallengeId:run.parentChallengeId,
    fault:run.fault,credentialClass:run.credentialClass,humanPresence:run.humanPresence}));
  return server;
}
async function main(args) {
  check(args.length===2&&['create','serve'].includes(args[0]),'REHEARSAL_USAGE_CREATE_OR_SERVE_ABSOLUTE_DIRECTORY');
  const [mode,output]=args;
  if(mode==='create') {
    await createRehearsal(output);
    // A fresh worker starts without loading the public operator-key fixture module.
    const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'serve',output],{stdio:'inherit'});
    const stop=()=>child.kill('SIGINT');process.once('SIGINT',stop);process.once('SIGTERM',stop);
    const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve(code??(signal?1:0)));});
    process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);process.exitCode=code;return;
  }
  const server=await serveRehearsal(output);let stopping=false;
  const stop=async()=>{if(stopping)return;stopping=true;await server.close();};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(error=>{process.stderr.write(humanOperatorCommandError(error)+'\n');process.exitCode=1;});
