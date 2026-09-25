// Install the exact prepared tuple and its locked third-party dependencies.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync,copyFileSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {requireNpm} from './npm.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const directory=process.argv[2];if(process.argv.length!==3||!isAbsolute(directory))throw Error('Pass an absolute empty consumer directory');
if(existsSync(directory)&&readdirSync(directory).length)throw Error('Consumer directory must be empty; no files were changed');
const release=join(root,'sdk/duty-release'),index=JSON.parse(readFileSync(join(release,'RELEASE-PACKAGES.json')));
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const p of index.packages)if(sha(readFileSync(join(release,p.archive)))!==p.sha256)throw Error('Archive hash mismatch: '+p.name);
const lock=JSON.parse(readFileSync(new URL('./consumer-lock.json',import.meta.url))),manifest=lock.packages[''];
for(const p of index.packages){if(manifest.dependencies[p.name]!=='file:packages/'+p.archive||lock.packages['node_modules/'+p.name].version!==p.version)throw Error('Lock/tuple mismatch');}
const npm=requireNpm();
mkdirSync(directory,{recursive:true,mode:0o700});mkdirSync(join(directory,'packages'),{mode:0o700});
for(const p of index.packages)copyFileSync(join(release,p.archive),join(directory,'packages',p.archive));
writeFileSync(join(directory,'package.json'),JSON.stringify({name:lock.name,version:lock.version,private:true,type:'module',dependencies:manifest.dependencies},null,2)+'\n');
writeFileSync(join(directory,'package-lock.json'),JSON.stringify(lock,null,2)+'\n');
const result=npm(['ci','--ignore-scripts','--no-audit','--no-fund',...(process.env.CONTINUITY_OFFLINE==='1'?['--offline']:[])],{cwd:directory,stdio:'inherit'});
if(result.status!==0||result.error)throw Error('Install failed; partial directory retained for diagnosis');
const list=npm(['ls','--all','--parseable','@ramex-labs/continuity'],{cwd:directory,encoding:'utf8'});
if(list.status!==0||list.stdout.trim().split('\n').filter(Boolean).length!==1)throw Error('Expected exactly one installed Core');
const walk=(dir,prefix='')=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name),prefix+e.name+'/'):[prefix+e.name]).sort();
for(const p of index.packages){const built=join(release,p.part),installed=join(directory,'node_modules',p.name),expected=walk(built),actual=walk(installed);
 if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error('Package membership differs: '+p.name);
 for(const file of expected)if(!readFileSync(join(built,file)).equals(readFileSync(join(installed,file))))throw Error('Installed bytes differ: '+p.name+'/'+file);
}
console.log(JSON.stringify({status:'INSTALLED_EXACT',directory,versions:index.packages.map(p=>[p.name,p.version]),oneCore:true,node:process.version}));
