// Read-only integration example. A query result is not execution authority.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PortableFileEventStore } from '../packages/core-0.2/src/indexer/portable-file-event-store.ts';
import * as core from '../packages/core-0.2/src/core/index.ts';
const name=process.argv[2];
if(!name||!/^[a-z][a-z0-9-]{0,31}$/.test(name))throw Error('Use: node examples/check-authority.mjs CASE_NAME');
const base=new URL(`../integrations/core-0.2-reference/cases/${name}/`,import.meta.url);
const config=JSON.parse(readFileSync(new URL('case.json',base),'utf8'));
const events=new PortableFileEventStore(fileURLToPath(new URL('history.jsonl',base))).readAll();
const replay=core.replayPortable({operationVersion:core.PORTABLE_REPLAY_VERSION,events});
if(replay.status!=='ACCEPTED')throw Error('History rejected');
for(const [action,resource] of [['record-review-progress','obligation'],['collect-evidence-packet','resource']]){
 const result=core.authorizePortable({operationVersion:core.PORTABLE_AUTHORIZATION_VERSION,events,expectedHistoryHead:replay.head,domain:config.domain,policyVersion:`local-evidence-intake-policy:${name}/0.2`,rootRecognitionPolicy:core.PORTABLE_ROOT_RECOGNITION_POLICY,request:{actorId:`b:${name}`,action,resource:`${resource}:${name}`,claimedAt:replay.head.canonicalTime},evaluationTime:replay.head.canonicalTime,authoritative:true,consequential:false});
 console.log(JSON.stringify({actor:`b:${name}`,action,decision:result.decision,historyHead:replay.head}));
}
