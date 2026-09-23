import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLocalOwner,createLocalAttemptOwner,createLocalReviewOwner,createLocalDomain,openLocalOwner} from '../../packages/core-0.3/src/local-owner.ts';
import {PORTABLE_ADAPTER_POLICY_HASH,PORTABLE_ADAPTER_POLICY_E5_HASH,PORTABLE_ADAPTER_POLICY_E6_HASH} from '../../packages/core-0.2/src/core/index.ts';
test('shared Core preserves the public default and requires explicit E5/E6 new-history selection',()=>{
 const dir=mkdtempSync(join(tmpdir(),'continuity-policy-compat-'));
 try {
  for(const [name,make,hash] of [['existing',createLocalOwner,PORTABLE_ADAPTER_POLICY_HASH],['attempts',createLocalAttemptOwner,PORTABLE_ADAPTER_POLICY_E5_HASH],['review',createLocalReviewOwner,PORTABLE_ADAPTER_POLICY_E6_HASH]]){
   const config={historyFile:join(dir,name+'.jsonl'),domain:createLocalDomain(),owner:'owner',controller:'controller',now:()=>100};
   const owner=make(config);assert.equal(owner.exportHistory()[0].data.adapterPolicyHash,hash);
   const before=owner.exportHistory();assert.deepEqual(openLocalOwner(config).exportHistory(),before);
   assert.throws(()=>createLocalReviewOwner(config));assert.deepEqual(openLocalOwner(config).exportHistory(),before,'creating a different policy must not migrate a history');
  }
 } finally {rmSync(dir,{recursive:true,force:true});}
});
