// Explicit browser evaluation profile; the published Node SDK is never modified.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PortableFileEventStore} from '../sdk/core/dist/indexer/portable-file-event-store.js';
const root=new URL('../',import.meta.url), dst=new URL('website/playground/engine/',root);
const check=process.argv.length===3&&process.argv[2]==='--check';
if(process.argv.length>2&&!check)throw Error('Use: node tools/build-playground.mjs [--check]');
if(!check)mkdirSync(dst,{recursive:true});
const write=(url,data)=>{if(check){if(!readFileSync(url).equals(Buffer.from(data)))throw Error('Browser build drift: '+url.pathname);}else writeFileSync(url,data);};
const rows=[];
for(const name of readdirSync(new URL('sdk/core/dist/core/',root)).filter(x=>x.endsWith('.js')).sort()){
 const source=readFileSync(new URL('sdk/core/dist/core/'+name,root),'utf8');
 const output=source.replace('from "node:util"','from "../host-profile.js"');
 if(/from ["']node:/.test(output))throw Error('Unadapted host dependency: '+name);
 write(new URL(name,dst),output);
 rows.push({path:name,sourceSha256:createHash('sha256').update(source).digest('hex'),browserSha256:createHash('sha256').update(output).digest('hex'),hostImportAdapted:source!==output});
}
const events=new PortableFileEventStore(new URL('tests/fixtures/handover-history.jsonl',root).pathname).readAll();
write(new URL('website/playground/fixture.json',root),JSON.stringify(events,(_,v)=>typeof v==='bigint'?{$bigint:v.toString()}:v));
write(new URL('website/playground/ENGINE-PROVENANCE.json',root),JSON.stringify({profile:'continuity-json-worker-evaluation/1',core:'0.2.2',nodeSdk:'0.2.2-sdk.1',boundary:'JSON text only; no supplied code, adapters, filesystem or credentials',modules:rows},null,2)+'\n');
console.log('Prepared '+rows.length+' engine modules; explicit structured-clone host profile, original Node SDK unchanged.');

write(new URL('website/playground/strict-json.mjs',root),readFileSync(new URL('integrations/retained-evidence-mcp/src/strict-json.mjs',root)));
