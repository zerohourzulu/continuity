// Standalone application: imports only the installed, packed JavaScript SDK.
// PUBLIC synthetic fixture signatures; no production credentials or network.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, realpathSync, existsSync, writeFileSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { replayPortable, PORTABLE_REPLAY_VERSION } from '@continuity/core-0.2';
import { DurableAdmissionCoordinator } from '@continuity/core-0.2/sdk/admission';
import { PortableFileEventStore } from '@continuity/core-0.2/store';
import { createPacketExecutor } from './packet-executor.mjs';
const root = fileURLToPath(new URL('./',import.meta.url));
const config = JSON.parse(readFileSync(join(root,'case.json')));
const input = JSON.parse(readFileSync(join(root,'admission.json'))).input;
const home = realpathSync(mkdtempSync(join(tmpdir(),'continuity-consumer-')));
const rows = [];
for (const mode of ['allow','control-lost','revoked-before-admission','forged','changed-request','input-changed']) {
  const dir = join(home,mode);mkdirSync(dir);const output=join(dir,'output');mkdirSync(output);
  const selectedInput=join(dir,'input');cpSync(join(root,'input'),selectedInput,{recursive:true});
  if(mode==='input-changed')writeFileSync(join(selectedInput,'agent.log'),'changed synthetic input');
  const store = new PortableFileEventStore(join(dir,'history.jsonl'));store.appendAll(input.events);
  const executor = createPacketExecutor({inputDirectory:selectedInput,outputDirectory:output,selection:config.selection,termsCommitment:config.termsCommitment,resource:input.request.resource,domain:config.domain,intentId:input.binding.intentId});
  let calls = 0;
  const adapter = {adapterProfile:executor.adapterProfile,submit(value){calls++;return executor.submit(value);},reconcile:value=>executor.reconcile(value)};
  const replay = ()=>replayPortable({operationVersion:PORTABLE_REPLAY_VERSION,events:store.readAll()});
  const coordinator = new DurableAdmissionCoordinator(store,adapter,{authoritativeNow:()=>replay().head.canonicalTime+1});
  if(mode==='revoked-before-admission')store.appendAtExpectedHead({id:'example:revoked',type:'AUTHORITY_REVOKED',timestamp:replay().head.canonicalTime+1,data:{authorityId:`collect-authority:${config.caseId}`,revokerId:`principal:${config.caseId}`}},replay().head);
  const request = structuredClone(input);if(mode==='changed-request')request.request.resource='resource:ungranted';
  const admitted = coordinator.admit(coordinator.prepare(request));
  let result;
  if(mode==='changed-request'||mode==='revoked-before-admission') { assert.notEqual(admitted.status,'ADMITTED');result={status:admitted.status}; }
  else {
    assert.equal(admitted.status,'ADMITTED');
    if(mode==='control-lost')store.appendAtExpectedHead({id:'example:control-lost',type:'CONTROL_EPOCH_ADVANCED',timestamp:replay().head.canonicalTime+1,data:{agentId:input.request.actorId,controllerId:`controller:${config.caseId}`,fromEpoch:1,toEpoch:2}},replay().head);
    result=await coordinator.invoke(mode==='forged'?{...admitted.capability}:admitted.capability);
    assert.equal((await coordinator.invoke(mode==='forged'?{...admitted.capability}:admitted.capability)).status,'NOT_INVOKED');
  }
  const packet=existsSync(join(output,'packet/manifest.json'));
  if(mode==='allow'){assert.equal(result.status,'SUBMITTED');assert.equal(result.recorded,true);assert.equal(calls,1);assert.equal(packet,true);assert.equal(executor.inspect().status,'PACKET_VERIFIED');
    for(const item of config.selection)assert.deepEqual(readFileSync(join(output,'packet/files',item.name)),readFileSync(join(root,'input',item.name)));
    // A fresh coordinator may read retained evidence; it never resubmits.
    const recovery = new DurableAdmissionCoordinator(store,adapter,{authoritativeNow:()=>replay().head.canonicalTime+1});
    assert.equal((await recovery.reconcile(input.binding.intentId)).status,'RETRY');assert.equal(calls,1);
  } else if(mode==='input-changed') {assert.equal(result.status,'OUTCOME_UNKNOWN');assert.equal(calls,1);assert.equal(packet,false);assert.equal((await coordinator.reconcile(input.binding.intentId)).status,'OUTCOME_UNKNOWN');assert.equal(calls,1);}
  else {assert.equal(calls,0);assert.equal(packet,false);}
  rows.push({mode,status:result.status,adapterCalls:calls,packetCreated:packet,head:replay().head});
}
const report={scope:'SYNTHETIC_TRUSTED_HOST',root:home,rows};writeFileSync(join(home,'result.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify(report,null,2));
console.log('PASS: one permitted local packet; rejected paths made no packet. Evidence retained at '+home);
