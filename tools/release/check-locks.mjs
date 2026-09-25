// Fail before installation if a local dependency lock points at stale archive bytes.
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../../',import.meta.url));
for(const file of ['integrations/protected-evidence-mcp/package-lock.json','integrations/langchain-evidence/package-lock.json','integrations/policy-composition/package-lock.json','packages/mcp-gateway/npm-shrinkwrap.json','tools/release/consumer-lock.json']) {
 const lock=JSON.parse(readFileSync(resolve(root,file)));
 for(const [name,row] of Object.entries(lock.packages)) {
  if(!name.startsWith('node_modules/@ramex-labs/')||!row.resolved?.startsWith('file:'))continue;
  const path=file==='tools/release/consumer-lock.json'?resolve(root,'sdk/investigation-release',row.resolved.slice('file:packages/'.length)):resolve(root,dirname(file),row.resolved.slice(5));
  const integrity='sha512-'+createHash('sha512').update(readFileSync(path)).digest('base64');
  if(row.integrity!==integrity)throw Error('Local archive integrity mismatch: '+file+' '+name);
 }
}
console.log('PASS: source and consumer locks match the coordinated local archives.');
