import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
function setup(t){
 const root=mkdtempSync(join(tmpdir(),'continuity-case-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 for(const p of ['package.json','tools/case.mjs','lib','packages/core-0.2','integrations/retained-evidence-mcp']){mkdirSync(join(root,p,'..'),{recursive:true});cpSync(join(ROOT,p),join(root,p),{recursive:true});}
 const dir=join(root,'integrations/core-0.2-reference/cases/first-look');mkdirSync(dir,{recursive:true});mkdirSync(join(root,'runs/first-look'),{recursive:true});
 cpSync(join(ROOT,'tests/fixtures/handover-history.jsonl'),join(dir,'history.jsonl'));
 const run=(...args)=>spawnSync(process.execPath,[join(root,'tools/case.mjs'),...args],{cwd:tmpdir(),encoding:'utf8',timeout:30000});
 return {root,dir,run};
}
test('case shortcuts work outside package cwd, give scoped human output and retain JSON',t=>{
 const {dir,run}=setup(t),before=readFileSync(join(dir,'history.jsonl'));
 const human=run('check','first-look','review');assert.equal(human.status,0,human.stderr);assert.match(human.stdout,/ALLOW/);assert.match(human.stdout,/not a capability/);assert.match(human.stdout,/History position 25/);
 const json=run('check','first-look','collect','--json');assert.equal(json.status,0,json.stderr);assert.equal(JSON.parse(json.stdout).decision,'DENY');
 assert.equal(JSON.parse(run('status','first-look','--json').stdout).replayStatus,'ACCEPTED');assert.deepEqual(readFileSync(join(dir,'history.jsonl')),before);
 for(const args of [['check','../first-look','review'],['check','first-look','all'],['status','first-look','--json','--json']])assert.notEqual(run(...args).status,0);
});
test('generated summary MCP config uses actual case, denies disclosure escalation on real wire',t=>{
 const {run}=setup(t);assert.notEqual(run('mcp-config','first-look').status,0);
 const first=run('mcp-config','first-look','--disclosure','summary');assert.equal(first.status,0,first.stderr);const paths=JSON.parse(first.stdout);
 const config=JSON.parse(readFileSync(paths.readerConfig)),client=JSON.parse(readFileSync(paths.hostFields));
 assert.deepEqual(config.sources['first-look'].operations,['verify','status','check']);
 assert.equal(run('mcp-config','first-look','--disclosure','summary').stdout,first.stdout);
 const messages=[{jsonrpc:'2.0',id:0,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'generated-config-test',version:'1'}}},{jsonrpc:'2.0',method:'notifications/initialized'},...['check','handover_report'].map((op,i)=>({jsonrpc:'2.0',id:i+1,method:'tools/call',params:{name:'continuity_'+op,arguments:op==='check'?{source:'first-look',actor:'b:first-look',action:'record-review-progress',resource:'obligation:first-look'}:{source:'first-look'}}}))];
 const wire=spawnSync(client.command,client.args,{input:messages.map(x=>JSON.stringify(x)).join('\n')+'\n',encoding:'utf8',timeout:30000});assert.equal(wire.status,0,wire.stderr);
 const replies=wire.stdout.trim().split('\n').map(x=>JSON.parse(x));const check=replies.find(x=>x.id===1),denied=replies.find(x=>x.id===2);
 assert.equal(JSON.parse(check.result.content[0].text).decision,'ALLOW');assert.equal(denied.result.isError,true);
 writeFileSync(paths.readerConfig,'{}');assert.notEqual(run('mcp-config','first-look','--disclosure','summary').status,0);assert.equal(readFileSync(paths.readerConfig,'utf8'),'{}');
});
test('case helper refuses aliased history and evidence disclosure requires explicit selection',t=>{
 const {root,dir,run}=setup(t);const result=run('mcp-config','first-look','--disclosure','evidence');assert.equal(result.status,0,result.stderr);
 const config=JSON.parse(readFileSync(JSON.parse(result.stdout).readerConfig));assert(config.sources['first-look'].operations.includes('handover_report'));
 const history=join(dir,'history.jsonl');rmSync(history);symlinkSync(join(root,'package.json'),history);assert.notEqual(run('status','first-look').status,0);
});
