import { mkdirSync, lstatSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { readRegular, parseJson, list, presentDirectory, safeDirectory } from './safe-io.mjs';
import { core, sha, bytes, equal, assert, ids, replay, slug, validateConfig, verifyProgressRecords, writeNew } from './protocol.mjs';
import { validateSupplementRecord, encodeSupplementRecord } from '../../core-0.2-reference/src/review-supplement-format.mjs';

const MATERIAL='continuity-action-review-material/1', SNAPSHOT='continuity-security-action-snapshot/1';
const BASE=['case.json','execution/attempt.json','execution/ack.json','execution/packet/manifest.json'];
const row=(path,data)=>({path,bytes:data.length,sha256:sha(data)});
const exact=(value,keys)=>value!==null && typeof value==='object' && !Array.isArray(value) && equal(Object.keys(value).sort(),[...keys].sort());
function materialNames(config, noteNames, supplementPresent) {
  return [...BASE,...config.selection.map(x=>'execution/packet/files/'+x.name),
    ...noteNames.map(x=>'review-progress/'+x),...(supplementPresent?['review-supplement/MANIFEST.json','review-supplement/SOURCE.log']:[])].sort();
}
function checkNotes(names) {
  assert(names.length<=32 && names.every((name,i)=>name===String(i+1).padStart(3,'0')+'.json'),'ACTION_PROGRESS_MEMBERSHIP');
}
function materialObject(config, originals, progressDirectoryPresent, supplementPresent) {
  const files=[...originals].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([p,b])=>row(p,b));
  const value={schemaVersion:MATERIAL,caseId:config.caseId,files,progressDirectoryPresent,supplementPresent};
  assert(files.length<=48 && bytes(value).length<=16384 && files.reduce((n,r)=>n+r.bytes,0)<=2*1024*1024,'ACTION_MATERIAL_LIMIT');
  return value;
}
function deriveReview(events, originals, progressDirectoryPresent, supplementPresent) {
  assert(events.length>0 && events.length<=120,'ACTION_SNAPSHOT_HISTORY_LIMIT');
  const config=validateConfig(parseJson(originals.get('case.json'),32768)),i=ids(config.caseId),state=replay(events);
  assert(equal(events[0].data.domain,config.domain) && events[0].data.adapterPolicyHash===core.PORTABLE_ADAPTER_POLICY_E2_HASH,'ACTION_SNAPSHOT_DOMAIN');
  const noteNames=[...originals.keys()].filter(x=>x.startsWith('review-progress/')).map(x=>x.slice(16)).sort();
  checkNotes(noteNames); assert(progressDirectoryPresent || noteNames.length===0,'ACTION_PROGRESS_PRESENCE');
  assert(equal([...originals.keys()].sort(),materialNames(config,noteNames,supplementPresent)),'ACTION_MATERIAL_MEMBERSHIP');
  const admissionIndex=events.findIndex(x=>x.type==='TRANSACTION_INTENT_ADMITTED' && x.data.intentId===i.intent);
  assert(admissionIndex>=0,'ACTION_COLLECTION_ADMISSION_REQUIRED');
  const identity=core.derivePortableAdapterIdentity({operationVersion:'continuity-adapter-submission/0.2',domain:config.domain,
    intentId:i.intent,admissionEvent:events[admissionIndex],admittedHistory:events.slice(0,admissionIndex+1)});
  const declaration=state.intentDeclarations.get(i.intent),consumed=state.intentConsumptions.get(i.intent);
  assert(declaration && consumed && declaration.data.termsCommitment===config.termsCommitment &&
    equal(declaration.data.adapterProfile,config.adapterProfile),'ACTION_COLLECTION_BINDING');
  const signedRequest=events[admissionIndex].data.authorizationProof.request;
  for(const request of [declaration.data,signedRequest]) assert(request && request.actorId===i.a &&
    request.action==='collect-evidence-packet' && request.resource===i.resource &&
    request.termsCommitment===config.termsCommitment,'ACTION_COLLECTION_REQUEST_BINDING');
  const record=schemaVersion=>({schemaVersion,idempotencyKey:identity.idempotencyKey,submissionFingerprint:identity.submissionFingerprint,
    intentId:i.intent,selection:config.selection,termsCommitment:config.termsCommitment,resource:i.resource,adapterIdentity:identity});
  const attempt=parseJson(originals.get('execution/attempt.json'),16384);
  const manifest=parseJson(originals.get('execution/packet/manifest.json'),16384);
  assert(equal(attempt,record('continuity-local-packet-attempt/0.2')) &&
    equal(manifest,record('continuity-local-packet-manifest/0.2')),'ACTION_PACKET_IDENTITY');
  assert(originals.get('execution/attempt.json').equals(bytes(attempt)) &&
    originals.get('execution/packet/manifest.json').equals(bytes(manifest)),'ACTION_PACKET_ENCODING');
  const manifestSha256=sha(originals.get('execution/packet/manifest.json'));
  const acknowledgment=core.createPortableAdapterAcknowledgment(identity,'0x'+manifestSha256);
  const ack={schemaVersion:'continuity-local-packet-ack/0.2',idempotencyKey:identity.idempotencyKey,
    submissionFingerprint:identity.submissionFingerprint,manifestSha256,acknowledgment,
    evidence:core.portableAdapterAcknowledgmentEvidence(identity,acknowledgment)};
  assert(originals.get('execution/ack.json').equals(bytes(ack)) && equal(consumed.acknowledgment,acknowledgment) &&
    consumed.transactionReference==='0x'+manifestSha256,'ACTION_PACKET_ACK');
  for(const item of config.selection) {
    const data=originals.get('execution/packet/files/'+item.name);
    assert(data.length===item.bytes && sha(data)===item.sha256,'ACTION_PACKET_FILE');
  }
  const packet={status:'PACKET_VERIFIED',manifestSha256,manifest,files:config.selection,acknowledgment};
  const entries=noteNames.map(x=>parseJson(originals.get('review-progress/'+x),32768));
  const progress=verifyProgressRecords(config.caseId,config,events,packet,entries);
  let supplement=null;
  if(supplementPresent) {
    supplement=validateSupplementRecord(parseJson(originals.get('review-supplement/MANIFEST.json'),4096));
    const source=originals.get('review-supplement/SOURCE.log'),h=supplement.observedHistoryHead;
    assert(supplement.caseId===config.caseId && supplement.basePacketManifestSha256===manifestSha256 &&
      source.length===supplement.bytes && source.length<=16384 && sha(source)===supplement.sha256 &&
      originals.get('review-supplement/MANIFEST.json').equals(encodeSupplementRecord(supplement)),'ACTION_SUPPLEMENT_BINDING');
    new TextDecoder('utf-8',{fatal:true}).decode(source);
    assert(h.position<events.length && equal(replay(events.slice(0,h.position+1)).head,h),'ACTION_SUPPLEMENT_PREFIX');
  }
  const obligation=state.obligations.get(i.obligation); assert(obligation,'ACTION_REVIEW_DUTY_REQUIRED');
  const summary={schemaVersion:'continuity-security-action-review-summary/1',caseId:config.caseId,head:state.head,
    packet:{status:packet.status,manifestSha256,files:packet.files},progress,
    duty:{obligationId:i.obligation,bearer:obligation.record.durableRoleId,performer:obligation.performanceAssigneeId,status:obligation.status},
    supplement,sourceTruth:'NOT_PROVEN',operatorApproval:'NOT_AUTHENTICATED'};
  return {config,events,originals,entries,summary,material:materialObject(config,originals,progressDirectoryPresent,supplementPresent)};
}
export function captureReview(c) {
  const history=c.store.readAll();
  assert(equal(list(join(c.path,'execution'),3),['ack.json','attempt.json','packet']) &&
    equal(list(join(c.path,'execution/packet'),2),['files','manifest.json']) &&
    equal(list(join(c.path,'execution/packet/files'),8),c.config.selection.map(x=>x.name)),'ACTION_PACKET_MEMBERSHIP');
  const progressDirectoryPresent=presentDirectory(join(c.path,'review-progress'));
  const noteNames=progressDirectoryPresent?list(join(c.path,'review-progress'),32):[]; checkNotes(noteNames);
  const supplementPresent=presentDirectory(join(c.path,'review-supplement'));
  if(supplementPresent) assert(equal(list(join(c.path,'review-supplement'),2),['MANIFEST.json','SOURCE.log']),'ACTION_SUPPLEMENT_MEMBERSHIP');
  const originals=new Map(materialNames(c.config,noteNames,supplementPresent).map(p=>[p,readRegular(join(c.path,p),65536)]));
  const result=deriveReview(history,originals,progressDirectoryPresent,supplementPresent);
  assert(equal(result.config,c.config),'ACTION_CONFIG_CHANGED');
  for(const [p,b] of originals) assert(b.equals(readRegular(join(c.path,p),65536)),'ACTION_MATERIAL_CHANGED');
  assert(equal(history,c.store.readAll()),'ACTION_HISTORY_CHANGED');
  assert(progressDirectoryPresent===presentDirectory(join(c.path,'review-progress')) &&
    supplementPresent===presentDirectory(join(c.path,'review-supplement')),'ACTION_MATERIAL_PRESENCE_CHANGED');
  if(progressDirectoryPresent) assert(equal(noteNames,list(join(c.path,'review-progress'),32)),'ACTION_PROGRESS_CHANGED');
  assert(equal(list(join(c.path,'execution'),3),['ack.json','attempt.json','packet']) &&
    equal(list(join(c.path,'execution/packet'),2),['files','manifest.json']) &&
    equal(list(join(c.path,'execution/packet/files'),8),c.config.selection.map(x=>x.name)),'ACTION_PACKET_MEMBERSHIP_CHANGED');
  if(supplementPresent) assert(equal(list(join(c.path,'review-supplement'),2),['MANIFEST.json','SOURCE.log']),'ACTION_SUPPLEMENT_CHANGED');
  return result;
}
function payloadFor(review) {
  const payload=new Map([['history.json',bytes(review.events)],['summary.json',bytes(review.summary)],
    ['progress.json',bytes(review.entries)],['material.json',bytes(review.material)]]);
  for(const [p,b] of review.originals) payload.set('originals/'+p,b);
  return payload;
}
export function createSnapshot(c,snapshotId) {
  slug(snapshotId); const review=captureReview(c),payload=payloadFor(review);
  const manifest={schemaVersion:SNAPSHOT,caseId:c.config.caseId,snapshotId,head:review.summary.head,
    files:[...payload].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([p,b])=>row(p,b))};
  assert(bytes(manifest).length<=16384,'ACTION_SNAPSHOT_MANIFEST_LIMIT');
  const target=join(c.path,'snapshots',snapshotId); safeDirectory(dirname(target));mkdirSync(target,{mode:0o700});
  for(const [p,b] of payload) { mkdirSync(dirname(join(target,p)),{recursive:true,mode:0o700});writeNew(join(target,p),b); }
  writeNew(join(target,'MANIFEST.json'),bytes(manifest));
  return {snapshotId,manifestSha256:sha(bytes(manifest)),head:manifest.head,materialSha256:sha(bytes(review.material))};
}
function treeFiles(root, prefix='',depth=0) {
  assert(depth<=5,'ACTION_SNAPSHOT_DEPTH'); const result=[];
  for(const name of list(join(root,prefix),64)) {
    assert(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(name),'ACTION_SNAPSHOT_PATH');
    const p=prefix?prefix+'/'+name:name,s=lstatSync(join(root,p));
    assert(!s.isSymbolicLink(),'ACTION_SNAPSHOT_ALIAS');
    if(s.isDirectory()) { const child=treeFiles(root,p,depth+1);assert(child.length>0,'ACTION_SNAPSHOT_EMPTY_DIRECTORY');result.push(...child); }
    else { assert(s.isFile() && s.nlink===1,'ACTION_SNAPSHOT_FILE');result.push(p); }
    assert(result.length<=64,'ACTION_SNAPSHOT_MEMBERSHIP_LIMIT');
  }
  return result.sort();
}
export function readSnapshot(caseDirectory,snapshotId,expectedSha256) {
  slug(snapshotId);assert(typeof expectedSha256==='string' && /^[0-9a-f]{64}$/.test(expectedSha256),'ACTION_SNAPSHOT_PIN');
  const root=join(safeDirectory(caseDirectory),'snapshots',snapshotId),manifestBytes=readRegular(join(root,'MANIFEST.json'),16384);
  assert(sha(manifestBytes)===expectedSha256,'ACTION_SNAPSHOT_PIN');
  const manifest=parseJson(manifestBytes,16384);
  assert(exact(manifest,['schemaVersion','caseId','snapshotId','head','files']) && manifest.schemaVersion===SNAPSHOT &&
    manifest.snapshotId===snapshotId && manifestBytes.equals(bytes(manifest)) && Array.isArray(manifest.files) &&
    manifest.files.length>=4 && manifest.files.length<=52,'ACTION_SNAPSHOT_MANIFEST');
  const names=[];let total=0;const payload=new Map();
  for(const item of manifest.files) {
    assert(exact(item,['path','bytes','sha256']) && typeof item.path==='string' &&
      /^(?:history\.json|summary\.json|progress\.json|material\.json|originals\/[A-Za-z0-9][A-Za-z0-9._/-]{0,255})$/.test(item.path) &&
      item.path.split('/').every(x=>x!=='.' && x!=='..' && x!=='') &&
      Number.isSafeInteger(item.bytes) && !Object.is(item.bytes,-0) && item.bytes>=0 && item.bytes<=1048576 &&
      typeof item.sha256==='string' && /^[0-9a-f]{64}$/.test(item.sha256),'ACTION_SNAPSHOT_ROW');
    assert(names.length===0 || names.at(-1)<item.path,'ACTION_SNAPSHOT_ORDER');names.push(item.path);
    total+=item.bytes;assert(total<=4*1024*1024,'ACTION_SNAPSHOT_TOTAL');
    const data=readRegular(join(root,item.path),item.bytes);assert(data.length===item.bytes && sha(data)===item.sha256,'ACTION_SNAPSHOT_BYTES');payload.set(item.path,data);
  }
  assert(equal(treeFiles(root),[...names,'MANIFEST.json'].sort()),'ACTION_SNAPSHOT_MEMBERSHIP');
  const materialBytes=payload.get('material.json'),material=parseJson(materialBytes,16384);
  assert(exact(material,['schemaVersion','caseId','files','progressDirectoryPresent','supplementPresent']) &&
    material.schemaVersion===MATERIAL && typeof material.progressDirectoryPresent==='boolean' &&
    typeof material.supplementPresent==='boolean','ACTION_MATERIAL_SHAPE');
  const originals=new Map([...payload].filter(([p])=>p.startsWith('originals/')).map(([p,b])=>[p.slice(10),b]));
  const result=deriveReview(parseJson(payload.get('history.json'),1048576),originals,material.progressDirectoryPresent,material.supplementPresent);
  assert(manifest.caseId===result.config.caseId && equal(manifest.head,result.summary.head) &&
    materialBytes.equals(bytes(result.material)) && payload.get('summary.json').equals(bytes(result.summary)) &&
    payload.get('progress.json').equals(bytes(result.entries)),'ACTION_SNAPSHOT_RECONSTRUCTION');
  assert(equal([...payload.keys()].sort(),[...payloadFor(result).keys()].sort()),'ACTION_SNAPSHOT_MIRRORS');
  for(const [p,b] of payload) assert(b.equals(readRegular(join(root,p),1048576)),'ACTION_SNAPSHOT_CHANGED');
  assert(manifestBytes.equals(readRegular(join(root,'MANIFEST.json'),16384)),'ACTION_SNAPSHOT_CHANGED');
  return {...result,snapshotId,manifestSha256:expectedSha256,manifestUtf8:manifestBytes.toString('utf8'),materialUtf8:materialBytes.toString('utf8')};
}
export function assertReviewedCurrent(c,snapshot,suffix=[]) {
  assert(equal(c.store.readAll(),[...snapshot.events,...suffix]),'ACTION_REVIEW_CONTEXT_CHANGED');
  const current=captureReview(c);
  assert(bytes(current.material).equals(bytes(snapshot.material)),'ACTION_REVIEW_CONTEXT_CHANGED');
  for(const [p,b] of snapshot.originals) assert(b.equals(current.originals.get(p)),'ACTION_REVIEW_CONTEXT_CHANGED');
  return true;
}
