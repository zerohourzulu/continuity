import {generateKeyPairSync} from 'node:crypto';
import {createToolRegistry,REFERENCE_TOOLS,createCooperativeClient,createCooperativeDestination,createCooperativeExecutor,
  type CooperativeReply,type ServiceResult,type ToolRequest,type ToolDefinition} from '@ramex-labs/continuity-remote';
import {createLocalAttemptOwner,createLocalDomain} from '@ramex-labs/continuity-remote/local';

const keys=generateKeyPairSync('ed25519'),domain=createLocalDomain();
const registry=createToolRegistry({serviceId:'consumer-types',account:'synthetic',tools:REFERENCE_TOOLS});
const client=createCooperativeClient({url:'http://127.0.0.1:12345',serviceId:'consumer-types',coordinatorPrivateKey:keys.privateKey,servicePublicKey:keys.publicKey});
const local={historyFile:'/synthetic/not-run',domain,owner:'owner',controller:'operator',now:()=>100,session:'session:bea',signHash:async():Promise<`0x${string}`>=>'0x00'};
const owner=createLocalAttemptOwner(local);
void client.checkpoint(owner.exportHistory());
void createCooperativeDestination({directory:'/synthetic/not-run',domain,serviceId:'consumer-types',coordinatorPublicKey:keys.publicKey,
  servicePrivateKey:keys.privateKey,now:()=>100,validateOperation:registry.validateOperation});
const executor=createCooperativeExecutor({local,client,registry,role:'operator',tenure:'shift:1'});
const request:ToolRequest={operationId:'one',businessKey:'case:one',tool:'ticket.create',arguments:{title:'Example'}};
void executor.run(request).then(result=>{
  const claim:'NOT_PROVEN'=result.externalOutcome;
  const outcome= result.serviceReport?.result;
  if(outcome?.state==='APPLIED'){const effect:string=outcome.effectId;void effect;}
  void claim;
});
function inspect(reply:CooperativeReply) {
  if(reply.result.state==='REFUSED'){const code:string=reply.result.code;void code;}
  if(reply.result.state==='TOO_LATE'){const id:string=reply.result.report.effectId;void id;}
}
const custom:ToolDefinition={id:'test',action:'test',resource:'test',fields:{count:'integer',enabled:'boolean'}};
void custom;void inspect;
// @ts-expect-error Agent tool requests cannot select destination or coordinator identity.
const injected:ToolRequest={...request,url:'http://evil.invalid'};
// @ts-expect-error APPLIED needs effect identity, operation bindings and checkpoint.
const badResult:ServiceResult={state:'APPLIED'};
// @ts-expect-error Unsupported opaque field types are rejected before use.
const badTool:ToolDefinition={id:'test',action:'test',resource:'test',fields:{amount:'float'}};
// @ts-expect-error Async validator cannot participate in the atomic destination transaction.
void createCooperativeDestination({directory:'/none',domain,serviceId:'x',coordinatorPublicKey:keys.publicKey,servicePrivateKey:keys.privateKey,now:()=>0,validateOperation:async()=>({})});
void injected;void badResult;void badTool;

import {createCooperativeRecovery, type DestinationLock} from '@ramex-labs/continuity-remote';
import {createLocalReviewOwner} from '@ramex-labs/continuity-remote/local';
import {createContinuityTool, createContinuityTools} from '@ramex-labs/continuity-remote/langchain';
const amountTool: ToolDefinition={id:'credits.reserve',action:'reserve',resource:'credits',fields:{units:'amount',recipient:'identifier'},projection:{amount:'units',counterparty:'recipient',unit:'credits'}};
const compensation: ToolDefinition={id:'ticket.close',action:'close',resource:'tickets',fields:{original:'identifier'},compensates:{tool:'ticket.create',businessKeyField:'original'}};
void amountTool;void compensation;void createLocalReviewOwner;void createCooperativeRecovery;void createContinuityTool;void createContinuityTools;
const lock: DestinationLock={version:'continuity-destination-lock/1',hostname:'host',pid:123,instance:'instance'};
void lock;
