//! Proposed engine sidecar, not a Core event, reducer or portable receipt schema.
//! Signed remote reporting and actual external delivery remain distinct axes.
use crate::common::*;
use native_core::policy::wire;
use serde_json::{json,Value as J};
use std::collections::{BTreeMap,BTreeSet};

pub const SCHEMA: &str="continuity.r3_1.counterparty-receipt.v1";
pub const SIGNING_DOMAIN: &str="CONTINUITY-R3_1-COUNTERPARTY-ED25519-V1";
pub const EFFECT: &str="BROKER_MEDIATED_DELIVERY_REPORT_V1";
const FIELDS: &[&str]=&["schema","domain","effectDefinition","engineEdition","coreEdition","counterpartyId","keyId","logicalId","physicalAttemptId","requestDigest","payloadDigest","metric","amount","outcome","reportDigest","authorityReceiptContentHash","receiptRecordDataDigest","signedAt","previousReceiptDigest","enrollmentHead"];
const KEY_FIELDS: &[&str]=&["counterpartyId","keyId","publicKey","enrollmentHead","authorizedFromTime","authorizedThroughTime","status","effectDefinition"];

pub fn check_trust(keys: &J, heads: &[J]) -> Result<()> {
    let keys=array(keys)?; need(keys.len()<=16,"COUNTERPARTY_TRUST_LIMIT")?;
    let mut ids=BTreeSet::new(); let mut material=BTreeSet::new();
    for key in keys {
        closed(key,KEY_FIELDS)?;
        text(field(key,"counterpartyId")?)?; let id=text(field(key,"keyId")?)?;
        need(ids.insert(id) && material.insert(spki_hex(field(key,"publicKey")?)?),"COUNTERPARTY_KEY_ALIAS")?;
        need(matches!(s(key,"status")?,"AUTHORIZED"|"DISABLED"),"COUNTERPARTY_KEY_STATUS")?;
        need(s(key,"effectDefinition")?==EFFECT,"COUNTERPARTY_EFFECT")?;
        let from=n(key,"authorizedFromTime")?; let through=n(key,"authorizedThroughTime")?;
        need(from<=through,"COUNTERPARTY_KEY_INTERVAL")?;
        closed(field(key,"enrollmentHead")?,&["hash","position","canonicalTime"])?;
        let position=n(field(key,"enrollmentHead")?,"position")? as usize;
        need(heads.get(position)==Some(field(key,"enrollmentHead")?),"COUNTERPARTY_ENROLLMENT_HEAD")?;
    } Ok(())
}

pub fn evaluate(
    receipts: &J, keys: &J, capture: &J, authority_inputs: &[J], authority_results: &[J],
    domain: &J, core_edition: &str, observed_time: u64, heads: &[J],
) -> Result<J> {
    check_trust(keys,heads)?;
    let receipts=array(receipts)?; need(receipts.len()<=512,"COUNTERPARTY_RECEIPT_LIMIT")?;
    let rows=a(field(field(field(capture,"witness")?,"streams")?,"broker")?,"records")?;
    let mut requests=BTreeMap::new();let mut admissions=BTreeMap::new();let mut dispatches=BTreeMap::new();let mut outcomes=BTreeMap::new();
    for row in rows {
        let record=field(row,"record")?;
        let target=match s(record,"kind")? {"REQUEST"=>&mut requests,"ADMISSION"=>&mut admissions,"DISPATCH"=>&mut dispatches,"OUTCOME"=>&mut outcomes,_=>continue};
        need(target.insert(s(record,"logicalId")?.to_owned(),record).is_none(),"COUNTERPARTY_BROKER_DUPLICATE")?;
    }
    let mut previous="0".repeat(64);let mut used=BTreeSet::new();let mut results=Vec::new();
    for envelope in receipts {
        closed(envelope,&["payload","signature"])?;let payload=field(envelope,"payload")?;closed(payload,FIELDS)?;
        need(s(payload,"schema")?==SCHEMA && s(payload,"effectDefinition")?==EFFECT && s(payload,"engineEdition")?==crate::EDITION,"COUNTERPARTY_PROFILE")?;
        need(field(payload,"domain")?==domain && s(payload,"coreEdition")?==core_edition,"COUNTERPARTY_SCOPE")?;
        for k in ["counterpartyId","keyId","logicalId","physicalAttemptId"] {text(field(payload,k)?)?;}
        for k in ["requestDigest","payloadDigest","receiptRecordDataDigest","previousReceiptDigest"] {digest(field(payload,k)?)?;}
        // Exact retained c05 relation: Core canonical Keccak report reference,
        // despite the adapter's legacy literal `algorithm: sha256` label.
        let report_reference=s(payload,"reportDigest")?;
        need(report_reference.len()==66 && report_reference.starts_with("0x"),"REPORT_REFERENCE")?;
        digest(&J::String(report_reference[2..].into()))?;
        need(s(payload,"previousReceiptDigest")?==previous,"COUNTERPARTY_RECEIPT_CHAIN")?;
        let key=array(keys)?.iter().find(|k|k.get("keyId")==payload.get("keyId") && k.get("counterpartyId")==payload.get("counterpartyId")).ok_or_else(||unavailable("COUNTERPARTY_KEY_NOT_ENROLLED"))?;
        need(s(key,"status")?=="AUTHORIZED" && field(key,"enrollmentHead")?==field(payload,"enrollmentHead")?,"COUNTERPARTY_MEMBERSHIP")?;
        let time=n(payload,"signedAt")?;
        need(time>=n(key,"authorizedFromTime")? && time>=n(field(key,"enrollmentHead")?,"canonicalTime")? && time<=n(key,"authorizedThroughTime")? && time<=observed_time,"COUNTERPARTY_SIGNING_TIME")?;
        authenticate(payload,field(envelope,"signature")?,field(key,"publicKey")?,SIGNING_DOMAIN)?;
        let id=s(payload,"logicalId")?;need(used.insert(id),"COUNTERPARTY_LOGICAL_REUSE")?;
        let request=*requests.get(id).ok_or_else(||unavailable("COUNTERPARTY_REQUEST_MISSING"))?;
        let admission=*admissions.get(id).ok_or_else(||unavailable("COUNTERPARTY_ADMISSION_MISSING"))?;
        let dispatch=*dispatches.get(id).ok_or_else(||unavailable("COUNTERPARTY_DISPATCH_MISSING"))?;
        let outcome=*outcomes.get(id).ok_or_else(||unavailable("COUNTERPARTY_OUTCOME_MISSING"))?;
        let captured=field(field(request,"request")?,"capture")?;
        need(s(outcome,"status")?=="ACKNOWLEDGED" && s(payload,"outcome")?=="ACKNOWLEDGED","COUNTERPARTY_OUTCOME_BINDING")?;
        need(field(field(request,"request")?,"recipientId")?==field(payload,"counterpartyId")?,"COUNTERPARTY_RECIPIENT_BINDING")?;
        need(s(payload,"requestDigest")?==hash(field(request,"request")?)? && field(captured,"payloadDigest")?==field(payload,"payloadDigest")?,"COUNTERPARTY_PAYLOAD_BINDING")?;
        for row in [request,admission,dispatch,outcome] { need(row.get("physicalAttemptId").is_none_or(|v|Some(v)==payload.get("physicalAttemptId")),"COUNTERPARTY_ATTEMPT_BINDING")?; }
        need(s(payload,"metric")?=="AMOUNT" && decimal(field(payload,"amount")?,false)?==s(captured,"amount")? && field(payload,"amount")?==field(admission,"amount")? && field(payload,"amount")?==field(dispatch,"amount")? && field(payload,"amount")?==field(outcome,"amount")?,"COUNTERPARTY_AMOUNT_BINDING")?;
        let report=field(field(field(outcome,"acknowledgment")?,"result")?,"reportDigest")?;
        need(s(report,"algorithm")?=="sha256" && field(report,"value")?==field(payload,"reportDigest")?,"COUNTERPARTY_REPORT_BINDING")?;
        let hash=s(payload,"authorityReceiptContentHash")?;
        let index=authority_inputs.iter().position(|i|i.get("artifact").and_then(|a|a.get("contentHash")).and_then(J::as_str)==Some(hash)).ok_or_else(||unavailable("COUNTERPARTY_AUTHORITY_ARTIFACT_MISSING"))?;
        let artifact=field(&authority_inputs[index],"artifact")?;let native_payload=field(artifact,"payload")?;
        need(authority_results[index].get("requiredPredicateSatisfied")==Some(&J::Bool(true)),"COUNTERPARTY_AUTHORITY_PREDICATE")?;
        need(field(field(native_payload,"intent")?,"intentId")?==field(payload,"logicalId")? && field(field(native_payload,"intent")?,"counterpartyId")?==field(payload,"counterpartyId")?,"COUNTERPARTY_INTENT_BINDING")?;
        need(field(field(native_payload,"result")?,"acknowledgment")?==field(outcome,"acknowledgment")?,"COUNTERPARTY_CONSUMED_ACK_BINDING")?;
        need(time>=n(field(native_payload,"issuance")?,"issuedAt")?,"COUNTERPARTY_BEFORE_ARTIFACT")?;
        need(s(payload,"receiptRecordDataDigest")?==crate::common::hash(field(&authority_results[index],"receiptRecordData")?)?,"COUNTERPARTY_RECORD_BINDING")?;
        previous=crate::common::hash(envelope)?;
        results.push(json!({"receiptDigest":previous,"logicalId":id,"signature":"PASS","membershipAtSigning":"PASS","contentAndRecordLinkage":"PASS","currentMembership":if observed_time<=n(key,"authorizedThroughTime")? {"CURRENT"}else{"STALE"},"reportCommitmentSemantics":"CORE_CANONICAL_KECCAK256_WITH_LEGACY_SHA256_LABEL","externalOutcome":"SIGNED_REMOTE_REPORT_ONLY","permitsExecution":false}));
    }
    // Explicit no-attestation state: it contributes no new acceptance or delivery credit.
    Ok(json!({"schema":"continuity.r3_1.counterparty-result.v1","status":if receipts.is_empty(){"NO_ATTESTATION"}else{"CHECKED_ENGINE_PREDICATES"},"count":results.len(),"lastReceiptDigest":previous,"receipts":results,"externalOutcome":"UNVERIFIED","permitsExecution":false}))
}
