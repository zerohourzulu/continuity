// Private H04 build. Never replaces a published SDK or selects an npm release.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,rmSync,mkdtempSync,cpSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=(dir,prefix='')=>readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>{if(e.isSymbolicLink())throw Error('No symlinks');return e.isDirectory()?files(join(dir,e.name),prefix+e.name+'/'):[prefix+e.name]});
const sha=b=>createHash('sha256').update(b).digest('hex');
const scratch=mkdtempSync(join(tmpdir(),'continuity-history-build-'));
const destination=join(root,'sdk/history-integration');
const check=process.argv[2]==='--check';if(process.argv.length>(check?3:2))throw Error('Use [--check]');
try{
 const compiler=JSON.parse(readFileSync(join(root,'tools/sdk-build/node_modules/typescript/package.json')));
 if(compiler.version!=='5.9.3')throw Error('Pinned TypeScript 5.9.3 required');
 const result=spawnSync(process.execPath,[join(root,'tools/sdk-build/node_modules/typescript/bin/tsc'),'-p',join(root,'tools/sdk-build/tsconfig-core-0.3.json'),'--outDir',join(scratch,'dist')],{stdio:'inherit'});
 if(result.error||result.status!==0)throw Error('Strict build failed');
 const exports=Object.fromEntries(Object.entries({'.':'index','./history':'history','./history-store':'history-store/index','./local':'local-owner','./simulation':'simulation','./runtime':'runtime','./attempts':'attempts','./evidence':'evidence','./policy':'policy','./adapter':'adapter'}).map(([name,path])=>[name,{types:`./dist/core-0.3/src/${path}.d.ts`,import:`./dist/core-0.3/src/${path}.js`}]));
 writeFileSync(join(scratch,'package.json'),JSON.stringify({name:'@ramex-labs/continuity',version:'0.3.0-h04.1',private:true,type:'module',license:'Apache-2.0',engines:{node:'^22.18.0 || ^24.0.0'},exports,bin:{'continuity-history-store':'dist/core-0.3/src/history-store/cli.js'},files:['dist','LICENSE','NOTICE','README.md','BUILD-PROVENANCE.json']},null,2)+'\n');
 for(const name of ['LICENSE','NOTICE'])cpSync(join(root,name),join(scratch,name));
 cpSync(join(root,'packages/core-0.3/package-docs/0.3.0-h04.1.md'),join(scratch,'README.md'));
 const sources=['core-0.2','core-0.3'].flatMap(component=>files(join(root,'packages',component,'src')).map(path=>({path:component+'/src/'+path,sha256:sha(readFileSync(join(root,'packages',component,'src',path)))})));
 const outputs=files(join(scratch,'dist')).map(path=>({path,sha256:sha(readFileSync(join(scratch,'dist',path)))}));
 writeFileSync(join(scratch,'BUILD-PROVENANCE.json'),JSON.stringify({schemaVersion:'continuity-history-store-build/1',version:'0.3.0-h04.1',baselineArchiveSha256:'3a617b9069795c38681ba64d7fd7253282b7c37752d5b77b36fb718b95713d0d',compiler:compiler.version,compilerConfigSha256:sha(readFileSync(join(root,'tools/sdk-build/tsconfig-core-0.3.json'))),sources,outputs},null,2)+'\n');
 if(check){if(JSON.stringify(files(scratch))!==JSON.stringify(files(destination)))throw Error('File membership differs');for(const path of files(scratch))if(!readFileSync(join(scratch,path)).equals(readFileSync(join(destination,path))))throw Error('Build drift '+path);console.log('Private H04 reproducible build matches');}
 else{rmSync(destination,{recursive:true,force:true});mkdirSync(destination,{recursive:true});cpSync(scratch,destination,{recursive:true});console.log('Private H04 JavaScript and declarations built; public SDK unchanged');}
}finally{rmSync(scratch,{recursive:true,force:true})}
