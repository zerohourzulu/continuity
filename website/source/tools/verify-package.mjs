import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const skip=new Set(['.git','node_modules','runs','integrations/core-0.2-reference/cases','integrations/document-release-native/build']);
function walk(dir='',files=[]){for(const entry of readdirSync(join(root,dir))){const rel=dir?`${dir}/${entry}`:entry;if(skip.has(rel)||entry==='.DS_Store')continue;const stat=lstatSync(join(root,rel));assert(!stat.isSymbolicLink(),`Unexpected link: ${rel}`);if(stat.isDirectory())walk(rel,files);else{assert(stat.isFile(),`Unexpected file type: ${rel}`);files.push(rel);}}return files.sort();}
try{
 const index=JSON.parse(readFileSync(join(root,'PACKAGE-FILES.json'),'utf8'));
 assert.equal(index.schemaVersion,'continuity-evaluation-files/1');
 const expected=index.files.map(row=>row.path).sort();
 assert.equal(new Set(expected).size,expected.length);
 assert.deepEqual(walk().filter(p=>p!=='PACKAGE-FILES.json'),expected,'Package membership differs');
 let bytes=0;
 for(const row of index.files){assert(!row.path.startsWith('/')&&!row.path.split('/').includes('..'));const body=readFileSync(join(root,row.path));assert.equal(body.length,row.bytes,`Size differs: ${row.path}`);assert.equal(createHash('sha256').update(body).digest('hex'),row.sha256,`Hash differs: ${row.path}`);bytes+=body.length;}
 console.log(`VERIFIED PACKAGE: ${expected.length} files, ${bytes} bytes. No product scenario executed.`);
 console.log('The file index is a local integrity record, not a publisher signature. Verify the archive checksum through your selected source.');
}catch(error){console.error(`PACKAGE VERIFICATION FAILED: ${error.message}`);process.exitCode=1;}
