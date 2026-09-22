// Genuine external application test; no implicit compiler install or registry contact.
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const consumer=mkdtempSync(join(tmpdir(),'continuity-sdk-consumer-'));
console.log('External consumer evidence retained: '+consumer);
cpSync(join(root,'examples/sdk-consumer'),consumer,{recursive:true,filter:path=>!path.split('/').includes('node_modules')});
function run(command,args,options={}) {
 const result=spawnSync(command,args,{cwd:consumer,encoding:'utf8',timeout:180000,...options});
 if(result.error||result.status!==0)throw Error(`${command} failed: ${result.error?.message??result.stderr}\n${result.stdout}`);
 return result.stdout;
}
console.log(run('npm',['install','--ignore-scripts','--offline','--no-audit','--no-fund','--package-lock=false',join(root,'sdk/continuity-core-0.2-0.2.2-sdk.1.tgz')]));
const installed=join(consumer,'node_modules/@continuity/core-0.2');
function files(dir,prefix=''){return readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>e.isDirectory()?files(join(dir,e.name),prefix+e.name+'/'):[prefix+e.name]);}
assert.deepEqual(files(installed),files(join(root,'sdk/core')));
for(const name of files(installed))assert.deepEqual(readFileSync(join(installed,name)),readFileSync(join(root,'sdk/core',name)),name);
const pkg=JSON.parse(readFileSync(join(installed,'package.json')));
assert.equal(pkg.version,'0.2.2-sdk.1');assert.equal(pkg.scripts,undefined);assert.equal(pkg.dependencies,undefined);
assert.deepEqual(readdirSync(join(consumer,'node_modules')).filter(n=>!n.startsWith('.')),['@continuity']);
console.log(run(process.execPath,['demo.mjs']));
writeFileSync(join(consumer,'exports.mjs'),`import assert from 'node:assert/strict';
for(const sub of ['', '/sdk/admission','/sdk/receipt','/store','/administration','/adapters'])await import('@continuity/core-0.2'+sub);
await assert.rejects(()=>import('@continuity/core-0.2/dist/core/host-intrinsics.js'),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
console.log('All six public JS exports load; private deep import rejected.');`);
console.log(run(process.execPath,['--no-experimental-strip-types','exports.mjs']));
console.log(run(process.execPath,[join(root,'tools/sdk-build/node_modules/typescript/bin/tsc'),'--noEmit','--strict','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','--typeRoots',join(root,'tools/sdk-build/node_modules/@types'),'types.mts']));
console.log('PASS: offline packed consumption, real packet/denials/recovery, export boundary and strict external TypeScript consumer.');
