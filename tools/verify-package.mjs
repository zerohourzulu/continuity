import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const skip=new Set(['.git','node_modules','runs','integrations/core-0.2-reference/cases','integrations/document-release-native/build']);
function walk(dir='',files=[]){for(const entry of readdirSync(join(root,dir))){const rel=dir?`${dir}/${entry}`:entry;if(skip.has(rel)||entry==='node_modules'||entry==='.DS_Store')continue;const stat=lstatSync(join(root,rel));assert(!stat.isSymbolicLink(),`Unexpected link: ${rel}`);if(stat.isDirectory())walk(rel,files);else{assert(stat.isFile(),`Unexpected file type: ${rel}`);files.push(rel);}}return files.sort();}
try{
 const index=JSON.parse(readFileSync(join(root,'PACKAGE-FILES.json'),'utf8'));
 assert.equal(index.schemaVersion,'continuity-evaluation-files/1');
 const expected=index.files.map(row=>row.path).sort();
 assert.equal(new Set(expected).size,expected.length);
 const actual=walk().filter(p=>p!=='PACKAGE-FILES.json');
 const actualSet=new Set(actual),expectedSet=new Set(expected);
 const missing=expected.filter(p=>!actualSet.has(p)),extra=actual.filter(p=>!expectedSet.has(p));
 if(missing.length||extra.length)throw Error(`Package membership differs: ${missing.length} missing, ${extra.length} extra. Missing: ${JSON.stringify(missing.slice(0,5))}; extra: ${JSON.stringify(extra.slice(0,5))}.`);
 let bytes=0;
 for(const row of index.files){assert(!row.path.startsWith('/')&&!row.path.split('/').includes('..'));const body=readFileSync(join(root,row.path));if(body.length!==row.bytes||createHash('sha256').update(body).digest('hex')!==row.sha256)throw Error(`Packaged bytes changed: ${JSON.stringify(row.path)}`);bytes+=body.length;}
 console.log(`VERIFIED PACKAGE: ${expected.length} files, ${bytes} bytes. No product scenario executed.`);
 console.log('The file index is a local integrity record, not a publisher signature. Verify the archive checksum through your selected source.');
}catch(error){console.error(`PACKAGE VERIFICATION FAILED: ${error.message}\nThis checks an untouched distribution, not whether your edits work. For intentional development changes use node tools/test.mjs; keep the original index. For an untouched download, re-extract and verify the published checksum. No files were changed.`);process.exitCode=1;}
