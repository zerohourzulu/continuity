// Install the exact release archive outside the checkout and exercise its real MCP path.
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const dir=realpathSync(mkdtempSync(join(tmpdir(),'continuity-gateway-consumer-')));
function run(command,args){const r=spawnSync(command,args,{cwd:dir,encoding:'utf8',timeout:180000});assert.equal(r.status,0,r.stderr||r.stdout||String(r.error));return r.stdout;}
try{
 writeFileSync(join(dir,'package.json'),JSON.stringify({private:true,type:'module'}));
 run('npm',['install','--ignore-scripts','--no-audit','--no-fund',join(root,'sdk/ramex-labs-continuity-0.3.0-preview.8.tgz'),join(root,'artifacts/ramex-labs-continuity-remote-0.3.0-preview.3.tgz'),join(root,'artifacts/ramex-labs-continuity-mcp-gateway-0.3.0-preview.8.tgz')]);
 const pkg=join(dir,'node_modules/@ramex-labs/continuity-mcp-gateway');
 const meta=JSON.parse(readFileSync(join(pkg,'package.json')));
 assert.equal(meta.version,'0.3.0-preview.8');assert.notEqual(meta.private,true);
 for(const bin of ['continuity-mcp-gateway','continuity-mcp-ops'])assert(existsSync(join(dir,'node_modules/.bin',bin)));
 assert.equal(run('npm',['ls','--all','--parseable','@ramex-labs/continuity']).trim().split('\n').length,1);
 for(const name of ['demo','http-demo','recovery-demo','tasks-demo'])console.log(run(process.execPath,[join(pkg,'examples',name+'.mjs')]));
 writeFileSync(join(dir,'imports.mjs'),`await Promise.all(['','/http','/cooperative','/operations','/access-policy'].map(p=>import('@ramex-labs/continuity-mcp-gateway'+p)));`);
 run(process.execPath,['imports.mjs']);
 const bad=spawnSync(join(dir,'node_modules/.bin/continuity-mcp-gateway'),[],{cwd:dir,encoding:'utf8',timeout:10000});
 assert.equal(bad.status,2);assert.equal(bad.stdout,'');assert.equal(bad.stderr,'GATEWAY_CONFIGURATION_UNAVAILABLE\n');
 console.log('PASS: exact gateway archive, both executables, all exports, four installed demos, one shared Core, missing-config refusal.');
}finally{rmSync(dir,{recursive:true,force:true});}
