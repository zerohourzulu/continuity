// Private H04 tuple, not a publication command. Published package snapshots stay intact.
import {cpSync,mkdirSync,readFileSync,writeFileSync,rmSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),source=join(root,'packages/mcp-gateway'),out=join(root,'sdk/history-gateway');
const packageJson=JSON.parse(readFileSync(join(source,'package.json')));
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
for(const name of packageJson.files)cpSync(join(source,name),join(out,name),{recursive:true});
packageJson.version='0.3.0-h04.1';packageJson.private=true;delete packageJson.publishConfig;delete packageJson.mcpName;
packageJson.dependencies['@ramex-labs/continuity']='0.3.0-h04.1';packageJson.dependencies['@ramex-labs/continuity-remote']='0.3.0-h04.1';
packageJson.files.push('HISTORY.md','BUILD-PROVENANCE.json');
writeFileSync(join(out,'package.json'),JSON.stringify(packageJson,null,2)+'\n');
cpSync(join(root,'docs/HISTORY-INTEGRATION.md'),join(out,'HISTORY.md'));
writeFileSync(join(out,'README.md'),'# Continuity MCP gateway — private H04 evaluation\n\nVersion 0.3.0-h04.1, with matching private Core and remote dependencies. Not published. Read [HISTORY.md](HISTORY.md) for explicit profile selection, migration and compatibility. Existing examples retain the legacy file profile. The cooperating gateway remains E5-only; late observation is not duty fulfillment. All host identity, paths, signing keys and jobs remain application-controlled.\n');
const walk=(dir,prefix='')=>readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>e.isDirectory()?walk(join(dir,e.name),prefix+e.name+'/'):[prefix+e.name]);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
writeFileSync(join(out,'BUILD-PROVENANCE.json'),JSON.stringify({version:'continuity-h04-gateway-build/1',coreVersion:'0.3.0-h04.1',remoteVersion:'0.3.0-h04.1',sources:walk(join(source,'src')).map(path=>({path:'src/'+path,sha256:sha(readFileSync(join(source,'src',path)))})),outputs:walk(out).map(path=>({path,sha256:sha(readFileSync(join(out,path)))}))},null,2)+'\n');
console.log('Private gateway built; published snapshot unchanged');
