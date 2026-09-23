// Explicit local build; never downloads tooling or runs package lifecycle hooks.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, mkdtempSync, cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function files(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e => {
    const name = prefix + e.name;
    if (e.isSymbolicLink()) throw Error('Build input/output must not contain symlinks');
    return e.isDirectory() ? files(join(dir,e.name), name + '/') : [name];
  });
}
const args = process.argv.slice(2);
if (args.length > 1 || args.some(x=>!['--check','--pack'].includes(x))) throw Error('Use: node tools/build-sdk.mjs [--check|--pack]');
// The frozen SDK can only be rebuilt from its recorded original source.
const frozen = JSON.parse(readFileSync(join(root,'sdk/core/BUILD-PROVENANCE.json')));
const currentSources = files(join(root,'packages/core-0.2/src'));
if (currentSources.length !== frozen.sources.length || frozen.sources.some(item => !currentSources.includes(item.path) || sha(readFileSync(join(root,'packages/core-0.2/src',item.path))) !== item.sha256)) {
  console.error('The frozen 0.2 SDK belongs to its original release source. Use that release to reproduce it. Build the current shared Core with npm run api:build; do not overwrite the old SDK under its old version.');
  process.exit(2);
}
const scratch = mkdtempSync(join(tmpdir(),'continuity-sdk-build-'));
try {
  const tsc = join(root,'tools/sdk-build/node_modules/typescript/bin/tsc');
  const compiler = JSON.parse(readFileSync(join(root,'tools/sdk-build/node_modules/typescript/package.json')));
  if (compiler.version !== '5.9.3') throw Error('Use pinned tooling: npm ci --prefix tools/sdk-build --ignore-scripts');
  const result = spawnSync(process.execPath,[tsc,'-p',join(root,'tools/sdk-build/tsconfig.json'),'--outDir',join(scratch,'dist')],{stdio:'inherit'});
  if (result.error || result.status !== 0) throw Error('Strict SDK build failed; no package was replaced');
  const exports = Object.fromEntries(Object.entries({'.':'core/index','./sdk/admission':'sdk/durable-admission','./sdk/receipt':'sdk/durable-receipt','./store':'indexer/portable-file-event-store','./administration':'administration/index','./adapters':'adapters/index'}).map(([name,path])=>[name,{types:`./dist/${path}.d.ts`,import:`./dist/${path}.js`}]));
  const manifest = {name:'@continuity/core-0.2',version:'0.2.2-sdk.1',private:true,type:'module',license:'Apache-2.0',description:'Continuity Core 0.2.2 local evaluation SDK',engines:{node:'^22.18.0 || ^24.0.0 || ^26.0.0'},exports,files:['dist','LICENSE','NOTICE','LICENSING.md','THIRD-PARTY-NOTICES.md','README.md','BUILD-PROVENANCE.json']};
  writeFileSync(join(scratch,'package.json'),JSON.stringify(manifest,null,2)+'\n');
  for (const name of ['LICENSE','NOTICE']) cpSync(join(root,name),join(scratch,name));
  cpSync(join(root,'docs/SDK-PACKAGE.md'),join(scratch,'README.md'));
  writeFileSync(join(scratch,'LICENSING.md'),'# SDK licensing\n\nContinuity-authored SDK code and documentation are Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). This archive contains no website assets or third-party runtime dependencies. Separate build tools retain their own licenses.\n');
  writeFileSync(join(scratch,'THIRD-PARTY-NOTICES.md'),'# SDK third-party scope\n\nNo third-party runtime code is bundled in this SDK archive. Node and build tooling are separately installed; their licenses remain applicable to those tools. The full evaluation distribution has its own dependency and website notices.\n');
  const sources = files(join(root,'packages/core-0.2/src')).map(path=>({path,sha256:sha(readFileSync(join(root,'packages/core-0.2/src',path)))}));
  const outputs = files(join(scratch,'dist')).map(path=>({path,sha256:sha(readFileSync(join(scratch,'dist',path)))}));
  writeFileSync(join(scratch,'BUILD-PROVENANCE.json'),JSON.stringify({schemaVersion:'continuity-sdk-build/1',coreVersion:'0.2.2',compiler:compiler.version,compilerConfigSha256:sha(readFileSync(join(root,'tools/sdk-build/tsconfig.json'))),sources,outputs},null,2)+'\n');
  const destination = join(root,'sdk/core');
  if(args.includes('--check')) {
    if(JSON.stringify(files(scratch))!==JSON.stringify(files(destination)))throw Error('SDK file membership differs; rebuild intentionally');
    for(const file of files(scratch)) if(!readFileSync(join(scratch,file)).equals(readFileSync(join(destination,file))))throw Error('SDK build drift: '+file);
    console.log('SDK reproducible build matches checked-in JavaScript, declarations and provenance.');
  } else {
    // sdk/core is generated output only. Source and installed consumers are never removed.
    rmSync(destination,{recursive:true,force:true}); mkdirSync(join(root,'sdk'),{recursive:true});cpSync(scratch,destination,{recursive:true});
    console.log('Built SDK from unchanged Core source with strict type checking.');
    if(args.includes('--pack')) {
      const pack = spawnSync('npm',['pack','--ignore-scripts','--json','--pack-destination',join(root,'sdk')],{cwd:destination,encoding:'utf8'});
      if(pack.error || pack.status!==0)throw Error('npm pack failed: '+(pack.stderr??''));
      console.log(pack.stdout);
    }
  }
} finally {rmSync(scratch,{recursive:true,force:true});}
