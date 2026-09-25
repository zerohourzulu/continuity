// Checks a fresh private tarball install; never consults or publishes to a registry.
import {mkdtempSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url)), scratch=mkdtempSync(join(tmpdir(),'continuity-history-installed-'));
const files=(dir,prefix='')=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name),prefix+e.name+'/'):[prefix+e.name]).sort();
const env={...process.env,npm_config_cache:join(scratch,'npm-cache'),PATH:dirname(process.execPath)+':'+process.env.PATH};
function run(command,args,cwd=scratch){const r=spawnSync(command,args,{cwd,env,encoding:'utf8'});if(r.status!==0||r.error)throw Error((r.stdout??'')+(r.stderr??'')+String(r.error??''));return r.stdout}
try{
 const packed=JSON.parse(run('npm',['pack','--offline','--ignore-scripts','--json','--pack-destination',scratch],join(root,'sdk/history-experiment')))[0];
 writeFileSync(join(scratch,'package.json'),JSON.stringify({name:'history-consumer',version:'1.0.0',private:true,type:'module'}));
 run('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund',join(scratch,packed.filename)]);
 const installed=join(scratch,'node_modules/@ramex-labs/continuity'),built=join(root,'sdk/history-experiment');
 if(JSON.stringify(files(installed))!==JSON.stringify(files(built)))throw Error('Installed file membership differs');
 for(const path of files(built))if(!readFileSync(join(installed,path)).equals(readFileSync(join(built,path))))throw Error('Installed bytes differ: '+path);
 const fixture=new URL('../tests/core-0.3/fixtures/history-fixture.mjs',import.meta.url).href;
 writeFileSync(join(scratch,'consumer.mjs'),`
import assert from 'node:assert/strict';
import * as h from '@ramex-labs/continuity/history';
import {fixture,padded,capture,authArgs,signHash} from ${JSON.stringify(fixture)};
const f=await fixture(undefined,{policy:'E6'});
try{
 const events=padded(f.events,320),known=capture(events);
 const view=h.captureContinuationHistory({operationVersion:h.CONTINUATION_HISTORY_VERSION,events,expectedHead:known.head});
 assert.equal(h.authorizeContinuation(view,authArgs(events)).result.decision,'DENY');
 assert.throws(()=>h.exportContinuationEvents({...view}),e=>e.code==='INVALID_HISTORY_HANDLE');
 const input={expectedDomain:f.config.domain,expectedHistoryHead:view.head,runtimeSessionId:'session',transition:{id:'installed:review',type:'ATTEMPT_DUTY_REVIEW_CLOSED',timestamp:100,data:{dutyId:'duty',actorId:'worker',observationEventIds:[],summaryDigest:'0x'+'a'.repeat(64)}}};
 const produced=(await h.produceContinuationAdministration(view,input,{signHash})).result;
 assert.equal(h.appendContinuationEvent(view,produced.event).eventCount,321);
 console.log('Installed '+process.version+': exact bytes, named export, full replay, denial, copied-handle refusal and signed review pass');
}finally{f.cleanup()}
`);
 writeFileSync(join(scratch,'consumer.mts'),`import {captureContinuationHistory,authorizeContinuation,type VerifiedHistory} from '@ramex-labs/continuity/history';\nconst h:VerifiedHistory=captureContinuationHistory({});\nconst result=authorizeContinuation(h,{});\nconst capability:false=result.executionCapability;\nconst scope:'CAPTURED_HISTORY_ONLY'=result.scope;\nvoid capability;void scope;\n`);
 console.log(run(process.execPath,['consumer.mjs']).trim());
 run(process.execPath,[join(root,'tools/sdk-build/node_modules/typescript/bin/tsc'),'consumer.mts','--noEmit','--strict','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','--typeRoots',join(root,'tools/sdk-build/node_modules/@types')]);
 console.log('Installed strict TypeScript consumer passes; no public SDK was replaced');
}finally{rmSync(scratch,{recursive:true,force:true})}
