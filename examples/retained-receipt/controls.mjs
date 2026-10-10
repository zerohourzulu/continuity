// Proposed finite controls. This file has not been imported or executed.
// Root selects actual producer/fresh-reader execution separately, once each.
import assert from 'node:assert/strict';
import {canonicalEncode} from '@ramex-labs/continuity/adapter';
import {decodeEnvelope,encodeEnvelope,LIMITS,readEnvelope} from './envelope.mjs';
import {inspectBytes} from './inspect.mjs';

const refused=(fn,code)=>assert.throws(fn,error=>error.code===code);
const copy=v=>decodeEnvelope(encodeEnvelope(v));
export function checkProducedEnvelope(raw){
 // raw must come from the one actual separately selected producer, never a
 // source-authored successful fixture. These are new composition observations.
 const value=decodeEnvelope(raw),result=inspectBytes(raw);
 assert.equal(result.receipt.status,'EVALUATED');assert.equal(result.receipt.authentic,true);
 assert.equal(result.receipt.historical,true);assert.equal(result.receipt.current,false);
 assert.equal(result.receipt.canonicalInclusion.status,'PASS');
 assert.equal(result.freshReplay.dutyStatus,'OPEN');assert.equal(result.freshReplay.successorReadDecision,'DENY');
 assert.equal(result.producerReported.repeatedOperation,'RECONCILIATION_ONLY');
 assert.equal(result.producerReportsIndependentlyAuthenticated,false);assert.equal(result.permitsExecution,false);
 assert.equal(result.settings.zkProofMode,'NOT_APPLICABLE');
 // One focused subject-lineage mutation, not an authentic alternative receipt.
 const otherIntent=copy(value);otherIntent.artifact.value.payload.intent.intentId='other:42';
 refused(()=>inspectBytes(encodeEnvelope(otherIntent)),'ARTIFACT_SUBJECT_INTENT_BINDING');
 const changed=copy(value);const original=changed.artifact.value.signature;
 changed.artifact.value.signature=original.slice(0,2)+(original[2]==='0'?'1':'0')+original.slice(3);
 const invalid=inspectBytes(encodeEnvelope(changed));
 assert.ok(invalid.receipt.status!=='EVALUATED'||invalid.receipt.authentic===false);
 // A changed ECDSA signature may recover a different key: possession can
 // remain PASS while issuer authentication fails. Never conflate the axes.
 const changedHash=copy(value),hash=changedHash.artifact.value.contentHash;
 changedHash.artifact.value.contentHash='0x'+(hash[2]==='0'?'1':'0')+hash.slice(3);
 const corrupt=inspectBytes(encodeEnvelope(changedHash));
 assert.equal(corrupt.receipt.status,'EVALUATED');assert.equal(corrupt.receipt.contentIntegrity.status,'FAIL');assert.equal(corrupt.receipt.authentic,false);
 const absent=copy(value);absent.artifact={availability:'UNAVAILABLE',value:null};
 const unavailable=inspectBytes(encodeEnvelope(absent));
 assert.equal(unavailable.receipt.status,'UNAVAILABLE');assert.equal(unavailable.receipt.badReceiptInference,false);
 assert.equal(unavailable.freshReplay.dutyStatus,'OPEN');
 const truncated=copy(value);truncated.issuanceEvents.pop();
 refused(()=>inspectBytes(encodeEnvelope(truncated)),'REPLAY_HEAD_BINDING');
 // Canonical byte comparison is the duplicate-key detector; never accept
 // JSON.parse's last-key overwrite as the envelope's original typed record.
 const text=raw.toString('utf8');const duplicate=text.replace('"schema":','"schema":"discarded","schema":');
 refused(()=>decodeEnvelope(Buffer.from(duplicate)),'NONCANONICAL_ENVELOPE');
 // Isolated codec-only data: never inspect/replay these mutated events.
 // Their old heads/signature are intentionally not evidence for the mutation.
 const codecOnly=[];
 for(const n of [0n,17n,(1n<<256n)-1n]){
  const codecValue=copy(value);codecValue.observedEvents[0].data={companionCodecOnly:n};
  const encoded=encodeEnvelope(codecValue),decoded=decodeEnvelope(encoded);
  assert.equal(typeof decoded.observedEvents[0].data.companionCodecOnly,'bigint');
  assert.equal(decoded.observedEvents[0].data.companionCodecOnly,n);
  assert.ok(encodeEnvelope(decoded).equals(encoded));
  codecOnly.push({decimal:n.toString(),scope:'CODEC_ONLY',coreOrReceiptAuthenticityCredit:false});
 }
 const aboveBound=JSON.parse(text);aboveBound.observedEvents[0].data={'$continuity.bigint':(1n<<256n).toString()};
 refused(()=>decodeEnvelope(Buffer.from(JSON.stringify(aboveBound))),'BIGINT_BOUND');
 const wrongMarker=JSON.parse(text);wrongMarker.observedEvents[0].data={'$bigint':'1'};
 refused(()=>decodeEnvelope(Buffer.from(JSON.stringify(wrongMarker))),'FOREIGN_OR_RESERVED_MARKER');
 const leadingZero=JSON.parse(text);leadingZero.observedEvents[0].data={'$continuity.bigint':'01'};
 refused(()=>decodeEnvelope(Buffer.from(JSON.stringify(leadingZero))),'BIGINT_DECIMAL');
 const wrongShape=JSON.parse(text);wrongShape.observedEvents[0].data={'$continuity.bigint':'1',extra:true};
 refused(()=>decodeEnvelope(Buffer.from(JSON.stringify(wrongShape))),'BIGINT_MARKER_SHAPE');
 refused(()=>decodeEnvelope(Buffer.alloc(LIMITS.bytes+1)),'ENVELOPE_BYTE_BOUND');
 refused(()=>decodeEnvelope(Buffer.from([0xff])),'ENVELOPE_JSON');
 const typed=copy(value);typed.verifierTime='100';
 refused(()=>encodeEnvelope(typed),'ENVELOPE_TIME');
 assert.equal(canonicalEncode(decodeEnvelope(raw)),text);
 return {status:'PROPOSED_COMPOSITION_CONTROLS_COMPLETED',genuineInputSource:'ACTUAL_SELECTED_PRODUCER_OUTPUT_REQUIRED',
  composition:{authentic:result.receipt.authentic,historical:result.receipt.historical,current:result.receipt.current,
   canonicalInclusion:result.receipt.canonicalInclusion.status,dutyStatus:result.freshReplay.dutyStatus,successorReadDecision:result.freshReplay.successorReadDecision},
  codecOnly,codecOnlyCoreOrReceiptAuthenticityCredit:false,nativeOrQOrProofInvocations:0,acceptance:false};
}
export function checkMissingFile(path){refused(()=>readEnvelope(path),'EVIDENCE_UNAVAILABLE');}
// New loader file-type/no-overwrite/symlink checks require separately selected
// synthetic filesystem fixtures, not edits to original envelope or histories.
