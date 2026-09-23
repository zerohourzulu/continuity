import{test}from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import * as node from '../../sdk/core/dist/core/index.js';import * as browser from '../../website/playground/engine/index.js';
import{vectorResult,checkExpected}from'./vector-suite.js';
const load=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
const vectors=load('../../conformance/vectors.json'),histories=Object.fromEntries([['first-look','handover-history'],['no-review-power','handover-denied-history'],['mandate','mandate-history']].map(([id,n])=>[id,load('../fixtures/'+n+'.json')]));
histories['mandate-quantitative-only']=histories.mandate.slice(0,6);
for(const v of vectors)test('browser profile vector '+v.id,()=>{const a=vectorResult(node,v,histories),b=vectorResult(browser,v,histories);checkExpected(b,v.expect);assert.deepEqual(a,b);});
