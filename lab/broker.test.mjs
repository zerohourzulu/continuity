import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFileSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {createBroker,LAB_TOOLS} from './broker.mjs';
import {setup,disposition} from './helpers.mjs';
import * as core from '../packages/core-0.2/src/core/index.ts';
import {DurableAdmissionCoordinator} from '../packages/core-0.2/src/sdk/durable-admission.ts';
import {openLocalRuntime} from '../packages/core-0.3/src/runtime.ts';

test('four synthetic tool kinds use actual Core admission and typed remote-report acknowledgments',async t=>{
  const s=await setup(t);
  const requests=[s.request,{operationId:'job:2',tool:'access.set',arguments:{level:'closed'}},
    {operationId:'job:3',tool:'payment.send',arguments:{amount:20}}, {operationId:'job:4',tool:'document.read',arguments:{}}];
  for(const request of requests) {
    const first=await s.broker.run(request);
    if(disposition(first)==='OUTCOME_UNKNOWN') {
      t.diagnostic(`One status-only recovery for ${request.tool}: ${first.result.invocation?.reason ?? first.providerReportStatus}`);
      // Never send the operation again. The persisted attempt permits only lookup.
      const recovered=await createBroker(s.options).run(request);
      assert.equal(disposition(recovered),'RETRY',JSON.stringify(recovered));
    } else assert.equal(disposition(first),'SUBMITTED',JSON.stringify(first));
  }
  assert.equal(s.service.stats().effects,4);
  assert.equal(s.owner.exportHistory().filter(e=>e.type==='TRANSACTION_INTENT_CONSUMED').length,4);
  assert.equal(disposition(await createBroker(s.options).run(s.request)),'RETRY');
  assert.equal(s.service.stats().requests,4);
});

for(const mode of ['drop-after-effect','error-after-effect']) test(mode+' stays UNKNOWN then reconciles without another send',async t=>{
  const s=await setup(t,mode), answer=await s.broker.run(s.request);
  assert.equal(disposition(answer),'OUTCOME_UNKNOWN');assert.equal(s.service.stats().effects,1);
  const recovered=await createBroker(s.options).run(s.request);
  assert.equal(disposition(recovered),'RETRY');assert.equal(s.service.stats().requests,1);
  assert.equal(s.service.stats().effects,1);assert.equal(s.service.stats().lookups,1);
});

test('late successful report after retirement is retained but current Core cannot record new consumption',async t=>{
  const s=await setup(t,'delayed-response');const running=s.broker.run(s.request);
  await s.service.waitForRequest();s.owner.advanceEpoch({agent:'bea',from:1,to:2});s.service.release();
  const answer=await running;assert.equal(disposition(answer),'OUTCOME_UNKNOWN');
  assert.equal(answer.providerReport.state,'APPLIED');assert.equal(s.service.stats().effects,1);
  assert.equal(s.owner.exportHistory().filter(e=>e.type==='TRANSACTION_INTENT_CONSUMED').length,0);
  assert.equal(disposition(await createBroker(s.options).run(s.request)),'OUTCOME_UNKNOWN');
  await assert.rejects(s.broker.run({...s.request,operationId:'new-job'}),e=>e.code==='RUNTIME_NOT_CURRENT');
  const next=privateKeyToAccount(generatePrivateKey());
  s.owner.admitRuntime({agent:'bea',session:'session:2',epoch:2,key:'key:2',address:next.address,expiresAt:10000});
  const successor=createBroker({...s.options,session:'session:2',epoch:2,signHash:h=>next.signMessage({message:{raw:h}})});
  await assert.rejects(successor.run(s.request),e=>e.code==='OPERATION_CONFLICT');
  assert.equal(s.service.stats().requests,1);
});

test('remote report remains explainable through SURVIVES and a receipt never asserts external settlement',async t=>{
  const s=await setup(t);await s.broker.run(s.request);
  const survives=s.owner.survives('bea');
  assert.equal(survives.epistemicStatus,'ESTABLISHED');
  const receipt=await core.createPortableReceipt({events:s.owner.exportHistory(),intentId:'job:1',issuedAt:100,externalOutcome:'NOT_PROVEN'},
    {keyId:'key:1',signHash:s.options.signHash});
  assert.equal(receipt.payload.result.acknowledgment.result.kind,'REMOTE_SERVICE_REPORTED');
  await assert.rejects(core.createPortableReceipt({events:s.owner.exportHistory(),intentId:'job:1',issuedAt:100,externalOutcome:'CONFIRMED'},
    {keyId:'key:1',signHash:s.options.signHash}));
});

test('counterexample: existing admission semantics do not cancel an admitted operation on grant revocation',async t=>{
  const s=await setup(t);const original=DurableAdmissionCoordinator.prototype.invoke;
  // Controlled test seam, not an agent-accessible hook: place revocation at the
  // otherwise very narrow admission-to-invocation boundary deterministically.
  DurableAdmissionCoordinator.prototype.invoke=function(capability){
    s.owner.revoke('tools');return original.call(this,capability);
  };
  try {assert.equal(disposition(await s.broker.run(s.request)),'SUBMITTED');}
  finally {DurableAdmissionCoordinator.prototype.invoke=original;}
  assert.equal(s.service.stats().effects,1);
  assert.equal(disposition(await s.broker.run({...s.request,operationId:'next'})),'NOT_AUTHORIZED');
});

test('unresolved admitted attempt survives but current duty helper requires consumption and receipt',async t=>{
  const s=await setup(t,'pending');await s.broker.run(s.request);
  const survives=s.owner.survives('bea');assert.equal(survives.epistemicStatus,'ESTABLISHED');
  assert.match(JSON.stringify(survives),/job:1/);
  await assert.rejects(openLocalRuntime(s.options).obligate({id:'follow-up',operation:'job:1',description:'Reconcile uncertain remote result',
    deadline:1000,succession:'future-rule',reviewAuthority:'tools'}),e=>e.code==='RECEIPT_UNAVAILABLE');
  assert.equal(s.service.stats().effects,0);
});

test('counterexample: local retirement cannot cancel a queued effect at a nonparticipating destination',async t=>{
  const s=await setup(t,'delayed-effect');const running=s.broker.run(s.request);
  await s.service.waitForRequest();assert.equal(s.service.stats().effects,0);
  s.owner.advanceEpoch({agent:'bea',from:1,to:2});s.service.release();await running;
  assert.equal(s.service.stats().effects,1); // Expected limit, not safety success.
});

test('participating fixture refuses old epoch only after its own fence barrier',async t=>{
  const s=await setup(t,'fenced-delayed-effect');const running=s.broker.run(s.request);
  await s.service.waitForRequest();s.owner.advanceEpoch({agent:'bea',from:1,to:2});
  await s.service.fence(2);s.service.release();
  assert.equal(disposition(await running),'OUTCOME_UNKNOWN');assert.equal(s.service.stats().effects,0);
  // A rejection response is not yet a Core no-effect proof or cancellation API.
});

test('timeout and NOT_FOUND cannot authorize resubmission while the original is still delayed',async t=>{
  const s=await setup(t,'delayed-effect');const broker=createBroker({...s.options,timeoutMs:100});
  const running=broker.run(s.request);await s.service.waitForRequest();
  assert.equal(disposition(await running),'OUTCOME_UNKNOWN');
  assert.equal(disposition(await broker.run(s.request)),'OUTCOME_UNKNOWN');
  assert.equal(s.service.stats().requests,1);s.service.release();
  // Lookup waits for service event processing without sending another effect.
  for(let i=0;i<20 && s.service.stats().effects===0;i++) await new Promise(r=>setTimeout(r,10));
  assert.equal(s.service.stats().effects,1);
});

test('payload, destination, service identity, schema and account changes conflict under the original operation ID',async t=>{
  const s=await setup(t);await s.broker.run(s.request);
  await assert.rejects(s.broker.run({...s.request,arguments:{title:'Different'}}),e=>e.code==='OPERATION_CONFLICT');
  for(const changed of [{target:'http://127.0.0.1:9'}, {serviceIdentity:'other'}, {account:'other'},
    {tools:{...LAB_TOOLS,'ticket.create':{...LAB_TOOLS['ticket.create'],schema:'ticket/2'}}}]) {
    await assert.rejects(createBroker({...s.options,...changed}).run(s.request),e=>e.code==='OPERATION_CONFLICT');
  }
  assert.equal(s.service.stats().requests,1);
});

test('unknown tools, caller destinations, accessors and unsupported effect-time guarantees fail before sending',async t=>{
  const s=await setup(t);
  for(const request of [{...s.request,tool:'arbitrary.shell'}, {...s.request,target:'http://example.com'},
    {...s.request,arguments:{get title(){throw Error('must not run')}}}]) await assert.rejects(s.broker.run(request));
  assert.throws(()=>createBroker({...s.options,target:'https://example.com'}));
  assert.throws(()=>createBroker({...s.options,enforcement:'EFFECT_TIME'}));
  assert.equal(s.service.stats().requests,0);
});

for(const mode of ['wrong-fingerprint','oversized-response','pending','redirect']) test(mode+' never produces canonical success',async t=>{
  const s=await setup(t,mode);assert.equal(disposition(await s.broker.run(s.request)),'OUTCOME_UNKNOWN');
  assert.equal(s.owner.exportHistory().filter(e=>e.type==='TRANSACTION_INTENT_CONSUMED').length,0);
  assert.equal(s.service.stats().unexpected,0);
});

test('permission revocation before call blocks dispatch',async t=>{
  const s=await setup(t);s.owner.revoke('tools');
  assert.equal(disposition(await s.broker.run(s.request)),'NOT_AUTHORIZED');
  assert.equal(s.service.stats().requests,0);
});

test('concurrent broker processes dispatch one original operation',async t=>{
  const s=await setup(t);const worker=fileURLToPath(new URL('./worker.mjs',import.meta.url));
  const launch=()=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--experimental-strip-types',worker,s.childConfig],{stdio:['ignore','pipe','pipe']});
    let output='',error='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);
    child.on('error',reject);child.on('exit',code=>code===0?resolve(output):reject(Error(error)));
  });
  await Promise.all([launch(),launch()]);
  assert.equal(s.service.stats().requests,1);assert.equal(s.service.stats().effects,1);
  assert.equal(s.owner.exportHistory().filter(e=>e.type==='TRANSACTION_INTENT_ADMITTED').length,1);
});

test('real SIGKILL after provider effect recovers by lookup without second dispatch',async t=>{
  const s=await setup(t,'delayed-response'), worker=fileURLToPath(new URL('./worker.mjs',import.meta.url));
  const child=spawn(process.execPath,['--experimental-strip-types',worker,s.childConfig],{stdio:'ignore'});
  t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL')});
  const exited=once(child,'exit');await s.service.waitForRequest();
  assert.equal(s.service.stats().effects,1);child.kill('SIGKILL');await exited;s.service.release();
  assert.equal(disposition(await createBroker(s.options).run(s.request)),'RETRY');
  assert.equal(s.service.stats().requests,1);assert.equal(s.service.stats().effects,1);
});

test('counterexample: choosing a new operation ID repeats the business effect',async t=>{
  const s=await setup(t);await s.broker.run(s.request);await s.broker.run({...s.request,operationId:'new-id'});
  assert.equal(s.service.stats().effects,2); // Business deduplication is not inferred.
});

test('changed or truncated private attempt journal blocks remote lookup and never resubmits',async t=>{
  const s=await setup(t,'drop-after-effect');await s.broker.run(s.request);
  const folder=readdirSync(s.options.storage)[0];writeFileSync(join(s.options.storage,folder,'attempt.json'),'{');
  assert.equal(disposition(await createBroker(s.options).run(s.request)),'OUTCOME_UNKNOWN');
  assert.equal(s.service.stats().requests,1);assert.equal(s.service.stats().lookups,0);
});

test('wire epoch comes from signed admission, not a contradictory host field',async t=>{
  const s=await setup(t,'fenced-delayed-effect');
  const running=createBroker({...s.options,epoch:999}).run(s.request);
  await s.service.waitForRequest();s.owner.advanceEpoch({agent:'bea',from:1,to:2});
  s.service.fence(2);s.service.release();await running;
  assert.equal(s.service.stats().effects,0);
  assert.equal(s.service.stats().audit.find(e=>e.kind==='REQUEST').request.epoch,1);
});

test('cached Core acknowledgment cannot authenticate a changed or missing report artifact',async t=>{
  const s=await setup(t);await s.broker.run(s.request);
  const path=join(s.options.storage,readdirSync(s.options.storage)[0],'report.json');
  const original=readFileSync(path,'utf8'), report=JSON.parse(original);
  for(const changed of [{...report,effectId:'effect:invented'},{...report,tool:'payment.send'}]) {
    writeFileSync(path,JSON.stringify(changed));
    const answer=await createBroker(s.options).run(s.request);
    assert.equal(disposition(answer),'RETRY'); // History still records the original digest.
    assert.equal(answer.providerReport,null);
    assert.equal(answer.providerReportStatus,'UNAVAILABLE_OR_MISMATCH');
  }
  writeFileSync(path,original);
  assert.equal((await s.broker.run(s.request)).providerReportStatus,'MATCHES_RECORDED_DIGEST');
  assert.equal(s.service.stats().requests,1);
});

test('unrecorded malformed retained report cannot be promoted to a canonical acknowledgment',async t=>{
  const s=await setup(t,'drop-after-effect');await s.broker.run(s.request);
  const path=join(s.options.storage,readdirSync(s.options.storage)[0],'report.json');
  const report=s.service.stats().reports[0];
  for(const changed of [{...report,tool:'payment.send'},{...report,state:'PENDING'},{...report,extra:true}]) {
    writeFileSync(path,JSON.stringify(changed));
    assert.equal(disposition(await createBroker(s.options).run(s.request)),'OUTCOME_UNKNOWN');
    assert.equal(s.owner.exportHistory().filter(e=>e.type==='TRANSACTION_INTENT_CONSUMED').length,0);
  }
  assert.equal(s.service.stats().requests,1);
});

test('real SIGKILL after admission but before invocation leaves zero effects and no automatic redispatch',async t=>{
  const s=await setup(t),worker=fileURLToPath(new URL('./worker.mjs',import.meta.url));
  const child=spawn(process.execPath,['--experimental-strip-types',worker,s.childConfig,'kill-before-invoke'],{stdio:'ignore'});
  const [,signal]=await once(child,'exit');assert.equal(signal,'SIGKILL');
  assert.equal(s.owner.exportHistory().filter(e=>e.type==='TRANSACTION_INTENT_ADMITTED').length,1);
  assert.equal(disposition(await createBroker(s.options).run(s.request)),'OUTCOME_UNKNOWN');
  assert.equal(s.service.stats().requests,0);
});

test('counterexample: restoring all local authority and attempt state can repeat an external effect',async t=>{
  const s=await setup(t);const earlier=readFileSync(s.options.historyFile);
  await s.broker.run(s.request);assert.equal(s.service.stats().effects,1);
  // Deliberate operator rollback in this disposable case, outside the supported
  // trusted-history profile. Destination audit remains independently ahead.
  writeFileSync(s.options.historyFile,earlier);
  for(const name of readdirSync(s.options.storage))rmSync(join(s.options.storage,name),{recursive:true,force:true});
  await createBroker(s.options).run(s.request);
  assert.equal(s.service.stats().effects,2);
});
