// Verify one installed Core owns every integration's rules and public types.
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url)),dir=mkdtempSync(join(tmpdir(),'continuity-shared-consumer-'));
const run=(command,args)=>{const r=spawnSync(command,args,{cwd:dir,encoding:'utf8',timeout:120000});if(r.status!==0)throw Error(r.stderr||r.stdout||String(r.error));return r.stdout;};
try {
 writeFileSync(join(dir,'package.json'),JSON.stringify({private:true,type:'module'}));
 run('npm',['install','--prefer-offline','--ignore-scripts','--no-audit','--no-fund',
 join(root,'sdk/ramex-labs-continuity-0.3.0-preview.7.tgz'),join(root,'artifacts/ramex-labs-continuity-remote-0.3.0-preview.2.tgz'),join(root,'sdk/ramex-labs-continuity-mcp-0.3.0-preview.8.tgz')]);
 const paths=run('npm',['ls','--all','--parseable','@ramex-labs/continuity']).trim().split('\n').filter(Boolean);
 assert.equal(paths.length,1,'The supported combination must resolve exactly one Core installation');
 const remote=join(dir,'node_modules/@ramex-labs/continuity-remote'),mcp=join(dir,'node_modules/@ramex-labs/continuity-mcp');
 for(const path of [remote,mcp]){
  const pkg=JSON.parse(readFileSync(join(path,'package.json')));assert.equal(pkg.dependencies['@ramex-labs/continuity'],'0.3.0-preview.7');
  const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(d,e.name)):[join(d,e.name)]);
  assert(!walk(path).some(p=>/core-0\.[23]\/|portable-replay\.|portable-authority-engine\./.test(p)),'An integration must not bundle engine files');
 }
 writeFileSync(join(dir,'check.mjs'),`import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs'; import {join} from 'node:path'; import {tmpdir} from 'node:os';
import {ContinuityError} from '@ramex-labs/continuity';
import * as local from '@ramex-labs/continuity/local';
import * as remoteLocal from '@ramex-labs/continuity-remote/local';
import * as runtime from '@ramex-labs/continuity/runtime';
import * as remoteRuntime from '@ramex-labs/continuity-remote/runtime';
import * as attempts from '@ramex-labs/continuity/attempts';
import * as remoteAttempts from '@ramex-labs/continuity-remote/attempts';
import {createToolRegistry} from '@ramex-labs/continuity-remote';
assert.equal(remoteLocal.createLocalOwner,local.createLocalOwner);
assert.equal(remoteLocal.createLocalAttemptOwner,local.createLocalAttemptOwner);
assert.equal(remoteLocal.createLocalReviewOwner,local.createLocalReviewOwner);
assert.equal(remoteRuntime.openLocalRuntime,runtime.openLocalRuntime);
assert.equal(remoteAttempts.openLocalAttemptRecorder,attempts.openLocalAttemptRecorder);
assert.throws(()=>createToolRegistry({}),e=>e instanceof ContinuityError);
const temp=mkdtempSync(join(tmpdir(),'continuity-policy-choice-'));
try {
 const hashes=[];
 for(const [name,make] of [['existing',local.createLocalOwner],['attempts',local.createLocalAttemptOwner],['review',local.createLocalReviewOwner]]) {
  const config={historyFile:join(temp,name+'.jsonl'),domain:local.createLocalDomain(),owner:'owner',controller:'controller',now:()=>100};
  const owner=make(config); const before=owner.exportHistory();hashes.push(before[0].data.adapterPolicyHash);
  assert.deepEqual(local.openLocalOwner(config).exportHistory(),before);
 }
 assert.equal(new Set(hashes).size,3,'History policies remain distinct and explicitly selected');
} finally {rmSync(temp,{recursive:true,force:true});}
await assert.rejects(import('@ramex-labs/continuity/dist/core-0.2/src/core/index.js'),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
console.log('PASS: shared function/error identity; explicit distinct policies; reopen unchanged; internal imports blocked.');
`);
 console.log(run(process.execPath,['--no-experimental-strip-types','check.mjs']));
 console.log('PASS: one installed Core; exact dependency versions; no bundled engine in remote or MCP.');
} finally {rmSync(dir,{recursive:true,force:true});}
