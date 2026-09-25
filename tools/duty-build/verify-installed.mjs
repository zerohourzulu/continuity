/** Local-only installed SDK probe. Run with Node24; uses existing compiler/signer dependencies. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync,mkdtempSync,mkdirSync,readFileSync,readdirSync,writeFileSync,statSync,realpathSync} from 'node:fs';
import {dirname,join,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {requireNpm} from '../release/npm.mjs';

const scriptDirectory=dirname(fileURLToPath(import.meta.url));
const root=resolve(scriptDirectory,'../..'),sdk=join(root,'sdk/duty-activation');
const [logArgument,node22Argument]=process.argv.slice(2);
if(!logArgument||process.argv.length>4) throw new Error('Usage: node24 tools/duty-build/verify-installed.mjs LOG_DIRECTORY [NODE22]');
const npm=requireNpm(); // Fail before local writes when no working PATH npm exists.
const logs=resolve(logArgument);mkdirSync(logs,{recursive:true});
const scratch=realpathSync(mkdtempSync(join(tmpdir(),'continuity-d02-installed-')));
const cache=join(scratch,'npm-cache'),consumer=join(scratch,'consumer');mkdirSync(consumer);
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const files=directory=>readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry=>{
  const path=join(directory,entry.name);return entry.isDirectory()?files(path):entry.isFile()?[path]:[];
});
const inherited=()=>files(join(root,'sdk')).filter(path=>!path.startsWith(sdk+'/')).map(path=>[relative(root,path),sha(path)]);
const prior=inherited();
const commands=[];
const run=(name,executable,args,cwd=consumer,extraEnv={})=>{
  const options={cwd,encoding:'utf8',maxBuffer:8*1024*1024,timeout:120000,shell:false,env:{...process.env,...extraEnv}};
  const result=executable==='npm'?npm(args,options):spawnSync(executable,args,options);
  const command={executable,args,cwd};commands.push({name,...command,status:result.status});
  writeFileSync(join(logs,`installed-${name}.log`),JSON.stringify({command,status:result.status,signal:result.signal,error:result.error?.message},null,2)+'\n'+result.stdout+result.stderr);
  if(result.error||result.status!==0) throw new Error(`${name} failed; see installed-${name}.log`);
  return result.stdout;
};
writeFileSync(join(scratch,'user.npmrc'),'');writeFileSync(join(scratch,'global.npmrc'),'');
const npmFlags=['--offline','--ignore-scripts','--no-audit','--no-fund','--cache',cache,'--userconfig',join(scratch,'user.npmrc'),'--globalconfig',join(scratch,'global.npmrc')];
const pack=JSON.parse(run('pack','npm',['pack',sdk,'--pack-destination',scratch,'--json',...npmFlags]));
assert.equal(pack.length,1);
const tgz=join(scratch,pack[0].filename);
writeFileSync(join(consumer,'package.json'),JSON.stringify({name:'d02-installed-consumer',private:true,type:'module'}));
run('install','npm',['install',tgz,...npmFlags]);
const installed=join(consumer,'node_modules/@ramex-labs/continuity');
const metadata=JSON.parse(readFileSync(join(installed,'package.json'),'utf8'));
assert.equal(metadata.version,'0.3.0-d02.1');assert.equal(metadata.private,true);
for(const member of pack[0].files) assert.deepEqual(readFileSync(join(installed,member.path)),readFileSync(join(sdk,member.path)),member.path);
for(const extension of ['mjs','mts']) cpSync(join(scriptDirectory,`installed-consumer.${extension}`),join(consumer,`consumer.${extension}`));
const signerEnv={CONTINUITY_TEST_SIGNER_PACKAGE_JSON:join(root,'package.json')};
const lanes=[];
for(const [label,executable] of [['node24',process.execPath],...(node22Argument?[['node22',resolve(node22Argument)]]:[])]) {
  const work=join(scratch,label+'-case');
  for(const mode of ['create','reopen']) {
    const output=run(`${label}-${mode}`,executable,[join(consumer,'consumer.mjs'),mode,work],consumer,signerEnv);
    lanes.push(JSON.parse(output));
  }
}
const compiler=join(root,'tools/sdk-build/node_modules/typescript/lib/tsc.js');
const compilerVersion=run('tsc-version',process.execPath,[compiler,'--version']).trim();assert.equal(compilerVersion,'Version 5.9.3');
run('typescript',process.execPath,[compiler,'--noEmit','--strict','--skipLibCheck','false','--target','ES2022','--module','NodeNext',
  '--moduleResolution','NodeNext','--allowImportingTsExtensions','--types','node','--typeRoots',join(root,'tools/sdk-build/node_modules/@types'),join(consumer,'consumer.mts')]);
assert.deepEqual(inherited(),prior,'Inherited SDK output changed during installed verification.');
const summary={node:process.version,compilerVersion,package:metadata.name,version:metadata.version,private:metadata.private,
  sdk,scratch,tgz,tgzBytes:statSync(tgz).size,tgzSha256:sha(tgz),npmIntegrity:pack[0].integrity,
  packedFiles:pack[0].files.length,installedBytesMatched:pack[0].files.length,inheritedSdkFilesUnchanged:prior.length,
  runtimeChecks:lanes.reduce((sum,lane)=>sum+lane.checks,0),lanes,commands};
writeFileSync(join(logs,'installed-summary.log'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({scratch,tgzSha256:summary.tgzSha256,packedFiles:summary.packedFiles,runtimeChecks:summary.runtimeChecks,
  inheritedSdkFilesUnchanged:summary.inheritedSdkFilesUnchanged,compilerVersion},null,2));
