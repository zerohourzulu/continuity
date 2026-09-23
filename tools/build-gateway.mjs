// Versioned gateway packaging: source locks use sibling tarballs; installed packages use exact shared dependencies.
import {readFileSync,writeFileSync,mkdirSync,rmSync,cpSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url)),source=join(root,'packages/mcp-gateway'),out=join(root,'artifacts/gateway-package');
const meta=JSON.parse(readFileSync(join(source,'package.json')));
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
for(const path of [...meta.files,'package.json'])cpSync(join(source,path),join(out,path),{recursive:true});
const lock=JSON.parse(readFileSync(join(source,'npm-shrinkwrap.json')));
for(const name of ['continuity','continuity-remote'])delete lock.packages['node_modules/@ramex-labs/'+name];
writeFileSync(join(out,'npm-shrinkwrap.json'),JSON.stringify(lock,null,2)+'\n');
const r=spawnSync('npm',['pack','--ignore-scripts','--json','--pack-destination',join(root,'artifacts')],{cwd:out,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||r.stdout);console.log(r.stdout);
