import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {cooperativeSetup} from '../../lab/cooperative-helpers.mjs';
import {padded,capture} from './fixtures/history-fixture.mjs';
import {PortableFileEventStore} from '../../packages/core-0.2/src/indexer/portable-file-event-store.ts';
import {prepareMigration,stageMigration,activateMigration} from '../../packages/core-0.3/src/history-store/index.ts';
import {openConfiguredEventStore} from '../../packages/core-0.3/src/configured-store.ts';
import {openLocalOwner} from '../../packages/core-0.3/src/local-owner.ts';
import {createHistoryTransfer} from '../../packages/core-0.3/src/history-store/transfer.ts';
import {createCooperativeDestination} from '../../packages/remote-tools/destination.mjs';
import {createCooperativeClient} from '../../packages/remote-tools/client.mjs';
import {createCooperativeExecutor} from '../../packages/remote-tools/executor.mjs';
import {createCooperativeRecovery} from '../../packages/remote-tools/recovery.mjs';
import {stateOf} from '../../packages/core-0.3/src/local-store.ts';
import * as core from '../../packages/core-0.2/src/core/index.ts';
const profile='continuity-segmented-local/1';
async function setup(t,{count=320,checkpointHooks}={}){
 const cleanup=[];const s=await cooperativeSetup({after:fn=>cleanup.push(fn)}),events=s.owner.exportHistory(),history=padded(events,count);
 // Synthetic fixture seed into the original format, followed by actual explicit migration.
 new PortableFileEventStore(s.local.historyFile).appendAll(history.slice(events.length));
 const planFile=join(s.dir,'migration.json'),binding=join(s.dir,'binding.json');
 prepareMigration({sourceFile:s.local.historyFile,targetDirectory:join(s.dir,'history-directory'),planFile,expectedHead:capture(history).head,configurationFiles:[binding],artifactFiles:[],quiesced:true});
 stageMigration(planFile,{quiesced:true});activateMigration(planFile,{quiesced:true});
 const {historyFile,...base}=s.local,local={...base,historyProfile:profile,historyBinding:binding};
 const owner=openLocalOwner(local),store=openConfiguredEventStore(local),directory=join(s.dir,'destination-v2');mkdirSync(directory,{mode:0o700});
 const options={...s.destinationOptions,directory,historyProfile:profile,checkpointHooks};
 let destination=await createCooperativeDestination(options);
 const connect=()=>createCooperativeClient({url:destination.url,serviceId:s.serviceId,coordinatorPrivateKey:s.coordinator.privateKey,servicePublicKey:s.provider.publicKey,timeoutMs:10000});
 let client=connect();t.after(async()=>{await destination.close();for(const fn of cleanup)await fn();});
 const executor=()=>createCooperativeExecutor({local,client,registry:s.registry,role:'operator',tenure:'shift:1'});
 return {...s,local,owner,store,options,directory,executor,
  get destination(){return destination},get client(){return client},
  async restart(){await destination.close();destination=await createCooperativeDestination(options);client=connect();},
 };
}
test('continued remote execution crosses 256, reopens and reconciles without resending',async t=>{
 const s=await setup(t);
 const initialCheckpoint=await s.client.checkpointHistory(s.store.directoryStore.snapshot().history);
 assert.equal(initialCheckpoint.result.state,"CHECKPOINTED",JSON.stringify(initialCheckpoint.result));
 const reply=await s.executor().run(s.request);
 assert.equal(reply.execution.status,'EXECUTION_RESULT');assert.equal(reply.execution.invocation.status,'SUBMITTED');
 assert.equal(reply.serviceReport.result.state,'APPLIED');assert.equal(s.destination.inspect().effects.length,1);
 const original=s.destination.inspect(),checkpoint=original.checkpoint;
 assert.equal(Object.hasOwn(checkpoint,'events'),false);assert.ok(checkpoint.head.position>256);
 assert.equal(s.owner.observe().eventCount,323);
 await s.restart();const repeated=await s.executor().run(s.request);
 assert.equal(repeated.execution.status,'RECONCILIATION_ONLY');assert.equal(s.destination.inspect().effects.length,1);
 const recovered=await createCooperativeRecovery({local:s.local,client:s.client,registry:s.registry}).lookup(s.request);
 assert.equal(recovered.serviceReport.result.state,'APPLIED');assert.equal(recovered.dispatchPerformed,false);
 const conflict=await s.executor().run({...s.request,operationId:'job:2'});
 assert.equal(conflict.serviceReport.result.code,'BUSINESS_KEY_CONFLICT');assert.equal(s.destination.inspect().effects.length,1);
});
test('same-history retry is idempotent; staging alone does not fence pending work',async t=>{
 const s=await setup(t,{count:270});
 const unknownClient={...s.client,commit:async()=>{throw Error('lost before commit')}};
 const executor=createCooperativeExecutor({local:s.local,client:unknownClient,registry:s.registry,role:'operator',tenure:'shift:1'});
 const first=await executor.run(s.request);assert.equal(first.execution.invocation.status,'OUTCOME_UNKNOWN');
 const before=s.destination.inspect(),key=before.attempts[0].key;
 assert.equal(before.attempts[0].report.state,'PENDING');
 const old=s.store.directoryStore.snapshot().history;
 s.setTime(101); // A later retry must not create a new destination sequence.
 const same=await s.client.checkpointHistory(old);assert.equal(same.result.state,'CHECKPOINTED');
 assert.equal(s.destination.inspect().sequence,before.sequence);
 s.owner.revoke('tools');
 const transfer=createHistoryTransfer(s.store.directoryStore.snapshot().history);
 assert.equal((await s.client.checkpointBegin(transfer.manifest,transfer.transferId)).result.state,'CHECKPOINT_STAGED');
 for(let i=0;i<transfer.chunks.length;i++)assert.equal((await s.client.checkpointChunk(transfer.transferId,i,transfer.chunks[i])).result.state,'CHECKPOINT_CHUNKED');
 assert.deepEqual(s.destination.inspect().checkpoint,before.checkpoint);
 assert.equal((await s.client.commit(key)).result.state,'APPLIED');
 assert.equal((await s.client.checkpointCommit(transfer.transferId)).result.state,'CHECKPOINTED');
 assert.equal((await s.client.status(key)).result.state,'APPLIED');
 assert.equal((await s.client.commit(key)).result.state,'APPLIED');assert.equal(s.destination.inspect().effects.length,1);
});
test('acknowledged extension fences a pending operation; no implicit downgrade or shortened checkpoint',async t=>{
 const s=await setup(t,{count:258});
 const client={...s.client,commit:async()=>{throw Error('stop before external effect')}};
 await createCooperativeExecutor({local:s.local,client,registry:s.registry,role:'operator',tenure:'shift:1'}).run(s.request);
 const original=s.destination.inspect(),key=original.attempts[0].key,old=s.store.directoryStore.snapshot().history;
 assert.equal(original.attempts[0].report.state,'PENDING');s.owner.revoke('tools');
 assert.equal((await s.client.checkpointHistory(s.store.directoryStore.snapshot().history)).result.state,'CHECKPOINTED');
 assert.equal((await s.client.commit(key)).result.code,'CHECKPOINT_CHANGED');assert.equal(s.destination.inspect().effects.length,0);
 assert.equal((await s.client.checkpointHistory(old)).result.code,'CHECKPOINT_CONFLICT');
 assert.equal((await s.client.checkpoint(s.owner.exportHistory().slice(0,2))).result.code,'UNSUPPORTED_HISTORY_PROFILE');
 await s.restart();assert.equal((await s.client.status(key)).result.state,'PENDING');
 assert.equal((await s.client.commit(key)).result.code,'CHECKPOINT_CHANGED');
});
test('missing, substituted and interleaved chunks refuse; duplicate exact chunks resume',async t=>{
 const s=await setup(t,{count:257}),transfer=createHistoryTransfer(s.store.directoryStore.snapshot().history);
 assert.equal((await s.client.checkpointBegin(transfer.manifest,transfer.transferId)).result.state,'CHECKPOINT_STAGED');
 assert.equal((await s.client.checkpointCommit(transfer.transferId)).result.state,'REFUSED');assert.equal(s.destination.inspect().checkpoint,null);
 assert.equal((await s.client.checkpointChunk(transfer.transferId,0,['d3Jvbmc='])).result.code,'TRANSFER_CHUNK_INVALID');
 const other=createHistoryTransfer(capture(s.owner.exportHistory().slice(0,256)));
 assert.equal((await s.client.checkpointBegin(other.manifest,other.transferId)).result.code,'TRANSFER_CONFLICT');
 assert.equal((await s.client.checkpointChunk(other.transferId,0,other.chunks[0])).result.code,'TRANSFER_CONFLICT');
 for(let i=transfer.chunks.length-1;i>=0;i--){assert.equal((await s.client.checkpointChunk(transfer.transferId,i,transfer.chunks[i])).result.state,'CHECKPOINT_CHUNKED');assert.equal((await s.client.checkpointChunk(transfer.transferId,i,transfer.chunks[i])).result.state,'CHECKPOINT_CHUNKED');}
 await s.restart();assert.equal((await s.client.checkpointCommit(transfer.transferId)).result.state,'CHECKPOINTED');
 assert.equal(s.destination.inspect().checkpoint.head.position,256);
});
test('lost checkpoint acknowledgment is reconciled by exact same-history retry',async t=>{
 let cut=true;const s=await setup(t,{count:260,checkpointHooks:{point(name){if(name==='checkpoint-reference-synced'&&cut){cut=false;throw Error('lost ack')}}}});
 const history=s.store.directoryStore.snapshot().history;
 assert.equal((await s.client.checkpointHistory(history)).result.state,'REFUSED');
 const stored=s.destination.inspect();assert.equal(core.canonicalEncode(stored.checkpoint.head),core.canonicalEncode(history.head));
 s.setTime(101);
 const retry=await s.client.checkpointHistory(history);assert.equal(retry.result.state,'CHECKPOINTED');assert.equal(s.destination.inspect().sequence,stored.sequence);
});
