import {parseStrictJson} from './strict-json.mjs';
// Pure scenario construction shared by browser profile and original Node parity tests.
export const ACTIONS=Object.freeze([
 ['record-review-progress','Review the packet','obligation:first-look'],
 ['collect-evidence-packet','Collect another packet','resource:first-look'],
 ['read-alert','Read an alert','play:alert'],['inspect-log','Inspect a log','play:log'],
 ['draft-report','Draft a report','play:report'],['publish-report','Publish a report','play:report'],
 ['quarantine-file','Quarantine a file','play:file'],['restore-file','Restore a file','play:file'],
 ['request-approval','Request approval','play:approval'],['approve-release','Approve release','play:release'],
 ['archive-record','Archive a record','play:archive'],['export-record','Export a record','play:archive']
]);
export const ROLE_NAMES=Object.freeze(['Observer','Reviewer','Collector','Reporter','Responder','Approver','Archivist']);
export const LIMITS=Object.freeze({agents:12,extraRoles:7,operations:12,grants:32,inputBytes:32768,steps:4});
export function defaultCase(){return {version:1,name:'The midnight handover',names:['Alex','Bea','Casey','Devon'],step:3,actor:1,operation:0,roles:[],grants:[],deny:false,withdrawReview:false};}
const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
const text=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.length<=n&&!/[\u0000-\u001f\u007f]/.test(v);
const integer=(v,low,high)=>Number.isInteger(v)&&v>=low&&v<=high;
const keys=(v,expected)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===expected.sort().join(',');
export function parseCase(raw){
 assert(typeof raw==='string','Send scenario JSON text only.');
 assert(raw.length<=LIMITS.inputBytes && new TextEncoder().encode(raw).length<=LIMITS.inputBytes,'The scenario is too large (32 KB maximum).');
 const c=parseStrictJson(new TextEncoder().encode(raw),{maxBytes:32768,maxDepth:8,maxNodes:2048});
 assert(keys(c,['version','name','names','step','actor','operation','roles','grants','deny','withdrawReview']),'The scenario has unexpected or missing fields.');
 assert(c.version===1 && text(c.name,64),'Use a scenario version 1 and a case name of 1–64 characters.');
 assert(Array.isArray(c.names)&&c.names.length>=2&&c.names.length<=12&&c.names.every(n=>text(n,24))&&new Set(c.names).size===c.names.length,'Use 2–12 distinct agent names, each up to 24 characters.');
 assert(integer(c.step,0,3)&&integer(c.actor,0,c.names.length-1)&&integer(c.operation,0,11),'Choose an available step, agent and operation.');
 assert(typeof c.deny==='boolean'&&typeof c.withdrawReview==='boolean','Permission choices must be true or false.');
 assert(Array.isArray(c.roles)&&c.roles.length<=7,'Use at most seven extra roles (eight including investigator).');
 assert(new Set(c.roles.map(r=>r?.role)).size===c.roles.length,'Each exclusive role needs one owner.');
 for(const r of c.roles)assert(keys(r,['role','agent','operations'])&&integer(r.role,0,6)&&integer(r.agent,0,c.names.length-1)&&Array.isArray(r.operations)&&r.operations.length<=12&&r.operations.every(o=>integer(o,0,11))&&new Set(r.operations).size===r.operations.length,'Invalid role assignment or operation list.');
 assert(Array.isArray(c.grants)&&c.grants.length<=32,'Use at most 32 direct permissions.');
 for(const g of c.grants)assert(keys(g,['agent','operation','revoked','expired'])&&integer(g.agent,0,c.names.length-1)&&integer(g.operation,0,11)&&typeof g.revoked==='boolean'&&typeof g.expired==='boolean','Invalid direct permission.');
 return c;
}
export function runCase(core,c,fixture){
 const end=[13,19,24,26][c.step]; const events=fixture.slice(0,end);
 const principal='principal:first-look', actorId=i=>i===0?'a:first-look':i===1?'b:first-look':`play:agent:${i}`;
 let serial=0,time=events.at(-1).timestamp;
 const append=(type,data)=>events.push({id:`play:${++serial}`,type,timestamp:++time,data});
 for(let i=2;i<c.names.length;i++)append('AGENT_CREATED',{agentId:actorId(i),principalId:principal,controllerId:'controller:first-look',initialControlEpoch:1});
 const permission=(id,grantee,operations,expired=false)=>append('AUTHORITY_GRANTED',{grant:{kind:'PERMISSION',authorityId:id,grantorId:principal,granteeId:grantee,rootAuthorityId:id,independent:true,constraints:{actions:operations.map(o=>ACTIONS[o][0]),resources:[...new Set(operations.map(o=>ACTIONS[o][2]))],quantitative:false,...(expired?{expiresAt:1}:{}),maxDelegationDepth:0,requiredIntersectionIds:[]}}});
 for(const r of c.roles){
 const id=`play:role:${r.role}`;append('ROLE_CREATED',{roleId:id,principalId:principal,exclusive:true});
 // A is terminated after handover; reject impossible appointment explicitly.
 if(c.step>=2&&r.agent===0)throw Error(`${c.names[0]}’s original identity has ended at this step. Choose another role owner or rewind.`);
 append('AGENT_APPOINTED',{agentId:actorId(r.agent),roleId:id,roleTenureId:id+':tenure',tenureNumber:1,principalId:principal});
 // Role assignment and agent permission are distinct Core events. These UI templates
 // explicitly do BOTH; no role-based inheritance is invented. One grant per pair.
 for(const o of r.operations)permission(`${id}:grant:${o}`,actorId(r.agent),[o]);
 }
 for(let i=0;i<c.grants.length;i++){const g=c.grants[i],id=`play:grant:${i}`;permission(id,actorId(g.agent),[g.operation],g.expired);if(g.revoked)append('AUTHORITY_REVOKED',{authorityId:id,revokerId:principal});}
 if(c.withdrawReview)append('AUTHORITY_REVOKED',{authorityId:'progress-b-authority:first-look',revokerId:principal});
 const [action,,resource]=ACTIONS[c.operation];
 if(c.deny)append('AUTHORITY_GRANTED',{grant:{kind:'PROHIBITION',scope:'GLOBAL',authorityId:'play:stop',grantorId:'policy-source:first-look',subjectActorId:actorId(c.actor),constraints:{actions:[action],resources:[resource],quantitative:false,maxDelegationDepth:0,requiredIntersectionIds:[]}}});
 assert(events.length<=224,'This scenario has too many events. Reduce the permissions.');
 const kernel=core.createPortableReplayKernel();
 const captured=core.captureBoundedCanonicalReplayBodyIncrementally(events,{operationVersion:core.PORTABLE_REPLAY_VERSION,events},kernel.visit);
 assert(captured.status==='CAPTURED','Core could not capture this history.');
 const replay=kernel.finish();
 assert(replay.status==='ACCEPTED',`Core rejected the scenario: ${replay.code??replay.status}`);
 const head=replay.state.head;
 const result=core.authorizePortable({operationVersion:core.PORTABLE_AUTHORIZATION_VERSION,events,expectedHistoryHead:head,domain:events[0].data.domain,policyVersion:events[0].data.policyVersion,rootRecognitionPolicy:core.PORTABLE_ROOT_RECOGNITION_POLICY,request:{actorId:actorId(c.actor),action,resource,claimedAt:head.canonicalTime},evaluationTime:head.canonicalTime,authoritative:true,consequential:false});
 const state=replay.state;
 return {profile:'continuity-json-worker-evaluation/1',caseName:c.name,step:c.step,actorId:actorId(c.actor),action,resource,decision:result.decision,code:result.code??null,head:head,coreResult:result,agents:c.names.map((name,i)=>({name,id:actorId(i),status:state.agents.get(actorId(i))?.terminated?'TERMINATED':'ACTIVE'})),duties:[...state.obligations.values()].map(o=>({id:o.record.obligationId,status:o.status,assignee:o.performanceAssigneeId})),events,recordedPrefixEvents:end,experimentEvents:events.length-end,scope:'Synthetic policy observation. No new signed admission, file action, containment or real incident.'};
}
