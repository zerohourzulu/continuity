// Trusted host recovery, deliberately unavailable through the worker proposal API.
import {readFileSync} from 'node:fs';
import {createPrivateKey,createPublicKey} from 'node:crypto';
import {privateKeyToAccount} from 'viem/accounts';
import {decodeTransport} from '../../packages/remote-tools/wire.mjs';
import {createToolRegistry} from '../../packages/remote-tools/validation.mjs';
import {createCooperativeClient} from '../../packages/remote-tools/client.mjs';
import {createCooperativeRecovery} from '../../packages/remote-tools/recovery.mjs';
import {createCooperativeExecutor} from '../../packages/remote-tools/executor.mjs';
import {openLocalOwner} from '../../packages/core-0.3/src/local-owner.ts';
import {openConfiguredEventStore} from '../../packages/core-0.3/src/configured-store.ts';
import {openLocalAttemptRecorder,inspectContinuationAttempts} from '../../packages/core-0.3/src/attempts.ts';
export async function recoverCoordinator(file){
 const config=decodeTransport(readFileSync(file)),account=privateKeyToAccount(config.runtimeKey);
 const local={...config.local,now:()=>100,session:'runtime:next',signHash:hash=>account.signMessage({message:{raw:hash}})};
 const owner=openLocalOwner(local),registry=createToolRegistry(config.registry);
 const client=createCooperativeClient({url:config.url,serviceId:registry.serviceId,coordinatorPrivateKey:createPrivateKey(config.coordinatorKey),servicePublicKey:createPublicKey(config.serviceKey),timeoutMs:10000});
 const recovery=await createCooperativeRecovery({local,client,registry}).lookup(config.request);
 if(recovery.dispatchPerformed||recovery.serviceReport.result.state!=='APPLIED')throw Error('ORIGINAL_RESULT_UNAVAILABLE');
 await openLocalAttemptRecorder(local).observe({id:'late-result:47',intent:config.request.operationId,acknowledgment:recovery.observationAcknowledgment});
 const duty=()=>inspectContinuationAttempts(openConfiguredEventStore(local).directoryStore.snapshot().history).attempts.find(attempt=>attempt.intentId===config.request.operationId).duty.record.status;
 return {result:{pid:process.pid,events:owner.exportHistory().length,report:recovery.serviceReport.result.state,dispatchPerformed:false,externalOutcome:recovery.externalOutcome,duty:duty()},
   async restore(request){
     // A distinct owner decision, not inferred from the OPEN investigation duty.
     owner.grant({id:'restore-once',to:'next',actions:['restore-evidence'],resources:[config.resource],maxTransactions:1,expiresAt:10000});
     const result=await createCooperativeExecutor({local,client,registry,role:'investigator',tenure:'shift:2'}).run(request);
     return {report:result.serviceReport?.result.state??null,duty:duty(),remainingPermission:owner.authorize({actor:'next',action:'restore-evidence',resource:config.resource}).decision};
   }};
}

export async function retryFromConfiguration(file,retryFile){
 const config=decodeTransport(readFileSync(file)),account=privateKeyToAccount(config.runtimeKey);
 const local={...config.local,now:()=>100,session:'runtime:next',signHash:hash=>account.signMessage({message:{raw:hash}})};
 const {retryInvestigation}=await import('./investigation.mjs');
 return retryInvestigation(local,retryFile);
}
