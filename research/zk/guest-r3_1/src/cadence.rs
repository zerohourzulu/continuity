//! Guest-owned, bounded signed engine stream. No serialized JS reduction is input.
//! v2 canonical bytes retained; edition3 adds the signed native source tuple.
use crate::common::*;
use serde_json::{json,Value as J};
use std::collections::{BTreeMap,BTreeSet};

pub const EDITION: &str="continuity-r3.1-cadence-source/1";
pub const SIGNING_DOMAIN: &str="CONTINUITY-R3_1-CADENCE-ED25519-V1";
const TRUST: &[&str]=&["schema","domain","session","engineEdition","coreEdition","ownerId","counterpartyId","ownerKey","counterpartyKey","reviewerDeploymentDigest","clock"];
const AGREEMENT: &[&str]=&["schema","domain","engineEdition","coreEdition","session","revision","effectiveAfterIndex","startingIndex","cadence","n","pMode","phase","metric","x","pathPolicy","denialPolicy","dueWindowMs","ownerId","counterpartyId","ownerKey","counterpartyKey","cryptoSuite","reviewerDeploymentDigest","disclosure","nonce","clock"];
const CHECKPOINT: &[&str]=&["checkpointId","agreementDigest","receiptRange","closedContext","protectedRequest","statementDigest","proofDigest","presentationDigest","intervalId","presentationId","audience","challenge","reviewerDeploymentDigest","kind","finalCustodyHeads"];
const DECISION: &[&str]=&["agreementDigest","decisionId","index","coreHead","requestDigest","resultDigest","coreDecision","outcome","eligibleContext","previousReceiptDigest","obligationId","obligationStatus","sourceBinding"];
pub const SOURCE_BINDING: &[&str]=&["schema","evaluationClass","logicalId","intentId","authorizationInputDigest","authorizationResultDigest","snapshotHead","evaluationTime","refusalClass","evidenceDigest"];

#[derive(Clone)]
struct Agreement { value:J, digest:String }
#[derive(Clone)]
struct Decision { value:J, digest:String, revisions:Vec<J> }
#[derive(Clone)]
struct Checkpoint { value:J, digest:String }
#[derive(Clone)]
struct Obligation { id:String, agreement:String,index:u64,receipt:Option<String>,request:Option<J>,nonce:Option<String>,deadline:u64,phase:String,status:String,fulfillment:Option<J>,evidence:Vec<J>,negative:bool }
fn active(agreements:&[Agreement])->Result<&Agreement> { agreements.last().ok_or_else(||unavailable("SETTINGS_UNAVAILABLE")) }
fn bound<'a>(body:&J,agreements:&'a [Agreement])->Result<&'a Agreement>{let a=active(agreements)?;need(s(body,"agreementDigest")?==a.digest,"ACTIVE_AGREEMENT_MISMATCH")?;Ok(a)}
fn new_obligation(obligations:&mut Vec<Obligation>,id:&J,a:&Agreement,index:u64,at:u64,decision:Option<&Decision>,request:Option<J>,nonce:Option<String>)->Result<()> {
    let id=text(id)?.to_owned();need(!obligations.iter().any(|o|o.id==id),"OBLIGATION_REUSE")?;
    let deadline=at.checked_add(n(&a.value,"dueWindowMs")?).filter(|n|*n<=9_007_199_254_740_991).ok_or_else(||invalid("DEADLINE_OVERFLOW"))?;
    let no_path=decision.is_some_and(|d|d.value.get("eligibleContext")==Some(&J::Null));
    let status=if !no_path {"DUE"}else if s(&a.value,"denialPolicy")?=="NOT_APPLICABLE" {"NOT_APPLICABLE"}else{"UNSATISFIED_NO_PATH"};
    obligations.push(Obligation{id,agreement:a.digest.clone(),index,receipt:decision.map(|d|d.digest.clone()),request,nonce,deadline,phase:s(&a.value,"phase")?.into(),status:status.into(),fulfillment:None,evidence:Vec::new(),negative:false});Ok(())
}
fn head(v:&J)->Result<()> {
    closed(v,&["hash","position","canonicalTime"])?;let hash=s(v,"hash")?;
    need(hash.len()==66 && hash.starts_with("0x"),"SNAPSHOT_HEAD")?;digest(&J::String(hash[2..].into()))?;n(v,"position")?;n(v,"canonicalTime")?;Ok(())
}
pub fn source_binding(v:&J)->Result<()> {
    closed(v,SOURCE_BINDING)?;need(s(v,"schema")?=="continuity.r3_1.native-authorization-source.v1","SOURCE_BINDING_SCHEMA")?;
    text(field(v,"logicalId")?)?;
    match s(v,"evaluationClass")? {
        "EVALUATED_NATIVE"=>{
            if !field(v,"intentId")?.is_null(){text(field(v,"intentId")?)?;}
            digest(field(v,"authorizationInputDigest")?)?;digest(field(v,"authorizationResultDigest")?)?;
            head(field(v,"snapshotHead")?)?;let time=n(v,"evaluationTime")?;
            need(time>=n(field(v,"snapshotHead")?,"canonicalTime")? && field(v,"refusalClass")?.is_null() && field(v,"evidenceDigest")?.is_null(),"SOURCE_CAUSAL_TIME_OR_REFUSAL_NULL")
        },
        "NOT_EVALUATED_NATIVE"=>{
            for k in ["intentId","authorizationInputDigest","authorizationResultDigest","snapshotHead","evaluationTime"]{need(field(v,k)?.is_null(),"NONEVALUATED_NATIVE_NULL")?;}
            need(matches!(s(v,"refusalClass")?,"INVENTORY_REFUSAL"|"TRANSPORT_REFUSAL"),"NONNATIVE_REFUSAL_CLASS")?;
            digest(field(v,"evidenceDigest")?)?;Ok(())
        },_=>Err(unsupported("NATIVE_EVALUATION_CLASS")),
    }
}
fn range(v:&J,index:u64,initial:u64,decisions:&[Decision])->Result<()> {
    closed(v,&["fromIndex","throughIndex","lastReceiptDigest"])?;
    let from=n(v,"fromIndex")?;let through=n(v,"throughIndex")?;digest(field(v,"lastReceiptDigest")?)?;
    need(from>=initial && from<=through && through<=index,"CHECKPOINT_RANGE")?;
    let expected=decisions.iter().find(|d|d.value.get("index").and_then(J::as_u64)==Some(through)).map(|d|d.digest.as_str()).unwrap_or("0000000000000000000000000000000000000000000000000000000000000000");
    need(s(v,"lastReceiptDigest")?==expected,"CHECKPOINT_RECEIPT_RANGE")
}

pub fn clock(v:&J)->Result<()> {
    closed(v,&["schema","cadence","core","scope"])?;
    need(v==&json!({"schema":"continuity.r3_1.engine-clock-profile.v1","cadence":"NODE_WALL_MILLISECONDS_OWNER_DECLARED","core":"NODE_WALL_SECONDS_V1","scope":"LOCAL_HOST_CLOCK_NOT_CERTIFIED_UTC"}),"INDEPENDENT_CLOCK_PROFILE")
}
pub(crate) fn evaluate(input:&J,enrolled_trust:&J,expected_digest:&str,observed_time:u64,evidence:&BTreeMap<String,J>,numeric_evidence:&BTreeMap<String,J>,pending:Option<&J>)->Result<J> {
    closed(input,&["schema","trustWire","journalWire","finalSequence","finalDigest","observedTime"])?;
    need(s(input,"schema")?=="continuity.r3_1.cadence-guest-input.v1","CADENCE_INPUT_SCHEMA")?;
    let t=finite_canonical_wire(s(input,"trustWire")?)?;closed(&t,TRUST)?;
    need(t==*enrolled_trust && s(&t,"schema")?=="continuity.r3_1.engine-trust.v1" && s(&t,"engineEdition")?==EDITION,"INDEPENDENT_ENGINE_ENROLLMENT")?;
    for k in ["domain","session","engineEdition","coreEdition","ownerId","counterpartyId"]{text(field(&t,k)?)?;}
    spki_hex(field(&t,"ownerKey")?)?;spki_hex(field(&t,"counterpartyKey")?)?;
    need(field(&t,"ownerKey")?!=field(&t,"counterpartyKey")? && field(&t,"ownerId")?!=field(&t,"counterpartyId")?,"PARTICIPANT_PIN_COLLISION")?;
    digest(field(&t,"reviewerDeploymentDigest")?)?;
    clock(field(&t,"clock")?)?;
    need(n(input,"observedTime")?==observed_time,"CADENCE_OBSERVED_TIME")?;
    let journal=finite_canonical_wire(s(input,"journalWire")?)?;let journal=array(&journal)?;
    need(journal.len()<=512 && journal.len() as u64==n(input,"finalSequence")?,"FULL_ENROLLED_JOURNAL_SEQUENCE")?;
    let mut tip="0".repeat(64);let mut previous_receipt="0".repeat(64);let mut at=0;let mut index=0;let mut initial=0;
    let mut agreements:Vec<Agreement>=Vec::new();let mut decisions:Vec<Decision>=Vec::new();let mut checkpoints:Vec<Checkpoint>=Vec::new();let mut obligations:Vec<Obligation>=Vec::new();
    let mut nonces=BTreeSet::new();let mut rejections=Vec::new();let mut linked=BTreeSet::new();let mut logical_decisions=BTreeSet::new();
    let mut negative_outcome:Option<J>=None;let mut workflow_release:Option<J>=None;
    for (position,envelope) in journal.iter().enumerate() {
        closed(envelope,&["payload","signatures"])?;let p=field(envelope,"payload")?;
        closed(p,&["schema","domain","session","sequence","previousJournalDigest","at","kind","body"])?;
        need(s(p,"schema")?=="continuity.r3_1.cadence-entry.v1" && field(p,"domain")?==field(&t,"domain")? && field(p,"session")?==field(&t,"session")?,"ENTRY_SCOPE")?;
        need(n(p,"sequence")?==position as u64+1 && s(p,"previousJournalDigest")?==tip,"JOURNAL_CHAIN")?;
        let next_at=n(p,"at")?;need(next_at>=at && next_at<=observed_time,"CADENCE_CAUSAL_TIME")?;at=next_at;
        let kind=s(p,"kind")?;let signatures=field(envelope,"signatures")?;
        let bilateral=matches!(kind,"AGREEMENT"|"REQUEST");closed(signatures,if bilateral{&["owner","counterparty"]}else{&["owner"]})?;
        authenticate(p,field(signatures,"owner")?,field(&t,"ownerKey")?,SIGNING_DOMAIN)?;
        if bilateral {authenticate(p,field(signatures,"counterparty")?,field(&t,"counterpartyKey")?,SIGNING_DOMAIN)?;}
        let b=field(p,"body")?;
        match kind {
            "AGREEMENT"=>{
                closed(b,AGREEMENT)?;need(s(b,"schema")?=="continuity.r3_1.engine-agreement.v1","AGREEMENT_SCHEMA")?;
                for k in ["domain","engineEdition","coreEdition","session","ownerId","counterpartyId","ownerKey","counterpartyKey","reviewerDeploymentDigest","clock"]{need(field(b,k)?==field(&t,k)?,"AGREEMENT_PIN_MISMATCH")?;}
                need(s(b,"cryptoSuite")?=="ED25519_ENGINE_AGREEMENT_V1","AGREEMENT_CRYPTO")?;
                if agreements.is_empty(){index=n(b,"startingIndex")?;initial=index;}
                need(n(b,"revision")?==agreements.len() as u64+1 && n(b,"effectiveAfterIndex")?==index && n(b,"startingIndex")?==initial,"AGREEMENT_INDEX_REVISION")?;
                need(n(b,"dueWindowMs")?>0,"DUE_WINDOW")?;
                match s(b,"cadence")?{"EVERY_N_DECISIONS"=>need(n(b,"n")?>0,"N_REQUIRED")?,"EVERY_DECISION"=>need(b.get("n").and_then(J::as_u64)==Some(1),"N_MISMATCH")?,"OFF"|"ON_DEMAND"=>need(b.get("n")==Some(&J::Null),"N_MISMATCH")?,_=>return Err(unsupported("CADENCE_SETTING"))}
                need(matches!(s(b,"pMode")?,"BUDGET"|"STATE"|"BOTH") && matches!(s(b,"phase")?,"BEFORE_DISPATCH"|"AFTER_DECISION"),"AGREEMENT_MODE_PHASE")?;
                selection(field(b,"metric")?,field(b,"x")?)?;need(s(b,"pathPolicy")?=="EXACT_SELECTED_PATH" && matches!(s(b,"denialPolicy")?,"NOT_APPLICABLE"|"UNSATISFIED"),"AGREEMENT_PATH_DENIAL")?;
                let disclosure=field(b,"disclosure")?;closed(disclosure,&["showOwner","showCounterparty"])?;need(disclosure.as_object().unwrap().values().all(J::is_boolean),"DISCLOSURE_BOOLEAN")?;
                let nonce=text(field(b,"nonce")?)?;need(nonces.insert(format!("agreement:{nonce}")),"NONCE_REUSE")?;
                agreements.push(Agreement{value:b.clone(),digest:hash(b)?});
            },
            "REJECT_AGREEMENT"=>{closed(b,&["proposedAgreementDigest","reason"])?;digest(field(b,"proposedAgreementDigest")?)?;text(field(b,"reason")?)?;rejections.push(b.clone());},
            "DECISION"=>{
                closed(b,DECISION)?;let a=bound(b,&agreements)?;let id=text(field(b,"decisionId")?)?;
                need(!decisions.iter().any(|d|d.value.get("decisionId").and_then(J::as_str)==Some(id)) && n(b,"index")?==index+1,"DECISION_UNIQUE_INDEX")?;
                for k in ["requestDigest","resultDigest","previousReceiptDigest"] {digest(field(b,k)?)?;}
                let evaluated=s(field(b,"sourceBinding")?,"evaluationClass")?=="EVALUATED_NATIVE";
                if evaluated {digest(field(b,"coreHead")?)?;need(matches!(s(b,"coreDecision")?,"ALLOW"|"DENY"|"INDETERMINATE"),"DECISION_STATUS")?;}
                else {need(field(b,"coreHead")?.is_null() && field(b,"coreDecision")?.is_null() && field(b,"eligibleContext")?.is_null(),"NONEVALUATED_DECISION_NULL")?;}
                need(matches!(s(b,"outcome")?,"NOT_SUBMITTED"|"SUBMITTED"|"UNKNOWN"|"CONFIRMED"|"FAILED"),"DECISION_OUTCOME")?;
                need(b.get("coreDecision").and_then(J::as_str)==Some("ALLOW") || s(b,"outcome")?=="NOT_SUBMITTED","NONALLOW_OUTCOME")?;
                let c=field(b,"eligibleContext")?;if !c.is_null(){context(c)?;for k in ["coreHead","requestDigest"]{need(field(c,k)?==field(b,k)?,"DECISION_CONTEXT")?;}for k in ["metric","x"]{need(field(c,k)?==field(&a.value,k)?,"DECISION_SELECTION")?;}}
                source_binding(field(b,"sourceBinding")?)?;
                if evaluated {need(n(field(b,"sourceBinding")?,"evaluationTime")?<=at/1000,"NATIVE_EVALUATION_SECONDS_AFTER_SIGNED_MILLISECONDS")?;}
                need(logical_decisions.insert(s(field(b,"sourceBinding")?,"logicalId")?.to_owned()),"RETRY_MUST_RETAIN_ORIGINAL_LOGICAL_DECISION")?;
                let actual=evidence.get(id).ok_or_else(||unavailable("NATIVE_DECISION_CORRESPONDENCE_MISSING"))?;
                need(field(actual,"sourceBinding")?==field(b,"sourceBinding")? && field(actual,"coreDecision")?==field(b,"coreDecision")? && field(actual,"coreHead")?==field(b,"coreHead")? && field(actual,"requestDigest")?==field(b,"requestDigest")? && field(actual,"resultDigest")?==field(b,"resultDigest")?,"NATIVE_DECISION_CORRESPONDENCE")?;
                need(linked.insert(id.to_owned()),"DECISION_LINK_REUSE")?;
                need(s(b,"previousReceiptDigest")?==previous_receipt,"DECISION_RECEIPT_CHAIN")?;
                let next=n(b,"index")?;
                let scheduled=s(&a.value,"cadence")?=="EVERY_DECISION" || (s(&a.value,"cadence")?=="EVERY_N_DECISIONS" && (next-initial)%n(&a.value,"n")?==0);
                need(if scheduled {field(b,"obligationId")?.is_string()} else {field(b,"obligationId")?.is_null()},"SCHEDULED_OBLIGATION")?;
                let status=if !scheduled{"NONE"}else if !c.is_null(){"DUE"}else if s(&a.value,"denialPolicy")?=="NOT_APPLICABLE"{"NOT_APPLICABLE"}else{"UNSATISFIED_NO_PATH"};
                need(s(b,"obligationStatus")?==status,"OBLIGATION_STATUS")?;
                let decision=Decision{value:b.clone(),digest:hash(envelope)?,revisions:Vec::new()};
                if scheduled{new_obligation(&mut obligations,field(b,"obligationId")?,a,next,at,Some(&decision),None,None)?;}
                previous_receipt=decision.digest.clone();index=next;decisions.push(decision);
            },
            "RECONCILIATION"=>{
                closed(b,&["decisionId","receiptDigest","priorRevisionDigest","outcome","evidenceDigest"])?;for k in ["receiptDigest","priorRevisionDigest","evidenceDigest"]{digest(field(b,k)?)?;}
                need(matches!(s(b,"outcome")?,"UNKNOWN"|"CONFIRMED"|"FAILED"),"RECONCILIATION_OUTCOME")?;
                let d=decisions.iter_mut().find(|d|d.value.get("decisionId")==b.get("decisionId") && d.digest==s(b,"receiptDigest").unwrap_or("")).ok_or_else(||invalid("RECONCILIATION_IDENTITY"))?;
                let prior=d.revisions.last().map(|r|r.get("outcome")).flatten().unwrap_or(field(&d.value,"outcome")?);
                need(prior.as_str()==Some("UNKNOWN"),"RECONCILIATION_NOT_UNKNOWN")?;
                let prior_digest=d.revisions.last().and_then(|r|r.get("revisionDigest")).and_then(J::as_str).unwrap_or("0000000000000000000000000000000000000000000000000000000000000000");
                need(s(b,"priorRevisionDigest")?==prior_digest,"RECONCILIATION_CHAIN")?;
                d.revisions.push(json!({"outcome":field(b,"outcome")?,"revisionDigest":hash(envelope)?,"at":at,"signedBody":b}));
            },
            "REQUEST"=>{
                closed(b,&["agreementDigest","obligationId","nonce","dueIndex","requestContext","decisionReceiptDigest"])?;let a=bound(b,&agreements)?;
                let nonce=text(field(b,"nonce")?)?;need(nonces.insert(format!("request:{nonce}")) && n(b,"dueIndex")?==index,"REQUEST_NONCE_INDEX")?;
                let c=field(b,"requestContext")?;context(c)?;for k in ["metric","x"]{need(field(c,k)?==field(&a.value,k)?,"REQUEST_SELECTION")?;}
                new_obligation(&mut obligations,field(b,"obligationId")?,a,index,at,None,Some(c.clone()),Some(nonce.into()))?;
                if !field(b,"decisionReceiptDigest")?.is_null(){
                    digest(field(b,"decisionReceiptDigest")?)?;
                    let d=decisions.iter().find(|d|d.digest==s(b,"decisionReceiptDigest").unwrap_or("")).ok_or_else(||invalid("EXHAUSTION_REPORTING_DECISION_MISSING"))?;
                    let actual=numeric_evidence.get(s(b,"obligationId")?).ok_or_else(||unavailable("EXHAUSTION_INDEPENDENT_DIAGNOSTIC_REQUIRED"))?;
                    need(index==2&&d.value["index"]==2&&d.value["sourceBinding"]["evaluationClass"]=="NOT_EVALUATED_NATIVE"&&d.value["sourceBinding"]["refusalClass"]=="INVENTORY_REFUSAL"&&d.value["outcome"]=="NOT_SUBMITTED"&&a.value["cadence"]=="ON_DEMAND"&&a.value["n"].is_null()&&a.value["phase"]=="AFTER_DECISION"&&a.value["pMode"]=="BOTH"&&a.value["metric"]=="AMOUNT"&&a.value["x"]=="3","EXHAUSTION_NARROW_REQUEST_EXCEPTION")?;
                    need(actual["kind"]=="EXHAUSTED_REFUSAL"&&actual["negativeFacts"]["decisionReceiptDigest"]==b["decisionReceiptDigest"]&&actual["protectedContext"]==*c&&actual["negativeFacts"]["requestNonce"]==b["nonce"],"EXHAUSTION_REQUEST_INDEPENDENT_CORRESPONDENCE")?;
                    let o=obligations.last_mut().ok_or_else(||invalid("OBLIGATION_MISSING"))?;o.receipt=Some(d.digest.clone());o.negative=true;
                }
            },
            "CHECKPOINT"=>{
                closed(b,CHECKPOINT)?;
                let final_heads=field(b,"finalCustodyHeads")?;
                if b["kind"]=="CLOSING"&&b["receiptRange"]["throughIndex"]==2 {
                    closed(final_heads,&["service","source","inventory","recipient"])?;
                    for name in ["service","source","inventory","recipient"] {let h=field(final_heads,name)?;closed(h,&["schema","storeId","stream","sequence","digest"])?;need(h["schema"]=="continuity.custody.head.v1","EXHAUSTION_FINAL_HEAD_SCHEMA")?;text(field(h,"storeId")?)?;text(field(h,"stream")?)?;n(h,"sequence")?;digest(field(h,"digest")?)?;}
                }else{need(final_heads.is_null(),"EXHAUSTION_NONFINAL_HEADS_NULL")?;}let a=agreements.iter().find(|a|a.digest==s(b,"agreementDigest").unwrap_or("")).ok_or_else(||invalid("CHECKPOINT_AGREEMENT_NOT_RETAINED"))?;
                text(field(b,"checkpointId")?)?;need(!checkpoints.iter().any(|c|c.value.get("checkpointId")==b.get("checkpointId")),"CHECKPOINT_REUSE")?;
                need(field(b,"reviewerDeploymentDigest")?==field(&a.value,"reviewerDeploymentDigest")?,"CHECKPOINT_REVIEWER")?;
                let r=field(b,"receiptRange")?;range(r,index,initial,&decisions)?;let protected=field(b,"protectedRequest")?;context(protected)?;
                for k in ["metric","x"]{need(field(protected,k)?==field(&a.value,k)?,"CHECKPOINT_SELECTION")?;}
                for k in ["statementDigest","proofDigest","presentationDigest"]{digest(field(b,k)?)?;}
                for k in ["intervalId","presentationId","audience","challenge"]{text(field(b,k)?)?;}
                need(field(b,"audience")?==field(&a.value,"counterpartyId")? && nonces.insert(format!("checkpoint:{}",s(b,"challenge")?)),"CHECKPOINT_AUDIENCE_NONCE")?;
                let closed_context=field(b,"closedContext")?;if !closed_context.is_null(){context(closed_context)?;}
                match s(b,"kind")? {
                    "INITIAL"=>need(index==initial && decisions.is_empty() && closed_context.is_null() && n(r,"throughIndex")?==initial && !checkpoints.iter().any(|c|c.value.get("kind").and_then(J::as_str)==Some("INITIAL")),"INITIAL_CHECKPOINT_RANGE_AND_PREDECISION_ORDER")?,
                    "CLOSING"=>{
                        let through=n(r,"throughIndex")?;need(through>initial,"CLOSING_CHECKPOINT_RANGE")?;
                        let original=decisions.iter().find(|d|d.value.get("index").and_then(J::as_u64)==Some(through)).ok_or_else(||invalid("CLOSING_DECISION_MISSING"))?;
                        need(field(&original.value,"eligibleContext")?==closed_context,"CLOSING_CONTEXT_SUBSTITUTION")?;
                        let retained=obligations.iter().any(|o|o.agreement==a.digest && o.fulfillment.is_none() && o.index==through && o.request.as_ref().map(|v|v==protected).unwrap_or(o.receipt.as_ref()==Some(&original.digest)));
                        need(field(&original.value,"agreementDigest")?.as_str()==Some(a.digest.as_str()) || retained,"CHECKPOINT_ORIGINAL_AGREEMENT")?;
                        need(a.digest==active(&agreements)?.digest || retained,"RETAINED_CHECKPOINT_OBLIGATION_REQUIRED")?;
                    },_=>return Err(unsupported("CHECKPOINT_KIND")),
                }
                checkpoints.push(Checkpoint{value:b.clone(),digest:hash(envelope)?});
            },
            "FULFILLMENT"=>{
                closed(b,&["obligationId","checkpointDigest","receiptDigest","requestNonce","statementDigest","proofDigest","protectedContextDigest","numericBinding"])?;
                for k in ["checkpointDigest","statementDigest","proofDigest","protectedContextDigest"]{digest(field(b,k)?)?;}
                text(field(b,"obligationId")?)?;let o=obligations.iter_mut().find(|o|o.id==s(b,"obligationId").unwrap_or("")).ok_or_else(||invalid("OBLIGATION_MISSING"))?;
                need(o.fulfillment.is_none() && !matches!(o.status.as_str(),"NOT_APPLICABLE"|"UNSATISFIED_NO_PATH"),"OBLIGATION_NOT_FULFILLABLE")?;
                let c=checkpoints.iter().find(|c|c.digest==s(b,"checkpointDigest").unwrap_or("")).ok_or_else(||unavailable("CHECKPOINT_MISSING"))?;let cp=&c.value;let r=field(cp,"receiptRange")?;
                need(s(cp,"agreementDigest")?==o.agreement,"FULFILLMENT_AGREEMENT_RANGE")?;
                if o.negative{need(o.index==2&&cp["kind"]=="CLOSING"&&n(r,"throughIndex")?==1&&index==2,"EXHAUSTION_I1_ORIGIN_R2_REPORTING_RANGE")?;}else{
                    need(n(r,"fromIndex")?<=o.index&&n(r,"throughIndex")?>=o.index,"FULFILLMENT_AGREEMENT_RANGE")?;
                    if let Some(receipt)=&o.receipt {let d=decisions.iter().find(|d|&d.digest==receipt).ok_or_else(||invalid("ORIGINAL_DECISION_MISSING"))?;need(n(r,"throughIndex")?==o.index && field(cp,"closedContext")?==field(&d.value,"eligibleContext")?,"FULFILLMENT_ORIGINAL_CONTEXT")?;}
                }
                need(b.get("receiptDigest").and_then(J::as_str)==o.receipt.as_deref() && b.get("requestNonce").and_then(J::as_str)==o.nonce.as_deref(),"FULFILLMENT_IDENTITY")?;
                // Require typed null when absent; missing/other scalar never aliases null.
                if o.receipt.is_none(){need(field(b,"receiptDigest")?.is_null(),"FULFILLMENT_RECEIPT_NULL")?;}if o.nonce.is_none(){need(field(b,"requestNonce")?.is_null(),"FULFILLMENT_NONCE_NULL")?;}
                let protected=if o.negative{o.request.as_ref().ok_or_else(||invalid("EXHAUSTION_REPORTING_CONTEXT_MISSING"))?}else{field(cp,"protectedRequest")?};
                need(field(b,"statementDigest")?==field(cp,"statementDigest")? && field(b,"proofDigest")?==field(cp,"proofDigest")? && s(b,"protectedContextDigest")?==hash(protected)?,"FULFILLMENT_SUBSTITUTION")?;
                if o.negative{for k in ["coreHead","path","cap","count","metric","x","qContextDigest","qTrustPolicyDigest"]{need(protected[k]==cp["protectedRequest"][k],"EXHAUSTION_ORIGIN_CONTEXT_JOIN")?;}}else if let Some(request)=&o.request{need(request==field(cp,"protectedRequest")?,"REQUEST_CONTEXT_SUBSTITUTION")?;}
                let numeric=field(b,"numericBinding")?;closed(numeric,crate::numeric_bridge::BINDING_KEYS)?;
                need(s(numeric,"schema")?=="continuity.r3_1.headroom-fulfillment-binding.v1" && s(numeric,"ordinaryCheckpointDigest")?==c.digest && s(numeric,"originCheckpointDigest")?==c.digest && s(numeric,"protectedContextDigest")?==hash(protected)? && s(numeric,"preparationJournalDigest")?==tip,"EXACT_NUMERIC_AFTER_VERIFICATION_FULFILLMENT")?;
                let wanted=if o.negative{"HISTORICAL_EXHAUSTED_REFUSAL"}else if o.receipt.is_some(){"HISTORICAL_AFTER_DECISION"}else{"INITIAL_BEFORE_DISPATCH"};need(s(numeric,"purpose")?==wanted,"NUMERIC_FULFILLMENT_PURPOSE")?;
                if wanted=="INITIAL_BEFORE_DISPATCH"{need(s(cp,"kind")?=="INITIAL" && o.index==initial && index==initial && decisions.is_empty(),"INITIAL_NUMERIC_FULFILLMENT_BEFORE_FIRST_DECISION")?;}
                need(if wanted=="INITIAL_BEFORE_DISPATCH"||o.negative{numeric["headroomNonce"].as_str()==o.nonce.as_deref()}else{numeric["headroomNonce"]==cp["challenge"]},"NUMERIC_FULFILLMENT_NONCE")?;
                let actual=numeric_evidence.get(&o.id).ok_or_else(||unavailable("GENUINE_TYPED_NUMERIC_CORRESPONDENCE_MISSING"))?;
                need(actual["numericBinding"]==*numeric && actual["protectedContext"]==*protected && actual["proofBinding"]=="PROOF_BOUND","NUMERIC_CALLER_ASSERTION_OR_SUBSTITUTION")?;
                if o.negative{need(actual["kind"]=="EXHAUSTED_REFUSAL"&&actual["nativeEvaluationTime"].is_null()&&actual["diagnosticProvenance"]=="P_EVALUATED_DIAGNOSTIC"&&n(actual,"diagnosticEvaluationTime")?<=at/1000,"EXHAUSTION_DIAGNOSTIC_DECLARED_TIME")?;}else{need(n(actual,"nativeEvaluationTime")?<=at/1000,"NUMERIC_NATIVE_SECONDS_AFTER_FULFILLMENT_MILLISECONDS")?;}
                o.fulfillment=Some(json!({"signedBody":b,"at":at,"proofBinding":"PROOF_BOUND","quantitative":"REQUIRES_EXTERNAL_ACTUAL_Q_VERIFICATION"}));
                if o.negative{o.fulfillment.as_mut().unwrap()["signedEnvelopeDigest"]=json!(hash(envelope)?);}
                if at>o.deadline{o.evidence.push(json!({"status":"LATE","reason":"FULFILLMENT_AFTER_DEADLINE","at":at}));o.status="LATE".into();}else{o.status=if o.evidence.is_empty(){if o.negative{"HEADROOM_INSUFFICIENT_PROVEN"}else{"AUTHENTICATED_BINDING"}}else{"BOUND_WITH_PRIOR_BREACH"}.into();}
            },
            "NEGATIVE_OUTCOME"=>{
                closed(b,crate::exhaustion::OUTCOME_KEYS)?;need(negative_outcome.is_none(),"EXHAUSTION_PUBLICATION_REUSE")?;
                let o=obligations.iter().find(|o|o.id==s(b,"obligationId").unwrap_or("")).ok_or_else(||invalid("OBLIGATION_MISSING"))?;
                let f=o.fulfillment.as_ref().ok_or_else(||unavailable("EXHAUSTION_FULFILLMENT_MISSING"))?;let actual=numeric_evidence.get(&o.id).ok_or_else(||unavailable("EXHAUSTION_NUMERIC_MISSING"))?;
                need(o.negative&&o.status=="HEADROOM_INSUFFICIENT_PROVEN"&&o.evidence.is_empty()&&b["fulfillmentDigest"]==f["signedEnvelopeDigest"]&&s(b,"fulfillmentDigest")?==tip,"EXHAUSTION_PUBLICATION_AFTER_FULFILLMENT")?;
                need(b["status"]=="HEADROOM_INSUFFICIENT_PROVEN"&&b["refusalSource"]=="INVENTORY"&&b["denialCode"]=="GROUP_LIMIT"&&b["orderClaimScope"]=="PUBLISHED_OUTCOME_ONLY"&&b["limitDimension"]=="AMOUNT"&&b["coreCumulativeStatus"]=="P_EVALUATED_DIAGNOSTIC"&&b["effectsScope"]=="ENROLLED_STREAMS_WITHIN_I2"&&b["head"]==actual["negativeFacts"]["head"]&&b["requestId"]==actual["negativeFacts"]["requestId"]&&b["nonce"].as_str()==o.nonce.as_deref()&&b["audience"]==t["counterpartyId"]&&b["complementStatementDigest"]==actual["complementStatementDigest"]&&b["complementProofDigest"]==actual["complementProofDigest"],"EXHAUSTION_SIGNED_NEGATIVE_FACTS")?;
                negative_outcome=Some(json!({"body":b,"receiptDigest":hash(envelope)?}));
            },
            "WORKFLOW_RELEASE"=>{
                closed(b,crate::exhaustion::RELEASE_KEYS)?;need(workflow_release.is_none(),"EXHAUSTION_RELEASE_REUSE")?;
                let outcome=negative_outcome.as_ref().ok_or_else(||unavailable("EXHAUSTION_PUBLICATION_MISSING"))?;let actual=numeric_evidence.get(s(b,"obligationId")?).ok_or_else(||unavailable("EXHAUSTION_NUMERIC_MISSING"))?;
                need(b["obligationId"]==outcome["body"]["obligationId"]&&b["negativeOutcomeDigest"]==outcome["receiptDigest"]&&s(b,"negativeOutcomeDigest")?==tip&&b["internalServiceResultDigest"]==actual["negativeFacts"]["serviceResultDigest"],"EXHAUSTION_RELEASE_LINKAGE")?;
                let published=json!({"schema":"continuity.r3_1.published-refusal.v1","negativeOutcome":outcome["body"],"receiptDigest":outcome["receiptDigest"]});
                need(s(b,"externalResultDigest")?==hash(&published)?,"EXHAUSTION_NO_CYCLE_EXTERNAL_RESULT")?;
                workflow_release=Some(json!({"body":b,"receiptDigest":hash(envelope)?}));
            },
            "EVIDENCE_STATUS"=>{
                closed(b,&["obligationId","status","reason"])?;text(field(b,"obligationId")?)?;text(field(b,"reason")?)?;let status=s(b,"status")?;
                need(matches!(status,"QUEUED"|"RUNNING"|"MISSING"|"LATE"|"INVALID"|"UNAVAILABLE"),"EVIDENCE_STATUS")?;
                let o=obligations.iter_mut().find(|o|o.id==s(b,"obligationId").unwrap_or("")).ok_or_else(||invalid("OBLIGATION_MISSING"))?;
                need(o.fulfillment.is_none() || !matches!(status,"QUEUED"|"RUNNING"),"STATUS_REGRESSION")?;need(status!="LATE" || at>o.deadline,"LATE_WITHOUT_DEADLINE")?;
                o.evidence.push(json!({"status":status,"reason":field(b,"reason")?,"at":at}));o.status=status.into();
            },
            "CLOCK_OBSERVATION"=>{closed(b,&["source"])?;need(s(b,"source")?=="OWNER_DECLARED_COORDINATOR_TIME","CLOCK_SOURCE")?;},
            _=>return Err(unsupported("CADENCE_ENTRY_KIND")),
        }
        for o in &mut obligations{if o.fulfillment.is_none() && !matches!(o.status.as_str(),"NOT_APPLICABLE"|"UNSATISFIED_NO_PATH") && at>o.deadline && !o.evidence.iter().any(|e|e.get("status").and_then(J::as_str)==Some("LATE")){o.evidence.push(json!({"status":"LATE","reason":"DEADLINE_PASSED_AT_SIGNED_OBSERVATION","at":at}));o.status="LATE".into();}}
        tip=hash(envelope)?;
    }
    need(tip==s(input,"finalDigest")? && tip==expected_digest,"ENROLLED_JOURNAL_TIP")?;
    need(linked.len()==evidence.len(),"NATIVE_DECISION_LINK_CENSUS")?;
    need(obligations.iter().filter(|o|o.fulfillment.is_some()).count()==numeric_evidence.len(),"NUMERIC_FULFILLMENT_WITNESS_CENSUS")?;
    let initial_cp=checkpoints.iter().find(|c|c.value.get("kind").and_then(J::as_str)==Some("INITIAL"));
    let mut reason=if agreements.is_empty(){"SETTINGS_UNAVAILABLE"}else if !rejections.is_empty(){"OWNER_REJECTED_AGREEMENT"}else if initial_cp.is_none(){"INITIAL_AUTHENTICATED_CHECKPOINT_MISSING"}else{"GENUINE_Q_AND_CURRENT_CUSTODY_UNAVAILABLE"};
    if reason=="GENUINE_Q_AND_CURRENT_CUSTODY_UNAVAILABLE" {
        for o in &obligations {if o.phase=="BEFORE_DISPATCH" && o.status!="NOT_APPLICABLE" && (o.fulfillment.is_none() || matches!(o.status.as_str(),"INVALID"|"UNAVAILABLE")){reason=if o.status=="UNSATISFIED_NO_PATH"{"HEADROOM_PATH_UNAVAILABLE"}else{"REQUIRED_PROOF_MISSING_OR_INVALID"};break;}}
        if let Some(pending)=pending {
            context(pending)?;
            let first=!decisions.iter().any(|d|d.value.get("coreDecision").and_then(J::as_str)==Some("ALLOW"));
            let due=obligations.iter().any(|o|o.phase=="BEFORE_DISPATCH" && o.index==index);
            if first || due {
                let exact=checkpoints.iter().any(|c|c.value.get("protectedRequest")==Some(pending) && if due {c.value.get("kind").and_then(J::as_str)==Some("CLOSING") && c.value.get("receiptRange").and_then(|r|r.get("throughIndex")).and_then(J::as_u64)==Some(index)}else{c.value.get("kind").and_then(J::as_str)==Some("INITIAL")});
                if !exact {reason="EXACT_NEXT_REQUEST_CHECKPOINT_MISSING";}
            }
        }
    }
    let reduced:Vec<J>=obligations.iter().map(|o|json!({"id":o.id,"agreementDigest":o.agreement,"index":o.index,"receiptDigest":o.receipt,"requestNonce":o.nonce,"deadline":o.deadline,"phase":o.phase,"status":o.status,"fulfillment":o.fulfillment,"evidence":o.evidence,"enrolledVerifierDeadlinePassed":observed_time>o.deadline,"deadlineClockScope":"SIGNED_DECLARED_TIME_PLUS_SEPARATE_ENROLLED_VERIFIER_TIME"})).collect();
    let initial_numeric=initial_cp.and_then(|c|obligations.iter().find(|o|o.fulfillment.as_ref().is_some_and(|f|f["signedBody"]["checkpointDigest"].as_str()==Some(c.digest.as_str()) && f["signedBody"]["numericBinding"]["purpose"]=="INITIAL_BEFORE_DISPATCH")));
    let initial_status=match initial_numeric{None=>"UNSATISFIED",Some(o) if o.status=="AUTHENTICATED_BINDING" && o.evidence.is_empty()=>"NUMERIC_FULFILLED",Some(_)=>"NUMERIC_FULFILLED_WITH_BREACH"};
    let mut result=json!({"schema":"continuity.r3_1.cadence-guest-result.v1","engineEdition":EDITION,"status":"AUTHENTICATED_CAPTURED_ENGINE_STREAM","journalDigest":tip,"sequence":journal.len(),"lastSignedDeclaredTime":at,"observedTimeMs":observed_time,"clock":field(&t,"clock")?,"initialIndex":initial,"completedThroughIndex":index,"nextProtectedDecisionIndex":index+1,"nativeDecisionLinkage":"RECOMPUTED_EXACT_PREFIX","agreements":agreements.iter().map(|a|a.value.clone()).collect::<Vec<_>>(),"obligations":reduced,"checkpointCount":checkpoints.len(),"ownerRejected":!rejections.is_empty(),"initialAuthenticatedCheckpointPresent":initial_cp.is_some(),"initialAssuranceStatus":initial_status,"initialNumericFulfillmentPresent":initial_numeric.is_some(),"initialAssuranceCompliant":initial_status=="NUMERIC_FULFILLED","gateReason":reason,"quantitative":"REQUIRES_EXTERNAL_ACTUAL_Q_VERIFICATION","currentCustody":"UNAVAILABLE","proofBinding":if numeric_evidence.is_empty(){"UNAVAILABLE"}else{"PROOF_BOUND"},"protectedDispatch":false,"permitsExecution":false});
    if let Some(outcome)=negative_outcome{need(workflow_release.is_some(),"EXHAUSTION_RELEASE_REQUIRED")?;result["nativeDecisionLinkage"]=json!("EVALUATED_NATIVE_PREFIX_AND_CAPTURED_INVENTORY_REFUSAL");result["negativeOutcome"]=outcome;result["workflowRelease"]=workflow_release.unwrap();}
    Ok(result)
}
