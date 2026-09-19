#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

const ROOT=realpathSync(fileURLToPath(new URL('../',import.meta.url)));
const help=`Continuity Core 0.2 — public evaluation tutorial

  node tutorial/cli.mjs run [--case NAME] [--mode simulated|packet]
                            [--successor-review allow|deny]
  node tutorial/cli.mjs inspect NAME
  node tutorial/cli.mjs --help

Default: local simulation with synthetic data and PUBLIC test signing keys.
No AI account, wallet, server, root access or network call is needed at runtime.
Packet mode copies two synthetic logs locally; it never exports a real document.
Each run uses a new case. Existing cases are refused. Evidence stays in runs/NAME
and integrations/core-0.2-reference/cases/NAME. Nothing is automatically deleted.
Linux/macOS, Node 24; install locked dependencies first (see README.md).
`;
function parse(args){
 const [command,...rest]=args;
 if(!command||command==='--help')return {command:'help'};
 if(command==='inspect') {if(rest.length!==1)throw Error('Use: inspect CASE_NAME');return {command,name:slug(rest[0])};}
 if(command!=='run')throw Error('Unknown command. Use --help.');
 const opts={command,mode:'simulated',successorReview:'allow'},seen=new Set();
 for(let i=0;i<rest.length;i+=2){const key=rest[i],value=rest[i+1];if(!['--case','--mode','--successor-review'].includes(key)||value===undefined||seen.has(key))throw Error('Invalid or repeated option. Use --help.');seen.add(key);opts[{'--case':'name','--mode':'mode','--successor-review':'successorReview'}[key]]=value;}
 if(!['simulated','packet'].includes(opts.mode)||!['allow','deny'].includes(opts.successorReview))throw Error('Invalid mode or policy. Use --help.');
 opts.name=slug(opts.name??`demo-${randomBytes(5).toString('hex')}`);return opts;
}
function slug(name){if(!/^[a-z][a-z0-9-]{0,31}$/.test(name))throw Error('Case name: 1–32 lowercase letters, digits or hyphens, starting with a letter.');return name;}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const save=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n',{flag:'wx',mode:0o600});
async function modules(){
 if(Number(process.versions.node.split('.')[0])!==24)throw Error('This candidate requires Node 24.x; check node --version.');
 const core=await import('../packages/core-0.2/src/core/index.ts');
 const {PortableFileEventStore}=await import('../packages/core-0.2/src/indexer/portable-file-event-store.ts');
 const app=await import('../integrations/core-0.2-reference/src/application.mjs');
 return {core,PortableFileEventStore,app};
}
export async function run(opts){
 const {core,PortableFileEventStore,app}=await modules(),name=opts.name;
 const caseDir=join(ROOT,'integrations/core-0.2-reference/cases',name),out=join(ROOT,'runs',name);
 if(existsSync(caseDir)||existsSync(out))throw Error('Case already exists. Choose another --case; retained evidence will not be overwritten.');
 mkdirSync(out,{recursive:true,mode:0o700});
 const checkpoints=[];
 const step=(label,value)=>{checkpoints.push({label,...value});console.log(`${checkpoints.length}. ${label}: ${value.decision??value.status}`);};
 const initial=await app.createCase(name,join(ROOT,'fixtures'),opts.mode);
 const config=json(join(caseDir,'case.json')),store=new PortableFileEventStore(join(caseDir,'history.jsonl'));
 function replay(){const r=core.replayPortable({operationVersion:core.PORTABLE_REPLAY_VERSION,events:store.readAll()});assert.equal(r.status,'ACCEPTED');return r;}
 function authorize(who,action,resource){const events=store.readAll(),r=replay();return core.authorizePortable({operationVersion:core.PORTABLE_AUTHORIZATION_VERSION,events,expectedHistoryHead:r.head,domain:config.domain,policyVersion:`local-evidence-intake-policy:${name}/0.2`,rootRecognitionPolicy:core.PORTABLE_ROOT_RECOGNITION_POLICY,request:{actorId:`${who}:${name}`,action,resource:`${resource}:${name}`,claimedAt:r.head.canonicalTime},evaluationTime:r.head.canonicalTime,authoritative:true,consequential:false});}
 function revoke(id,suffix){const e={id:`${name}:tutorial-${suffix}`,type:'AUTHORITY_REVOKED',timestamp:replay().head.canonicalTime+1,data:{authorityId:`${id}:${name}`,revokerId:`principal:${name}`}};const proposed=core.replayPortable({operationVersion:core.PORTABLE_REPLAY_VERSION,events:[...store.readAll(),e]});assert.equal(proposed.status,'ACCEPTED');store.appendAll([e]);}
 const before=authorize('a','collect-evidence-packet','resource');assert.equal(before.decision,'ALLOW');save(join(out,'authority-before.json'),before);
 step('A may collect the selected synthetic evidence',{decision:before.decision});
 const collected=await app.collectCase(name);assert.equal(collected.duty.status,'OPEN');
 step('Intake acknowledged; investigation duty created',{status:collected.duty.status,executor:collected.scope.executorKind,packet:collected.packet.status});
 const handover=await app.handoverCase(name);assert.equal(handover.status,'HANDOVER_COMPLETE');
 step('Handover advances control epoch and replaces A',{status:handover.status});
 revoke('collect-authority','revoke-a');
 const after=authorize('a','collect-evidence-packet','resource');assert.equal(after.decision,'DENY');save(join(out,'authority-after.json'),after);
 step('Operator revokes A collection permission',{decision:after.decision});
 if(opts.successorReview==='deny')revoke('progress-b-authority','revoke-b-review');
 const stale=await app.attemptOldWorker(name);assert.equal(stale.status,'DENIED');assert.equal(stale.executorInvoked,false);
 step('Old signed worker request reaches admission and is refused',stale);
 const summary=await app.inspectCase(name);assert.equal(summary.duty.performer,`b:${name}`);assert.equal(summary.duty.status,'OPEN');
 step('B inherits the unfinished duty',{status:summary.duty.status,performer:summary.duty.performer});
 const b=authorize('b','record-review-progress','obligation');assert.equal(b.decision,opts.successorReview==='allow'?'ALLOW':'DENY');save(join(out,'successor-authority.json'),b);
 const bCollect=authorize('b','collect-evidence-packet','resource');assert.equal(bCollect.decision,'DENY');save(join(out,'successor-collection.json'),bCollect);
 step('B review permission is checked separately from its duty',{decision:b.decision,collectionDecision:bCollect.decision});
 if(opts.mode==='packet'){
  if(opts.successorReview==='allow'){await app.recordReviewProgress(name,'b','agent.log','tutorial-note','Synthetic request reviewed; investigation is still unresolved.');step('B records one signed review note',{status:'RECORDED'});}
  else {await assert.rejects(()=>app.recordReviewProgress(name,'b','agent.log','tutorial-note','This note must be refused.'),/REVIEW_AUTHORITY_REQUIRED/);step('B note write is refused despite the assigned duty',{status:'DENIED'});}
 }
 const final=await app.inspectCase(name);assert.equal(final.duty.status,'OPEN');
 const exported=await app.exportCase(name);save(join(out,'export-result.json'),exported);
 const history=json(join(caseDir,'export/history.json')),r=core.replayPortable({operationVersion:core.PORTABLE_REPLAY_VERSION,events:history});assert.equal(r.status,'ACCEPTED');assert.deepEqual(r.head,final.head);
 save(join(out,'summary.json'),final);
 const evidenceFiles=['case.json','history.jsonl','receipt.json','stale-request.json','export/history.json','export/summary.json'];
 const evidence=evidenceFiles.map(path=>({path,sha256:sha(readFileSync(join(caseDir,path)))}));
 const result={schemaVersion:'continuity-evaluation-result/1',caseId:name,mode:opts.mode,successorReview:opts.successorReview,status:'PASS',checkpoints,head:r.head,evidence,scope:{synthetic:true,signing:'PUBLIC_TEST_KEYS',execution:'TRUSTED_LOCAL_REFERENCE',blockchain:'NONE',aiModel:'NONE',hostileHostContainment:false},next:'Run inspect in a fresh process; open the JSON evidence and the recorded Linux guide.'};
 save(join(out,'result.json'),result);
 console.log(`PASS — duty remains OPEN; B has no collection power.\nEvidence: runs/${name}/result.json\nReplay: node tutorial/cli.mjs inspect ${name}`);
 return result;
}
export async function inspect(name){
 const {core,app}=await modules(),out=join(ROOT,'runs',name),caseDir=join(ROOT,'integrations/core-0.2-reference/cases',name),result=json(join(out,'result.json'));
 assert.equal(result.caseId,name);assert.equal(result.schemaVersion,'continuity-evaluation-result/1');
 const expected=['case.json','history.jsonl','receipt.json','stale-request.json','export/history.json','export/summary.json'];
 assert.deepEqual(result.evidence.map(row=>row.path),expected);
 for(const row of result.evidence)assert.equal(sha(readFileSync(join(caseDir,row.path))),row.sha256,`Evidence changed: ${row.path}`);
 const events=json(join(caseDir,'export/history.json')),r=core.replayPortable({operationVersion:core.PORTABLE_REPLAY_VERSION,events});assert.equal(r.status,'ACCEPTED');assert.deepEqual(r.head,result.head);
 const live=await app.inspectCase(name);assert.deepEqual(live.head,result.head);assert.equal(live.duty.status,'OPEN');assert.equal(live.duty.performer,`b:${name}`);
 const stale=json(join(caseDir,'stale-request.json'));assert.equal(stale.status,'DENIED');assert.equal(stale.executorInvoked,false);
 console.log(`VERIFIED ${name}\nReplay: ACCEPTED (${events.length} events)\nDuty: OPEN; performer b:${name}\nOld request: DENIED; executor invoked: false\nMode: ${result.mode}; selected B review policy: ${result.successorReview}\nLocal hashes detect changes against this local result file; they are not an external trust anchor.`);
 return result;
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const opts=parse(process.argv.slice(2));if(opts.command==='help')console.log(help);else if(opts.command==='run')await run(opts);else await inspect(opts.name);}
 catch(error){console.error(`Continuity: ${error.message}\nSee docs/TROUBLESHOOTING.md. Any partial case is retained; use a new case name after diagnosis.`);process.exitCode=1;}
}
