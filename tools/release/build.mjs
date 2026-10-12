// Builds the proposed package tuple locally. Never authenticates or publishes.
import {readFileSync,writeFileSync,readdirSync,mkdirSync,cpSync,rmSync,mkdtempSync,existsSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {requireNpm} from './npm.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),versions=JSON.parse(readFileSync(new URL('./versions.json',import.meta.url)));
const check=process.argv.includes('--check');if(process.argv.slice(2).some(x=>!['--check','--pack'].includes(x)))throw Error('Use [--check|--pack]');
const npm=requireNpm({env:{...process.env,npm_config_cache:join(tmpdir(),'continuity-release-npm-cache')}});
const out=join(root,'sdk/security-release'),scratch=mkdtempSync(join(tmpdir(),'continuity-release-build-'));
const sha=x=>createHash('sha256').update(x).digest('hex');
const files=(dir,prefix='')=>readdirSync(dir,{withFileTypes:true}).filter(e=>!['node_modules','.DS_Store'].includes(e.name)).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>{if(e.isSymbolicLink())throw Error('Symlink in build');return e.isDirectory()?files(join(dir,e.name),prefix+e.name+'/'):[prefix+e.name];});
const json=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n');
const names={core:'continuity',remote:'continuity-remote',gateway:'continuity-mcp-gateway',evidence:'continuity-mcp'};
const base=(part,extra)=>({name:'@ramex-labs/'+names[part],version:versions[part],private:false,type:'module',license:'Apache-2.0',repository:{type:'git',url:'https://github.com/zerohourzulu/continuity.git'},publishConfig:{access:'public',tag:'preview',registry:'https://registry.npmjs.org'},...extra});
const provenance=(part,inputRoots)=>{const dir=join(scratch,part);json(join(dir,'BUILD-PROVENANCE.json'),{format:'continuity-coordinated-build/1',part,version:versions[part],compiler:'5.9.3',buildInputs:['tools/release/build.mjs','tools/release/npm.mjs','tools/release/versions.json','tools/sdk-build/tsconfig-core-0.3.json','docs/releases/'+part+'-'+versions[part]+'.md'].map(path=>({path,sha256:sha(readFileSync(join(root,path)))})),inputs:inputRoots.flatMap(path=>{const p=join(root,path);return files(p).filter(f=>!(part==='evidence'&&f==='package-lock.json')).map(f=>({path:path+'/'+f,sha256:sha(readFileSync(join(p,f)))}));}),outputs:files(dir).map(path=>({path,sha256:sha(readFileSync(join(dir,path)))}))});};
try{
 for(const part of Object.keys(names)){mkdirSync(join(scratch,part),{recursive:true});for(const name of ['LICENSE','NOTICE'])cpSync(join(root,name),join(scratch,part,name));cpSync(join(root,'docs/releases',part+'-'+versions[part]+'.md'),join(scratch,part,'README.md'));}
 const inherited=join(root,'sdk/message-release');
 // Core and remote are inherited byte-for-byte; only MCP packages change.
 for(const part of ['core','remote'])cpSync(join(inherited,part),join(scratch,part),{recursive:true,force:true});
 const gateway=join(scratch,'gateway'),g=JSON.parse(readFileSync(join(root,'packages/mcp-gateway/package.json')));
 for(const name of g.files)if(!['README.md','LICENSE','NOTICE'].includes(name))cpSync(join(root,'packages/mcp-gateway',name),join(gateway,name),{recursive:true});
 g.version=versions.gateway;g.private=false;g.dependencies['@ramex-labs/continuity']=versions.core;g.dependencies['@ramex-labs/continuity-remote']=versions.remote;g.files=[...new Set([...g.files,'HISTORY.md','BUILD-PROVENANCE.json'])];json(join(gateway,'package.json'),g);cpSync(join(root,'docs/HISTORY-INTEGRATION.md'),join(gateway,'HISTORY.md'));provenance('gateway',['packages/mcp-gateway/src','packages/mcp-gateway/examples']);
 const evidence=join(scratch,'evidence');
 for(const name of ['server.mjs','config.mjs','setup.mjs','client.mjs','strict-json.mjs'])cpSync(join(root,'integrations/protected-evidence-mcp',name),join(evidence,name));
 json(join(evidence,'package.json'),base('evidence',{description:'A local MCP evidence tool with current permission checks and persistent case history',engines:{node:'^22.18.0 || ^24.0.0'},mcpName:'io.github.zerohourzulu/continuity-evidence',bin:{'continuity-mcp':'./server.mjs','continuity-evidence':'./server.mjs','continuity-evidence-setup':'./setup.mjs','continuity-evidence-demo':'./client.mjs'},files:['*.mjs','README.md','LICENSE','NOTICE','BUILD-PROVENANCE.json','HISTORY.md','THIRD-PARTY-NOTICES.md'],dependencies:{'@ramex-labs/continuity':versions.core,'@modelcontextprotocol/client':'2.2.0','@modelcontextprotocol/server':'2.2.0',viem:'2.55.19',zod:'4.6.5'}}));
 cpSync(join(root,'docs/HISTORY-INTEGRATION.md'),join(evidence,'HISTORY.md'));cpSync(join(root,'sdk/evidence-mcp/THIRD-PARTY-NOTICES.md'),join(evidence,'THIRD-PARTY-NOTICES.md'));provenance('evidence',['integrations/protected-evidence-mcp']);
 // Fail on unresolved source-tree imports or a bundled second semantic engine.
 for(const part of Object.keys(names))for(const name of files(join(scratch,part))){
  if(!/\.(?:mjs|js)$/.test(name))continue;const path=join(scratch,part,name),code=readFileSync(path,'utf8');
  if(part!=='core'&&/core-0\.[23]\//.test(name))throw Error('Integration bundled Core');
  for(const match of code.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)){const target=match[1];if(target.startsWith('.')&&!existsSync(resolve(dirname(path),target)))throw Error('Unresolved import: '+path+' '+target);}
 }
 const index=[];
 for(const part of Object.keys(names)){
  if(['core','remote'].includes(part)){
   const row=JSON.parse(readFileSync(join(inherited,'RELEASE-PACKAGES.json'))).packages.find(p=>p.part===part);
   if(row.version!==versions[part]||sha(readFileSync(join(inherited,row.archive)))!==row.sha256)throw Error('Inherited archive mismatch: '+part);
   cpSync(join(inherited,row.archive),join(scratch,row.archive));index.push(row);continue;
  }
  const result=npm(['pack','--offline','--ignore-scripts','--json','--pack-destination',scratch],{cwd:join(scratch,part),encoding:'utf8'});
  if(result.status!==0||result.error)throw Error(result.stdout+result.stderr+String(result.error??''));
  const packed=JSON.parse(result.stdout)[0];
  index.push({part,name:'@ramex-labs/'+names[part],version:versions[part],archive:packed.filename,sha256:sha(readFileSync(join(scratch,packed.filename))),files:packed.entryCount});
 }
 json(join(scratch,'RELEASE-PACKAGES.json'),{status:versions.status,sourceVersion:versions.source,packages:index});
 if(check){if(JSON.stringify(files(scratch))!==JSON.stringify(files(out)))throw Error('Release membership drift');for(const file of files(scratch))if(!readFileSync(join(scratch,file)).equals(readFileSync(join(out,file))))throw Error('Release byte drift: '+file);console.log('PASS: all four coordinated packages reproduce exactly.');}
 else{rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});cpSync(scratch,out,{recursive:true});console.log(JSON.stringify({status:'PREPARED_NOT_PUBLISHED',packages:index}));}
}finally{rmSync(scratch,{recursive:true,force:true});}
