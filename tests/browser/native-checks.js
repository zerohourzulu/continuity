import * as core from '../../website/playground/engine-api.js';
import{vectorResult,checkExpected}from'./vector-suite.js';
import{scenarios}from'./scenarios.mjs';
import{parseCase,runCase}from'../../website/playground/model.js';
const read=async p=>{const r=await fetch(p);if(!r.ok)throw Error('Cannot load '+p);return r.json();};
const lines=[],report=document.getElementById('report');
try{const vectors=await read('../../conformance/vectors.json');const histories={};for(const [id,n]of [['first-look','handover-history'],['no-review-power','handover-denied-history'],['mandate','mandate-history']])histories[id]=await read('../fixtures/'+n+'.json');
histories['mandate-quantitative-only']=histories.mandate.slice(0,6);
for(const v of vectors){checkExpected(vectorResult(core,v,histories),v.expect);lines.push('PASS '+v.id);report.textContent=lines.join('\n');}
const fixture=await read('../../website/playground/fixture.json');for(const [name,c,decision]of scenarios){const r=runCase(core,parseCase(JSON.stringify(c)),fixture);checkExpected(r.decision,decision);lines.push('PASS '+name);}
report.textContent=lines.join('\n')+'\nPASS: '+vectors.length+' vectors and '+scenarios.length+' scenarios.';document.body.dataset.result='PASS';
}catch(e){report.textContent=lines.join('\n')+'\nFAIL: '+e.message;document.body.dataset.result='FAIL';}
