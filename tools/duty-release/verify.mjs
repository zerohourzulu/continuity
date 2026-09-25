// Tests the installed tuple outside the source tree; leaves failures for diagnosis.
import {mkdtempSync,cpSync,writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url)),consumer=mkdtempSync(join(tmpdir(),'continuity-release-consumer-'));
const run=(args,cwd=consumer)=>{const r=spawnSync(process.execPath,args,{cwd,stdio:'inherit',timeout:300000,env:{...process.env,PATH:dirname(process.execPath)+':'+process.env.PATH}});if(r.status!==0||r.error)throw Error('Consumer check failed; retained at '+consumer+' '+String(r.error??r.status));};
run([join(root,'tools/duty-release/install.mjs'),consumer],root);
for(const name of ['history-installed-consumer.mjs','protected-installed.mjs','evidence-history-installed.mjs','history-installed-consumer.mts','protected-installed.mts'])cpSync(join(root,'tests/core-0.3',name),join(consumer,name));
for(const name of ['duty-installed.mjs','duty-installed.mts'])cpSync(join(root,'tools/duty-release',name),join(consumer,name));
for(const dependency of ['typescript','@types/node','undici-types']){const dest=join(consumer,'node_modules',dependency);mkdirSync(dirname(dest),{recursive:true});cpSync(join(root,'tools/sdk-build/node_modules',dependency),dest,{recursive:true});}
writeFileSync(join(consumer,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',strict:true,noEmit:true,skipLibCheck:false,types:['node']},include:['*.mts']}));
run([join(consumer,'node_modules/typescript/bin/tsc'),'-p',join(consumer,'tsconfig.json')]);
run([join(consumer,'node_modules/.bin/continuity-history-store'),'--version']);
for(const name of ['duty-installed.mjs','protected-installed.mjs','evidence-history-installed.mjs'])run([name]);
console.log(JSON.stringify({status:'PASS',check:'coordinated-installed-tuple',node:process.version,consumer}));
