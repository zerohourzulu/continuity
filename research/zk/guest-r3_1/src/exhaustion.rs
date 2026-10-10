//! Unbuilt successor proposal. Inventory facts and P-evaluated diagnostics are
//! distinct. This module never verifies Q cryptography or grants execution.
use crate::common::*;
use crate::numeric_bridge::{actual_head,bigint,core_json,opening,u64s};
use native_core::{canonical,policy::wire,replay::State};
use serde_json::{json,Value as J};
use std::collections::BTreeMap;

pub const FRAME_KEYS:&[&str]=&["anchorDecisionId","decisionReceiptDigest","refusalEvidenceDigest","originCheckpointDigest","diagnosticAuthorizationInput","diagnosticAuthorizationResult","diagnosticRequestDigest","diagnosticProvenance"];
pub const REFUSAL_KEYS:&[&str]=&["schema","refusalSource","logicalId","serviceRequestDigest","serviceResultDigest","unadmittedIngressCommitment","originCheckpointDigest"];
pub const OUTCOME_KEYS:&[&str]=&["obligationId","status","refusalSource","denialCode","head","requestId","nonce","audience","complementStatementDigest","complementProofDigest","fulfillmentDigest","orderClaimScope","limitDimension","coreCumulativeStatus","effectsScope"];
pub const RELEASE_KEYS:&[&str]=&["obligationId","negativeOutcomeDigest","internalServiceResultDigest","externalResultDigest"];

fn one<'a>(rows:&'a[J],predicate:impl Fn(&J)->bool,code:&str)->Result<&'a J>{
    let mut found=rows.iter().filter(|v|predicate(v));let value=found.next().ok_or_else(||unavailable(code))?;
    need(found.next().is_none(),code)?;Ok(value)
}
pub(crate) fn entry<'a>(journal:&'a[J],digest_value:&str,kind:&str)->Result<&'a J>{
    one(journal,|j|j["payload"]["kind"].as_str()==Some(kind)&&hash(j).ok().as_deref()==Some(digest_value),"EXHAUSTION_EXACT_JOURNAL_ENTRY")
}
fn intervals(capture:&J)->Result<&[J]>{a(field(capture,"witness")?,"intervals")}
fn selected_interval<'a>(capture:&'a J,cp:&J)->Result<&'a J>{
    one(intervals(capture)?,|i|i["expected"]["intervalId"]==cp["intervalId"],"EXHAUSTION_EXACT_INTERVAL")
}
fn closing_policy(interval:&J)->Result<&J>{
    let d=field(interval,"dossier")?;let end=field(field(d,"end")?,"payload")?;
    let env=one(a(d,"policies")?,|p|wire::digest("continuity/private-case/v1/policy",&p["payload"]).ok().as_deref()==end["policyDigest"].as_str(),"EXHAUSTION_CLOSING_POLICY")?;
    field(env,"payload")
}
pub(crate) fn origin_head(capture:&J,journal:&[J],cp_digest:&str)->Result<J>{
    let cp=field(field(entry(journal,cp_digest,"CHECKPOINT")?,"payload")?,"body")?;
    need(cp["kind"]=="CLOSING"&&cp["receiptRange"]["throughIndex"]==1,"EXHAUSTION_I1_ORIGIN_INDEX")?;
    let ii=intervals(capture)?;need(ii.len()==3,"EXHAUSTION_THREE_INTERVALS")?;
    let interval=selected_interval(capture,cp)?;need(interval==&ii[1],"EXHAUSTION_I1_ORIGIN_SELECTION")?;
    let policy=closing_policy(interval)?;let value=opening(a(interval,"bindings")?,s(policy,"coreBinding")?,"core-head")?;
    Ok(field(value,"head")?.clone())
}
fn stream<'a>(capture:&'a J,name:&str)->Result<&'a [J]>{a(field(field(field(capture,"witness")?,"streams")?,name)?,"records")}
fn capture_id(request:&J)->Result<String>{
    // Immutable durable-capture requestId uses legacy UTF-16 canonical bytes,
    // separately from successor cadence metadata hashes and service op IDs.
    let value=json!({"caseId":field(request,"caseId")?,"logicalId":field(request,"logicalId")?});
    Ok(format!("capture:{}",wire::hash_bytes(wire::canonical(&value).map_err(invalid)?.as_bytes())))
}
fn source_pair<'a>(capture:&'a J,request:&J)->Result<(&'a J,&'a J,J)>{
    closed(request,&["logicalId","caseId","resource","recipientId","purpose","actorId","sessionId","roleId","tenureId"])?;
    let id=capture_id(request)?;let rows=stream(capture,"source")?;
    let pending=one(rows,|r|r["record"]["kind"]=="SOURCE_READ_PENDING"&&r["record"]["request"]==*request,"EXHAUSTION_ACTUAL_SOURCE_REQUEST")?;
    let p=field(pending,"record")?;closed(p,&["kind","logicalId","request","ingressId","sourceReadId"])?;
    need(p["logicalId"]==id&&pending["operationId"]==format!("{id}:pending"),"EXHAUSTION_DERIVED_CAPTURE_ID")?;
    let captured=one(rows,|r|r["record"]["kind"]=="SOURCE_CAPTURED"&&r["record"]["logicalId"]==p["logicalId"],"EXHAUSTION_ACTUAL_SOURCE_CAPTURE")?;
    let r=field(captured,"record")?;
    if r.get("payloadRef").is_some(){closed(r,&["kind","logicalId","ingressId","sourceReadId","resource","sourceSequence","amount","payloadDigest","files","payloadRef"])?;}else{closed(r,&["kind","logicalId","ingressId","sourceReadId","resource","sourceSequence","amount","payloadDigest","files","payload"])?;}
    need(captured["operationId"]==format!("{id}:captured")&&r["ingressId"]==p["ingressId"]&&r["sourceReadId"]==p["sourceReadId"]&&r["resource"]==request["resource"]&&n(pending,"sequence")?<n(captured,"sequence")?,"EXHAUSTION_SOURCE_CAPTURE_PREIMAGES")?;
    let metadata=json!({"schema":"continuity.q-staged-capture/1","durableId":captured["operationId"],"recordDigest":captured["digest"],"ingressId":r["ingressId"],"sourceReadId":r["sourceReadId"],"resource":r["resource"],"sourceSequence":r["sourceSequence"],"amount":r["amount"],"payloadDigest":r["payloadDigest"],"files":r["files"]});
    Ok((pending,captured,metadata))
}

/// The complete captured-policy relation authenticates these same preimages.
/// No return from this function is credited until that relation also succeeds.
pub(crate) fn refusal(link:&J,capture:&J,journal:&[J],state:&State)->Result<J>{
    let sb=field(link,"sourceBinding")?;crate::cadence::source_binding(sb)?;
    need(sb["evaluationClass"]=="NOT_EVALUATED_NATIVE"&&sb["refusalClass"]=="INVENTORY_REFUSAL","EXHAUSTION_ACTUAL_INVENTORY_SOURCE")?;
    for k in ["authorizationInput","authorizationResult"]{need(field(link,k)?.is_null(),"EXHAUSTION_NO_CAPTURED_NATIVE_FRAME")?;}
    let ev=field(link,"refusalEvidence")?;closed(ev,REFUSAL_KEYS)?;
    need(ev["schema"]=="continuity.r3_1.inventory-refusal-evidence.v1"&&ev["refusalSource"]=="INVENTORY"&&ev["logicalId"]==sb["logicalId"]&&hash(ev)?==s(sb,"evidenceDigest")?,"EXHAUSTION_CLOSED_REFUSAL_EVIDENCE")?;
    for k in ["serviceRequestDigest","serviceResultDigest","unadmittedIngressCommitment","originCheckpointDigest"]{digest(field(ev,k)?)?;}
    let head=origin_head(capture,journal,s(ev,"originCheckpointDigest")?)?;actual_head(state,&head)?;
    need(head==json!(state.head()),"EXHAUSTION_ORIGIN_CURRENT_CAPTURED_HEAD")?;
    let logical=s(sb,"logicalId")?;let service=stream(capture,"service")?;
    let request_env=one(service,|r|r["record"]["kind"]=="SERVICE_REQUEST"&&r["record"]["logicalId"].as_str()==Some(logical),"EXHAUSTION_ACTUAL_SERVICE_REQUEST")?;
    let result_env=one(service,|r|r["record"]["kind"]=="SERVICE_RESULT"&&r["record"]["logicalId"].as_str()==Some(logical),"EXHAUSTION_ACTUAL_SERVICE_RESULT")?;
    let request=field(request_env,"record")?;let result=field(result_env,"record")?;
    need(hash(request)?==s(ev,"serviceRequestDigest")?&&hash(result)?==s(ev,"serviceResultDigest")?&&n(request_env,"sequence")?<n(result_env,"sequence")?,"EXHAUSTION_SERVICE_RECORD_PREIMAGES")?;
    need(result["result"]==json!({"logicalId":logical,"status":"BROKER_REFUSED","automaticResend":false}),"EXHAUSTION_REAL_INTERNAL_RESULT")?;
    let interval=&intervals(capture)?[2];let ingress=opening(a(interval,"bindings")?,s(ev,"unadmittedIngressCommitment")?,"unadmitted-ingress")?;
    closed(ingress,&["logicalId","caseId","reason","evidence"])?;
    closed(field(ingress,"evidence")?,&["capture","quantitative"])?;closed(field(field(ingress,"evidence")?,"quantitative")?,&["allowed","reason"])?;
    need(ingress["logicalId"]==sb["logicalId"]&&ingress["caseId"]==request["request"]["caseId"]&&ingress["reason"]=="BROKER_REFUSED"&&ingress["evidence"]["quantitative"]==json!({"allowed":false,"reason":"GROUP_LIMIT"}),"EXHAUSTION_REAL_QUANTITATIVE_INGRESS")?;
    let (_,_,metadata)=source_pair(capture,field(request,"request")?)?;
    need(ingress["evidence"]["capture"]==metadata,"EXHAUSTION_ACTUAL_SOURCE_CAPTURE_METADATA")?;
    let rows=a(field(interval,"dossier")?,"rows")?;
    one(rows,|r|r["kind"]=="REQUEST"&&r["details"]["requestCommitment"]==ev["unadmittedIngressCommitment"],"EXHAUSTION_INGRESS_Q_REQUEST")?;
    need(!stream(capture,"broker")?.iter().any(|r|r["record"]["logicalId"].as_str()==Some(logical)),"EXHAUSTION_NO_R2_BROKER_ATTEMPT")?;
    need(state.declaration(logical).is_none()&&state.admission(logical).is_none()&&state.consumption(logical).is_none(),"EXHAUSTION_NO_R2_NATIVE_ATTEMPT")?;
    Ok(json!({"decisionId":field(link,"decisionId")?,"sourceBinding":sb,"coreDecision":null,"coreHead":null,"requestDigest":hash(&request["request"])? ,"resultDigest":hash(&result["result"])? ,"authorizationInput":null,"authorizationResult":null,"serviceRequest":request,"ingress":ingress,"refusalEvidence":ev,"internalServiceResultSequence":n(result_env,"sequence")?,"head":head}))
}

pub(crate) fn request_record_digest(context:&J,record:&J,evidence:&J)->Result<()> {
    let actual=hash(record)?;
    need(record["kind"]=="SERVICE_REQUEST"&&context["requestDigest"].as_str()==Some(actual.as_str())
        &&evidence["serviceRequestDigest"].as_str()==Some(actual.as_str()),"EXHAUSTION_REQUEST_RECORD_DIGEST")
}
/// Reconstruct every legacy UTF-16 custody link and require the signed final tip.
/// Signature authenticity is established by the complete cadence relation before credit.
pub(crate) fn final_custody_heads(config:&J,heads:&J,custody:&J)->Result<()> {
    closed(heads,&["service","source","inventory","recipient"])?;
    for (name,key) in [("service","serviceRecords"),("source","sourceRecords"),("inventory","inventoryRecords"),("recipient","recipientRecords")] {
        closed(field(heads,name)?,&["schema","storeId","stream","sequence","digest"])?;
        let actual=crate::numeric_bridge::journal_head(&identity(config,name),a(custody,key)?)?;
        need(actual==heads[name],"EXHAUSTION_SIGNED_FINAL_CUSTODY_HEAD")?;
    }
    Ok(())
}

pub(crate) struct Prepared {pub input:J,pub anchor:J,pub context:J,pub facts:J}
pub(crate) fn prepare(w:&J,capture:&J,state:&State,journal:&[J],evidence:&BTreeMap<String,J>)->Result<Prepared>{
    let f=field(w,"negativeFrame")?;closed(f,FRAME_KEYS)?;
    need(f["diagnosticProvenance"]=="P_EVALUATED_DIAGNOSTIC","EXHAUSTION_DIAGNOSTIC_PROVENANCE")?;
    for k in ["authorizationInput","authorizationResult","postAuthorizationInput","postAuthorizationResult"]{need(field(w,k)?.is_null(),"EXHAUSTION_NULL_CAPTURED_NATIVE_FIELDS")?;}
    let d=entry(journal,s(f,"decisionReceiptDigest")?,"DECISION")?;let db=field(field(d,"payload")?,"body")?;
    need(db["index"]==2&&db["coreDecision"].is_null()&&db["coreHead"].is_null()&&db["eligibleContext"].is_null()&&db["outcome"]=="NOT_SUBMITTED","EXHAUSTION_R2_DECISION")?;
    let refusal=evidence.get(s(db,"decisionId")?).ok_or_else(||unavailable("EXHAUSTION_ACTUAL_REFUSAL_MISSING"))?;
    need(w["verificationReceipt"]["engineBinding"]["decisionId"]==db["decisionId"],"EXHAUSTION_RECEIPT_ACTUAL_DECISION_ID")?;
    need(refusal["sourceBinding"]==db["sourceBinding"]&&hash(&refusal["refusalEvidence"])?==s(f,"refusalEvidenceDigest")?&&refusal["refusalEvidence"]["originCheckpointDigest"]==f["originCheckpointDigest"],"EXHAUSTION_FRAME_ACTUAL_REFUSAL")?;
    let anchor=evidence.get(s(f,"anchorDecisionId")?).ok_or_else(||unavailable("EXHAUSTION_R1_ANCHOR_MISSING"))?;
    need(anchor["coreDecision"]=="ALLOW","EXHAUSTION_R1_REAL_ALLOW")?;
    let sb=field(anchor,"sourceBinding")?;let intent=s(sb,"intentId")?;let p=n(field(sb,"snapshotHead")?,"position")? as usize;
    need(p<state.events().len(),"EXHAUSTION_ANCHOR_PREFIX")?;
    let tail=&state.events()[p+1..];need(tail.len()==2&&tail[0].get("type").and_then(canonical::Value::string)==Some("TRANSACTION_INTENT_ADMITTED")&&tail[1].get("type").and_then(canonical::Value::string)==Some("TRANSACTION_INTENT_CONSUMED")&&tail.iter().all(|e|e.get("data").and_then(|v|v.get("intentId")).and_then(canonical::Value::string)==Some(intent)),"EXHAUSTION_EXACT_R1_ADMISSION_AND_CONSUMPTION_TAIL")?;
    let seconds=n(field(d,"payload")?,"at")?/1000;need(seconds>=state.head().canonical_time,"EXHAUSTION_DECLARED_R2_TIME")?;
    let sr=&refusal["serviceRequest"];let request=&sr["request"];let captured=&refusal["ingress"]["evidence"]["capture"];
    need(db["decisionId"]==sr["logicalId"]&&db["sourceBinding"]["logicalId"]==sr["logicalId"],"EXHAUSTION_PUBLISHED_SERVICE_OPERATION_ID")?;
    need(captured["amount"]=="3"&&anchor["authorizationInput"]["request"]["amount"]==json!({"$bigint":"3"})&&request["actorId"]==anchor["authorizationInput"]["request"]["actorId"]&&request["recipientId"]==anchor["authorizationInput"]["request"]["counterpartyId"]&&request["resource"]==captured["resource"]&&captured["resource"]==anchor["authorizationInput"]["request"]["resource"],"EXHAUSTION_REAL_R2_AMOUNT_RESOURCE")?;
    active_tuple(state,request,seconds)?;
    let diagnostic_request=json!({"actorId":request["actorId"],"action":"disclose","resource":captured["resource"],"claimedAt":seconds,"amount":{"$bigint":"3"},"counterpartyId":request["recipientId"]});
    let original=&anchor["authorizationInput"];
    let input=json!({"operationVersion":"continuity-authorization/0.2","expectedHistoryHead":state.head(),"domain":original["domain"],"policyVersion":original["policyVersion"],"rootRecognitionPolicy":original["rootRecognitionPolicy"],"request":diagnostic_request,"evaluationTime":seconds,"authoritative":true,"consequential":false});
    need(input==f["diagnosticAuthorizationInput"]&&hash(&diagnostic_request)?==s(f,"diagnosticRequestDigest")?,"EXHAUSTION_DERIVED_DIAGNOSTIC_INPUT")?;
    let encoded=canonical::encode(&wire::core_value(&input).map_err(invalid)?).map_err(|v|invalid(v.to_string()))?;
    let result=core_json(native_core::authorization::authorize_at_state_canonical(state,&encoded).map_err(|v|invalid(v.to_string()))?)?;
    need(result==f["diagnosticAuthorizationResult"]&&result["decision"]=="DENY"&&result["scopeAssurance"]=="REPLAY_VERIFIED"&&result["code"]=="CUMULATIVE_AMOUNT_EXCEEDED","EXHAUSTION_AMOUNT_CAUSAL_DIAGNOSTIC")?;
    let failures=a(&result,"failures")?;need(failures.len()==1&&failures[0]["code"]=="CUMULATIVE_AMOUNT_EXCEEDED","EXHAUSTION_SINGLE_PATH_AMOUNT_CAUSE")?;
    let path:Vec<J>=a(&anchor["authorizationResult"]["proof"],"permissionPath")?.iter().map(|g|g["authorityId"].clone()).collect();
    need(failures[0]["authorityPathIds"]==json!(path),"EXHAUSTION_EXACT_ANCHORED_PATH")?;
    let obligation=s(w,"obligationId")?;
    let rq=one(journal,|j|j["payload"]["kind"]=="REQUEST"&&j["payload"]["body"]["obligationId"].as_str()==Some(obligation),"EXHAUSTION_REPORTING_REQUEST")?;
    let rb=field(field(rq,"payload")?,"body")?;
    need(rb["decisionReceiptDigest"]==f["decisionReceiptDigest"]&&rb["dueIndex"]==2&&n(field(rq,"payload")?,"sequence")?>n(field(d,"payload")?,"sequence")?,"EXHAUSTION_REQUEST_AFTER_R2")?;
    let context=field(rb,"requestContext")?.clone();crate::common::context(&context)?;
    request_record_digest(&context,sr,field(refusal,"refusalEvidence")?)?;
    // Published requestId is the real service operation ID. The caller input's
    // requestId stays bound inside the full original SERVICE_REQUEST preimage.
    let facts=json!({"logicalId":db["sourceBinding"]["logicalId"],"requestId":sr["logicalId"],"internalServiceResultSequence":refusal["internalServiceResultSequence"],"serviceResultDigest":refusal["refusalEvidence"]["serviceResultDigest"],"decisionReceiptDigest":f["decisionReceiptDigest"],"originCheckpointDigest":f["originCheckpointDigest"],"head":state.head(),"requestNonce":rb["nonce"],"diagnosticEvaluationTime":seconds,"serviceRequestDigest":hash(sr)?});
    Ok(Prepared{input,anchor:anchor["authorizationResult"].clone(),context,facts})
}

fn active_tuple(state:&State,request:&J,time:u64)->Result<()>{
    let projection=core_json(state.projection())?;
    let agent=one(a(&projection,"agents")?,|v|v[0]==request["actorId"],"EXHAUSTION_AGENT")?;
    let session=one(a(&projection,"runtimeSessions")?,|v|v[0]==request["sessionId"],"EXHAUSTION_RUNTIME_SESSION")?;
    let role=one(a(&projection,"roles")?,|v|v[0]==request["roleId"],"EXHAUSTION_ROLE")?;
    let tenure=one(a(&projection,"tenures")?,|v|v[0]==request["tenureId"],"EXHAUSTION_TENURE")?;
    // The actual retained broker AUTHORIZE input has no runtime binding. This
    // diagnostic supplement derives the tuple from real request + replay only.
    text(field(&session[1],"credentialKeyId")?)?;
    need(agent[1]["terminated"]==false&&session[1]["agentId"]==request["actorId"]&&session[1]["controllerId"]==agent[1]["controllerId"]&&session[1]["controlEpoch"]==agent[1]["currentControlEpoch"],"EXHAUSTION_ACTIVE_SESSION_EPOCH")?;
    if let Some(expiry)=session[1].get("expiresAt"){need(time<number(expiry)?,"EXHAUSTION_SESSION_EXPIRED")?;}
    need(role[1]["currentTenureId"]==request["tenureId"]&&tenure[1]["closed"]==false&&tenure[1]["agentId"]==request["actorId"]&&tenure[1]["roleId"]==request["roleId"],"EXHAUSTION_ACTIVE_EXACT_ROLE_TUPLE")
}

pub(crate) fn finite_caps(capture:&J,e:&J,closing:&J,structural:&J,proof:&J)->Result<()>{
    let groups=a(field(field(field(capture,"q")?,"expected")?,"enrollment")?,"groups")?;
    need(groups.len()==1&&groups[0]["id"]==e["completeGroupId"]&&a(structural,"groupIds")?.len()==1&&structural["groupIds"][0]==e["completeGroupId"],"EXHAUSTION_SINGLE_COMPLETE_GROUP")?;
    let gid=s(e,"completeGroupId")?;let caps=a(closing,"groupLimits")?;
    need(caps.len()==1&&caps[0]["groupId"]==e["completeGroupId"]&&caps[0]["amountLimit"]=="3"&&u64s(&caps[0]["countLimit"])? >=2,"EXHAUSTION_REAL_CAP3_COUNT_AMPLE")?;
    let constraints=field(proof,"effectiveConstraints")?;
    need(bigint(field(constraints,"maxCumulativeAmount")?)?==3&&n(constraints,"maxTransactions")? >=2&&bigint(field(constraints,"maxAmount")?)? >=3,"EXHAUSTION_NATIVE_AMOUNT_ONLY_CONSTRAINT")?;
    need(structural["groupCounts"][gid]=="1"&&structural["groupAmounts"][gid]=="3","EXHAUSTION_R1_ONLY_CHARGE3")?;
    for usage in a(structural,"authorityUsage")?{need(bigint(field(usage,"admittedCumulativeAmount")?)?==3&&n(usage,"admittedTransactionCount")?==1,"EXHAUSTION_CURRENT_AUTHORITY_USAGE")?;}
    let ii=intervals(capture)?;need(ii.len()==3,"EXHAUSTION_THREE_INTERVALS")?;
    for interval in ii{
        for env in a(field(interval,"dossier")?,"policies")?{let limits=a(field(env,"payload")?,"groupLimits")?;need(limits.len()==1&&limits[0]["groupId"]==e["completeGroupId"]&&limits[0]["amountLimit"]=="3"&&limits[0]["countLimit"]==caps[0]["countLimit"],"EXHAUSTION_NO_POLICY_OR_CAP_CHANGE")?;}
    }
    let charges=a(field(&ii[1],"witness")?,"charges")?;need(charges.len()==1&&charges[0]["value"]=="3","EXHAUSTION_ONE_REAL_R1_QUANTITY_CHARGE")?;
    need(a(field(&ii[0],"witness")?,"charges")?.is_empty()&&a(field(&ii[2],"witness")?,"charges")?.is_empty(),"EXHAUSTION_NO_OTHER_QUANTITY_CHARGES")?;
    for (index,interval) in ii.iter().enumerate(){
        let carry=one(a(interval,"nextPrivateCarry")?,|v|v["groupId"]==e["completeGroupId"],"EXHAUSTION_CARRY_GROUP")?;
        need(carry["value"]==if index==0{json!("0")}else{json!("3")},"EXHAUSTION_EXACT_CLOSING_CARRY")?;
    }
    Ok(())
}

fn closure(interval:&J)->Result<&J>{
    let mut values=Vec::new();
    for row in a(field(interval,"dossier")?,"rows")?.iter().filter(|r|r["kind"]=="CONTROL"){
        let commitment=s(field(row,"details")?,"controlCommitment")?;
        if let Ok(value)=opening(a(interval,"bindings")?,commitment,"case-control"){
            if value.get("serviceHead").is_some(){values.push(value);}
        }
    }
    need(values.len()==1,"EXHAUSTION_UNIQUE_CAPTURED_SERVICE_CLOSE")?;Ok(values[0])
}
fn identity(config:&J,name:&str)->J{json!({"storeId":config["custody"]["storeId"],"stream":config["streams"][name]})}
fn prefix_head(config:&J,name:&str,rows:&[J],head:&J)->Result<J>{
    closed(head,&["schema","storeId","stream","sequence","digest"])?;
    let count=n(head,"sequence")? as usize;need(count<=rows.len(),"EXHAUSTION_CUSTODY_PREFIX_BOUND")?;
    let actual=crate::numeric_bridge::journal_head(&identity(config,name),&rows[..count])?;
    need(&actual==head,"EXHAUSTION_RECONSTRUCTED_FULL_PREFIX")?;Ok(actual)
}
fn artifact_ref(interval:&J,value:&J,config:&J)->Result<()>{
    closed(value,&["schema","storeId","stream","key","sha256","bytes","manifestOperationId","head"])?;
    let mut artifact=interval.clone();artifact["schema"]=json!("continuity.case.private-interval.v1");
    let raw=wire::canonical(&artifact).map_err(invalid)?;let key=format!("interval:{}",s(field(interval,"expected")?,"intervalId")?);
    need(value["schema"]=="continuity.custody.blob.v1"&&value["storeId"]==config["custody"]["storeId"]&&value["stream"]==config["streams"]["blobs"]&&value["key"]==key&&s(value,"sha256")?==wire::hash_bytes(raw.as_bytes())&&n(value,"bytes")?==raw.len() as u64,"EXHAUSTION_EXACT_CLOSED_INTERVAL_ARTIFACT")?;
    need(value["manifestOperationId"]==format!("blob:{}:manifest",wire::hash_bytes(key.as_bytes())),"EXHAUSTION_ARTIFACT_MANIFEST_ID")?;
    let head=field(value,"head")?;closed(head,&["schema","storeId","stream","sequence","digest"])?;
    need(head["schema"]=="continuity.custody.head.v1"&&head["storeId"]==value["storeId"]&&head["stream"]==value["stream"]&&n(head,"sequence")?>0,"EXHAUSTION_ARTIFACT_HEAD_IDENTITY")?;digest(field(head,"digest")?)?;Ok(())
}

/// Final vectors are an explicit host finalization. The preparation receipt
/// still binds only its exact earlier prefixes; final I2 is checked separately.
pub(crate) fn custody_heads(w:&J,capture:&J,state:&State,config:&J,journal:&[J],current:&mut J)->Result<()>{
    let c=field(w,"custody")?;let heads=field(c,"openingHeads")?;
    closed(heads,&["core","broker","service","source","inventory","recipient"])?;
    need(heads["core"]==json!(state.head()),"EXHAUSTION_OPENING_GENUINE_CORE_HEAD")?;
    let final_cp=one(journal,|e|e["payload"]["kind"]=="CHECKPOINT"&&e["payload"]["body"]["receiptRange"]["throughIndex"]==2,"EXHAUSTION_FINAL_CHECKPOINT_CENSUS")?;
    final_custody_heads(config,field(field(field(final_cp,"payload")?,"body")?,"finalCustodyHeads")?,c)?;
    let ii=intervals(capture)?;let origin=closure(&ii[1])?;
    for (name,expected) in [("broker",&origin["broker"]["journalHead"]),("source",&origin["sourceHead"]),("recipient",&origin["recipient"]["head"])]{
        let rows=stream(capture,name)?;need(heads[name]==*expected,"EXHAUSTION_OPENING_I1_CLOSURE_HEAD")?;
        prefix_head(config,name,rows,&heads[name])?;
    }
    let broker=stream(capture,"broker")?;
    need(n(&heads["broker"],"sequence")? as usize==broker.len()&&n(c,"brokerSequence")? as usize==broker.len(),"EXHAUSTION_WHOLE_I2_BROKER_UNCHANGED")?;
    let receipt_heads=field(field(w,"verificationReceipt")?,"custodyHeads")?;
    closed(receipt_heads,&["core","cadence","broker","blobs","service","source","inventory","recipient"])?;
    for (name,key) in [("service","serviceRecords"),("source","sourceRecords"),("recipient","recipientRecords")]{
        let rows=a(c,key)?;need(rows==stream(capture,name)?,"EXHAUSTION_COMPLETE_FINAL_CAPTURE_STREAM")?;
        crate::numeric_bridge::journal_head(&identity(config,name),rows)?;
        let prepared=prefix_head(config,name,rows,&receipt_heads[name])?;
        need(n(&prepared,"sequence")?>=n(&heads[name],"sequence")?,"EXHAUSTION_PREPARATION_AFTER_OPENING")?;current[name]=prepared;
    }
    let inventory=a(c,"inventoryRecords")?;crate::numeric_bridge::journal_head(&identity(config,"inventory"),inventory)?;
    let enrolled=one(inventory,|r|r["record"]["kind"]=="CONFIG","EXHAUSTION_ORIGINAL_INVENTORY_ENROLLMENT")?;let initial=&enrolled["record"];
    closed(&initial["config"],&["enrollment","trust","privateBindings"])?;
    need(initial["config"]["enrollment"]==capture["q"]["expected"]["enrollment"]&&initial["config"]["trust"]==ii[0]["trust"]&&initial["start"]==ii[0]["dossier"]["start"]&&initial["policy"]==a(field(&ii[0],"dossier")?,"policies")?.first().cloned().ok_or_else(||invalid("EXHAUSTION_INITIAL_POLICY_MISSING"))?&&initial["carry"]==ii[0]["witness"]["carries"],"EXHAUSTION_INITIAL_INVENTORY_PREIMAGES")?;
    for binding in a(&initial["config"],"privateBindings")?{need(a(&ii[0],"bindings")?.contains(binding),"EXHAUSTION_INITIAL_PRIVATE_BINDING")?;}
    prefix_head(config,"inventory",inventory,&heads["inventory"])?;
    let opened=n(&heads["inventory"],"sequence")? as usize;
    need(opened>0&&opened<=inventory.len(),"EXHAUSTION_EXACT_I2_BEGIN_BOUND")?;
    let begin=&inventory[opened-1]["record"];
    need(begin["kind"]=="BEGIN"&&begin["begin"]["intervalId"]==ii[2]["expected"]["intervalId"]&&begin["begin"]["audience"]==ii[2]["expected"]["audience"]&&begin["begin"]["purpose"]==ii[2]["expected"]["purpose"]&&begin["begin"]["challenge"]==ii[2]["expected"]["challenge"],"EXHAUSTION_ACTUAL_I2_OPENING_BEGIN")?;
    let service=stream(capture,"service")?;let service_before=n(&origin["serviceHead"],"sequence")? as usize;let service_open=n(&heads["service"],"sequence")? as usize;
    prefix_head(config,"service",service,&origin["serviceHead"])?;prefix_head(config,"service",service,&heads["service"])?;
    need(service_open==service_before+2&&service_open<=service.len(),"EXHAUSTION_I1_TO_I2_EXACT_SERVICE_BEGIN_PAIR")?;
    let command=&service[service_before]["record"];let result=&service[service_before+1]["record"];
    need(command["kind"]=="CONTROL_REQUEST"&&command["name"]=="begin"&&command["input"]==begin["begin"]&&result["kind"]=="CONTROL_RESULT"&&result["controlId"]==command["controlId"]&&result["result"]==json!({"intervalId":ii[2]["expected"]["intervalId"]}),"EXHAUSTION_OPENING_SERVICE_BEGIN_JOIN")?;
    let prior=one(&inventory[..opened-1],|r|r["record"]["kind"]=="CLOSED"&&r["record"]["artifact"]["key"]==format!("interval:{}",ii[1]["expected"]["intervalId"].as_str().unwrap_or("")),"EXHAUSTION_RETAINED_I1_CLOSED")?;
    artifact_ref(&ii[1],&prior["record"]["artifact"],config)?;
    let prior_ref=&prior["record"]["artifact"];let blobs=a(c,"blobRecords")?;
    let manifest=one(blobs,|r|r["operationId"]==prior_ref["manifestOperationId"],"EXHAUSTION_ORIGIN_RETAINED_BLOB_MANIFEST")?;
    need(manifest["record"]["sha256"]==prior_ref["sha256"]&&manifest["record"]["bytes"]==prior_ref["bytes"]&&manifest["record"]["key"]==prior_ref["key"],"EXHAUSTION_ORIGIN_BLOB_REFERENCE_PREIMAGE")?;
    need(crate::numeric_bridge::journal_head(&identity(config,"blobs"),&blobs[..n(manifest,"sequence")? as usize])?==prior_ref["head"],"EXHAUSTION_ORIGIN_BLOB_CUSTODY_ROOT")?;
    need(inventory[n(prior,"sequence")? as usize..opened-1].iter().all(|r|r["record"]["kind"]=="COMMAND_PENDING"),"EXHAUSTION_I1_TO_I2_ONLY_BEGIN_COMMAND")?;
    let prepared=prefix_head(config,"inventory",inventory,&receipt_heads["inventory"])?;
    let p=n(&prepared,"sequence")? as usize;need(p>=opened&&p<=inventory.len(),"EXHAUSTION_INVENTORY_PREPARATION_BOUND")?;current["inventory"]=prepared;
    let frame=field(w,"negativeFrame")?;
    let decision_row=one(a(c,"cadenceRecords")?,|r|r["record"]["payload"]["kind"]=="DECISION"&&hash(&r["record"]).ok().as_deref()==frame["decisionReceiptDigest"].as_str(),"EXHAUSTION_PREPARATION_R2_DECISION_PREIMAGE")?;
    let logical=s(&decision_row["record"]["payload"]["body"]["sourceBinding"],"logicalId")?.to_owned();
    let service_request=one(stream(capture,"service")?,|r|r["record"]["kind"]=="SERVICE_REQUEST"&&r["record"]["logicalId"].as_str()==Some(logical.as_str()),"EXHAUSTION_PREPARATION_ACTUAL_R2_SERVICE_REQUEST")?;
    let (pending,captured,_)=source_pair(capture,&service_request["record"]["request"])?;
    let service_count=n(&receipt_heads["service"],"sequence")? as usize;need(service_count<=service.len(),"EXHAUSTION_PREPARATION_STREAM_BOUND")?;
    one(&service[..service_count],|r|r["record"]["kind"]=="SERVICE_RESULT"&&r["record"]["logicalId"].as_str()==Some(logical.as_str()),"EXHAUSTION_R2_CLASSIFICATION_BEFORE_PREPARATION")?;
    let source_count=n(&receipt_heads["source"],"sequence")?;
    need(n(pending,"sequence")?<=source_count&&n(captured,"sequence")?<=source_count,"EXHAUSTION_REAL_CAPTURE_BEFORE_PREPARATION")?;
    need(receipt_heads["recipient"]==heads["recipient"],"EXHAUSTION_PREPARATION_RECIPIENT_UNCHANGED")?;
    let unadmitted=one(&inventory[opened..p],|r|r["record"]["kind"]=="UNADMITTED"&&r["record"]["logicalId"].as_str()==Some(logical.as_str()),"EXHAUSTION_ACTUAL_PREPARATION_UNADMITTED")?;
    let ingress=&unadmitted["record"];let ir=a(ingress,"rows")?;
    need(ir.len()==2&&ir[0]["kind"]=="REQUEST"&&ir[1]["kind"]=="DENIAL"&&ir[1]["details"]["reason"]=="UNADMITTED_ERROR","EXHAUSTION_REAL_INVENTORY_PAIR")?;
    let opening_value=opening(a(&ii[2],"bindings")?,s(&ir[0]["details"],"requestCommitment")?,"unadmitted-ingress")?;
    need(ingress["opening"]["label"]=="unadmitted-ingress"&&ingress["opening"]["value"]==*opening_value&&a(field(&ii[2],"dossier")?,"rows")?.iter().filter(|r|**r==ir[0]||**r==ir[1]).count()==2,"EXHAUSTION_INVENTORY_CAPTURE_ROW_JOIN")?;
    let retained_opening=one(a(&ii[2],"bindings")?,|v|native_core::policy::envelope::binding_digest(v).ok().as_deref()==ir[0]["details"]["requestCommitment"].as_str(),"EXHAUSTION_EXACT_RETAINED_UNADMITTED_OPENING")?;
    need(ingress["opening"]==*retained_opening,"EXHAUSTION_ORIGINAL_UNADMITTED_OPENING")?;
    whole_interval(capture,c,config,&logical)?;Ok(())
}

fn whole_interval(capture:&J,c:&J,config:&J,logical:&str)->Result<()>{
    let ii=intervals(capture)?;let heads=field(c,"openingHeads")?;let closing=closure(&ii[2])?;
    for (name,expected) in [("service",&closing["serviceHead"]),("source",&closing["sourceHead"]),("recipient",&closing["recipient"]["head"]),("broker",&closing["broker"]["journalHead"])]{
        let rows=stream(capture,name)?;need(crate::numeric_bridge::journal_head(&identity(config,name),rows)?==*expected,"EXHAUSTION_FULL_FINAL_CLOSURE_STREAM_HEAD")?;
    }
    need(closing["broker"]["coreHead"]==heads["core"]&&closing["broker"]["totalCharged"]=="3"&&closing["broker"]["admissions"]==1&&closing["broker"]["journalHead"]==heads["broker"],"EXHAUSTION_NO_FINAL_CORE_OR_BROKER_EFFECTS")?;
    let recipients=stream(capture,"recipient")?;need(recipients.len()==n(&heads["recipient"],"sequence")? as usize,"EXHAUSTION_NO_WHOLE_I2_RECIPIENT_EFFECT")?;
    let service_request=one(stream(capture,"service")?,|r|r["record"]["kind"]=="SERVICE_REQUEST"&&r["record"]["logicalId"].as_str()==Some(logical),"EXHAUSTION_FINAL_ACTUAL_R2_SERVICE_REQUEST")?;
    let source_id=capture_id(&service_request["record"]["request"])?;source_pair(capture,&service_request["record"]["request"])?;
    for name in ["service","source"]{
        let records=stream(capture,name)?;let start=n(&heads[name],"sequence")? as usize;need(start<=records.len(),"EXHAUSTION_OPENING_PREFIX_BOUND")?;
        let mut requests=0;let mut results=0;
        for row in &records[start..]{let record=field(row,"record")?;let kind=s(record,"kind")?;
            if name=="service"{need(matches!(kind,"SERVICE_REQUEST"|"SERVICE_RESULT"|"CONTROL_REQUEST"|"CONTROL_RESULT"),"EXHAUSTION_UNSUPPORTED_SERVICE_EFFECT")?;if matches!(kind,"SERVICE_REQUEST"|"SERVICE_RESULT"){need(record["logicalId"].as_str()==Some(logical),"EXHAUSTION_ONLY_ACTUAL_R2_SERVICE_OPERATION")?;if kind=="SERVICE_REQUEST"{requests+=1;}else{results+=1;}}}
            else{need(matches!(kind,"SOURCE_READ_PENDING"|"SOURCE_CAPTURED")&&record["logicalId"].as_str()==Some(source_id.as_str()),"EXHAUSTION_ONLY_ACTUAL_R2_SOURCE_CAPTURE")?;if kind=="SOURCE_READ_PENDING"{requests+=1;}else{results+=1;}}
        }
        need(requests==1&&results==1,"EXHAUSTION_COMPLETE_R2_SERVICE_SOURCE_PAIR")?;
    }
    let rows=a(field(&ii[2],"dossier")?,"rows")?;
    need(rows.iter().all(|r|matches!(r["kind"].as_str(),Some("REQUEST"|"DENIAL"|"CONTROL"|"CLOSE")))&&rows.iter().filter(|r|r["kind"]=="REQUEST").count()==1&&rows.iter().filter(|r|r["kind"]=="DENIAL").count()==1&&a(field(&ii[2],"witness")?,"charges")?.is_empty(),"EXHAUSTION_WHOLE_I2_ZERO_ADMISSION_CHARGE_DISPATCH")?;
    let inventory=a(c,"inventoryRecords")?;let start=n(&heads["inventory"],"sequence")? as usize;need(start<=inventory.len(),"EXHAUSTION_FINAL_INVENTORY_PREFIX")?;
    let tail=&inventory[start..];let closed_record=one(tail,|r|r["record"]["kind"]=="CLOSED","EXHAUSTION_ONE_FINAL_I2_CLOSED")?;
    need(n(closed_record,"sequence")? as usize==inventory.len(),"EXHAUSTION_NO_AFTER_FINAL_INVENTORY_TAIL")?;
    artifact_ref(&ii[2],&closed_record["record"]["artifact"],config)?;
    let mut projected=Vec::new();let mut denied=0;let mut closing_count=0;
    for record in tail.iter().map(|r|&r["record"]){
        need(matches!(record["kind"].as_str(),Some("UNADMITTED"|"CONTROL"|"OBSERVED"|"CLOSING"|"CLOSED")),"EXHAUSTION_FINITE_I2_INVENTORY_KINDS")?;
        if record["kind"]=="UNADMITTED"{need(record["logicalId"].as_str()==Some(logical),"EXHAUSTION_SINGLE_I2_UNADMITTED")?;denied+=1;projected.extend(a(record,"rows")?.iter().cloned());}
        if record["kind"]=="CONTROL"{let row=field(record,"row")?;let retained=one(a(&ii[2],"bindings")?,|v|native_core::policy::envelope::binding_digest(v).ok().as_deref()==row["details"]["controlCommitment"].as_str(),"EXHAUSTION_RETAINED_CONTROL_OPENING")?;need(record["opening"]==*retained,"EXHAUSTION_ORIGINAL_CONTROL_OPENING")?;projected.push(row.clone());}
        if record["kind"]=="CLOSING"{closing_count+=1;need(record["artifact"]==closed_record["record"]["artifact"],"EXHAUSTION_EXACT_CLOSING_CLOSED_ARTIFACT")?;}
    }
    need(denied==1&&closing_count==1&&rows.last().is_some_and(|r|r["kind"]=="CLOSE")&&projected.as_slice()==&rows[..rows.len()-1],"EXHAUSTION_ALL_ORIGINAL_INVENTORY_ROWS")?;
    Ok(())
}

pub(crate) fn final_contract(input:&J,capture:&J,journal:&[J],state:&State,cadence:&J,numeric:&BTreeMap<String,J>)->Result<J>{
    let kinds:Vec<&str>=journal.iter().map(|e|e["payload"]["kind"].as_str().unwrap_or("")).collect();
    need(kinds==vec!["AGREEMENT","REQUEST","CHECKPOINT","FULFILLMENT","DECISION","CHECKPOINT","DECISION","REQUEST","FULFILLMENT","NEGATIVE_OUTCOME","WORKFLOW_RELEASE","CHECKPOINT"],"EXHAUSTION_EXACT_SIGNED_CADENCE_CENSUS")?;
    need(state.events().len()==10&&a(input,"decisionLinks")?.len()==2&&a(input,"numericWitnesses")?.len()==2&&a(input,"authorityReceipts")?.is_empty()&&a(input,"counterpartyReceipts")?.is_empty()&&numeric.len()==2,"EXHAUSTION_FINITE_CORE_EVIDENCE_CENSUS")?;
    let agreements=a(cadence,"agreements")?;need(agreements.len()==1&&agreements[0]["cadence"]=="ON_DEMAND"&&agreements[0]["n"].is_null()&&agreements[0]["phase"]=="AFTER_DECISION"&&agreements[0]["pMode"]=="BOTH"&&agreements[0]["metric"]=="AMOUNT"&&agreements[0]["x"]=="3"&&cadence["initialIndex"]==0&&cadence["completedThroughIndex"]==2&&cadence["initialAssuranceCompliant"]==true&&cadence["ownerRejected"]==false,"EXHAUSTION_EXACT_AGREEMENT_AND_INITIAL_GATE")?;
    let witnesses=a(input,"numericWitnesses")?;need(witnesses[0]["kind"]=="INITIAL_DISPATCH"&&witnesses[1]["kind"]=="EXHAUSTED_REFUSAL","EXHAUSTION_WITNESS_ORDER")?;
    need(input["enrollment"]["captureSelection"]["matrixId"]=="r3_1-headroom-exhaustion-both"&&input["expectation"]["expectedAssurance"]["initial"]=="NUMERIC_FULFILLED"&&a(&input["expectation"]["expectedAssurance"],"obligations")?.len()==2,"EXHAUSTION_EXACT_SELECTION_AND_ASSURANCE")?;
    let negative=numeric.get(s(&witnesses[1],"obligationId")?).ok_or_else(||unavailable("EXHAUSTION_NEGATIVE_NUMERIC_MISSING"))?;let facts=field(negative,"negativeFacts")?;
    let initial=numeric.get(s(&witnesses[0],"obligationId")?).ok_or_else(||unavailable("EXHAUSTION_INITIAL_NUMERIC_MISSING"))?;
    let links=a(input,"decisionLinks")?;need(links[0]["sourceBinding"]["evaluationClass"]=="EVALUATED_NATIVE"&&links[1]["sourceBinding"]["evaluationClass"]=="NOT_EVALUATED_NATIVE"&&initial["protectedContext"]["requestDigest"]==hash(field(field(&links[0],"authorizationInput")?,"request")?)?,"EXHAUSTION_INITIAL_EXACT_ACTUAL_R1_REQUEST")?;
    need(initial["numericBinding"]["purpose"]=="INITIAL_BEFORE_DISPATCH"&&negative["numericBinding"]["purpose"]=="HISTORICAL_EXHAUSTED_REFUSAL"&&initial["numericBinding"]["ordinaryCheckpointDigest"]==hash(&journal[2])?&&negative["numericBinding"]["originCheckpointDigest"]==hash(&journal[5])?&&facts["head"]==json!(state.head()),"EXHAUSTION_INITIAL_AND_AUTHENTICATED_ORIGIN")?;
    let cps=[&journal[2]["payload"]["body"],&journal[5]["payload"]["body"],&journal[11]["payload"]["body"]];
    let ii=intervals(capture)?;need(ii.len()==3,"EXHAUSTION_ORDINARY_CHECKPOINT_CENSUS")?;
    need(cps[2]["protectedRequest"]["requestDigest"]==facts["serviceRequestDigest"],"EXHAUSTION_FINAL_CHECKPOINT_REQUEST_RECORD")?;
    let expected_intervals=["initial:headroom-exhaustion-cap3","closing:headroom-exhaustion-cap3","refusal:headroom-exhaustion-cap3"];
    for (index,cp) in cps.iter().enumerate(){
        need(cp["receiptRange"]["throughIndex"]==json!(index)&&cp["intervalId"]==ii[index]["expected"]["intervalId"]&&cp["intervalId"]==expected_intervals[index]&&cp["kind"]==if index==0{json!("INITIAL")}else{json!("CLOSING")},"EXHAUSTION_CHECKPOINT_ORDER_INDEX")?;
        let statement=native_core::content_derive_bound_public(field(&ii[index],"expected")?,field(&ii[index],"trust")?,field(&ii[index],"dossier")?).map_err(invalid)?;
        need(statement==ii[index]["statement"]&&s(cp,"statementDigest")?==wire::hash_bytes(wire::canonical(&statement).map_err(invalid)?.as_bytes()),"EXHAUSTION_ALL_THREE_ORDINARY_STATEMENT_PREIMAGES")?;
    }
    let config=&input["enrollment"]["numericEnrollment"]["verificationDescriptor"]["configuration"];
    whole_interval(capture,field(&witnesses[1],"custody")?,config,s(facts,"logicalId")?)?;
    final_custody_heads(config,field(cps[2],"finalCustodyHeads")?,field(&witnesses[1],"custody")?)?;
    let outcome=field(cadence,"negativeOutcome")?;let release=field(cadence,"workflowRelease")?;
    need(outcome["receiptDigest"]==hash(&journal[9])?&&release["receiptDigest"]==hash(&journal[10])?&&outcome["body"]["obligationId"]==witnesses[1]["obligationId"]&&outcome["body"]["head"]==json!(state.head()),"EXHAUSTION_AUTHENTICATED_REPORT_RELEASE")?;
    let mut result=field(outcome,"body")?.clone();result["receiptDigest"]=outcome["receiptDigest"].clone();result["originCheckpointDigest"]=facts["originCheckpointDigest"].clone();result["refusalCheckpointDigest"]=json!(hash(&journal[11])?);result["internalServiceResultSequence"]=facts["internalServiceResultSequence"].clone();result["workflowReleaseDigest"]=release["receiptDigest"].clone();
    for field in ["admissionsAfterRefusal","chargesAfterRefusal","dispatchesAfterRefusal"]{result[field]=json!(0);}
    Ok(result)
}
