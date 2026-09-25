// Preserve locked third-party dependencies; update only the local private tuple.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url),read=path=>JSON.parse(readFileSync(new URL(path,root)));
const lock=read('tools/release/consumer-lock.json'),index=read('sdk/duty-release/RELEASE-PACKAGES.json');
lock.name='continuity-duty-integration-consumer';lock.packages[''].name=lock.name;
for(const p of index.packages){
 const manifest=read('sdk/duty-release/'+p.part+'/package.json'),resolved='file:packages/'+p.archive;
 if(manifest.private!==true)throw Error('Private build required');
 lock.packages[''].dependencies[p.name]=resolved;
 const row=lock.packages['node_modules/'+p.name];
 row.version=p.version;row.resolved=resolved;row.integrity='sha512-'+createHash('sha512').update(readFileSync(new URL('sdk/duty-release/'+p.archive,root))).digest('base64');
 for(const field of ['dependencies','peerDependencies','peerDependenciesMeta','engines','bin']){
  if(manifest[field]===undefined)delete row[field];else row[field]=manifest[field];
 }
}
writeFileSync(new URL('./consumer-lock.json',import.meta.url),JSON.stringify(lock,null,2)+'\n');
console.log('Private tuple lock updated; third-party pins retained.');
