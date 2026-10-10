// Root-owned integrated source/evidence bundle. No installation, evaluation or publication.
import {readFile,writeFile,mkdir,readdir,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {resolveProfile} from '../src/profile.mjs';
const repo=fileURLToPath(new URL('../../../',import.meta.url));
const reader=path.join(repo,'integrations/retained-evidence-mcp');
const sha=b=>createHash('sha256').update(b).digest('hex');
const fail=m=>{throw new Error(m);};
async function regular(p){const stat=await lstat(p);if(!stat.isFile()||stat.isSymbolicLink())fail('NONREGULAR_PACKAGE_SOURCE');return readFile(p);}
async function walk(p){const result=[];for(const name of (await readdir(p)).sort()){if(name==='node_modules'||name.startsWith('.'))continue;const child=path.join(p,name),s=await lstat(child);if(s.isSymbolicLink())fail('SYMLINK_PACKAGE_SOURCE');if(s.isDirectory())result.push(...await walk(child));else if(s.isFile())result.push(child);else fail('NONREGULAR_PACKAGE_SOURCE');}return result;}
async function main(){
 const [name,...extra]=process.argv.slice(2);
 if(extra.length||!/^continuity-0\.2-mcp-2026-09-11-r(?:[4-9]|[1-9][0-9]+)$/.test(name??''))fail('Usage: node scripts/package-source.mjs continuity-0.2-mcp-2026-09-11-rN (N >= 4)');
 const target=path.join(repo,'deliverables',name),archive=target+'.tar.gz';
 const catalogs=[];
 for(const name of ['cheshire','security','durable-security','core02-packet','core02-simulated']){
  const profile=resolveProfile(name),raw=await regular(path.join(profile.bundleDir,'catalog.json'));
  if(sha(raw)!==profile.expectedCatalogSha256)fail('CATALOG_PIN_MISMATCH');const c=JSON.parse(raw.toString('utf8'));
  if(JSON.stringify(c.members.map(m=>m.evidenceId))!==JSON.stringify(profile.evidenceIds))fail('CATALOG_MEMBERSHIP');
  for(const m of c.members){if(!/^[A-Za-z0-9.]+\.(?:json|log)$/.test(m.fileName))fail('UNSAFE_MEMBER');const b=await regular(path.join(profile.bundleDir,m.fileName));if(b.length!==m.bytes||sha(b)!==m.sha256)fail('EVIDENCE_CHANGED');}
  catalogs.push({profile:name,catalogId:profile.catalogId,catalogSha256:profile.expectedCatalogSha256,artifacts:c.members.length,bytes:c.members.reduce((n,m)=>n+m.bytes,0),scope:profile.scope});
 }
 const files=[...await walk(reader),...await walk(path.join(repo,'integrations/core02-evidence-consumer')),...await walk(path.join(repo,'packages/core-0.2/src')),...await walk(path.join(repo,'docs/development/CORE-0.2-EVIDENCE-INTERFACE-2026-09-11'))];
 for(const rel of ['packages/core-0.2/package.json','packages/core-0.2/README.md','docs/decisions/ADR-0036-common-adapter-acknowledgment-contract.md','docs/development/CORE-0.2-COMMON-ENGINE-2026-09-11/CONTRACT.md','docs/reviews/CORE-0.2-EVIDENCE-INTERFACE-ACCEPTANCE-2026-09-11.md'])files.push(path.join(repo,rel));
 const payloads=[];for(const p of [...new Set(files)].sort())payloads.push({name:path.relative(repo,p),bytes:await regular(p)});
 try{await lstat(archive);fail('ARCHIVE_ALREADY_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
 await mkdir(target);const members=[];
 for(const p of payloads){const dest=path.join(target,p.name);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,p.bytes,{flag:'wx'});members.push({path:p.name,bytes:p.bytes.length,sha256:sha(p.bytes)});}
 const introduction=Buffer.from('# Continuity 0.2 — common-engine evidence interface\n\n'+
 'Two fixed Core0.2 profiles now join the three preserved earlier examples. Every original case export and manifest remains retrievable through the same MCP interface. A matching-version caller checks accepted Core source identity, replays the retained histories, verifies receipts/queries and separately hashes the actual packet files.\n\n'+
 '- [Start the one-command comparison](integrations/core02-evidence-consumer/README.md)\n- [Use the evidence reader](integrations/retained-evidence-mcp/README.md)\n- [Actual result](docs/development/CORE-0.2-EVIDENCE-INTERFACE-2026-09-11/RESULTS.md)\n- [Root provisional acceptance](docs/reviews/CORE-0.2-EVIDENCE-INTERFACE-ACCEPTANCE-2026-09-11.md)\n- [Complete file identities](MANIFEST.json)\n\n'+
 'This is a private repository-context source/evidence bundle with unchanged locked reader dependencies and accepted Core source. Use Node24 and the existing checkout dependencies; Node and node_modules are not bundled. Historical source documents may link to earlier evidence in the original checkout. No public release, new case/action/signature/executor or external observation occurred. Retained canonical-time verification does not grant current authority or prove incident resolution.\n');
 await writeFile(path.join(target,'README.md'),introduction,{flag:'wx'});members.push({path:'README.md',bytes:introduction.length,sha256:sha(introduction)});
 const manifest={schemaVersion:'continuity-integrated-evidence-source/1',name,createdAt:new Date().toISOString(),status:'LOCAL_PRIVATE_SOURCE_EVIDENCE_NOT_PUBLISHED',readerVersion:'0.2.0-dev.4',commonCoreVersion:'0.2',commonCorePackageVersion:'0.2.0',catalogs,members};
 await writeFile(path.join(target,'MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 const tar=spawnSync('/usr/bin/tar',['-czf',archive,'-C',path.dirname(target),name],{encoding:'utf8',env:{...process.env,COPYFILE_DISABLE:'1'}});if(tar.status!==0)fail('ARCHIVE_FAILED');
 const raw=await readFile(archive);await writeFile(archive+'.sha256',sha(raw)+'  '+path.basename(archive)+'\n',{flag:'wx'});
 process.stdout.write(JSON.stringify({bundle:path.relative(repo,target),archive:path.relative(repo,archive),archiveBytes:raw.length,archiveSha256:sha(raw),payloadFiles:members.length,payloadBytes:members.reduce((n,m)=>n+m.bytes,0),manifestSha256:sha(await readFile(path.join(target,'MANIFEST.json'))),runtimeDuringPackaging:false})+'\n');
}
main().catch(e=>{process.stderr.write(e.message+'\n');process.exitCode=1;});
