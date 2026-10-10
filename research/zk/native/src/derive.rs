//! UNBUILT successor-only host census and independent UTF-8 commitment encoding.
//! The guest evaluates the captured relation. This observer never verifies Q/P.
use serde_json::{json,Value as J};
use sha2::{Digest,Sha256};
use crate::read_io::{Result,require};
pub const MAX:usize=16_776_192;
pub const DOMAIN:&str="CONTINUITY-R3_1-APPLICATION-COMMITMENT-V1";
pub const PROFILE:&str="continuity-r3.1-captured-engine/1";
pub const EDITION:&str="continuity-r3.1-application-source/1";
pub const MATRIX:&str="r3_1-headroom-exhaustion-both";
pub const PREDICATE:&str="CAPTURED_HEADROOM_EXHAUSTION";
pub const INITIAL:&str="initial:headroom-exhaustion-cap3";
pub const EXHAUSTED:&str="exhausted:headroom-exhaustion-cap3";
pub const BOOLS:[&str;9]=["coreContentChecked","privateQContextRequired","budgetProven","stateProven","quantitativeQVerified","requiredPredicateSatisfied","permitsExecution","expectedAssuranceSatisfied","retainedCaptureSelectionSatisfied"];
pub const OUTCOME_KEYS:[&str;23]=["obligationId","status","refusalSource","denialCode","head","requestId","nonce","audience","complementStatementDigest","complementProofDigest","fulfillmentDigest","orderClaimScope","limitDimension","coreCumulativeStatus","effectsScope","receiptDigest","originCheckpointDigest","refusalCheckpointDigest","internalServiceResultSequence","workflowReleaseDigest","admissionsAfterRefusal","chargesAfterRefusal","dispatchesAfterRefusal"];
const BODY_KEYS:[&str;15]=["obligationId","status","refusalSource","denialCode","head","requestId","nonce","audience","complementStatementDigest","complementProofDigest","fulfillmentDigest","orderClaimScope","limitDimension","coreCumulativeStatus","effectsScope"];
const KINDS:[&str;12]=["AGREEMENT","REQUEST","CHECKPOINT","FULFILLMENT","DECISION","CHECKPOINT","DECISION","REQUEST","FULFILLMENT","NEGATIVE_OUTCOME","WORKFLOW_RELEASE","CHECKPOINT"];
fn closed(v:&J,ks:&[&str])->Result<()>{let o=v.as_object().ok_or("CLOSED_OBJECT")?;require(o.len()==ks.len()&&ks.iter().all(|k|o.contains_key(*k)),"CLOSED_OBJECT")}
fn count(v:&J,n:usize)->bool{v.as_array().is_some_and(|a|a.len()==n)}
fn null(v:&J,k:&str)->bool{v.get(k).is_some_and(J::is_null)}
fn digest(v:&J)->Result<()>{let s=v.as_str().ok_or("DIGEST_TYPE")?;require(s.len()==64&&s.bytes().all(|b|b.is_ascii_digit()||(b'a'..=b'f').contains(&b)),"DIGEST_SHAPE")}
fn text(v:&J)->Result<&str>{let s=v.as_str().ok_or("TEXT_TYPE")?;require(!s.is_empty()&&s.encode_utf16().count()<=4096,"TEXT_BOUND")?;Ok(s)}
pub fn canonical(v:&J)->Result<String>{
 fn encode(v:&J,out:&mut String,depth:usize)->Result<()>{
  require(depth<=32,"CANONICAL_DEPTH")?;
  match v {
   J::Null=>out.push_str("null"),J::Bool(v)=>out.push_str(if *v{"true"}else{"false"}),
   J::String(v)=>out.push_str(&serde_json::to_string(v)?),
   J::Number(v)=>{let n=v.as_i64().filter(|n|n.unsigned_abs()<=9_007_199_254_740_991).ok_or("CANONICAL_INTEGER")?;out.push_str(&n.to_string());},
   J::Array(v)=>{out.push('[');for(i,v)in v.iter().enumerate(){if i!=0{out.push(',');}encode(v,out,depth+1)?;}out.push(']');},
   J::Object(v)=>{let mut keys:Vec<&String>=v.keys().collect();keys.sort_by(|a,b|a.as_bytes().cmp(b.as_bytes()));out.push('{');for(i,k)in keys.into_iter().enumerate(){if i!=0{out.push(',');}out.push_str(&serde_json::to_string(k)?);out.push(':');encode(&v[k],out,depth+1)?;}out.push('}');},
  }
  require(out.len()<=MAX,"CANONICAL_BYTES")
 }
 let mut out=String::new();encode(v,&mut out,0)?;Ok(out)
}
fn hash(v:&J)->Result<String>{Ok(format!("{:x}",Sha256::digest(canonical(v)?.as_bytes())))}
pub fn crosscheck(result:&J)->Result<(String,[u8;32])>{
 let wire=canonical(result)?;let mut h=Sha256::new();h.update(DOMAIN.as_bytes());h.update([0u8]);h.update(wire.as_bytes());let independent:[u8;32]=h.finalize().into();
 let actual=guest::commitment(result).map_err(|r|r.code)?;
 require(actual==independent,"ACTUAL_GUEST_COMMITMENT_CANONICAL_CROSSCHECK")?;Ok((wire,actual))
}
pub fn completed(result:&J)->J{
 let rows:Vec<J>=BOOLS.iter().map(|k|match result.get(*k){None=>json!({"field":k,"present":false,"kind":"MISSING"}),Some(v) if v.is_boolean()=>json!({"field":k,"present":true,"kind":"BOOLEAN","value":v}),Some(v) if v.is_null()=>json!({"field":k,"present":true,"kind":"NULL","value":null}),Some(_)=>json!({"field":k,"present":true,"kind":"OTHER","valueRetainedInResultOnly":true})}).collect();
 json!({"schema":"continuity.r3_1.native-result-completed-observation.v1","status":"COMPLETED_NATIVE_EVALUATION","predicates":rows,"acceptance":false,"proofAccepted":false,"permitsExecution":false,"commitmentDomain":DOMAIN})
}
/// Both logs and the durable event must be attempted before next is invoked.
pub fn complete_before<T,S,N>(result:&J,sink:S,next:N)->Result<T> where S:FnOnce(&J)->Result<()>,N:FnOnce()->Result<T>{sink(&completed(result))?;next()}
pub fn expected()->std::collections::BTreeMap<String,bool>{BOOLS.iter().zip([true,true,true,true,false,true,false,true,false]).map(|(k,v)|((*k).to_owned(),v)).collect()}
pub fn selected(input:&J,program:&str)->Result<()>{
 closed(input,&["schema","enrollment","expectation","capture","authorityReceipts","counterpartyReceipts","cadence","decisionLinks","pendingRequest","pendingContext","numericWitnesses"])?;
 let e=&input["enrollment"];let x=&input["expectation"];
 require(input["schema"]=="continuity.r3_1.application-input.v1"&&e["schema"]=="continuity.r3_1.application-enrollment.v1"&&x["schema"]=="continuity.r3_1.application-expectation.v1"&&e["profile"]==PROFILE&&x["profile"]==PROFILE&&e["engineEdition"]==EDITION&&e["programId"].as_str()==Some(program)&&e["captureSelection"]["matrixId"]==MATRIX&&e["captureSelection"]["mode"]=="BOTH"&&e["cadenceAxis"]=="CONFIGURED"&&x["mode"]=="BOTH"&&x["predicate"]==PREDICATE,"EXACT_SUCCESSOR_SELECTION")?;
 digest(&e["programId"])?;
 for(k,n)in[("authorityReceipts",0),("counterpartyReceipts",0),("numericWitnesses",2),("decisionLinks",2)]{require(count(&input[k],n),"FINITE_EXHAUSTION_CENSUS")?;}
 require(null(input,"pendingRequest")&&null(input,"pendingContext"),"NULL_HISTORICAL_PENDING")?;
 let signer=&e["denialSigner"];closed(signer,&["ownerId","ownerKey"])?;require(signer["ownerId"]==e["cadenceTrust"]["ownerId"]&&signer["ownerKey"]==e["cadenceTrust"]["ownerKey"],"EXACT_DENIAL_SIGNER")?;
 let capture_wire=input["capture"].as_str().ok_or("CAPTURE_WIRE")?;require(capture_wire.len()<=MAX,"CAPTURE_BOUND")?;let capture:J=serde_json::from_str(capture_wire)?;
 require(count(&capture["witness"]["coreEvents"],10)&&count(&capture["witness"]["intervals"],3),"CAPTURE_CENSUS")?;
 for(i,id)in[INITIAL,"closing:headroom-exhaustion-cap3","refusal:headroom-exhaustion-cap3"].into_iter().enumerate(){require(capture["witness"]["intervals"][i]["expected"]["intervalId"]==id,"INTERVAL_ORDER")?;}
 let wire=input["cadence"]["journalWire"].as_str().ok_or("CADENCE_WIRE")?;require(wire.len()<=1_048_576,"CADENCE_BOUND")?;let journal:J=serde_json::from_str(wire)?;let rows=journal.as_array().ok_or("CADENCE_ARRAY")?;
 require(rows.len()==12&&rows.iter().zip(KINDS).all(|(r,k)|r["payload"]["kind"]==k)&&input["cadence"]["finalSequence"].as_u64()==Some(12),"JOURNAL_CENSUS")?;
 let a=&rows[0]["payload"]["body"];require(a["pMode"]=="BOTH"&&a["cadence"]=="ON_DEMAND"&&null(a,"n")&&a["phase"]=="AFTER_DECISION"&&a["metric"]=="AMOUNT"&&a["x"]=="3","AUTHENTICATED_SETTINGS")?;
 let b=&rows[6]["payload"]["body"];require(b["index"]==2&&["coreHead","coreDecision","eligibleContext"].iter().all(|k|null(b,k))&&b["outcome"]=="NOT_SUBMITTED","NO_FABRICATED_NATIVE_R2")?;
 let sb=&b["sourceBinding"];closed(sb,&["schema","evaluationClass","logicalId","intentId","authorizationInputDigest","authorizationResultDigest","snapshotHead","evaluationTime","refusalClass","evidenceDigest"])?;
 require(sb["schema"]=="continuity.r3_1.native-authorization-source.v1"&&sb["evaluationClass"]=="NOT_EVALUATED_NATIVE"&&sb["refusalClass"]=="INVENTORY_REFUSAL"&&["intentId","authorizationInputDigest","authorizationResultDigest","snapshotHead","evaluationTime"].iter().all(|k|null(sb,k)),"ACTUAL_NULL_NATIVE_SOURCE")?;
 require(input["numericWitnesses"][0]["kind"]=="INITIAL_DISPATCH"&&input["numericWitnesses"][1]["kind"]=="EXHAUSTED_REFUSAL"&&input["numericWitnesses"][0]["obligationId"]==INITIAL&&input["numericWitnesses"][1]["obligationId"]==EXHAUSTED,"NUMERIC_ORDER")
}
pub fn result_selection(result:&J,input:&J,program:&str)->Result<()>{
 require(result["schema"]=="continuity.r3_1.application-predicate-result.v1"&&result["profile"]==PROFILE&&result["engineEdition"]==EDITION&&result["programId"].as_str()==Some(program)&&result["captureSelection"]==input["enrollment"]["captureSelection"]&&result["predicate"]==PREDICATE&&result["mode"]=="BOTH"&&result["authenticatedSessionMode"]=="BOTH"&&result["proofMode"]=="BOTH"&&result["modeRelationship"]=="MATCHED"&&result["cadenceAxis"]=="CONFIGURED","RESULT_IDENTITY")?;
 for(k,v)in expected(){require(result.get(k.as_str()).and_then(J::as_bool)==Some(v),"RESULT_BOOLEAN_PRESENCE_TYPE_VALUE")?;}
 require(count(&result["authorityReceipts"],0)&&count(&result["counterpartyReceipts"]["receipts"],0)&&count(&result["numericCorrespondence"],2)&&null(result,"pendingAuthorization")&&result["coreHead"]["position"].as_u64()==Some(9)&&result["cadence"]["sequence"].as_u64()==Some(12)&&result["cadence"]["protectedDispatch"].as_bool()==Some(false),"RESULT_CENSUS_NO_AUTHORITY")?;
 let n=&result["negativeOutcome"];closed(n,&OUTCOME_KEYS)?;require(n["obligationId"]==EXHAUSTED&&n["status"]=="HEADROOM_INSUFFICIENT_PROVEN"&&n["refusalSource"]=="INVENTORY"&&n["denialCode"]=="GROUP_LIMIT"&&n["orderClaimScope"]=="PUBLISHED_OUTCOME_ONLY"&&n["limitDimension"]=="AMOUNT"&&n["coreCumulativeStatus"]=="P_EVALUATED_DIAGNOSTIC"&&n["effectsScope"]=="ENROLLED_STREAMS_WITHIN_I2"&&["admissionsAfterRefusal","chargesAfterRefusal","dispatchesAfterRefusal"].iter().all(|k|n[*k].as_u64()==Some(0)),"NEGATIVE_OUTCOME_VALUES")?;
 for k in["nonce","complementStatementDigest","complementProofDigest","fulfillmentDigest","receiptDigest","originCheckpointDigest","refusalCheckpointDigest","workflowReleaseDigest"]{digest(&n[k])?;}
 text(&n["requestId"])?;text(&n["audience"])?;closed(&n["head"],&["hash","position","canonicalTime"])?;
 let head=&n["head"];let h=head["hash"].as_str().ok_or("HEAD_HASH_TYPE")?;require(h.len()==66&&h.starts_with("0x")&&h.as_bytes()[2..].iter().all(|b|b.is_ascii_digit()||(b'a'..=b'f').contains(b))&&head==&result["coreHead"]&&head["position"].as_u64()==Some(9)&&head["canonicalTime"].as_u64().is_some_and(|n|n<=9_007_199_254_740_991),"EXACT_CAPTURED_HEAD")?;
 let journal:J=serde_json::from_str(input["cadence"]["journalWire"].as_str().ok_or("CADENCE_WIRE")?)?;
 let body=&journal[9]["payload"]["body"];closed(body,&BODY_KEYS)?;require(BODY_KEYS.iter().all(|k|n[*k]==body[*k]),"EXACT_SIGNED_OUTCOME_BODY")?;
 require(n["receiptDigest"]==hash(&journal[9])?&&n["originCheckpointDigest"]==hash(&journal[5])?&&n["refusalCheckpointDigest"]==hash(&journal[11])?&&n["workflowReleaseDigest"]==hash(&journal[10])?,"HISTORICAL_ENVELOPE_DIGESTS")?;
 let db=&journal[6]["payload"]["body"];let logical=text(&db["sourceBinding"]["logicalId"])?;
 let capture:J=serde_json::from_str(input["capture"].as_str().ok_or("CAPTURE_WIRE")?)?;
 let service=capture["witness"]["streams"]["service"]["records"].as_array().ok_or("SERVICE_RECORDS")?;
 let requests:Vec<&J>=service.iter().filter(|r|r["record"]["kind"]=="SERVICE_REQUEST"&&r["record"]["logicalId"].as_str()==Some(logical)).collect();
 let results:Vec<&J>=service.iter().filter(|r|r["record"]["kind"]=="SERVICE_RESULT"&&r["record"]["logicalId"].as_str()==Some(logical)).collect();
 require(requests.len()==1&&results.len()==1,"ACTUAL_SERVICE_PAIR_CENSUS")?;
 require(journal[7]["payload"]["body"]["requestContext"]["requestDigest"]==hash(&requests[0]["record"])?&&input["decisionLinks"][1]["refusalEvidence"]["serviceRequestDigest"]==hash(&requests[0]["record"])?,"EXACT_NEGATIVE_REQUEST_RECORD_DIGEST")?;
 // Published service op identity; never substitute the caller input requestId.
 require(n["requestId"].as_str()==Some(logical)&&db["decisionId"].as_str()==Some(logical)&&n["requestId"]==requests[0]["record"]["logicalId"]&&n["internalServiceResultSequence"].as_u64().is_some_and(|v|v>0)&&n["internalServiceResultSequence"]==results[0]["sequence"],"PUBLISHED_SERVICE_OPERATION_ID")?;
 let numeric=result["numericCorrespondence"].as_array().ok_or("NUMERIC_RESULTS")?;
 for(id,purpose)in[(INITIAL,"INITIAL_BEFORE_DISPATCH"),(EXHAUSTED,"HISTORICAL_EXHAUSTED_REFUSAL")]{let rows:Vec<&J>=numeric.iter().filter(|r|r["obligationId"]==id).collect();require(rows.len()==1,"NUMERIC_RESULT_IDENTITY")?;let row=rows[0];require(row["numericBinding"]["purpose"]==purpose&&row["proofBinding"]=="PROOF_BOUND"&&row["quantitativeQVerified"].as_bool()==Some(false)&&row["permitsExecution"].as_bool()==Some(false),"NUMERIC_CORRESPONDENCE_LIMITS")?;if id==EXHAUSTED{require(row["kind"]=="EXHAUSTED_REFUSAL"&&null(row,"nativeEvaluationTime")&&row["diagnosticProvenance"]=="P_EVALUATED_DIAGNOSTIC"&&row["diagnosticEvaluationTime"].as_u64()==journal[6]["payload"]["at"].as_u64().map(|n|n/1000),"DIAGNOSTIC_IS_NOT_NATIVE_SOURCE_TIME")?;}}
 require(result["cadence"]["initialAssuranceStatus"]=="NUMERIC_FULFILLED"&&result["cadence"]["initialAssuranceCompliant"].as_bool()==Some(true),"INITIAL_GATE_RETAINED")
}
