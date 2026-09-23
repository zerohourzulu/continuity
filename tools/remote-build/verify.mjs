// Install the archive outside the source tree, preserving the locked example dependencies.
import {readFileSync,writeFileSync,mkdtempSync,cpSync,mkdirSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const source=resolve(process.argv[2]??'.'),here=dirname(fileURLToPath(import.meta.url));
const consumer=realpathSync(mkdtempSync(join(tmpdir(),'continuity-installed-')));
const manifest=JSON.parse(readFileSync(join(source,'package.json'))),lock=JSON.parse(readFileSync(join(source,'package-lock.json')));
manifest.name='continuity-installed-consumer';delete manifest.scripts;
lock.name=manifest.name;lock.packages[''].name=manifest.name;
writeFileSync(join(consumer,'package.json'),JSON.stringify(manifest,null,2)+'\n');
writeFileSync(join(consumer,'package-lock.json'),JSON.stringify(lock,null,2)+'\n');
const npm=process.env.npm_execpath??resolve(dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js');
const run=args=>{
  const result=spawnSync(process.execPath,args,{cwd:consumer,encoding:'utf8',maxBuffer:8*1024*1024});
  if(result.status!==0)throw Error(result.stderr||result.stdout||String(result.error));
  if(result.stdout)process.stdout.write(result.stdout);
};
const flags=['--ignore-scripts','--no-audit','--no-fund',...(process.env.CONTINUITY_OFFLINE==='1'?['--offline']:[]),
  ...(process.env.CONTINUITY_NPM_CACHE?['--cache',process.env.CONTINUITY_NPM_CACHE]:[])];
run([npm,'ci',...flags]);
const archive=join(source,'artifacts/ramex-labs-continuity-remote-0.3.0-preview.3.tgz');
run([npm,'install',...flags,join(source,'sdk/ramex-labs-continuity-0.3.0-preview.8.tgz'),archive]);
for(const name of ['walkthrough.mjs','native-consumer.mjs'])cpSync(join(source,'examples/remote',name),join(consumer,name));
for(const dependency of ['typescript','@types/node','undici-types']){
 const target=join(consumer,'node_modules',dependency);mkdirSync(dirname(target),{recursive:true});
 cpSync(join(source,'tools/sdk-build/node_modules',dependency),target,{recursive:true});
}
cpSync(join(here,'templates/consumer.mts'),join(consumer,'consumer.mts'));
writeFileSync(join(consumer,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',strict:true,noEmit:true,skipLibCheck:false,types:['node']},include:['consumer.mts']},null,2)+'\n');
run([join(consumer,'node_modules/typescript/bin/tsc'),'-p',join(consumer,'tsconfig.json')]);
run(['walkthrough.mjs']);run(['native-consumer.mjs']);
if(process.env.CONTINUITY_CONSUMER_RECORD)writeFileSync(process.env.CONTINUITY_CONSUMER_RECORD,JSON.stringify({directory:consumer,node:process.version,package:'@ramex-labs/continuity-remote@0.3.0-preview.3',checks:['strict public types','signed walkthrough','native installed invocation']},null,2)+'\n');
console.log('Independent installed consumer passed: '+consumer);
