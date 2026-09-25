import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,realpathSync,writeFileSync,readFileSync,chmodSync,chownSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {createHash,generateKeyPairSync,randomBytes} from 'node:crypto';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {createLocalAttemptOwner,createLocalDomain,openLocalOwner} from '../../packages/core-0.3/src/local-owner.ts';
import {prepareMigration,stageMigration,activateMigration} from '../../packages/core-0.3/src/history-store/index.ts';
import {openConfiguredEventStore} from '../../packages/core-0.3/src/configured-store.ts';
import {openLocalAttemptRecorder,inspectContinuationAttempts} from '../../packages/core-0.3/src/attempts.ts';
import {stateOf} from '../../packages/core-0.3/src/local-store.ts';
import {protectedEvidenceProfile} from '../../packages/remote-tools/protected-evidence.mjs';
import {createCooperativeClient} from '../../packages/remote-tools/client.mjs';
import {createCooperativeExecutor} from '../../packages/remote-tools/executor.mjs';
import {createCooperativeRecovery} from '../../packages/remote-tools/recovery.mjs';
import {encodeTransport} from '../../packages/remote-tools/wire.mjs';
import {investigateDuty} from './investigation.mjs';
import {lossyRelay} from '../../packages/mcp-gateway/examples/lossy-relay.mjs';

const json=value=>JSON.stringify(value,(_key,item)=>typeof item==='bigint'?item.toString():item);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const profile='continuity-segmented-local/1';
const pem=(key,type)=>key.export({format:'pem',type});
function child(identity){
  const process=fork(new URL('./process.mjs',import.meta.url),[],{serialization:'advanced',stdio:['ignore','inherit','inherit','ipc'],...(identity??{})});
  let next=0;const pending=new Map();
  process.on('message',message=>{const promise=pending.get(message.id);if(!promise)return;pending.delete(message.id);message.error?promise.reject(Error(message.error)):promise.resolve(message);});
  process.on('exit',()=>{for(const p of pending.values())p.reject(Error('CHILD_EXITED'));pending.clear();});
  return {process,async call(command,body={}){const id=++next;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});process.send({id,command,...body});});},
    async stop(){if(process.exitCode!==null||process.signalCode!==null||!process.connected)return;const exited=once(process,'exit');process.disconnect();await exited;}};
}

/** Run one case. Linux identities are provisioned explicitly by the lab operator. */
export async function runProtectedScenario({identities,windows=124,investigation=false,onStage=()=>{}}={}) {
  if(!Number.isSafeInteger(windows)||windows<124||windows>130)throw Error('Use 124–130 review windows');
  if(identities&&(process.platform!=='linux'||process.getuid()!==0))throw Error('Linux identity demonstration requires the trusted root launcher');
  const dir=realpathSync(mkdtempSync(join(tmpdir(),'ct-h05-')));chmodSync(dir,0o711);
  const makeDir=(name,mode,identity)=>{const path=join(dir,name);mkdirSync(path,{mode});if(identity)chownSync(path,identity.uid,identity.gid);return path;};
  const host=makeDir('host',0o700),bundle=makeDir('bundle',0o700),destinationDirectory=makeDir('service',0o700),socketDirectory=makeDir('reader',0o710);
  const reviewerDirectory=makeDir('reviewer',0o700);
  const content=Buffer.from('Synthetic incident 47\nUnexpected reader observed. Preserve the report and investigate.\n');
  const bundleFile=join(bundle,'incident.txt');writeFileSync(bundleFile,content,{mode:0o400});
  const token=randomBytes(32).toString('hex'),socketPath=join(socketDirectory,'evidence.sock');
  const evidence={bundleDirectory:bundle,files:[{name:'incident.txt',bytes:content.length,sha256:sha(content)}],resource:'evidence:incident-47',reviewerTokenHash:sha(token),socketPath};
  // Compute the fixed contract while the trusted host still owns the fixture.
  const registry=protectedEvidenceProfile(evidence).registry;
  const reviewerConfig=join(reviewerDirectory,'read.json');writeFileSync(reviewerConfig,JSON.stringify({socketPath,token}),{mode:0o600});
  const coordinator=generateKeyPairSync('ed25519'),provider=generateKeyPairSync('ed25519');
  const coordinatorFile=join(host,'coordinator.pem');writeFileSync(coordinatorFile,pem(coordinator.privateKey,'pkcs8'),{mode:0o600});
  if(identities){
    for(const path of [bundle,bundleFile,destinationDirectory,socketDirectory])chownSync(path,identities.service.uid,identities.service.gid);
    for(const path of [reviewerDirectory,reviewerConfig])chownSync(path,identities.reviewer.uid,identities.reviewer.gid);
  }
  const runtimeKeys={old:generatePrivateKey(),next:generatePrivateKey()};
  const accounts={old:privateKeyToAccount(runtimeKeys.old),next:privateKeyToAccount(runtimeKeys.next)};
  const base={historyFile:join(host,'history.jsonl'),domain:createLocalDomain(),owner:'incident-owner',controller:'incident-controller',now:()=>100};
  let owner=createLocalAttemptOwner(base);
  owner.createAgent({id:'old'});owner.createAgent({id:'next'});owner.createAgent({id:'review-scheduler'});owner.createRole({id:'investigator'});
  owner.appoint({agent:'old',role:'investigator',tenure:'shift:1',number:1});
  owner.admitRuntime({agent:'old',session:'runtime:old',epoch:1,key:'key:old',address:accounts.old.address,expiresAt:10000});
  owner.grant({id:'restrict-once',to:'old',actions:['restrict-evidence'],resources:[evidence.resource],maxTransactions:1,expiresAt:10000});
  owner.grant({id:'revoked-restore',to:'old',actions:['restore-evidence'],resources:[evidence.resource],expiresAt:10000});
  owner.revoke('revoked-restore');
  owner.grant({id:'old-investigation',to:'old',actions:['CREATE_ATTEMPT_DUTY'],resources:['restriction:47'],expiresAt:10000});
  let localBase=base;
  const local=agent=>({...localBase,session:`runtime:${agent}`,signHash:hash=>accounts[agent].signMessage({message:{raw:hash}})});
  const serviceOptions={initialize:true,directory:destinationDirectory,domain:base.domain,evidence,historyProfile:profile,
    coordinatorPublicKey:pem(coordinator.publicKey,'spki'),servicePrivateKey:pem(provider.privateKey,'pkcs8')};
  let service,relay,client;const children=[];const stages=[];
  const emit=(stage,data={})=>{const value={stage,...data};stages.push(value);onStage(value);};
  const start=async()=>{
    service=child(identities?.service);children.push(service);
    const started=(await service.call('service-start',{options:serviceOptions})).result;
    assert.equal(started.contractId,registry.contractId);serviceOptions.initialize=false;
    relay=await lossyRelay(started.url);
    client=createCooperativeClient({url:relay.url,serviceId:registry.serviceId,coordinatorPrivateKey:coordinator.privateKey,servicePublicKey:provider.publicKey,timeoutMs:10000});
    return started;
  };
  const state=()=>stateOf(owner.exportHistory());
  const handle=()=>openConfiguredEventStore(local('old')).directoryStore.snapshot().history;
  const attempts=()=>inspectContinuationAttempts(handle()).attempts.filter(attempt=>attempt.intentId==='restriction:47');
  const controls=()=>{
    assert.equal(owner.authorize({actor:'old',action:'restrict-evidence',resource:evidence.resource}).decision,'DENY');
    assert.equal(owner.authorize({actor:'old',action:'restore-evidence',resource:evidence.resource}).decision,'DENY');
  };
  const request={operationId:'restriction:47',businessKey:'restriction:47',tool:'evidence.restrict',arguments:{reason:'Investigate unexpected reader'}};
  const workers={old:child(identities?.old),next:child(identities?.next)},reviewer=child(identities?.reviewer);
  children.push(...Object.values(workers),reviewer);
  const read=async()=> (await reviewer.call('review',{configFile:reviewerConfig})).result;
  const run=async(agent,request)=>{
    const proposal=(await workers[agent].call('work',{request})).proposal;
    try{return await createCooperativeExecutor({local:local(agent),client,registry,role:'investigator',tenure:agent==='old'?'shift:1':'shift:2'}).run(proposal);}
    catch(error){return {error:error.code??error.message};}
  };
  try{
    // Explicit migration preserves a real owner-created case; no synthetic padding.
    const expectedHead=state().head,planFile=join(host,'migration.json'),binding=join(host,'binding.json');
    prepareMigration({sourceFile:base.historyFile,targetDirectory:join(host,'continued-history'),planFile,expectedHead,configurationFiles:[binding],artifactFiles:[],quiesced:true});
    stageMigration(planFile,{quiesced:true});activateMigration(planFile,{quiesced:true});
    const {historyFile,...common}=base;localBase={...common,historyProfile:profile,historyBinding:binding};owner=openLocalOwner(localBase);
    const started=await start();
    const baseline=await read();assert.equal(baseline.status,200);assert.equal(Buffer.from(baseline.body.files[0].base64,'base64').toString(),content.toString());
    if(identities){
      for(const worker of Object.values(workers)){
        const probe=(await worker.call('probe',{paths:[bundleFile,coordinatorFile,reviewerConfig,join(host,'binding.json')],socketPath,url:started.url})).result;
        assert.ok(probe.files.every(f=>!f.readable&&f.code==='EACCES'));assert.equal(probe.socket,'EACCES');assert.equal(probe.unsignedWrite,400);
        emit('worker-isolation',probe);
      }
    }
    relay.behavior.dropAfter='commit';
    const lost=await run('old',request);assert.equal(lost.execution?.invocation?.status,'OUTCOME_UNKNOWN',json(lost));
    delete relay.behavior.dropAfter;
    assert.equal((await read()).status,403);
    assert.equal((await service.call('inspect')).result.effects.length,1);
    await openLocalAttemptRecorder(local('old')).createDuty({id:'investigate:47',intent:request.operationId,description:'Find the durable result of the restriction and report it.',deadline:10000});
    controls();const retainedUsage=[...state().authorityUsage],originalDuty=attempts()[0].duty.record;
    assert.equal(state().intentConsumptions.size,0); // Unknown result reserves the one permitted admission; it is not a consumed receipt.
    emit('reply-lost-access-closed',{events:owner.exportHistory().length,duty:originalDuty.status,spentAdmissionPreserved:true});
    // Real administration records: unrelated, bounded review windows are opened
    // and then withdrawn. None renews the investigator's restriction allowance.
    for(let i=0;i<windows;i++){
      owner.grant({id:`review-window:${i}`,to:'review-scheduler',actions:['review-metadata'],resources:[`review-window:${i}`],expiresAt:10000,maxTransactions:1});
      owner.revoke(`review-window:${i}`);
      if((i+1)%20===0)emit('review-windows-recorded',{windows:i+1,events:owner.exportHistory().length});
    }
    assert.ok(owner.exportHistory().length>256);controls();for(const [id,usage] of retainedUsage)assert.deepEqual(state().authorityUsage.get(id),usage);
    assert.deepEqual(attempts()[0].duty.record,originalDuty);assert.equal(attempts()[0].reportStatus,'NO_RECORDED_REPORTS');
    await run('old',{...request,operationId:'second-restriction',businessKey:'second-restriction'});
    assert.equal(state().intentAdmissions.has('second-restriction'),false);assert.equal((await service.call('inspect')).result.effects.length,1);
    emit('continued-same-case',{events:owner.exportHistory().length,segments:openConfiguredEventStore(local('old')).directoryStore.snapshot().manifest.segments.length,spentAndRevokedDenied:true});
    owner.declareSuccession({id:'replacement',from:'old',to:'next',role:'investigator'});
    owner.succeed({id:'handover:2',rule:'replacement',fromAgent:'old',fromTenure:'shift:1',toAgent:'next',toTenure:'shift:2',role:'investigator',number:2});
    owner.admitRuntime({agent:'next',session:'runtime:next',epoch:1,key:'key:next',address:accounts.next.address,expiresAt:10000});
    const nextRecorder=openLocalAttemptRecorder(local('next'));
    await assert.rejects(nextRecorder.assignDuty({id:'assignment:47',duty:'investigate:47'}));
    owner.grant({id:'next-investigation',to:'next',actions:['OBSERVE_OUTCOME','ASSIGN_ATTEMPT_DUTY'],resources:[request.operationId],expiresAt:10000});
    await nextRecorder.assignDuty({id:'assignment:47',duty:'investigate:47'});
    assert.equal(owner.authorize({actor:'next',action:'restore-evidence',resource:evidence.resource}).decision,'DENY');
    assert.equal((await client.checkpointHistory(handle())).result.state,'CHECKPOINTED');
    const oldPid=(await workers.old.call('ping')).result.pid;
    const stale=await run('old',{operationId:'stale-restore',businessKey:'stale-restore',tool:'evidence.restore',arguments:{reason:'Old worker still running'}});
    assert.equal(stale.error,'RUNTIME_NOT_CURRENT');assert.equal(state().intentAdmissions.has('stale-restore'),false);assert.equal((await service.call('inspect')).result.effects.length,1);
    assert.equal((await workers.old.call('ping')).result.pid,oldPid);
    emit('replacement-old-process-alive',{oldPid,refusal:stale.error??stale.execution?.status,dutyAssignee:attempts()[0].duty.currentAssigneeId,restorationStillDenied:true});
    const beforeRestart=(await service.call('inspect')).result;
    await relay.close();relay=null;await service.call('close');await service.stop();
    // Reopen coordinator objects, history and destination from durable state.
    owner=openLocalOwner(localBase);await start();controls();assert.equal((await read()).status,403);
    assert.deepEqual((await service.call('inspect')).result,beforeRestart);
    const recoveryFile=join(host,'recovery.bin');
    const {now,...serialLocal}=localBase;
    writeFileSync(recoveryFile,encodeTransport({local:serialLocal,runtimeKey:runtimeKeys.next,
      coordinatorKey:pem(coordinator.privateKey,'pkcs8'),serviceKey:pem(provider.publicKey,'spki'),url:relay.url,
      registry:{serviceId:registry.serviceId,account:registry.account,tools:registry.tools},request,resource:evidence.resource}),{mode:0o600});
    const freshHost=child();children.push(freshHost);
    const recovered=(await freshHost.call('coordinator-recover',{configFile:recoveryFile})).result;
    assert.equal(recovered.dispatchPerformed,false);assert.equal(recovered.report,'APPLIED');assert.notEqual(recovered.pid,process.pid);
    assert.equal((await service.call('inspect')).result.effects.length,1);assert.equal((await read()).status,403);
    emit('recovered-original-result',recovered);
    const restoration={operationId:'restoration:47',businessKey:'restoration:47',tool:'evidence.restore',arguments:{reason:'Separately approved restoration after investigation'}};
    const proposed=(await workers.next.call('work',{request:restoration})).proposal;
    const restored=(await freshHost.call('coordinator-restore',{request:proposed})).result;
    assert.equal(restored.report,'APPLIED');assert.equal(restored.duty,'OPEN');assert.equal(restored.remainingPermission,'DENY');
    assert.equal((await read()).status,200);assert.equal((await service.call('inspect')).result.effects.length,2);
    assert.equal(attempts()[0].duty.record.status,'OPEN');
    emit('restored-under-new-permission',{events:owner.exportHistory().length,effects:2,duty:'OPEN',sameDomain:true});
    let investigationResult;
    if(investigation){
      investigationResult=await investigateDuty({local:local('next'),dutyId:'investigate:47',sourceFile:bundleFile,
        sourceDigest:{algorithm:'sha256',value:'0x'+sha(content)},reportDirectory:host,onStage:stage=>emit(stage.stage,stage),
        observeAgain:async()=>{
          const recovered=await createCooperativeRecovery({local:local('next'),client,registry}).lookup(request);
          assert.equal(recovered.dispatchPerformed,false);assert.equal(recovered.serviceReport.result.state,'APPLIED');
          await nextRecorder.observe({id:'later-check:47',intent:request.operationId,acknowledgment:recovered.observationAcknowledgment});
        }});
      assert.equal((await client.checkpointHistory(handle())).result.state,'CHECKPOINTED');
      const beforeD1Restart=(await service.call('inspect')).result;
      await relay.close();relay=null;await service.call('close');await service.stop();await start();
      assert.deepEqual((await service.call('inspect')).result,beforeD1Restart);assert.equal((await read()).status,200);
      const replayHost=child();children.push(replayHost);
      const retry=(await replayHost.call('coordinator-duty-retry',{configFile:recoveryFile,retryFile:investigationResult.retryFile})).result;
      assert.notEqual(retry.pid,process.pid);assert.equal(retry.signatures,0);assert.equal(retry.appended,false);
      assert.equal((await workers.old.call('ping')).result.pid,oldPid);controls();
      const denied=await run('old',{operationId:'old-after-finding',businessKey:'old-after-finding',tool:'evidence.restore',arguments:{reason:'A report does not restore an old session'}});
      assert.equal(denied.error,'RUNTIME_NOT_CURRENT');assert.equal((await service.call('inspect')).result.effects.length,2);
      assert.equal(owner.authorize({actor:'next',action:'restore-evidence',resource:evidence.resource}).decision,'DENY');
      emit('investigation-reopened-without-resend',{...retry,effects:2,oldWorkerStillAlive:true,spentAndRevokedDenied:true});
    }
    const result={version:'continuity-protected-workflow-result/1',directory:dir,osIsolation:Boolean(identities),stages,eventCount:owner.exportHistory().length,
      head:state().head,domain:base.domain,dutyStatus:investigation?'CONTESTED':'OPEN',effects:2,...(investigationResult?{investigation:investigationResult}:{})};
    writeFileSync(join(host,'result.json'),json(result)+'\n',{mode:0o600});
    return result;
  }finally{
    await relay?.close();try{await service?.call('close');}catch{}
    for(const process of children)await process.stop();
  }
}

if(process.argv[1]===new URL(import.meta.url).pathname){
  const identities=process.argv[2]?JSON.parse(readFileSync(process.argv[2],'utf8')):undefined;
  const result=await runProtectedScenario({identities,onStage:stage=>console.log(JSON.stringify(stage))});
  console.log(json({result}));
}
