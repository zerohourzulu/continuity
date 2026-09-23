import {join} from 'node:path';
import {existsSync} from 'node:fs';
import {fromJsonSchema} from '@modelcontextprotocol/server';
import {observeHistory} from '@ramex-labs/continuity';
import {PortableFileEventStore,stateOf,openLocalExecution,derivePortableAdapterIdentity,
 approvedPortableAdapterProfileForPolicy,PORTABLE_ADAPTER_POLICY_E5_HASH,REMOTE_SERVICE_REPORT_ADAPTER_ID,
 createRemoteServiceReportAcknowledgment,portableAdapterAcknowledgmentEvidence} from '@ramex-labs/continuity/adapter';
import {check,data,exact,id,hash,same,privateDirectory,readPrivate,durableCreate,fail} from './data.mjs';
import {captureUpstream,approval,connectUpstream} from './upstream.mjs';

export function operationIdentity(domain,businessKey){return 'mcp:'+hash({version:'continuity-mcp-job/1',domain,businessKey:id(businessKey)}).slice(2);}
const reserved=new Set(['continuity_status','continuity_why']);
const safeCodes=new Set(['CAPACITY_RESERVED','CAPACITY_INCOMPATIBLE','CAPACITY_EVENT_LIMIT','INVALID_INPUT','TOOL_CHANGED','CATALOG_LIMIT','CATALOG_CONFLICT','RUNTIME_NOT_CURRENT','OPERATION_CONFLICT','HISTORY_CONFLICT','HISTORY_LIMIT','SIGNER_FAILED','STORAGE_UNAVAILABLE','INSPECTION_DENIED','UNKNOWN_TOOL','INVALID_ARGUMENTS','PROFILE_MISMATCH','CLOCK_INVALID','ACCESS_NOT_CURRENT','ADMISSION_REQUIRED','REPORT_UNAVAILABLE','REPORT_NOT_APPLIED','REPORT_MISMATCH','REPORT_ROLLBACK','REPORT_LIMIT']);
export function publicError(error){return {status:'REFUSED',reason:safeCodes.has(error.code)?error.code:'GATEWAY_UNAVAILABLE',mayHaveCommitted:error.mayHaveCommitted===true};}

/** Privileged host factory. Never expose this handle or its options to agents. */
export async function createGateway(options){
 check(options&&typeof options==='object');
 const local={...options.local,domain:data(options.local.domain)};
 const storage=privateDirectory(options.storage),timeout=options.timeoutMs??5000;
 check(Number.isSafeInteger(timeout)&&timeout>=100&&timeout<=30000);
 const configs=data(options.upstreams).map(captureUpstream);
 check(configs.length>0&&configs.length<=8);
 const servers=new Map();for(const c of configs){check(!servers.has(c.id));servers.set(c.id,c);}
 const jobs=new Map(),business=new Set();
 check(Array.isArray(options.operations)&&options.operations.length>0&&options.operations.length<=32);
 for(const input of options.operations){
  const j=exact(data(input),['name','upstream','tool','businessKey','action','resource','role','tenure','approval']);
  check(/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(j.name)&&!reserved.has(j.name)&&!jobs.has(j.name));
  for(const k of ['upstream','tool','businessKey','action','resource','role','tenure'])id(j[k]);
  check(servers.has(j.upstream)&&!business.has(j.businessKey));business.add(j.businessKey);
  check(same(approval(j.approval),j.approval)&&j.approval.name===j.tool);
  check(j.approval.inputSchema.type==='object','INVALID_INPUT');
  const inputSchema={...j.approval.inputSchema,additionalProperties:false};
  const schema=fromJsonSchema(inputSchema);
  jobs.set(j.name,{...j,inputSchema,schema,operationId:operationIdentity(local.domain,j.businessKey)});
 }
 const store=new PortableFileEventStore(local.historyFile);
 const readState=()=>{const events=store.readAll(),state=stateOf(events);check(same(state.genesis.domain,local.domain),'PROFILE_MISMATCH');return {events,state};};
 const initial=readState();
 check(initial.state.genesis.adapterPolicyHash===PORTABLE_ADAPTER_POLICY_E5_HASH,'PROFILE_MISMATCH');
 const session=initial.state.runtimeSessions.get(local.session);
 check(session&&session.controllerId===local.controller,'RUNTIME_NOT_CURRENT');
 const inspectPolicy=(job,action='inspect-operation',termsCommitment)=>{
  const {events,state}=readState(),at=local.now(),agent=state.agents.get(session.agentId),tenure=state.tenures.get(job.tenure);
  check(Number.isSafeInteger(at)&&at>=state.head.canonicalTime,'CLOCK_INVALID');
  check(agent&&!agent.terminated&&agent.currentControlEpoch===session.controlEpoch&&
   (session.expiresAt===undefined||at<session.expiresAt)&&state.roles.get(job.role)?.currentTenureId===job.tenure&&
   tenure&&!tenure.closed&&tenure.agentId===session.agentId,'RUNTIME_NOT_CURRENT');
  const decision=observeHistory(events,{at}).authorize({actor:session.agentId,action,resource:job.resource,...(termsCommitment?{termsCommitment}:{})});
  return {decision:decision.decision,head:decision.head.hash};
 };
 const lookup=name=>{const job=jobs.get(name);check(job,'UNKNOWN_TOOL');return job;};
 const paths=job=>({attempt:join(storage,job.operationId.slice(4)+'.attempt.json'),report:join(storage,job.operationId.slice(4)+'.report.json')});
 const getReport=(job,identity,terms)=>{
  const p=paths(job),attempt=readPrivate(p.attempt),report=readPrivate(p.report);
  const expectedIdentity={operationVersion:'continuity-adapter-submission/0.2',...identity};
  check(same(attempt.identity,expectedIdentity)&&same(attempt.terms,terms)&&report.attemptDigest===hash(attempt)&&same(report.identity,expectedIdentity),'STORAGE_UNAVAILABLE');
  check(report.version==='continuity-mcp-response/1'&&Buffer.byteLength(JSON.stringify(report.result))<=16384,'STORAGE_UNAVAILABLE');
  const consumption=readState().state.intentConsumptions.get(job.operationId);
  if(consumption)check(consumption.acknowledgment.result.kind==='REMOTE_SERVICE_REPORTED'&&consumption.acknowledgment.result.reportDigest.value===hash(report),'STORAGE_UNAVAILABLE');
  return report;
 };
 const connections=new Map();
 let busy=false,closed=false;
 const connection=async serverId=>{
  if(!connections.has(serverId))connections.set(serverId,await connectUpstream(servers.get(serverId),timeout));
  return connections.get(serverId);
 };
 const profile=approvedPortableAdapterProfileForPolicy(PORTABLE_ADAPTER_POLICY_E5_HASH,REMOTE_SERVICE_REPORT_ADAPTER_ID);
 const unknown=i=>({status:'OUTCOME_UNKNOWN',idempotencyKey:i.idempotencyKey,submissionFingerprint:i.submissionFingerprint});
 const reported=(report,i,status)=>{
  const acknowledgment=createRemoteServiceReportAcknowledgment(i,hash(report)),evidence=portableAdapterAcknowledgmentEvidence(i,acknowledgment);
  return {status,idempotencyKey:i.idempotencyKey,submissionFingerprint:i.submissionFingerprint,acknowledgment,...(status==='RETRY'?{retainedEvidence:evidence}:{evidence})};
 };
 return Object.freeze({
  tools:()=>[...jobs.values()].map(j=>({name:j.name,inputSchema:data(j.inputSchema),description:'Run the operator-approved '+j.tool+' job. Repeating this job inspects its original attempt; it never creates a new business operation.'})),
  async run(name,input,{assertCurrent=()=>{}}={}){
   if(busy)return {status:'BUSY'};check(!closed,'GATEWAY_UNAVAILABLE');busy=true;
   try{
    assertCurrent();
    const job=lookup(name),args=data(input);
    const valid=await job.schema['~standard'].validate(args);check(!valid.issues,'INVALID_ARGUMENTS');assertCurrent();
    const terms=data({version:'continuity-mcp-job/1',upstream:servers.get(job.upstream),tool:job.tool,approval:job.approval,
     businessKey:job.businessKey,action:job.action,resource:job.resource,arguments:args});
    const operation={id:job.operationId,action:job.action,resource:job.resource,role:job.role,tenure:job.tenure,termsCommitment:hash(terms)};
    let state=readState().state;
    const wasAdmitted=state.intentAdmissions.has(job.operationId);
    if(wasAdmitted)check(inspectPolicy(job).decision==='ALLOW','INSPECTION_DENIED');
    // Denied work must not launch any upstream process. Discovery is after a
    // current coarse check, but before the actual signed Core admission.
    let upstream;
    if(!wasAdmitted){
     const before=inspectPolicy(job,job.action,operation.termsCommitment);
     if(before.decision!=='ALLOW')return {status:'DENIED',reason:'CORE_POLICY'};
     assertCurrent();upstream=await connection(job.upstream);await upstream.verify(job.approval);assertCurrent();
    }
    let report;
    const adapter={adapterProfile:profile,
     submit(submission){
      assertCurrent();
      const i=derivePortableAdapterIdentity(submission),p=paths(job);
      try{durableCreate(p.attempt,{version:'continuity-mcp-attempt/1',identity:i,terms});}
      catch{return Promise.resolve(unknown(i));}
      // Admission and attempt retention precede transmission. The upstream may
      // finish after retirement; no recipient-side fence is claimed here.
      return upstream.call(job.approval,args).then(result=>{
       const attempt=readPrivate(p.attempt);
       const retained={version:'continuity-mcp-response/1',attemptDigest:hash(attempt),identity:i,result};
       durableCreate(p.report,retained);report=retained;return reported(report,i,'SUBMITTED');
      }).catch(()=>unknown(i));
     },
     reconcile(submission){const i=derivePortableAdapterIdentity(submission);try{report=getReport(job,i,terms);return reported(report,i,'RETRY');}catch{return unknown(i);}},
    };
    const checkedLocal={...local,async signHash(h){assertCurrent();const signature=await local.signHash(h);assertCurrent();return signature;}};
    assertCurrent();
    const result=await openLocalExecution(checkedLocal,adapter,'REMOTE_REPORT').run(operation);
    // Core can return an existing consumption without calling adapter.reconcile.
    // Load bytes separately and compare their digest to that canonical acknowledgment.
    if(!report){try{const admission=readState().state.intentAdmissions.get(job.operationId);if(admission)report=getReport(job,admission.adapterIdentity,terms);}catch{}}
    const invocation=result.invocation??result.result;
    const status=result.status==='NOT_AUTHORIZED'||result.status==='POLICY_REFUSED'?'DENIED':
     result.status==='NOT_ADMITTED'?'REFUSED':report?(wasAdmitted?'RECONCILIATION_ONLY':'RESPONSE_RETAINED'):'OUTCOME_UNKNOWN';
    return {status,operationId:job.operationId,coreStatus:result.status,canonicalDisposition:invocation?.status??null,
     externalOutcome:'NOT_PROVEN',enforcement:'GATEWAY_ADMISSION',
     ...(report?{upstreamResult:report.result,upstreamContentTrust:'UNTRUSTED_DATA'}:{})};
   }catch(error){return publicError(error);}finally{busy=false;}
  },
  status(name){
   try{
    const job=lookup(name);check(inspectPolicy(job).decision==='ALLOW','INSPECTION_DENIED');
    const state=readState().state,admission=state.intentAdmissions.get(job.operationId),declared=state.intentDeclarations.get(job.operationId);
    if(!admission)return {status:declared?'NOT_ADMITTED':'NOT_STARTED',operationId:job.operationId,dispatchPerformed:false};
    let report;
    try{const attempt=readPrivate(paths(job).attempt);
     check(hash(attempt.terms)===declared.data.termsCommitment,'STORAGE_UNAVAILABLE');
     // Only the configured resource/tool/contract may be inspected under this alias.
     check(attempt.terms.resource===job.resource&&attempt.terms.action===job.action&&attempt.terms.tool===job.tool&&attempt.terms.businessKey===job.businessKey&&same(attempt.terms.upstream,servers.get(job.upstream))&&same(attempt.terms.approval,job.approval),'STORAGE_UNAVAILABLE');
     report=getReport(job,admission.adapterIdentity,attempt.terms);
    }catch{}
    return {status:report?'RESPONSE_RETAINED':'OUTCOME_UNKNOWN',operationId:job.operationId,dispatchPerformed:false,
     responseDigest:report?hash(report):null,reportedError:report?report.result.isError:null,
     canonicalResponseRecorded:state.intentConsumptions.has(job.operationId),externalOutcome:'NOT_PROVEN'};
   }catch(error){return publicError(error);}
  },
  why(name){
   try{const job=lookup(name);check(inspectPolicy(job).decision==='ALLOW','INSPECTION_DENIED');
    const decision=inspectPolicy(job,job.action);
    return {decision:decision.decision,action:job.action,resource:job.resource,historyHead:decision.head,
     scope:'CURRENT_PERMISSION_ONLY',executionCapability:false,notes:'Admission also requires matching original arguments, current runtime, role, schema and available limits.'};
   }catch(error){return publicError(error);}
  },
  async close(){closed=true;await Promise.allSettled([...connections.values()].map(c=>c.close()));},
 });
}
