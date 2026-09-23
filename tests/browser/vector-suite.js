export function revive(v){if(v===null||typeof v!=='object')return v;if(Object.hasOwn(v,'$continuity.bigint'))return BigInt(v['$continuity.bigint']);if(Array.isArray(v))return v.map(revive);return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,revive(x)]));}
export function vectorResult(core,v,histories){
 const events=revive(v.events??histories[v.history.ref]);
 if(v.kind==='replay'){const r=core.replayPortable({operationVersion:v.input.operationVersion,events});return {status:r.status,head:r.head??null};}
 if(v.kind==='authorization'){const r=core.authorizePortable({...revive(v.input),events});return {decision:r.decision,code:r.code??null,scopeAssurance:r.scopeAssurance??null,controllingAuthorityIds:r.proof?.controllingAuthorityIds??null,failureCodes:(r.failures??[]).map(f=>f.code)};}
 const r=core.survivesPortable({...revive(v.input),observedEvents:events.slice(0,v.history.eventCount),disclosure:core.portablePublicQueryDisclosure('SURVIVES')});
 if(!Object.hasOwn(r,'answer'))return {established:false,code:r.code,epistemicStatus:r.epistemicStatus};
 const a=r.answer;return {established:true,exists:a.exists,lifecycleStatus:a.lifecycleStatus,obligationIds:a.obligations.map(x=>x.obligationId??x.record?.obligationId??null).filter(Boolean).sort(),currentAssignments:a.currentPerformanceAssignments.map(x=>({obligationId:x.obligationId,assigneeId:x.assigneeId,successionRuleId:x.successionRuleId??null})),currentRoleTenureCount:a.currentRoleTenures.length,transferredRoleTenureCount:a.transferredRoleTenures.length,invalidatedAuthorityIds:a.invalidatedAuthorityDependencies.map(x=>x.authorityId??x.subjectId??null).filter(Boolean).sort(),unresolvedIntentIds:a.unresolvedIntents.map(x=>x.intentId??null).filter(Boolean).sort()};
}
export function checkExpected(actual,expected,path='result'){
 if(expected!==null&&typeof expected==='object'){
 if(actual===null||typeof actual!=='object'||Array.isArray(actual)!==Array.isArray(expected))throw Error(path+': wrong structure');
 if(Array.isArray(expected)&&actual.length!==expected.length)throw Error(path+': wrong length');
 for(const [k,v]of Object.entries(expected)){if(!Object.hasOwn(actual,k))throw Error(path+'.'+k+': missing');checkExpected(actual[k],v,path+'.'+k);}return;
 }if(!Object.is(actual,expected))throw Error(path+': '+JSON.stringify(actual)+' differs from '+JSON.stringify(expected));
}
