//! Proposed r3 guest composition over byte-unchanged pinned c05 Core exports.
//! The evaluator derives predicates; only an actual independently checked guest
//! proof can establish that these predicates ran in the enrolled executable.
#[cfg(all(target_os="zkvm",not(feature="openvm-secp")))]
compile_error!("r3 requires the selected existing OpenVM secp feature");

mod common;
mod cadence;
mod counterparty;
mod numeric_bridge;
mod exhaustion;
mod mode_relation;
#[cfg(test)]
#[path = "../tests/historical_mode_projection.rs"]
mod historical_mode_projection_controls;
pub use common::{Refusal, owned_core_data};
use common::*;
use native_core::{canonical::{self,Value as C},policy::wire,replay::{self,Outcome,State}};
use serde_json::{json,Value as J};
use std::collections::{BTreeMap,BTreeSet};

pub const EDITION: &str="continuity-r3.1-application-source/1";
pub const PROFILE: &str="continuity-r3.1-captured-engine/1";
pub const MAX_INPUT_BYTES: usize=16_776_192;
pub const COMMITMENT_DOMAIN: &str="CONTINUITY-R3_1-APPLICATION-COMMITMENT-V1";
const ENROLLMENT: &[&str]=&["schema","profile","engineEdition","programId","coreEditionDigest","captureEnrollmentDigest","captureSelection","coreDomain","cadenceAxis","cadenceTrust","counterpartyTrust","numericEnrollment","denialSigner"];
const EXPECTATION: &[&str]=&["schema","profile","mode","predicate","enrollmentDigest","captureExpectationDigest","coreHeadDigest","observedTime","cadenceObservedTimeMs","authorityReceiptSetDigest","counterpartyReceiptSetDigest","cadenceJournalDigest","pendingRequestDigest","numericWitnessSetDigest","expectedAssurance"];

fn replay_refusal(outcome:Outcome)->Result<State> {
    match outcome {
        Outcome::Accepted(state)=>Ok(state),
        Outcome::Unsupported{..}=>Err(unsupported("CORE_NATIVE_TRANSITION")),
        Outcome::Rejected(reason)=>{
            let code=reason.get("code").and_then(J::as_str).unwrap_or("CORE_REPLAY_REJECTED");
            if matches!(code,"UNSUPPORTED_VERSION"|"UNSUPPORTED_EVENT_SCHEMA"|"UNSUPPORTED_EVENT_TYPE"){Err(unsupported(code))}else{Err(invalid(code))}
        },
    }
}
fn requests(capture:&J)->Result<BTreeMap<String,&J>> {
    let stream=field(field(field(capture,"witness")?,"streams")?,"broker")?;
    let mut requests=BTreeMap::new();
    for row in a(stream,"records")? {
        let record=field(row,"record")?;
        if record.get("kind").and_then(J::as_str)==Some("REQUEST") {
            need(requests.insert(s(record,"logicalId")?.to_owned(),record).is_none(),"LOGICAL_REQUEST_REUSE")?;
        }
    } Ok(requests)
}

/// Exact signed historical source tuple over the genuine replay prefix. Native
/// authorization is called unchanged. No admission/preUse head is inferred.
fn decision_evidence(link:&J,state:&State,broker_requests:&BTreeMap<String,&J>,domain:&J)->Result<J> {
    closed(link,&["decisionId","sourceBinding","authorizationInput","authorizationResult","refusalEvidence"])?;
    let id=text(field(link,"decisionId")?)?;let binding=field(link,"sourceBinding")?;cadence::source_binding(binding)?;
    need(s(binding,"evaluationClass")?=="EVALUATED_NATIVE" && field(link,"refusalEvidence")?.is_null(),"EVALUATED_NATIVE_LINK")?;
    let input=field(link,"authorizationInput")?;let supplied_result=field(link,"authorizationResult")?;
    // Native operation closure owns all optional binding semantics. Engine only
    // checks the closed captured profile before handing data to that function.
    let keys=["operationVersion","expectedHistoryHead","domain","policyVersion","rootRecognitionPolicy","request","evaluationTime","authoritative","consequential"];
    let object=input.as_object().ok_or_else(||invalid("NATIVE_INPUT_OBJECT"))?;
    need(keys.iter().all(|k|object.contains_key(*k)) && object.keys().all(|k|keys.contains(&k.as_str()) || k=="binding"),"NATIVE_INPUT_CLOSED")?;
    need(s(input,"operationVersion")?=="continuity-authorization/0.2" && input.get("authoritative")==Some(&J::Bool(true)),"NATIVE_AUTHORIZATION_OPERATION")?;
    need(field(input,"domain")?==domain && field(input,"expectedHistoryHead")?==field(binding,"snapshotHead")? && field(binding,"snapshotHead")?==&json!(state.head()),"NATIVE_SNAPSHOT_HEAD")?;
    need(field(input,"evaluationTime")?==field(binding,"evaluationTime")?,"NATIVE_EVALUATION_TIME")?;
    need(s(binding,"authorizationInputDigest")?==hash(input)? && s(binding,"authorizationResultDigest")?==hash(supplied_result)?,"NATIVE_SOURCE_DIGEST")?;
    let logical=s(binding,"logicalId")?;let intent=field(binding,"intentId")?;
    let broker=*broker_requests.get(logical).ok_or_else(||unavailable("NATIVE_BROKER_REQUEST_MISSING"))?;
    let request=field(input,"request")?;let staged=field(broker,"request")?;let capture=field(staged,"capture")?;
    need(field(request,"actorId")?==field(staged,"actorId")? && s(request,"action")?=="disclose" && field(request,"resource")?==field(capture,"resource")? && field(request,"counterpartyId")?==field(staged,"recipientId")? && field(request,"termsCommitment")?==field(broker,"termsCommitment")? && field(request,"amount")?==&json!({"$bigint":field(capture,"amount")?}),"NATIVE_BROKER_REQUEST_BINDING")?;
    // In the selected c05 capture profile Core intent identifiers are the exact
    // broker logical identifiers; the signed tuple retains both explicitly.
    if state.declaration(logical).is_some(){need(intent.as_str()==Some(logical),"C05_CORE_INTENT_LOGICAL_BINDING")?;}
    else {need(intent.is_null(),"PREDECLARATION_CORE_INTENT_NULL")?;}
    if let Some(control)=input.get("binding") {
        need(control.get("intentId").and_then(J::as_str)==Some(logical),"NATIVE_CORE_INTENT_BINDING")?;
        for (native,captured) in [("runtimeSessionId","sessionId"),("roleId","roleId"),("roleTenureId","tenureId")] {
            need(field(control,native)?==field(staged,captured)?,"NATIVE_CAPTURE_CONTROL_BINDING")?;
        }
    } else {
        need(input.get("consequential")==Some(&J::Bool(false)),"NATIVE_MISSING_CONTROL_BINDING")?;
    }
    let canonical_input=canonical::encode(&wire::core_value(input).map_err(invalid)?).map_err(|e|invalid(e.to_string()))?;
    let actual_json=native_core::authorization::authorize_at_state_canonical(state,&canonical_input).map_err(|e|invalid(e.to_string()))?;
    // Native JSON-data uses $continuity.bigint; the signed engine transport is
    // the existing typed $bigint wire. Convert owned native output, never guess
    // or treat a marker alias supplied by the producer as an authoritative State.
    let actual=wire::core_wire(&owned_core_data(actual_json)?);
    need(&actual==supplied_result,"NATIVE_AUTHORIZATION_RESULT_SUBSTITUTION")?;
    let decision=s(&actual,"decision")?;need(matches!(decision,"ALLOW"|"DENY"|"INDETERMINATE"),"NATIVE_DECISION_STATUS")?;
    Ok(json!({"decisionId":id,"sourceBinding":binding,"coreDecision":decision,"coreHead":hash(&json!(state.head()))?,"requestDigest":hash(request)?,"resultDigest":hash(&actual)?,"authorizationInput":input,"authorizationResult":actual}))
}

fn pending_authorization(input:&J,state:&State,domain:&J,time:u64)->Result<J> {
    need(field(input,"domain")?==domain && field(input,"expectedHistoryHead")?==&json!(state.head()) && n(input,"evaluationTime")?==time,"PENDING_CURRENT_CAPTURED_HEAD")?;
    let encoded=canonical::encode(&wire::core_value(input).map_err(invalid)?).map_err(|e|invalid(e.to_string()))?;
    let result_json=native_core::authorization::authorize_at_state_canonical(state,&encoded).map_err(|e|invalid(e.to_string()))?;
    let result=wire::core_wire(&owned_core_data(result_json)?);
    Ok(json!({"coreHead":hash(&json!(state.head()))?,"requestDigest":hash(field(input,"request")?)?,"decision":result.get("decision"),"result":result,"scope":"CAPTURED_HEAD_AND_DECLARED_TIME","permitsExecution":false}))
}

/// Closed input. Reuse the exact old capture relation in all three modes and
/// perform a second raw replay for its opaque State API. STATE still carries
/// private Q context and pays the unchanged relation/replay costs.
pub fn evaluate(input:&str)->Result<J> {
    need(input.len()<=MAX_INPUT_BYTES,"RAW_ENVELOPE_BOUND")?;
    let input=wire::parse(input).map_err(invalid)?;
    closed(&input,&["schema","enrollment","expectation","capture","authorityReceipts","counterpartyReceipts","cadence","decisionLinks","pendingRequest","pendingContext","numericWitnesses"])?;
    if s(&input,"schema")?!="continuity.r3_1.application-input.v1" {return Err(unsupported("R3_INPUT_SCHEMA"));}
    let e=field(&input,"enrollment")?;let x=field(&input,"expectation")?;let capture_wire=s(&input,"capture")?;let captured=wire::parse(capture_wire).map_err(invalid)?;let capture=&captured;
    closed(e,ENROLLMENT)?;closed(x,EXPECTATION)?;
    need(s(e,"schema")?=="continuity.r3_1.application-enrollment.v1" && s(x,"schema")?=="continuity.r3_1.application-expectation.v1" && s(e,"profile")?==PROFILE && s(x,"profile")?==PROFILE && s(e,"engineEdition")?==EDITION,"R3_ENROLLMENT_PROFILE")?;
    for k in ["programId","coreEditionDigest","captureEnrollmentDigest"]{digest(field(e,k)?)?;}
    for k in ["enrollmentDigest","captureExpectationDigest","coreHeadDigest","authorityReceiptSetDigest","counterpartyReceiptSetDigest"]{digest(field(x,k)?)?;}
    let mode=s(x,"mode")?;need(matches!(mode,"BUDGET"|"STATE"|"BOTH"),"P_MODE")?;
    let predicate=s(x,"predicate")?;need(matches!(predicate,"CAPTURED_HISTORY"|"CAPTURED_ENGINE"|"PROTECTED_DISPATCH"|"CAPTURED_HEADROOM_EXHAUSTION"),"P_PREDICATE")?;
    let exhaustion_selected=predicate=="CAPTURED_HEADROOM_EXHAUSTION";
    need(!exhaustion_selected||mode=="BOTH","EXHAUSTION_MATCHED_BOTH_REQUIRED")?;
    let axis=s(e,"cadenceAxis")?;need(matches!(axis,"CONFIGURED"|"NOT_CONFIGURED_RETAINED_CAPTURE"),"INDEPENDENT_CADENCE_AXIS")?;let configured=axis=="CONFIGURED";
    let selection=field(e,"captureSelection")?;closed(selection,&["matrixId","inputDigest","mode"])?;text(field(selection,"matrixId")?)?;digest(field(selection,"inputDigest")?)?;mode_relation::verify_capture_selection(selection,mode,capture_wire)?;
    if !configured{
        let retained=match s(selection,"matrixId")?{"full100"=>Some(("BUDGET","ff4bf8d3b0bd07b5e897d3524aada3fe9c202c529b04eba81a2914c91402a3e9")),"threeperiod"=>Some(("BOTH","3d5d55028ac57818eeea59f0815fa44f8d73a2c91afd07167e28cc8edf937078")),"revocation"=>Some(("BOTH","736505ad2496ec009905d97b77a71082ec7fce3a8d0061d91a4697057cea4e5d")),_=>None}.ok_or_else(||unsupported("RETAINED_CAPTURE_MATRIX_SELECTION"))?;
        need(mode==retained.0 && s(selection,"inputDigest")?==retained.1 && predicate=="CAPTURED_HISTORY","EXACT_RETAINED_CAPTURE_MODE_PREDICATE")?;
        for k in ["cadenceTrust","counterpartyTrust","numericEnrollment","denialSigner"]{need(field(e,k)?.is_null(),"RETAINED_CONFIGURED_ENROLLMENT_MUST_BE_NULL")?;}
        for k in ["cadence","pendingRequest","pendingContext"]{need(field(&input,k)?.is_null(),"RETAINED_CONFIGURED_INPUT_MUST_BE_NULL")?;}
        for k in ["authorityReceipts","counterpartyReceipts","decisionLinks","numericWitnesses"]{need(a(&input,k)?.is_empty(),"RETAINED_EVIDENCE_MUST_BE_EMPTY")?;}
        for k in ["cadenceObservedTimeMs","cadenceJournalDigest","pendingRequestDigest","numericWitnessSetDigest"]{need(field(x,k)?.is_null(),"RETAINED_CONFIGURED_EXPECTATION_MUST_BE_NULL")?;}
        need(field(x,"expectedAssurance")?==&json!({"initial":"NOT_CONFIGURED","obligations":[]}),"RETAINED_NO_ASSURANCE_EXPECTATION")?;
    }else{need(predicate!="CAPTURED_HISTORY","CONFIGURED_PREDICATE_REQUIRED")?;for k in ["cadenceJournalDigest","pendingRequestDigest","numericWitnessSetDigest"]{digest(field(x,k)?)?;}}
    let time=n(x,"observedTime")?;
    let cadence_time=if configured{let ms=n(x,"cadenceObservedTimeMs")?;need(ms/1000==time,"ENROLLED_SECONDS_MILLISECONDS_OBSERVATION")?;ms}else{0};
    if configured{cadence::clock(field(field(e,"cadenceTrust")?,"clock")?)?;numeric_bridge::enrollment(field(e,"numericEnrollment")?)?;
        let signer=field(e,"denialSigner")?;closed(signer,&["ownerId","ownerKey"])?;spki_hex(field(signer,"ownerKey")?)?;
        for k in ["ownerId","ownerKey"]{need(field(signer,k)?==field(field(e,"cadenceTrust")?,k)?,"EXACT_ENROLLED_DENIAL_SIGNER")?;}
        need(hash(field(field(e,"numericEnrollment")?,"qDeployment")?)?==s(field(e,"cadenceTrust")?,"reviewerDeploymentDigest")?,"INDEPENDENT_MINIMUM_Q_DEPLOYMENT")?;
        need(s(field(field(field(e,"numericEnrollment")?,"verificationDescriptor")?,"configuration")?,"cadenceTrustWire")?==canonical(field(e,"cadenceTrust")?)?,"REDACTED_DESCRIPTOR_EXACT_ENROLLED_CADENCE")?;}
    need(tagged_digest("continuity/r3_1/enrollment/v1",e)?==s(x,"enrollmentDigest")?,"INDEPENDENT_ENROLLMENT_BINDING")?;
    need(tagged_digest("continuity/r3_1/capture-enrollment/v1",field(capture,"enrollment")?)?==s(e,"captureEnrollmentDigest")? && field(field(capture,"enrollment")?,"coreEditionDigest")?==field(e,"coreEditionDigest")?,"EXACT_C05_CAPTURE_ENROLLMENT")?;
    need(tagged_digest("continuity/r3_1/capture-expectation/v1",field(capture,"expectation")?)?==s(x,"captureExpectationDigest")?,"EXACT_C05_CAPTURE_EXPECTATION")?;
    if configured{need(field(field(e,"cadenceTrust")?,"coreEdition")?==field(e,"coreEditionDigest")?,"CADENCE_CORE_EDITION")?;}
    for (field_name,digest_name) in [("authorityReceipts","authorityReceiptSetDigest"),("counterpartyReceipts","counterpartyReceiptSetDigest")] {
        need(hash(field(&input,field_name)?)?==s(x,digest_name)?,"SELECTED_ARTIFACT_OR_REQUEST_SET")?;
    }
    if configured{for(field_name,digest_name)in[("pendingRequest","pendingRequestDigest"),("numericWitnesses","numericWitnessSetDigest")]{need(hash(field(&input,field_name)?)?==s(x,digest_name)?,"SELECTED_ARTIFACT_OR_REQUEST_SET")?;}}
    let raw=a(field(capture,"witness")?,"coreEvents")?;need(!raw.is_empty() && raw.len()<=native_core::private_history::MAX_EVENTS,"RAW_CORE_EVENT_COUNT")?;
    let events:Vec<C>=raw.iter().map(|e|wire::core_value(e).map_err(invalid)).collect::<Result<_>>()?;
    let domain=field(e,"coreDomain")?;let core_domain=wire::core_value(domain).map_err(invalid)?;
    let broker_requests=requests(capture)?;
    let numeric_witnesses=a(&input,"numericWitnesses")?;need(numeric_witnesses.len()<=16,"NUMERIC_WITNESS_BOUND")?;
    let journal_value=if configured{finite_canonical_wire(s(field(&input,"cadence")?,"journalWire")?)?}else{json!([])};let journal=array(&journal_value)?;
    let links=a(&input,"decisionLinks")?;need(links.len()<=512,"DECISION_LINK_LIMIT")?;
    let mut by_position:BTreeMap<usize,Vec<&J>>=BTreeMap::new();let mut ids=BTreeSet::new();
    for link in links {
        closed(link,&["decisionId","sourceBinding","authorizationInput","authorizationResult","refusalEvidence"])?;cadence::source_binding(field(link,"sourceBinding")?)?;
        need(ids.insert(s(link,"decisionId")?),"DECISION_LINK_DUPLICATE")?;
        let nonnative=s(field(link,"sourceBinding")?,"evaluationClass")?=="NOT_EVALUATED_NATIVE";
        let source_head=if nonnative{
            need(exhaustion_selected,"NONNATIVE_REQUIRES_SELECTED_EXHAUSTION_CONTRACT")?;
            exhaustion::origin_head(capture,journal,s(field(link,"refusalEvidence")?,"originCheckpointDigest")?)?
        }else{field(field(link,"sourceBinding")?,"snapshotHead")?.clone()};
        let position=n(&source_head,"position")? as usize;
        need(position<events.len(),"DECISION_LINK_OUTSIDE_CAPTURE")?;by_position.entry(position).or_default().push(link);
    }
    let mut numeric_by_position:BTreeMap<usize,Vec<&J>>=BTreeMap::new();let mut numeric_ids=BTreeSet::new();
    for w in numeric_witnesses{closed(w,numeric_bridge::WITNESS_KEYS)?;need(w["kind"]!="EXHAUSTED_REFUSAL"||exhaustion_selected,"NEGATIVE_WITNESS_REQUIRES_SELECTED_PREDICATE")?;need(numeric_ids.insert(s(w,"obligationId")?),"NUMERIC_OBLIGATION_REUSE")?;let position=n(field(w,"snapshotHead")?,"position")? as usize;need(position<events.len(),"NUMERIC_PREFIX_OUTSIDE_CAPTURE")?;numeric_by_position.entry(position).or_default().push(w);}
    let mut heads=Vec::with_capacity(events.len());let mut evidence=BTreeMap::new();let mut numeric_evidence=BTreeMap::new();let mut error=None;
    let replay=replay::replay_private_events_observed_owned(events.clone(),&mut |state|{
        heads.push(json!(state.head()));
        if error.is_none() {for link in by_position.get(&state.head().position).into_iter().flatten(){let derived=if link["sourceBinding"]["evaluationClass"]=="NOT_EVALUATED_NATIVE"{exhaustion::refusal(link,capture,journal,state)}else{decision_evidence(link,state,&broker_requests,domain)};match derived{Ok(result)=>{evidence.insert(link["decisionId"].as_str().unwrap().to_owned(),result);},Err(reason)=>{error=Some(reason);break;}}}}
        if error.is_none(){for w in numeric_by_position.get(&state.head().position).into_iter().flatten(){match numeric_bridge::derive(w,field(e,"numericEnrollment").unwrap(),capture,state,&heads,journal,&evidence,s(e,"coreEditionDigest").unwrap()){Ok(result)=>{numeric_evidence.insert(w["obligationId"].as_str().unwrap().to_owned(),result);},Err(reason)=>{error=Some(reason);break;}}}}
    });
    let state=replay_refusal(replay)?;if let Some(error)=error{return Err(error);}
    // No factoring, reducer copying or relaxed Q/P rule: old complete relation.
    // Typed replay above preserves unsupported classification before the old
    // relation's generic P_CORE_REPLAY diagnostic. Both run in every mode.
    let capture_result=capture_relation::evaluate(capture_wire).map_err(invalid)?;
    need(state.genesis_data().get("domain")==Some(&core_domain) && time>=state.head().canonical_time,"ENROLLED_CORE_DOMAIN_TIME")?;
    need(hash(&json!(state.head()))?==s(x,"coreHeadDigest")?,"EXPECTED_CAPTURED_CORE_HEAD")?;
    let wrappers=a(&input,"authorityReceipts")?;need(wrappers.len()<=512,"AUTHORITY_RECEIPT_LIMIT")?;
    let recorded:Vec<&C>=events.iter().filter(|event|event.get("type").and_then(C::string)==Some("RECEIPT_RECORDED")).filter_map(|event|event.get("data")).collect();
    need(recorded.len()==wrappers.len(),"AUTHORITY_RECEIPT_RECORD_CENSUS")?;
    let mut receipt_inputs=Vec::new();let mut receipt_results=Vec::new();let mut seen=BTreeSet::new();
    for wrapper in wrappers {
        closed(wrapper,&["claim","input"])?;let claim=s(wrapper,"claim")?;need(matches!(claim,"HISTORICAL"|"CURRENT"),"AUTHORITY_RECEIPT_CLAIM")?;
        let receipt_input=field(wrapper,"input")?;
        let result=authority_receipt::evaluate_for_capture(&canonical(receipt_input)?,&events,&core_domain,time).map_err(|e|match e{authority_receipt::ReceiptInputError::InvalidInput(code)=>invalid(code),authority_receipt::ReceiptInputError::Unsupported(code)=>unsupported(code),authority_receipt::ReceiptInputError::Unavailable(code)=>unavailable(code)})?;
        need(result.get("requiredPredicateSatisfied")==Some(&J::Bool(true)) && (claim!="CURRENT" || result.get("current")==Some(&J::Bool(true))),"AUTHORITY_RECEIPT_REQUIRED_PREDICATE")?;
        let data=wire::core_value(field(&result,"receiptRecordData")?).map_err(invalid)?;
        need(recorded.iter().any(|record|**record==data) && seen.insert(canonical(field(&result,"receiptRecordData")?)?),"AUTHORITY_RECEIPT_RECORD_SUBSTITUTION")?;
        receipt_inputs.push(receipt_input.clone());receipt_results.push(result);
    }
    let counterparty_result=if configured{counterparty::evaluate(field(&input,"counterpartyReceipts")?,field(e,"counterpartyTrust")?,capture,&receipt_inputs,&receipt_results,domain,s(e,"coreEditionDigest")?,time,&heads)?}else{json!({"status":"NO_ATTESTATION","receipts":[],"deliveryVerified":false,"permitsExecution":false})};
    let pending=field(&input,"pendingRequest")?;let supplied_context=field(&input,"pendingContext")?;
    need(!exhaustion_selected||(pending.is_null()&&supplied_context.is_null()),"EXHAUSTION_HISTORICAL_ONLY_NO_PENDING_EXECUTION")?;
    let pending_result=if pending.is_null(){need(supplied_context.is_null(),"CONTEXT_WITHOUT_PENDING_REQUEST")?;J::Null}else{
        let result=pending_authorization(pending,&state,domain,time)?;
        if !supplied_context.is_null(){context(supplied_context)?;need(field(supplied_context,"coreHead")?==field(&result,"coreHead")? && field(supplied_context,"requestDigest")?==field(&result,"requestDigest")?,"PENDING_CONTEXT_NATIVE_HEAD_REQUEST")?;}
        result
    };
    let cadence_result=if configured{cadence::evaluate(field(&input,"cadence")?,field(e,"cadenceTrust")?,s(x,"cadenceJournalDigest")?,cadence_time,&evidence,&numeric_evidence,if supplied_context.is_null(){None}else{Some(supplied_context)})?}else{json!({"status":"NOT_CONFIGURED_RETAINED_CAPTURE","initialAuthenticatedCheckpointPresent":false,"initialAssuranceStatus":"NOT_CONFIGURED","initialAssuranceCompliant":false,"obligations":[],"protectedDispatch":false,"permitsExecution":false})};
    let mode_relation=mode_relation::derive(
        configured,selection,mode,predicate,
        cadence_result["agreements"].as_array().and_then(|agreements|agreements.last()),
        pending,supplied_context,
    )?;
    let captured_required=configured && !cadence_result["ownerRejected"].as_bool().unwrap_or(true) && cadence_result["initialAuthenticatedCheckpointPresent"].as_bool()==Some(true);
    let assurance=field(x,"expectedAssurance")?;closed(assurance,&["initial","obligations"])?;let initial=s(assurance,"initial")?;need(if configured{matches!(initial,"CAPTURED_HISTORY_ONLY"|"NUMERIC_FULFILLED")}else{initial=="NOT_CONFIGURED"},"EXPECTED_ASSURANCE_SELECTION")?;
    let assurance_initial=initial=="CAPTURED_HISTORY_ONLY" || cadence_result["initialAssuranceStatus"]=="NUMERIC_FULFILLED";
    let actual_obligations:Vec<J>=a(&cadence_result,"obligations")?.iter().map(|o|json!({"id":o["id"],"status":o["status"],"proofBinding":o["fulfillment"].get("proofBinding").cloned().unwrap_or(json!("UNAVAILABLE"))})).collect();
    for o in a(assurance,"obligations")?{closed(o,&["id","status","proofBinding"])?;text(field(o,"id")?)?;text(field(o,"status")?)?;need(matches!(s(o,"proofBinding")?,"PROOF_BOUND"|"UNAVAILABLE"),"EXPECTED_ASSURANCE_BINDING")?;}
    let assurance_matched=configured && assurance_initial && field(assurance,"obligations")?==&json!(actual_obligations);
    // Numeric evidence is captured PROOF_BOUND correspondence. Quantitative
    // cryptographic verification and a fresh live custody fence remain external.
    let negative_outcome=if exhaustion_selected{Some(exhaustion::final_contract(&input,capture,journal,&state,&cadence_result,&numeric_evidence)?)}else{None};
    let required=if configured{captured_required && assurance_matched && (predicate=="CAPTURED_ENGINE"||exhaustion_selected&&negative_outcome.is_some()&&cadence_result["initialAssuranceCompliant"]==true)}else{predicate=="CAPTURED_HISTORY"};
    let budget=mode!="STATE";let state_selected=mode!="BUDGET";
    let mut result=json!({"schema":"continuity.r3_1.application-predicate-result.v1","profile":PROFILE,"engineEdition":EDITION,"programId":field(e,"programId")?,"enrollmentDigest":field(x,"enrollmentDigest")?,"expectationDigest":tagged_digest("continuity/r3_1/expectation/v1",x)?,"mode":mode,"authenticatedSessionMode":mode_relation.authenticated_session_mode,"proofMode":mode_relation.proof_mode,"modeRelationship":mode_relation.relationship,"predicate":predicate,"captureSelection":selection,"cadenceAxis":axis,"coreEditionDigest":field(e,"coreEditionDigest")?,"coreHead":state.head(),"observedTime":time,"cadenceObservedTimeMs":field(x,"cadenceObservedTimeMs")?,"clock":if configured{field(field(e,"cadenceTrust")?,"clock")?.clone()}else{J::Null},"capturedScope":"broker-mediated","coreContentChecked":true,"privateQContextRequired":true,"budgetProven":budget,"stateProven":state_selected,"quantitativeQVerified":false,"authorityReceipts":receipt_results,"counterpartyReceipts":counterparty_result,"cadence":cadence_result,"numericCorrespondence":numeric_evidence.values().collect::<Vec<_>>(),"pendingAuthorization":pending_result,"pendingContextEquivalence":if configured{"CAPTURED_PREFIX_ONLY_WHERE_PROOF_BOUND"}else{"NOT_CONFIGURED"},"genuineCurrentQ":"REQUIRES_EXTERNAL_ACTUAL_Q_VERIFICATION","currentCustody":"UNAVAILABLE","requiredPredicateSatisfied":required,"evidence":"PREDICATE_ONLY_REQUIRES_ACTUAL_GUEST_PROOF","permitsExecution":false});
    if budget {result["budgetContent"]=capture_result;}
    result["expectedAssurance"]=assurance.clone();result["expectedAssuranceSatisfied"]=json!(assurance_matched);result["retainedCaptureSelectionSatisfied"]=json!(!configured);
    if let Some(outcome)=negative_outcome{result["capturedScope"]=json!("successor-workflow");result["negativeOutcome"]=outcome;}
    if state_selected {result["stateRoot"]=serde_json::to_value(state_root::derive_from_state(&state).map_err(|e|invalid(e.to_string()))?).map_err(|e|invalid(e.to_string()))?;}
    Ok(result)
}

/// Same 32-byte public-value interface, a new domain and exact canonical result.
/// Source mode flags are predicates to be proved, never host proof acceptance.
pub fn commitment(result:&J)->Result<[u8;32]> {
    let bytes=canonical(result)?;let mut preimage=Vec::with_capacity(COMMITMENT_DOMAIN.len()+1+bytes.len());
    preimage.extend_from_slice(COMMITMENT_DOMAIN.as_bytes());preimage.push(0);preimage.extend_from_slice(bytes.as_bytes());
    Ok(crypto_adapter::hash::Sha256::digest(&preimage))
}
