// Build the exact local evaluation package. Does not publish.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,rmSync,cpSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,resolve,dirname,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {tmpdir,homedir} from 'node:os';

const here=dirname(fileURLToPath(import.meta.url));
if(process.argv.length!==3)throw Error('Use: node tools/remote-build/build.mjs /path/to/source');
const source=resolve(process.argv[2]),artifacts=join(source,'sdk/history-remote-artifacts'),out=join(artifacts,'npm-package'),cache=join(tmpdir(),'continuity-remote-pack-cache');
const sha=value=>createHash('sha256').update(value).digest('hex');
const walk=(root,prefix='')=>readdirSync(root,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(item=>{
  if(item.isSymbolicLink())throw Error('Symlink in package input/output');
  const name=prefix+item.name;
  return item.isDirectory()?walk(join(root,item.name),name+'/'):[name];
});
function run(args,options={}) {
  const result=spawnSync(process.execPath,args,{encoding:'utf8',...options});
  if(result.error||result.status!==0)throw Error((result.stderr||result.stdout||String(result.error)).slice(-16000));
  return result.stdout;
}
const tsc=join(source,'tools/sdk-build/node_modules/typescript/bin/tsc');
const compiler=JSON.parse(readFileSync(join(source,'tools/sdk-build/node_modules/typescript/package.json'),'utf8'));
const ts=createRequire(import.meta.url)(join(source,'tools/sdk-build/node_modules/typescript'));
if(compiler.version!=='5.9.3')throw Error('Use the installed pinned compiler, 5.9.3');
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
const selected=['wire.mjs','destination.mjs','client.mjs','durable-store.mjs','validation.mjs','executor.mjs','recovery.mjs','langchain.mjs'];
const remote=join(out,'dist/remote-tools');mkdirSync(remote,{recursive:true});
for(const name of selected) {
  let code=readFileSync(join(source,'packages/remote-tools',name),'utf8');
  code=code.replace(/(['"])\.\.\/core-0\.[23]\/src\/[^'"]+\.ts\1/g, "'@ramex-labs/continuity/adapter'");
  code=code.replaceAll("'../../lab/strict-json.mjs'","'./strict-json.mjs'");
  writeFileSync(join(remote,name),code);
}
cpSync(join(source,'lab/strict-json.mjs'),join(remote,'strict-json.mjs'));
for(const name of ['index.mjs','index.d.mts','langchain.d.mts','local.mjs','local.d.mts','runtime.mjs','runtime.d.mts','attempts.mjs','attempts.d.mts'])cpSync(join(here,'templates',name),join(remote,name));
for(const name of ['LICENSE','NOTICE'])cpSync(join(source,name),join(out,name));
for(const name of ['LICENSING.md','THIRD-PARTY-NOTICES.md'])cpSync(join(source,'packages/remote-tools',name),join(out,name));

const manifest={name:'@ramex-labs/continuity-remote',version:'0.3.0-h04.1',private:true,repository:{type:'git',url:'https://github.com/zerohourzulu/continuity.git'},type:'module',license:'Apache-2.0',
  description:'Cooperating tool execution, recovery and evidence review; local evaluation profile',
  engines:{node:'^22.18.0 || ^24.0.0'},
  exports:{
    '.':{types:'./dist/remote-tools/index.d.mts',import:'./dist/remote-tools/index.mjs'},
    './langchain':{types:'./dist/remote-tools/langchain.d.mts',import:'./dist/remote-tools/langchain.mjs'},
    './local':{types:'./dist/remote-tools/local.d.mts',import:'./dist/remote-tools/local.mjs'},
    './runtime':{types:'./dist/remote-tools/runtime.d.mts',import:'./dist/remote-tools/runtime.mjs'},
    './attempts':{types:'./dist/remote-tools/attempts.d.mts',import:'./dist/remote-tools/attempts.mjs'},
  },dependencies:{'@ramex-labs/continuity':'0.3.0-h04.1'},peerDependencies:{'@langchain/core':'1.2.12',zod:'4.6.5'},
  peerDependenciesMeta:{'@langchain/core':{optional:true},zod:{optional:true}},
  files:['dist','LICENSE','NOTICE','LICENSING.md','THIRD-PARTY-NOTICES.md','README.md','BUILD-PROVENANCE.json','HISTORY.md','examples']};
writeFileSync(join(out,'package.json'),JSON.stringify(manifest,null,2)+'\n');
cpSync(join(source,'packages/remote-tools/package-docs/0.3.0-h04.1.md'),join(out,'README.md'));
cpSync(join(source,'docs/HISTORY-INTEGRATION.md'),join(out,'HISTORY.md'));
cpSync(join(source,'examples/remote'),join(out,'examples'),{recursive:true});
const provenance={kind:'continuity-remote-shared-core-build/1',compiler:compiler.version,coreDependency:{name:'@ramex-labs/continuity',version:'0.3.0-h04.1',archiveSha256:sha(readFileSync(join(source,'sdk/history-packages/ramex-labs-continuity-0.3.0-h04.1.tgz')))},
  sources:['packages/remote-tools','examples/remote'].flatMap(base=>walk(join(source,base)).map(path=>({path:base+'/'+path,sha256:sha(readFileSync(join(source,base,path)))}))),
  buildInputs:['tools/remote-build/build-history.mjs',...walk(join(source,'tools/remote-build/templates')).map(path=>'tools/remote-build/templates/'+path),'tools/sdk-build/tsconfig-core-0.3.json','tools/sdk-build/package-lock.json'].map(path=>({path,sha256:sha(readFileSync(join(source,path)))})),
  strictJsonSha256:sha(readFileSync(join(source,'lab/strict-json.mjs'))),
  outputs:walk(join(out,'dist')).map(path=>({path:'dist/'+path,sha256:sha(readFileSync(join(out,'dist',path)))}))};
writeFileSync(join(out,'BUILD-PROVENANCE.json'),JSON.stringify(provenance,null,2)+'\n');
for(const path of walk(join(out,'dist'))) {
  if(!/\.(?:js|mjs|d\.ts|d\.mts)$/.test(path))throw Error('Unexpected runtime package file: '+path);
  const code=readFileSync(join(out,'dist',path),'utf8');
  if(code.includes(homedir())||code.includes('../../lab/'))throw Error('Private/source-tree path in artifact: '+path);
  if(['.js','.mjs'].includes(extname(path))) {
    const imports=[];
    const visit=node=>{
      if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))imports.push(node.moduleSpecifier.text);
      if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword) {
        if(node.arguments.length!==1||!ts.isStringLiteral(node.arguments[0]))throw Error('Unbounded dynamic import: '+path);
        imports.push(node.arguments[0].text);
      }
      ts.forEachChild(node,visit);
    };
    visit(ts.createSourceFile(path,code,ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS));
    for(const target of imports) {
    if(target.endsWith('.ts'))throw Error('Runtime TypeScript import: '+path);
    if(target.startsWith('node:'))continue;
    if(['@ramex-labs/continuity/adapter','@ramex-labs/continuity/local','@ramex-labs/continuity/runtime','@ramex-labs/continuity/attempts'].includes(target))continue;
    if(path==='remote-tools/langchain.mjs'&&['@langchain/core/tools','zod'].includes(target))continue;
    if(!target.startsWith('.'))throw Error('Unbundled dependency: '+target+' in '+path);
    const destination=resolve(dirname(join(out,'dist',path)),target);
    if(!destination.startsWith(out+'/')||!existsSync(destination))throw Error('Unresolved package reference: '+target+' in '+path);
    }
  }
}
const npm=process.env.npm_execpath??resolve(dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js');
const packed=JSON.parse(run([npm,'pack','--offline','--ignore-scripts','--json','--cache',cache,'--pack-destination',artifacts],{cwd:out}));
writeFileSync(join(artifacts,'pack-result.json'),JSON.stringify(packed,null,2)+'\n');
console.log(JSON.stringify({package:manifest.name,version:manifest.version,private:manifest.private,archive:join(artifacts,packed[0].filename),files:packed[0].entryCount,unpackedSize:packed[0].unpackedSize}));
