// Copy this file to a fresh consumer directory containing the four coordinated release archives.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync} from 'node:crypto';
import {privateKeyToAccount} from 'viem/accounts';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {serveGatewayHttp} from '@ramex-labs/continuity-mcp-gateway/http';
import {testIssuer} from './node_modules/@ramex-labs/continuity-mcp-gateway/examples/test-issuer.mjs';
import {observeContinuationHistory,inspectContinuationAttempts} from '@ramex-labs/continuity';
import {openLocalDutyPolicy} from '@ramex-labs/continuity/duties';
import {openLocalAttemptRecorder} from '@ramex-labs/continuity/attempts';
import {createLocalAttemptOwner,openLocalOwner,createLocalDomain} from '@ramex-labs/continuity/local';
import {PortableFileEventStore,openConfiguredEventStore} from '@ramex-labs/continuity/adapter';
import {captureContinuationHistory,CONTINUATION_HISTORY_VERSION} from '@ramex-labs/continuity/history';
import {prepareMigration,stageMigration,activateMigration} from '@ramex-labs/continuity/history-store';
import {createToolRegistry,createCooperativeDestination,createCooperativeClient,createCooperativeExecutor,createCooperativeRecovery} from '@ramex-labs/continuity-remote';
import {createContinuityTool} from '@ramex-labs/continuity-remote/langchain';
import {createCooperativeGateway} from '@ramex-labs/continuity-mcp-gateway/cooperative';
import {operationIdentity} from '@ramex-labs/continuity-mcp-gateway';
import {inspectCase,snapshotCase} from '@ramex-labs/continuity-mcp-gateway/operations';
import {lossyRelay} from './node_modules/@ramex-labs/continuity-mcp-gateway/examples/lossy-relay.mjs';
const root=realpathSync(mkdtempSync(join(tmpdir(),'continuity-h04-installed-case-'))),profile='continuity-segmented-local/1';let destination,relay,gateway;
try{
 const account=privateKeyToAccount('0x'+'11'.repeat(32)),coordinator=generateKeyPairSync('ed25519'),provider=generateKeyPairSync('ed25519');
 const old={historyFile:join(root,'history.jsonl'),domain:createLocalDomain(),owner:'owner',controller:'host',session:'worker:1',now:()=>100,signHash:h=>account.signMessage({message:{raw:h}})};
 const owner=createLocalAttemptOwner(old);owner.createAgent({id:'worker'});owner.createRole({id:'analyst'});owner.appoint({agent:'worker',role:'analyst',tenure:'shift:1',number:1});owner.admitRuntime({agent:'worker',session:old.session,epoch:1,key:'key',address:account.address,expiresAt:10000});
 owner.grant({id:'write',to:'worker',actions:['create-ticket','inspect-operation'],resources:['queue'],expiresAt:10000});
 const operationId=operationIdentity(old.domain,'case:mcp');owner.grant({id:'observe',to:'worker',actions:['OBSERVE_OUTCOME'],resources:[operationId],expiresAt:10000});
 const original=owner.exportHistory(),padding=[];for(let i=original.length;i<320;i++)padding.push({id:'padding:'+i,type:'PRINCIPAL_CREATED',timestamp:100,data:{principalId:'padding:'+i}});new PortableFileEventStore(old.historyFile).appendAll(padding);
 const events=new PortableFileEventStore(old.historyFile).readAll();
 // Read the exact legacy head for migration. No source-path imports are used.
 const {stateOf}=await import('@ramex-labs/continuity/adapter'),head=stateOf(events).head;
 const planFile=join(root,'migration.json'),binding=join(root,'binding.json');
 prepareMigration({sourceFile:old.historyFile,targetDirectory:join(root,'case'),planFile,expectedHead:head,configurationFiles:[binding],artifactFiles:[],quiesced:true});stageMigration(planFile,{quiesced:true});activateMigration(planFile,{quiesced:true});
 const {historyFile,...base}=old,local={...base,historyProfile:profile,historyBinding:binding},store=openConfiguredEventStore(local);
 const registryConfig={serviceId:'destination:test',account:'synthetic',tools:[{id:'ticket.create',action:'create-ticket',resource:'queue',fields:{title:'text'}}]},registry=createToolRegistry(registryConfig);
 const directory=join(root,'destination'),storage=join(root,'records');mkdirSync(directory,{mode:0o700});mkdirSync(storage,{mode:0o700});
 const destinationOptions={directory,historyProfile:profile,domain:local.domain,serviceId:registry.serviceId,coordinatorPublicKey:coordinator.publicKey,servicePrivateKey:provider.privateKey,now:()=>100,validateOperation:registry.validateOperation};
 destination=await createCooperativeDestination(destinationOptions);relay=await lossyRelay(destination.url);relay.behavior.dropAfter='commit';
 const config={local,storage,registry:registryConfig,operations:[{name:'create_ticket',tool:'ticket.create',businessKey:'case:mcp',role:'analyst',tenure:'shift:1'}],destination:{url:relay.url,serviceId:registry.serviceId,coordinatorPrivateKey:coordinator.privateKey,servicePublicKey:provider.publicKey,timeoutMs:10000}};
 gateway=await createCooperativeGateway(config);
 assert.equal(gateway.why('create_ticket').decision,'ALLOW');assert.equal((await gateway.run('create_ticket',{title:'Synthetic case'})).status,'OUTCOME_UNKNOWN');assert.equal(destination.inspect().effects.length,1);
 await gateway.close();await destination.close();await relay.close();destination=await createCooperativeDestination(destinationOptions);relay=await lossyRelay(destination.url);config.destination.url=relay.url;
 gateway=await createCooperativeGateway(config);const result=await gateway.recover('create_ticket');assert.equal(result.serviceState,'APPLIED');assert.equal(result.dispatchPerformed,false);assert.equal(relay.counts.commit,0);assert.equal(relay.counts.prepare,0);
 assert.equal((await gateway.observe('create_ticket')).status,'OBSERVATION_RECORDED');
 const snapshot=store.directoryStore.snapshot().history;assert.ok(snapshot.eventCount>320);assert.equal(inspectContinuationAttempts(snapshot).attempts[0].reportStatus,'REPORT_RECORDED');assert.equal(observeContinuationHistory(snapshot).authorize({actor:'worker',action:'create-ticket',resource:'queue'}).decision,'ALLOW');
 const inspected=inspectCase({...local,storage});assert.equal(inspected.profile,profile);assert.equal(inspected.eventCount,snapshot.eventCount);assert.throws(()=>snapshotCase({...local,storage,directory:join(root,'legacy-copy')}),/UNSUPPORTED_HISTORY_PROFILE/);
 const dutyOwner=openLocalOwner(local);
 dutyOwner.grant({id:'duty-create',to:'worker',actions:['CREATE_ATTEMPT_DUTY'],resources:[operationId],expiresAt:10000});
 await openLocalAttemptRecorder(local).createDuty({id:'investigation',intent:operationId,description:'Review the unknown tool result',deadline:10000});
 const duties=openLocalDutyPolicy(local),selected=duties.describe({duty:'investigation',incidentSourceDigest:{algorithm:'sha256',value:'0x'+'a'.repeat(64)},attesterRole:'analyst'});
 dutyOwner.grant({id:'activation',to:'worker',actions:[selected.activationAction],resources:[selected.activationResource],expiresAt:10000});
 await duties.activate({id:'rules',descriptor:selected.descriptor,activationAuthority:'activation'});
 for(const [id,action]of [['finding','ATTEST_DUTY_FINDING'],['disposition','RECORD_DUTY_DISPOSITION']])dutyOwner.grant({id,to:'worker',actions:[action],resources:['duty:'+selected.descriptorHash],expiresAt:10000});
 const input={id:'complete',duty:'investigation',disposition:'COMPLETED_UNDER_POLICY',checklist:Object.fromEntries(['SOURCE_REVIEWED','HISTORY_REVIEWED','FINDING_RECORDED','CONTROL_REVIEWED'].map(k=>[k,{state:'SATISFIED',reason:'Synthetic installed consumer reviewed the local case.'}])),reportDigest:{algorithm:'sha256',value:'0x'+'b'.repeat(64)},nextStep:null,attestationAuthority:'finding',dispositionAuthority:'disposition'};
 const completed=await duties.dispose(input);
 assert.equal(gateway.status('create_ticket').investigation.dutyDisposition,'COMPLETED_UNDER_POLICY');
 assert.equal(inspectCase({...local,storage}).dutySummary.states.COMPLETED_UNDER_POLICY,1);
 const recoveredWithD1=await gateway.recover('create_ticket');assert.equal(recoveredWithD1.dispatchPerformed,false);assert.equal(recoveredWithD1.investigation.externalOutcome,'NOT_PROVEN');
 await duties.contest({id:'challenge',duty:'investigation',targetDispositionId:completed.eventId,reason:'Review the finding',reportDigest:{algorithm:'sha256',value:'0x'+'c'.repeat(64)},attestationAuthority:'finding',dispositionAuthority:'disposition'});
 assert.equal(gateway.status('create_ticket').investigation.dutyDisposition,'CONTESTED');
 assert.equal(inspectCase({...local,storage}).dutySummary.outstanding,1);
 await gateway.close();gateway=await createCooperativeGateway(config);
 const afterD1Restart=await gateway.recover('create_ticket');assert.equal(afterD1Restart.investigation.dutyDisposition,'CONTESTED');assert.equal(destination.inspect().effects.length,1);
 assert.equal(relay.counts.commit,0);assert.equal(relay.counts.prepare,0);
 assert.equal((await duties.dispose(input)).alreadyRecorded,true);
 // Verify the current view crosses an actual authenticated MCP connection.
 const issuer=await testIssuer();let http,mcpClient;
 try{
  http=await serveGatewayHttp({issuer:issuer.issuer,keys:issuer.keys,allowTestIssuer:true,isActive:()=>true,bindings:[{kind:'cooperative',id:'agent-a',subject:'alice',clientId:'example-client',gateway:config}]});
  const token=await issuer.issue(http.resourceUrl);
  mcpClient=new Client({name:'duty-installed',version:'1'},{versionNegotiation:{mode:{pin:'2026-07-28'}}});
  await mcpClient.connect(new StreamableHTTPClientTransport(new URL(http.resourceUrl),{requestInit:{headers:{authorization:'Bearer '+token}}}));
  const {tools}=await mcpClient.listTools({cursor:''});
  for(const name of ['continuity_status','continuity_recover']){
   const reply=await mcpClient.callTool({name,arguments:{job:'create_ticket'}},{toolDefinition:tools.find(t=>t.name===name)});
   assert.equal(reply.structuredContent.investigation.dutyDisposition,'CONTESTED');
   assert.equal(reply.structuredContent.investigation.externalOutcome,'NOT_PROVEN');
   assert.deepEqual(JSON.parse(reply.content[0].text),reply.structuredContent);
  }
  assert.equal(relay.counts.commit,0);assert.equal(relay.counts.prepare,0);
 }finally{await mcpClient?.close();await http?.close();await issuer.close();}
 const client=createCooperativeClient({...config.destination,url:destination.url}),executor=createCooperativeExecutor({local,client,registry,role:'analyst',tenure:'shift:1'});
 const tool=createContinuityTool({registry,executor,tool:'ticket.create',operationId:'job:langchain',businessKey:'case:langchain'});
 const native=JSON.parse(await tool.invoke({title:'Native LangChain tool'}));assert.equal(native.lastReportedServiceState,'APPLIED');assert.equal(destination.inspect().effects.length,2);
 assert.equal(JSON.parse(await tool.invoke({title:'Native LangChain tool'})).status,'RECONCILIATION_ONLY');assert.equal(destination.inspect().effects.length,2);
 const conflict=await executor.run({operationId:'conflict',businessKey:'case:langchain',tool:'ticket.create',arguments:{title:'Native LangChain tool'}});assert.equal(conflict.serviceReport.result.code,'BUSINESS_KEY_CONFLICT');
 openLocalOwner(local).revoke('write');assert.equal(gateway.why('create_ticket').reason,'INSPECTION_DENIED');assert.equal(openLocalOwner(local).observe().authorize({actor:'worker',action:'create-ticket',resource:'queue'}).decision,'DENY');assert.equal(destination.inspect().effects.length,2);
 const recovery=createCooperativeRecovery({local,client,registry});const previous=await recovery.lookup({operationId:'job:langchain',businessKey:'case:langchain',tool:'ticket.create',arguments:{title:'Native LangChain tool'}});assert.equal(previous.serviceReport.result.state,'APPLIED');assert.equal(previous.dispatchPerformed,false);
 console.log(JSON.stringify({status:'PASS',core:'0.3.0-d04.1',remote:'0.3.0-d04.1',gateway:'0.3.0-d04.1',investigation:'CONTESTED',operatorCounts:true,mcpHttpCurrentView:true,node:process.version,initialEvents:320,finalEvents:openLocalOwner(local).observe().eventCount,effects:2,mcpUnknownRecoveredWithoutSend:true,signedObservation:true,langchainActualTool:true,businessConflictRetained:true,revocationRetained:true}));
}finally{await gateway?.close();await relay?.close();await destination?.close();rmSync(root,{recursive:true,force:true});}
