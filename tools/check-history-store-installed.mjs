// Checks a fresh private tarball install; never consults or publishes to a registry.
import {mkdtempSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url)), scratch=mkdtempSync(join(tmpdir(),'continuity-store-installed-'));
const files=(dir,prefix='')=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name),prefix+e.name+'/'):[prefix+e.name]).sort();
const env={...process.env,npm_config_cache:join(scratch,'npm-cache'),PATH:dirname(process.execPath)+':'+process.env.PATH};
function run(command,args,cwd=scratch){const r=spawnSync(command,args,{cwd,env,encoding:'utf8'});if(r.status!==0||r.error)throw Error((r.stdout??'')+(r.stderr??'')+String(r.error??''));return r.stdout}
try{
 const packed=JSON.parse(run('npm',['pack','--offline','--ignore-scripts','--json','--pack-destination',scratch],join(root,'sdk/history-store')))[0];
 writeFileSync(join(scratch,'package.json'),JSON.stringify({name:'history-consumer',version:'1.0.0',private:true,type:'module'}));
 run('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund',join(scratch,packed.filename)]);
 const installed=join(scratch,'node_modules/@ramex-labs/continuity'),built=join(root,'sdk/history-store');
 if(JSON.stringify(files(installed))!==JSON.stringify(files(built)))throw Error('Installed file membership differs');
 for(const path of files(built))if(!readFileSync(join(installed,path)).equals(readFileSync(join(built,path))))throw Error('Installed bytes differ: '+path);
 const fixture=new URL('../tests/core-0.3/fixtures/history-fixture.mjs',import.meta.url).href;
 writeFileSync(join(scratch,'consumer.mjs'),`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import * as h from '@ramex-labs/continuity/history';
import * as storage from '@ramex-labs/continuity/history-store';
import {fixture,padded,capture,authArgs,signHash} from ${JSON.stringify(fixture)};
const f=await fixture(undefined,{policy:'E6'}),root=process.cwd();
try{
 const events=padded(f.events,320),known=capture(events);
 const view=h.captureContinuationHistory({operationVersion:h.CONTINUATION_HISTORY_VERSION,events,expectedHead:known.head});
 assert.throws(()=>storage.DirectoryHistoryStore.create(join(root,'unsafe-copy'),view),e=>e.code==='MIGRATION_REQUIRED');
 assert.equal(h.authorizeContinuation(view,authArgs(events)).result.decision,'DENY');
 const planFile=join(root,'migration-plan.json'),config=join(root,'binding.json'),settings=join(root,'settings.json');
 fs.writeFileSync(settings,JSON.stringify({sourceFile:f.config.historyFile,targetDirectory:join(root,'migrated'),planFile,expectedHead:f.handle.head,configurationFiles:[config],artifactFiles:[],quiesced:true},null,2));
 const cli=join(root,'node_modules/.bin/continuity-history-store');
 const call=args=>{const r=spawnSync(cli,args,{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
 for(const args of [['prepare-migration',settings],['stage',planFile,'--quiesced'],['activate',planFile,'--quiesced'],['migration-status',planFile]])call(args);
 const store=storage.openHistoryBinding(config);assert.deepEqual(store.snapshot().history.head,f.handle.head);
 const input={expectedDomain:f.config.domain,runtimeSessionId:'session',transition:{id:'installed:review',type:'ATTEMPT_DUTY_REVIEW_CLOSED',timestamp:100,data:{dutyId:'duty',actorId:'worker',observationEventIds:[],summaryDigest:'0x'+'a'.repeat(64)}}};
 const next=await storage.commitHistoryAdministration(store,input,{signHash,now:()=>100});
 assert.equal(next.history.eventCount,f.events.length+1);assert.deepEqual(new storage.DirectoryHistoryStore(store.path).snapshot().revision,next.revision);
 call(['inspect',store.path]);
 const {createHash}=await import('node:crypto');const orphan=Buffer.from('deliberate test orphan');fs.writeFileSync(join(store.path,'segments',createHash('sha256').update(orphan).digest('hex')+'.jsonl'),orphan,{mode:0o600});
 const inventory=call(['orphans',store.path]),inventoryFile=join(root,'inventory.json');fs.writeFileSync(inventoryFile,JSON.stringify(inventory,null,2));
 assert.equal(call(['cleanup-orphans',store.path,inventoryFile]).removed,1);
 console.log('Installed '+process.version+': all bytes, named exports, copy refusal, pretty-JSON migration CLI, binding, signed durable commit, reopen and explicit orphan cleanup pass');
}finally{f.cleanup()}
`);
 writeFileSync(join(scratch,'consumer.mts'),`import {DirectoryHistoryStore,type Revision,commitHistoryAdministration} from '@ramex-labs/continuity/history-store';\nimport {type VerifiedHistory} from '@ramex-labs/continuity/history';\ndeclare const h:VerifiedHistory;\nconst s=DirectoryHistoryStore.create('unused',h);\nconst r:Revision=s.snapshot().revision;\nconst incapable:false=s.snapshot().history.executionCapability;\nvoid r;void incapable;void commitHistoryAdministration;\n`);
 console.log(run(process.execPath,['consumer.mjs']).trim());
 run(process.execPath,[join(root,'tools/sdk-build/node_modules/typescript/bin/tsc'),'consumer.mts','--noEmit','--strict','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','--typeRoots',join(root,'tools/sdk-build/node_modules/@types')]);
 console.log('Installed strict TypeScript consumer passes; no public SDK was replaced');
}finally{rmSync(scratch,{recursive:true,force:true})}
