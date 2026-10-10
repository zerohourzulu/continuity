import { mkdirSync, existsSync, openSync, closeSync, unlinkSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import * as core from '../../../packages/core-0.2/src/core/index.ts';
import { captureBoundedCanonicalReplayBodyIncrementally } from '../../../packages/core-0.2/src/core/canonical.ts';
import { createPortableReplayKernel } from '../../../packages/core-0.2/src/core/portable-replay.ts';
import { PortableFileEventStore } from '../../../packages/core-0.2/src/indexer/portable-file-event-store.ts';
import { produceAdministrativeEvent } from '../../../packages/core-0.2/src/administration/index.ts';
import { selectInput, createPacketExecutor } from '../../core-0.2-reference/src/packet-executor.mjs';
import { writeNew } from '../../core-0.2-reference/src/io.mjs';
import { safeDirectory as directory, readJson } from './safe-io.mjs';
import { recoverPortableContentHashSigner } from '../../../packages/core-0.2/src/core/portable-authority-engine.ts';
import { validateProgressEntry, summarizeProgress } from '../../core-0.2-reference/src/review-progress.mjs';
export { core, writeNew, directory, readJson };
export const VERSION = '0.2';
export const MAX_EVENTS = 120;
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const bytes = value => Buffer.from(JSON.stringify(value) + '\n');
export const equal = (a,b) => core.canonicalEncode(a) === core.canonicalEncode(b);
export const assert = (ok, code) => { if (!ok) { const e = new Error(code); e.code = code; throw e; } };
export function slug(value) { assert(typeof value === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(value), 'CASE_ID_MUST_BE_LOWERCASE_SLUG'); return value; }
export function ids(caseId) {
  return Object.freeze(Object.fromEntries(['principal','controller','a','b','role','tenure-a','tenure-b','succession','collect-authority','obligate-authority','review-authority','progress-a-authority','progress-b-authority','obligation','resource','intent','nonce','stale-intent','stale-nonce'].map(name => [name, `${name}:${caseId}`])));
}
export const domainFor = caseId => ({ protocol: 'continuity', version: VERSION, deploymentId: `security-action-reference:${caseId}`, chainId: '31337', verifyingContract: '0x0000000000000000000000000000000000003002' });
export const policyFor = caseId => `local-evidence-intake-policy:${caseId}/${VERSION}`;
export const session = (caseId, who) => ({ runtimeSessionId: `session:${caseId}:${who}`, credentialKeyId: `key:${caseId}:${who}`, controlEpoch: 1 });
export const termsFor = (caseId, selection) => ({ caseId, subject: 'Collect the selected synthetic log packet; investigate and account for unresolved review.', syntheticOnly: true, selection, reviewDeadline: 1000 });
export function replay(events) {
  const kernel = createPortableReplayKernel();
  const captured = captureBoundedCanonicalReplayBodyIncrementally(events, Object.freeze({ operationVersion: core.PORTABLE_REPLAY_VERSION, events }), kernel.visit);
  assert(captured.status === 'CAPTURED', 'HISTORY_CAPTURE_FAILED');
  const result = kernel.finish(); assert(result.status === 'ACCEPTED', `HISTORY_REJECTED:${result.code ?? ''}`); return result.state;
}
export function event(caseId, suffix, type, timestamp, data) { return core.immutableProtocolValue({ id: `${caseId}:${suffix}`, type, timestamp, data }); }
export async function credentials() {
  // Public development scalars, never operational keys. Reuse already installed signing library.
  const requireCore = createRequire(new URL('../../../packages/core/package.json', import.meta.url));
  const { privateKeyToAccount } = await import(pathToFileURL(requireCore.resolve('viem/accounts')).href);
  return Object.freeze(Object.fromEntries([['a',1001],['b',1003]].map(([name,scalar]) => {
    const account = privateKeyToAccount(`0x${scalar.toString(16).padStart(64,'0')}`);
    return [name, { address: account.address, signHash: hash => account.signMessage({ message: { raw: hash } }) }];
  })));
}
export function validateConfig(config) {
  const caseId=slug(config.caseId);
  assert(equal(Object.keys(config).sort(),['actionResource','adapterPolicyHash','adapterProfile','caseId','domain','inputDirectory','schemaVersion','selection','terms','termsCommitment'].sort()),'ACTION_CASE_FIELDS');
  assert(config.schemaVersion==='continuity-security-action-case/1' && equal(config.domain,domainFor(caseId)) && config.adapterPolicyHash===core.PORTABLE_ADAPTER_POLICY_E2_HASH,'ACTION_CASE_DOMAIN');
  assert(config.actionResource==='synthetic-endpoint:'+caseId && equal(config.adapterProfile,core.approvedPortableAdapterProfile(core.LOCAL_EVIDENCE_PACKET_ADAPTER_ID)),'ACTION_CASE_PROFILE');
  assert(equal(config.terms,termsFor(caseId,config.selection)) && core.hashCanonical(config.terms)===config.termsCommitment,'ACTION_CASE_TERMS');
  return config;
}
export function load(path) {
  path=directory(path); const config=validateConfig(readJson(join(path,'case.json'),32768)),caseId=config.caseId;
  const store=new PortableFileEventStore(join(path,'history.jsonl')), history=store.readAll();
  assert(history.length>0 && history.length<=MAX_EVENTS,'ACTION_HISTORY_LIMIT');
  assert(equal(history[0].data.domain,config.domain) && history[0].data.adapterPolicyHash===config.adapterPolicyHash,'ACTION_HISTORY_DOMAIN');
  const i=ids(caseId),state=replay(history),declared=state.intentDeclarations.get(i.intent);
  if(declared) assert(declared.data.termsCommitment===config.termsCommitment && equal(declared.data.adapterProfile,config.adapterProfile),'ACTION_COLLECTION_CHANGED');
  let time=state.head.canonicalTime;
  const executor=createPacketExecutor({inputDirectory:config.inputDirectory,outputDirectory:directory(join(path,'execution')),selection:config.selection,termsCommitment:config.termsCommitment,resource:i.resource,domain:config.domain,intentId:i.intent});
  return {path,config,i,store,executor,now:()=>time,advance:()=>++time,state:()=>replay(store.readAll())};
}
export async function locked(path,operation) {
  path=directory(path); const lock=join(path,'.command.lock'),fd=openSync(lock,'wx',0o600);
  try{return await operation(load(path));}finally{closeSync(fd);unlinkSync(lock);}
}
export function append(context, suffix, type, data) {
  const history = context.store.readAll(); assert(history.length < MAX_EVENTS, 'CASE_EVENT_LIMIT');
  const before = replay(history).head, next = event(context.config.caseId,suffix,type,context.advance(),data);
  const head = context.store.appendAtExpectedHead(next,before);
  assert(equal(head,replay(context.store.readAll()).head), 'APPEND_READBACK_MISMATCH'); return next;
}
export function reserveEvents(c, count) {
  assert(Number.isInteger(count) && count>=0 && c.store.readAll().length+count<=MAX_EVENTS,'CASE_EVENT_LIMIT');
}
export async function administrative(c, suffix, type, data, who, handles) {
  reserveEvents(c,1);
  const history = c.store.readAll(), expectedHistoryHead = replay(history).head;
  const transition = event(c.config.caseId,suffix,type,c.advance(),data);
  const result = await produceAdministrativeEvent({ events: history, expectedDomain: c.config.domain, expectedHistoryHead, transition, runtimeSessionId: session(c.config.caseId,who).runtimeSessionId }, { signHash: handles[who].signHash });
  const head = c.store.appendAtExpectedHead(result.event,expectedHistoryHead);
  assert(equal(head,result.replayHead), 'ADMINISTRATIVE_READBACK_MISMATCH'); return result.event;
}
export function inspectBoundPacket(c, state=c.state()) {
  const consumed=state.intentConsumptions.get(c.i.intent);
  if(c.config.adapterProfile.profileId===core.SIMULATED_ADAPTER_ID) return {status:consumed?'SIMULATED_ACKNOWLEDGMENT_RECORDED':'NOT_STARTED',acknowledgment:consumed?.acknowledgment??null,files:[],externalEffect:'NONE_SIMULATED'};
  const packet=c.executor.inspect();
  if(packet.status==='PACKET_VERIFIED' && consumed &&
    (consumed.transactionReference!==`0x${packet.manifestSha256}` || consumed.idempotencyKey!==packet.manifest.idempotencyKey || consumed.submissionFingerprint!==packet.manifest.submissionFingerprint || packet.manifest.intentId!==c.i.intent || !equal(consumed.acknowledgment,packet.acknowledgment))) {
    return {status:'OUTCOME_UNKNOWN',reason:'PACKET_DOES_NOT_MATCH_CANONICAL_ACKNOWLEDGMENT'};
  }
  return packet;
}
export function grant(c, name, grantee, actions, resources, timestamp) {
  return event(c,name,'AUTHORITY_GRANTED',timestamp,{ grant: { kind:'PERMISSION', authorityId:ids(c)[name],grantorId:ids(c).principal,granteeId:grantee,rootAuthorityId:ids(c)[name],independent:true,constraints:{actions,resources,quantitative:false,expiresAt:1000,maxDelegationDepth:0,requiredIntersectionIds:[]} } });
}
export async function createInitialCase(caseDirectory,caseId,inputDirectory) {
  const adapterProfile=core.approvedPortableAdapterProfile(core.LOCAL_EVIDENCE_PACKET_ADAPTER_ID);
  slug(caseId); const input = directory(resolve(inputDirectory)), selection = selectInput(input), terms = termsFor(caseId,selection), i = ids(caseId);
  const handles = await credentials();
  const config = { adapterProfile, schemaVersion:"continuity-security-action-case/1",adapterPolicyHash:core.PORTABLE_ADAPTER_POLICY_E2_HASH,actionResource:"synthetic-endpoint:"+caseId,caseId,inputDirectory:input,selection,terms,termsCommitment:core.hashCanonical(terms),domain:domainFor(caseId) };
  const e=(suffix,type,time,data)=>event(caseId,suffix,type,time,data);
  const initial=[
    e('genesis','DEPLOYMENT_INITIALIZED',0,{domain:config.domain,adapterPolicyHash:core.PORTABLE_ADAPTER_POLICY_E2_HASH,canonicalLineageId:`lineage:${caseId}`,versions:{eventSchemaVersion:`continuity-event/${VERSION}`,receiptSchemaVersion:`continuity-receipt/${VERSION}`,queryEnvelopeVersion:`continuity-query-envelope/${VERSION}`,authorizationProofVersion:`continuity-authorization-proof/${VERSION}`,runtimeAuthorizationVersion:`continuity-runtime-authorization/${VERSION}`,administrativeAuthorizationVersion:`continuity-administrative-authorization/${VERSION}`,signatureScheme:'eip191-personal-sign-keccak256'},policyVersion:policyFor(caseId),rootRecognitionPolicy:`declared-principal-root/${VERSION}`,globalPolicySourceId:`policy-source:${caseId}`,timeSource:'EVENT_TIMESTAMP',finality:'LOCAL_ONLY'}),
    e('principal','PRINCIPAL_CREATED',1,{principalId:i.principal}),
    e('a','AGENT_CREATED',2,{agentId:i.a,principalId:i.principal,controllerId:i.controller,initialControlEpoch:1}),
    e('b','AGENT_CREATED',3,{agentId:i.b,principalId:i.principal,controllerId:i.controller,initialControlEpoch:1}),
    e('role','ROLE_CREATED',4,{roleId:i.role,principalId:i.principal,exclusive:true}),
    e('succession','SUCCESSION_RULE_DECLARED',5,{ruleId:i.succession,principalId:i.principal,predecessorAgentId:i.a,successorAgentId:i.b,roleId:i.role,trigger:'AGENT_TERMINATED',permittedEventTypes:['AGENT_TERMINATED','ROLE_TRANSFERRED','OBLIGATION_PERFORMANCE_ASSIGNED']}),
    e('appointment','AGENT_APPOINTED',6,{agentId:i.a,roleId:i.role,roleTenureId:i['tenure-a'],tenureNumber:1,principalId:i.principal,successionRuleId:i.succession}),
    e('session-a','RUNTIME_SESSION_ADMITTED',7,{sessionId:session(caseId,'a').runtimeSessionId,agentId:i.a,controllerId:i.controller,controlEpoch:1,credentialKeyId:session(caseId,'a').credentialKeyId,credentialAddress:handles.a.address,expiresAt:10000}),
    grant(caseId,'collect-authority',i.a,['collect-evidence-packet'],[i.resource],8),
    grant(caseId,'obligate-authority',i.a,['OBLIGATE'],[i.resource],9),
    grant(caseId,'review-authority',i.b,['ASSIGN_PERFORMANCE','record-collection-disposition'],[i.obligation],10),
    grant(caseId,'progress-a-authority',i.a,['record-review-progress'],[i.obligation],11),
    grant(caseId,'progress-b-authority',i.b,['record-review-progress'],[i.obligation],12),
  ];
  replay(initial); // Validate the prepared setup before creating any case directory.
  const target=resolve(caseDirectory); directory(resolve(target,'..')); mkdirSync(target,{mode:0o700}); mkdirSync(join(target,'execution'),{mode:0o700}); mkdirSync(join(target,'actions'),{mode:0o700}); mkdirSync(join(target,'snapshots'),{mode:0o700}); mkdirSync(join(target,'effect'),{mode:0o700});
  writeNew(join(target,'case.json'),bytes(config));
  new PortableFileEventStore(join(target,'history.jsonl')).appendAll(initial);
  return {caseId,path:target,config};
}
export function progressAuthorization(caseId, config, history, actorId) {
  const state=replay(history), i=ids(caseId), who=actorId===i.a?'a':actorId===i.b?'b':undefined;
  assert(who,'REVIEW_ACTOR_UNKNOWN');
  const agent=state.agents.get(actorId), runtime=state.runtimeSessions.get(session(caseId,who).runtimeSessionId);
  assert(agent && !agent.terminated,'REVIEW_AGENT_INACTIVE');
  assert(runtime && runtime.agentId===actorId && runtime.controlEpoch===agent.currentControlEpoch && runtime.controlEpoch===1,'REVIEW_SESSION_FENCED');
  assert(runtime.expiresAt===undefined || state.head.canonicalTime<runtime.expiresAt,'REVIEW_SESSION_EXPIRED');
  const tenureId=i[`tenure-${who}`], tenure=state.tenures.get(tenureId), duty=state.obligations.get(i.obligation);
  assert(tenure && !tenure.closed && state.roles.get(i.role)?.currentTenureId===tenureId,'REVIEW_ROLE_NOT_CURRENT');
  assert(duty && duty.performanceAssigneeId===actorId && ['OPEN','OUTCOME_UNKNOWN'].includes(duty.status),'REVIEW_ASSIGNMENT_REQUIRED');
  const authorization=core.authorizePortable({operationVersion:core.PORTABLE_AUTHORIZATION_VERSION,events:history,expectedHistoryHead:state.head,domain:config.domain,policyVersion:policyFor(caseId),rootRecognitionPolicy:core.PORTABLE_ROOT_RECOGNITION_POLICY,request:{actorId,action:'record-review-progress',resource:i.obligation,claimedAt:state.head.canonicalTime},evaluationTime:state.head.canonicalTime,authoritative:true,consequential:false});
  assert(authorization.decision==='ALLOW' && authorization.scopeAssurance==='REPLAY_VERIFIED','REVIEW_AUTHORITY_REQUIRED');
  assert(authorization.proof.controllingAuthorityIds.includes(i[`progress-${who}-authority`]),'REVIEW_INDEPENDENT_GRANT_REQUIRED');
  return {who,state,runtime,tenureId,authorization};
}
export function verifyProgressRecords(caseId, config, history, packet, entries) {
  const summary=summarizeProgress(config.selection,entries);
  let previous=null, previousPosition=-1;
  for(const entry of entries) {
    validateProgressEntry(entry);
    assert(entry.schemaVersion==='continuity-review-progress/1','ACTION_REVIEW_PROGRESS_VERSION_UNSUPPORTED');
    assert(entry.caseId===caseId && packet.status==='PACKET_VERIFIED' && entry.packetManifestSha256===packet.manifestSha256,'REVIEW_PACKET_BINDING');
    assert(entry.previousRecordHash===previous,'REVIEW_RECORD_CHAIN');
    assert(entry.historyHead.position>=previousPosition && entry.historyHead.position<history.length,'REVIEW_HISTORY_ORDER');
    const prefix=history.slice(0,entry.historyHead.position+1), check=progressAuthorization(caseId,config,prefix,entry.actorId);
    assert(equal(check.state.head,entry.historyHead),'REVIEW_HISTORY_BINDING');
    assert(entry.runtimeSessionId===check.runtime.id && entry.controlEpoch===check.runtime.controlEpoch && entry.roleTenureId===check.tenureId,'REVIEW_ACTOR_BINDING');
    assert(entry.authorizationProofHash===core.hashCanonical(check.authorization.proof),'REVIEW_AUTHORIZATION_BINDING');
    const {signature,...unsigned}=entry;
    assert(recoverPortableContentHashSigner(core.hashCanonical(unsigned),signature)===check.runtime.credentialAddressKey,'REVIEW_SIGNATURE_INVALID');
    previous=core.hashCanonical(entry); previousPosition=entry.historyHead.position;
  }
  return {...summary,verification:entries.length?'HISTORICAL_SIGNATURE_AND_SCOPE_VERIFIED':'NO_RECORDS',lastRecordHash:previous};
}
