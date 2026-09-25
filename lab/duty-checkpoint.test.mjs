import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {cooperativeSetup} from './cooperative-helpers.mjs';
import {capture} from '../tests/core-0.3/fixtures/history-fixture.mjs';
import {prepareMigration,stageMigration,activateMigration} from '../packages/core-0.3/src/history-store/index.ts';
import {openConfiguredEventStore} from '../packages/core-0.3/src/configured-store.ts';
import {openLocalOwner} from '../packages/core-0.3/src/local-owner.ts';
import {openLocalAttemptRecorder} from '../packages/core-0.3/src/attempts.ts';
import {openLocalDutyPolicy} from '../packages/core-0.3/src/duties.ts';
import {stateOf} from '../packages/core-0.3/src/local-store.ts';
import {exportContinuationEvents} from '../packages/core-0.3/src/history.ts';
import {createHistoryTransfer,openCheckpointStorage} from '../packages/core-0.3/src/history-store/transfer.ts';
import {createCooperativeDestination} from '../packages/remote-tools/destination.mjs';
import {createCooperativeClient} from '../packages/remote-tools/client.mjs';
import {createCooperativeExecutor} from '../packages/remote-tools/executor.mjs';
import {lossyRelay} from '../packages/mcp-gateway/examples/lossy-relay.mjs';
import * as core from '../packages/core-0.2/src/core/index.ts';

const profile='continuity-segmented-local/1';
const same=(actual,expected)=>assert.equal(core.canonicalEncode(actual),core.canonicalEncode(expected));

test('D1 checkpoint transfer preserves applied and pending attempts, refuses incomplete chunks and fences pending commit across restart',async t=>{
  const cleanup=[],s=await cooperativeSetup({after:fn=>cleanup.push(fn)});
  let destination,relay;
  t.after(async()=>{await relay?.close();await destination?.close();for(const fn of cleanup)await fn();});
  // Migrate this existing E5 case explicitly, preserving genesis and its exact prefix.
  const original=s.owner.exportHistory(),planFile=join(s.dir,'duty-migration.json'),binding=join(s.dir,'duty-binding.json');
  prepareMigration({sourceFile:s.local.historyFile,targetDirectory:join(s.dir,'duty-history'),planFile,
    expectedHead:capture(original).head,configurationFiles:[binding],artifactFiles:[],quiesced:true});
  stageMigration(planFile,{quiesced:true});activateMigration(planFile,{quiesced:true});
  const {historyFile,...base}=s.local,local={...base,historyProfile:profile,historyBinding:binding};
  const owner=openLocalOwner(local),store=openConfiguredEventStore(local).directoryStore;
  same(owner.exportHistory(),original);
  const directory=join(s.dir,'duty-destination');mkdirSync(directory,{mode:0o700});
  const destinationOptions={...s.destinationOptions,directory,historyProfile:profile};
  destination=await createCooperativeDestination(destinationOptions);
  relay=await lossyRelay(destination.url);
  const connect=url=>createCooperativeClient({url,serviceId:s.serviceId,coordinatorPrivateKey:s.coordinator.privateKey,
    servicePublicKey:s.provider.publicKey,timeoutMs:10000});
  let client=connect(relay.url);
  const executor=createCooperativeExecutor({local,client,registry:s.registry,role:'operator',tenure:'shift:1'});

  // The destination applies once; its real network reply is dropped after commit.
  relay.behavior.dropAfter='commit';
  const lost=await executor.run(s.request);
  delete relay.behavior.dropAfter;
  assert.equal(lost.execution.invocation.status,'OUTCOME_UNKNOWN');assert.equal(lost.serviceReport,null);
  const applied=destination.inspect().attempts.find(item=>item.intentId===s.request.operationId);
  assert.equal(applied.report.state,'APPLIED');assert.equal(destination.inspect().effects.length,1);
  assert.equal(relay.counts.commit,1);
  assert.equal(stateOf(owner.exportHistory()).intentConsumptions.size,0);

  owner.grant({id:'duty-create',to:'bea',actions:['CREATE_ATTEMPT_DUTY'],resources:[s.request.operationId],expiresAt:500});
  await openLocalAttemptRecorder(local).createDuty({id:'investigate',intent:s.request.operationId,
    description:'Investigate the lost destination reply',deadline:500});
  const duties=openLocalDutyPolicy(local),selection=duties.describe({duty:'investigate',attesterRole:'operator',
    incidentSourceDigest:{algorithm:'sha256',value:'0x'+'d'.repeat(64)}});
  owner.grant({id:'duty-activation',to:'bea',actions:[selection.activationAction],resources:[selection.activationResource],expiresAt:500});

  // Stop the second real operation before commit: it is retained as PENDING.
  const pendingRequest={...s.request,operationId:'job:pending',businessKey:'case:pending',arguments:{title:'Await a later decision'}};
  relay.behavior.dropBefore='commit';
  const waiting=await executor.run(pendingRequest);
  delete relay.behavior.dropBefore;
  assert.equal(waiting.execution.invocation.status,'OUTCOME_UNKNOWN');
  assert.equal(destination.inspect().effects.length,1);
  const pending=destination.inspect().attempts.find(item=>item.intentId===pendingRequest.operationId);
  assert.equal(pending.report.state,'PENDING');assert.equal(relay.counts.commit,2);
  const beforeHistory=store.snapshot().history;
  assert.equal((await client.checkpointHistory(beforeHistory)).result.state,'CHECKPOINTED');
  const before=destination.inspect();same(before.checkpoint.head,beforeHistory.head);same(pending.checkpointHead,beforeHistory.head);
  same(before.attempts.find(item=>item.key===applied.key),applied);

  const activated=await duties.activate({id:'activate',descriptor:selection.descriptor,activationAuthority:'duty-activation'});
  const extended=store.snapshot().history,extendedEvents=owner.exportHistory();
  same(extendedEvents.slice(0,-1),exportContinuationEvents(beforeHistory));
  assert.equal(extendedEvents.at(-1).type,'ATTEMPT_DUTY_POLICY_ACTIVATED');
  assert.equal(extended.head.position,beforeHistory.head.position+1);
  assert.equal(activated.view.dutyDisposition,'OPEN');assert.equal(activated.view.outstanding,true);
  same(destination.inspect().checkpoint,before.checkpoint);

  const transfer=createHistoryTransfer(extended);
  assert.equal((await client.checkpointBegin(transfer.manifest,transfer.transferId)).result.state,'CHECKPOINT_STAGED');
  // The final changed chunk has not been uploaded: no partial-prefix acceptance.
  const missing=await client.checkpointCommit(transfer.transferId);
  assert.equal(missing.result.state,'REFUSED');
  const incomplete=destination.inspect();same(incomplete.checkpoint,before.checkpoint);
  same(incomplete.attempts,before.attempts);same(incomplete.effects,before.effects);assert.equal(incomplete.sequence,before.sequence);
  for(let i=0;i<transfer.chunks.length;i++) {
    assert.equal((await client.checkpointChunk(transfer.transferId,i,transfer.chunks[i])).result.state,'CHECKPOINT_CHUNKED');
  }
  same(destination.inspect().checkpoint,before.checkpoint);
  assert.equal((await client.checkpointCommit(transfer.transferId)).result.state,'CHECKPOINTED');
  const committed=destination.inspect();same(committed.checkpoint.head,extended.head);
  assert.equal(committed.checkpoint.reference,transfer.transferId);
  same(committed.attempts,before.attempts);same(committed.effects,before.effects);
  assert.equal((await client.status(applied.key)).result.state,'APPLIED');
  assert.equal((await client.status(pending.key)).result.state,'PENDING');
  assert.equal((await client.commit(pending.key)).result.code,'CHECKPOINT_CHANGED');
  assert.equal((await client.commit(applied.key)).result.state,'APPLIED');
  same(destination.inspect().effects,before.effects);

  await relay.close();relay=undefined;
  await destination.close();destination=await createCooperativeDestination(destinationOptions);client=connect(destination.url);
  const reopened=destination.inspect();same(reopened.checkpoint,committed.checkpoint);
  same(reopened.attempts,committed.attempts);same(reopened.effects,committed.effects);
  assert.equal((await client.status(applied.key)).result.state,'APPLIED');
  assert.equal((await client.status(pending.key)).result.state,'PENDING');
  assert.equal((await client.commit(pending.key)).result.code,'CHECKPOINT_CHANGED');
  const recovered=openCheckpointStorage(directory).load(reopened.checkpoint.reference);
  const replay=stateOf(exportContinuationEvents(recovered));
  assert.equal(replay.attemptDutyPolicies.get('investigate').eventId,activated.eventId);
  same(recovered.head,extended.head);assert.equal(replay.genesis.adapterPolicyHash,core.PORTABLE_ADAPTER_POLICY_E5_HASH);
  t.diagnostic(`Actual dropped APPLIED reply; PENDING retained; incomplete D1 transfer refused (${missing.result.code}); `+
    `complete ${extended.eventCount}-event checkpoint survives restart with one effect and pending fence.`);
});
