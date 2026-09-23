import {mkdtempSync,mkdirSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {createLocalAttemptOwner as createLocalOwner,createLocalDomain} from '../packages/core-0.3/src/local-owner.ts';
import {createToolRegistry,REFERENCE_TOOLS} from '../packages/remote-tools/validation.mjs';
import {createCooperativeDestination} from '../packages/remote-tools/destination.mjs';
import {createCooperativeClient} from '../packages/remote-tools/client.mjs';
import {createCooperativeExecutor} from '../packages/remote-tools/executor.mjs';
import {openLocalExecution} from '../packages/core-0.3/src/execution.ts';
import {stateOf} from '../packages/core-0.3/src/local-store.ts';
import * as core from '../packages/core-0.2/src/core/index.ts';
export async function cooperativeSetup(t,tools=REFERENCE_TOOLS){
  const dir=realpathSync(mkdtempSync(join(tmpdir(),'continuity-cooperative-'))),directory=join(dir,'destination');mkdirSync(directory,{mode:0o700});
  const coordinator=generateKeyPairSync('ed25519'),provider=generateKeyPairSync('ed25519');
  const serviceId='destination:'+randomUUID();let clock=100;
  const registry=createToolRegistry({serviceId,account:'synthetic',tools}),account=privateKeyToAccount(generatePrivateKey());
  const local={historyFile:join(dir,'history.jsonl'),domain:createLocalDomain(),owner:'operations',controller:'operator',now:()=>clock,
    session:'session:bea',signHash:h=>account.signMessage({message:{raw:h}})};
  const owner=createLocalOwner(local);owner.createAgent({id:'bea'});owner.createRole({id:'operator'});
  owner.appoint({agent:'bea',role:'operator',tenure:'shift:1',number:1});
  owner.admitRuntime({agent:'bea',session:local.session,epoch:1,key:'key:bea',address:account.address,expiresAt:1000});
  owner.grant({id:'tools',to:'bea',actions:tools.map(x=>x.action).filter((x,i,a)=>a.indexOf(x)===i),resources:tools.map(x=>x.resource).filter((x,i,a)=>a.indexOf(x)===i),expiresAt:500});
  const destinationOptions={directory,domain:local.domain,serviceId,coordinatorPublicKey:coordinator.publicKey,servicePrivateKey:provider.privateKey,
    now:()=>clock,validateOperation:registry.validateOperation};
  let destination=await createCooperativeDestination(destinationOptions);
  // Full signed-history replay can exceed five seconds on shared CI CPUs.
  // Use the existing maximum for this fixture; production defaults and timeout tests stay unchanged.
  const makeClient=url=>createCooperativeClient({url,serviceId,coordinatorPrivateKey:coordinator.privateKey,servicePublicKey:provider.publicKey,timeoutMs:10000});
  let client=makeClient(destination.url);
  t.after(async()=>{await destination.close();rmSync(dir,{recursive:true,force:true});});
  const executor=createCooperativeExecutor({local,client,registry,role:'operator',tenure:'shift:1'});
  const request={operationId:'job:1',businessKey:'case:1',tool:'ticket.create',arguments:{title:'Investigate suspicious document'}};
  const wire=(input=request)=>registry.capture({intentId:input.operationId,businessKey:input.businessKey,tool:input.tool,arguments:input.arguments,contractId:registry.contractId}).wire;
  async function admitOnly(input=request,options=local,tenure='shift:1'){
    const selected=registry.capture(wire(input));
    const adapter={adapterProfile:core.approvedPortableAdapterProfileForPolicy(core.PORTABLE_ADAPTER_POLICY_E5_HASH,core.REMOTE_SERVICE_REPORT_ADAPTER_ID),
      submit(submission){const i=core.derivePortableAdapterIdentity(submission);return {status:'OUTCOME_UNKNOWN',idempotencyKey:i.idempotencyKey,submissionFingerprint:i.submissionFingerprint}},
      reconcile(){throw Error('No test reconciliation');}};
    await openLocalExecution(options,adapter,'REMOTE_REPORT').run({id:input.operationId,action:selected.action,resource:selected.resource,role:'operator',tenure,termsCommitment:selected.termsCommitment,...selected.quantities});
    const admission=stateOf(owner.exportHistory()).intentAdmissions.get(input.operationId);if(!admission)throw Error('Test admission failed');return admission.adapterIdentity.idempotencyKey;
  }
  return {dir,directory,coordinator,provider,serviceId,registry,local,owner,executor,request,wire,admitOnly,destinationOptions,
    get destination(){return destination},get client(){return client},setTime(value){clock=value},
    async restart(){await destination.close();destination=await createCooperativeDestination(destinationOptions);client=makeClient(destination.url);return destination;}};
}
