// Verify the archive as a separate application, not through repository imports.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, cpSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const scratch=mkdtempSync(join(tmpdir(),'continuity-core03-consumer-'));
const run=(cmd,args,options={})=>{
  const p=spawnSync(cmd,args,{cwd:scratch,encoding:'utf8',timeout:120000,
    env:{...process.env,npm_config_cache:process.env.npm_config_cache??join(scratch,'npm-cache')},...options});
  if(p.error||p.status!==0)throw Error(`${cmd} failed: ${p.error?.message??p.stderr}`);
  return p.stdout;
};
const files=(dir,prefix='')=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name),prefix+e.name+'/'):[prefix+e.name]).sort();
try {
  writeFileSync(join(scratch,'package.json'),JSON.stringify({private:true,type:'module'}));
  run('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund',join(root,'sdk/investigation-release/ramex-labs-continuity-0.3.0-preview.10.tgz')]);
  const installed=join(scratch,'node_modules/@ramex-labs/continuity'), generated=join(root,'sdk/investigation-release/core');
  assert.deepEqual(files(installed),files(generated));
  for(const path of files(generated))assert.deepEqual(readFileSync(join(installed,path)),readFileSync(join(generated,path)),path);
  cpSync(join(root,'examples/core-0.3/permissions.mjs'),join(scratch,'permissions.mjs'));
  const output=run(process.execPath,['--no-experimental-strip-types','permissions.mjs']);
  for(const expected of ['A job title alone: DENY','With permission: ALLOW','After withdrawal: DENY','After reopening: DENY'])assert(output.includes(expected),expected);
  writeFileSync(join(scratch,'exports.mjs'),`import assert from 'node:assert/strict';
import {observeHistory,ContinuityError} from '@ramex-labs/continuity';
import {createLocalDomain,createLocalOwner,openLocalOwner} from '@ramex-labs/continuity/local';
for(const fn of [observeHistory,ContinuityError,createLocalDomain,createLocalOwner,openLocalOwner])assert.equal(typeof fn,'function');
await assert.rejects(import('@ramex-labs/continuity/dist/core-0.2/src/core/index.js'),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
`);
  run(process.execPath,['--no-experimental-strip-types','exports.mjs']);
  writeFileSync(join(scratch,'consumer.mts'),`import {observeHistory, type Action, type HistoryEvent} from '@ramex-labs/continuity';
import {createLocalOwner, type LocalOwnerOptions} from '@ramex-labs/continuity/local';
import {openLocalEvidenceTool, type EvidenceToolOptions} from '@ramex-labs/continuity/evidence';
import type {AdditionalPolicy} from '@ramex-labs/continuity/policy';
export function protectedTool(options:EvidenceToolOptions, additionalPolicy:AdditionalPolicy) {return openLocalEvidenceTool({...options,additionalPolicy});}
import {openLocalRuntime, type Obligation, type LocalRuntimeOptions} from '@ramex-labs/continuity/runtime';
import {openLocalSimulation, commitTerms} from '@ramex-labs/continuity/simulation';
export async function signed(options:LocalRuntimeOptions, obligation:Obligation) {
 const runtime=openLocalRuntime(options);
 await runtime.obligate(obligation);
 await runtime.assign({id:'assignment',obligation:obligation.id});
 const result=await openLocalSimulation(options).run({id:'operation',action:'read',resource:'incident:42',role:'reviewer',tenure:'shift',termsCommitment:commitTerms({work:'review'})});
 // @ts-expect-error runtime cannot grant authority.
 runtime.grant({});
 return result;
}
const q: Action={actor:'bea',action:'read',resource:'incident:42'};
export function observe(events: readonly HistoryEvent[]) {return observeHistory(events).why(q);}
export function manage(options: LocalOwnerOptions) {
 const owner=createLocalOwner(options);
 owner.createAgent({id:'bea'});
 owner.grant({id:'g',to:'bea',actions:['read'],resources:['incident:42'],expiresAt:100});
 const noExecution: false=owner.authorize(q).executionCapability;
 // @ts-expect-error request quantity is bigint, never an imprecise number.
 owner.authorize({...q,amount:1});
 // @ts-expect-error callers cannot supply a grantor through the public operation.
 owner.grant({id:'h',to:'bea',actions:['read'],resources:['incident:42'],expiresAt:100,grantor:'other'});
 return noExecution;
}
`);
  run(process.execPath,[join(root,'tools/sdk-build/node_modules/typescript/bin/tsc'),'--strict','--noEmit','--module','NodeNext',
    '--moduleResolution','NodeNext','--target','ES2022','--types','node','--typeRoots',join(root,'tools/sdk-build/node_modules/@types'),'consumer.mts']);
  cpSync(join(root,'examples/core-0.3/signing/package.json'),join(scratch,'package.json'));
  cpSync(join(root,'examples/core-0.3/signing/package-lock.json'),join(scratch,'package-lock.json'));
  // The optional signing example has registry dependencies. Its fresh cache
  // is independent of the dependency-free SDK's offline install above.
  run('npm',['ci','--prefer-offline','--ignore-scripts','--no-audit','--no-fund']);
  run('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund',join(root,'sdk/investigation-release/ramex-labs-continuity-0.3.0-preview.10.tgz')]);
  cpSync(join(root,'examples/core-0.3/handover.mjs'),join(scratch,'handover.mjs'));
  const handover=run(process.execPath,['--no-experimental-strip-types','handover.mjs']);
  for(const expected of ['Simulation: SUBMITTED','Signed receipt: ADMITTED','Old live process: RUNTIME_NOT_CURRENT','Replacement can read? DENY','Duty: OPEN','Repeated operation: RECONCILIATION_ONLY'])assert(handover.includes(expected),expected);
  console.log(handover);
  console.log('PASS: installed archive bytes, public exports, blocked internal import, strict TypeScript consumer and both fresh-case examples.');
  console.log(output);
} finally {rmSync(scratch,{recursive:true,force:true});}
