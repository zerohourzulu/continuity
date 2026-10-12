import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync} from 'node:crypto';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {createToolRegistry,createCooperativeDestination,createCooperativeClient,createCooperativeExecutor,createCooperativeRecovery} from '@ramex-labs/continuity-remote';
import {createContinuityTools} from '@ramex-labs/continuity-remote/langchain';
import {createLocalDomain,createLocalAttemptOwner} from '@ramex-labs/continuity-remote/local';

const dir=realpathSync(mkdtempSync(join(tmpdir(),'continuity-native-')));
let destination;
try {
  const amount=9007199254740993n,account=privateKeyToAccount(generatePrivateKey());
  const local={historyFile:join(dir,'history.jsonl'),domain:createLocalDomain(),owner:'operations',controller:'app',now:()=>100,
    session:'session:bea',signHash:hash=>account.signMessage({message:{raw:hash}})};
  const owner=createLocalAttemptOwner(local);owner.createAgent({id:'bea'});owner.createRole({id:'operator'});
  owner.appoint({agent:'bea',role:'operator',tenure:'shift:1',number:1});
  owner.admitRuntime({agent:'bea',session:local.session,epoch:1,key:'key:bea',address:account.address,expiresAt:1000});
  owner.grant({id:'budget',to:'bea',actions:['allocate'],resources:['credits:example'],expiresAt:500,
    maxAmount:amount,maxCumulativeAmount:amount,maxTransactions:1});
  const registry=createToolRegistry({serviceId:'native-example',account:'synthetic',tools:[{
    id:'credits.allocate',action:'allocate',resource:'credits:example',fields:{units:'amount',recipient:'identifier'},
    projection:{amount:'units',counterparty:'recipient',unit:'credits'},
  }]});
  const coordinator=generateKeyPairSync('ed25519'),provider=generateKeyPairSync('ed25519');
  mkdirSync(join(dir,'destination'),{mode:0o700});
  destination=await createCooperativeDestination({directory:join(dir,'destination'),domain:local.domain,serviceId:registry.serviceId,
    coordinatorPublicKey:coordinator.publicKey,servicePrivateKey:provider.privateKey,now:()=>100,validateOperation:registry.validateOperation});
  const client=createCooperativeClient({url:destination.url,serviceId:registry.serviceId,coordinatorPrivateKey:coordinator.privateKey,servicePublicKey:provider.publicKey});
  let commits=0;
  const simulatedLostReply={...client,async commit(key){commits++;await client.commit(key);throw Error('Example: reply lost after durable effect');}};
  const executor=createCooperativeExecutor({local,client:simulatedLostReply,registry,role:'operator',tenure:'shift:1'});
  const [tool]=createContinuityTools({registry,executor,operations:[{tool:'credits.allocate',operationId:'allocation:1',businessKey:'case:1:allocation'}]});
  const args={units:amount.toString(),recipient:'team:blue'};
  await assert.rejects(tool.invoke({...args,operationId:'model-selected'}));
  const first=JSON.parse(await tool.invoke(args));assert.equal(first.invocation,'OUTCOME_UNKNOWN');
  assert.equal(destination.inspect().effects.length,1);
  const second=JSON.parse(await tool.invoke(args));assert.equal(second.lastReportedServiceState,'APPLIED');
  assert.equal(commits,1);assert.equal(destination.inspect().effects[0].arguments.units,amount);
  const recovered=await createCooperativeRecovery({local,client,registry}).lookup({operationId:'allocation:1',businessKey:'case:1:allocation',tool:'credits.allocate',arguments:{units:amount,recipient:'team:blue'}});
  assert.equal(recovered.serviceReport.result.state,'APPLIED');assert.equal(recovered.dispatchPerformed,false);
  console.log('Installed LangChain tool: exact decimal amount, denied identity injection, lost reply, status-only recovery and one effect passed.');
} finally {try{await destination?.close();}finally{rmSync(dir,{recursive:true,force:true});}}
