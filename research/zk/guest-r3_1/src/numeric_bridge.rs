//! Bounded captured-snapshot correspondence, not quantitative verification or
//! live custody authority. All State and authorization values are replay owned.
use crate::common::*;
use native_core::{canonical::{self,Value as C},policy::{wire,envelope,quantity},replay::State};
use serde_json::{json,Value as J};
use std::collections::{BTreeMap,BTreeSet};

pub const ENROLLMENT_KEYS:&[&str]=&["schema","configurationDigest","sourceLockDigest","numericBinaryDigest","coreIdentity","cadenceIdentity","blobIdentity","completeGroupId","caseId","qDeployment","verificationDescriptor","descriptorDigest"];
pub const WITNESS_KEYS:&[&str]=&["obligationId","intervalId","snapshotHead","authorizationInput","authorizationResult","postAuthorizationInput","postAuthorizationResult","custody","verificationReceipt","proofBundle","qReviews","reviewerEvidence","kind","negativeFrame"];
pub const RECEIPT_KEYS:&[&str]=&["schema","purpose","configurationDigest","sourceLockDigest","numericBinaryDigest","engineBinding","inputs","statements","proofBundleDigest","statementBundleDigest","ordinaryCheckpointDigest","protectedContextDigest","preparationJournalDigest","qReviewDigest","coreHead","custodyHeads","reviewerFloor","metric","x","headroomNonce","permitsExecution","originCheckpointDigest"];
pub const BINDING_KEYS:&[&str]=&["schema","purpose","metric","x","headroomNonce","ordinaryCheckpointDigest","protectedContextDigest","engineBindingDigest","statementBundleDigest","proofBundleDigest","preparationJournalDigest","verificationReceiptDigest","originCheckpointDigest"];

pub(crate) fn u64s(v:&J)->Result<u64>{decimal(v,false)?.parse().map_err(|_|invalid("FINITE_U64_REQUIRED"))}
pub(crate) fn bigint(v:&J)->Result<u64>{closed(v,&["$bigint"])?;u64s(field(v,"$bigint")?)}
pub(crate) fn core_json(v:J)->Result<J>{Ok(wire::core_wire(&owned_core_data(v)?))}
pub(crate) fn opening<'a>(bindings:&'a [J],commitment:&str,label:&str)->Result<&'a J>{
    let found:Vec<_>=bindings.iter().filter(|b|b.get("label").and_then(J::as_str)==Some(label) && envelope::binding_digest(b).ok().as_deref()==Some(commitment)).collect();
    need(found.len()==1,"EXACT_UNIQUE_PRIVATE_OPENING")?;
    envelope::opening(commitment,found[0],label).map_err(invalid)
}
pub(crate) fn actual_head(state:&State,head:&J)->Result<()> {
    closed(head,&["hash","position","canonicalTime"])?;let p=n(head,"position")? as usize;
    need(state.prefix_hash(p)==Some(s(head,"hash")?) && state.events().get(p).and_then(|e|e.get("timestamp")).and_then(C::integer)==Some(n(head,"canonicalTime")? as i64),"GENUINE_NATIVE_PREFIX")
}
pub fn enrollment(e:&J)->Result<()> {
    closed(e,ENROLLMENT_KEYS)?;need(s(e,"schema")?=="continuity.r3_1.numeric-enrollment.v1","NUMERIC_ENROLLMENT_SCHEMA")?;
    for k in ["configurationDigest","sourceLockDigest","numericBinaryDigest"]{digest(field(e,k)?)?;}
    text(field(e,"completeGroupId")?)?;text(field(e,"caseId")?)?;
    let identity=field(e,"coreIdentity")?;closed(identity,&["version","stream","instance","epoch","writer","keyId","source"])?;
    need(s(identity,"version")?=="continuity-canonical-q-replica/1" && n(identity,"epoch")?>0,"CORE_REPLICA_IDENTITY")?;
    for k in ["stream","instance","writer","keyId","source"]{text(field(identity,k)?)?;}
    let instance=s(identity,"instance")?.as_bytes();need(instance.len()==36 && instance.iter().enumerate().all(|(i,c)|if matches!(i,8|13|18|23){*c==b'-'}else if i==14{*c==b'4'}else if i==19{matches!(*c,b'8'|b'9'|b'a'|b'b')}else{c.is_ascii_digit() || (b'a'..=b'f').contains(c)}),"CORE_REPLICA_UUID_V4")?;
    for k in ["cadenceIdentity","blobIdentity"]{closed(field(e,k)?,&["storeId","stream"])?;digest(field(field(e,k)?,"storeId")?)?;text(field(field(e,k)?,"stream")?)?;}
    closed(field(e,"qDeployment")?,&["schema","directory","floor","backend"])?;need(s(field(e,"qDeployment")?,"schema")?=="continuity.r3_1.q-deployment.v1","Q_DEPLOYMENT_SCHEMA")?;
    let descriptor=field(e,"verificationDescriptor")?;closed(descriptor,&["schema","configurationDigest","sourceLockDigest","numericBinaryDigest","configuration"])?;need(s(descriptor,"schema")?=="continuity.r3_1.engine-verification-descriptor.v1" && hash(descriptor)?==s(e,"descriptorDigest")?,"INDEPENDENT_REDACTED_DESCRIPTOR_DIGEST")?;
    for k in ["configurationDigest","sourceLockDigest","numericBinaryDigest"]{need(field(e,k)?==field(descriptor,k)?,"INDEPENDENT_FULL_CONFIGURATION_ASSOCIATION")?;}
    let config=field(descriptor,"configuration")?;closed(config,&["schema","custody","coreIdentity","streams","cadenceTrustWire","coreDomainDigest","coreEditionDigest","intervalRoutes","completeGroupId","caseId","reviewerDirectory","reviewerFloor","quantitativeBackend","historicalBackend","clockSource","clockScope"])?;
    need(s(config,"schema")?=="continuity.r3_1.current-engine-host.v1" && s(config,"clockSource")?=="NODE_WALL_SECONDS_V1" && s(config,"clockScope")?=="LOCAL_HOST_CLOCK_NOT_CERTIFIED_UTC","REDACTED_HOST_CLOCK_PROFILE")?;
    closed(field(config,"custody")?,&["socketPath","publicKey","storeId","timeoutMs"])?;closed(field(config,"streams")?,&["cadence","broker","blobs","service","source","inventory","recipient"])?;
    let mut stream_ids=BTreeSet::new();for name in ["cadence","broker","blobs","service","source","inventory","recipient"]{need(stream_ids.insert(s(field(config,"streams")?,name)?),"SUCCESSOR_UNIQUE_CUSTODY_STREAMS")?;}
    need(config["coreIdentity"]==e["coreIdentity"] && config["completeGroupId"]==e["completeGroupId"] && config["caseId"]==e["caseId"],"REDACTED_HOST_SCOPE_IDENTITY")?;
    for (name,stream) in [("cadenceIdentity","cadence"),("blobIdentity","blobs")]{need(e[name]==json!({"storeId":config["custody"]["storeId"],"stream":config["streams"][stream]}),"REDACTED_HOST_STREAM_IDENTITY")?;}
    need(e["qDeployment"]==json!({"schema":"continuity.r3_1.q-deployment.v1","directory":config["reviewerDirectory"],"floor":config["reviewerFloor"],"backend":config["historicalBackend"]}),"REDACTED_HOST_ENROLLED_MINIMUM_DEPLOYMENT")?;
    let mut keys=BTreeSet::new();let routes=a(config,"intervalRoutes")?;need(!routes.is_empty() && routes.len()<=8,"FINITE_INTERVAL_ROUTES")?;for route in routes{closed(route,&["checkpointKind","decisionIndex","intervalId","presentationId","priorIntervals"])?;need(matches!(s(route,"checkpointKind")?,"INITIAL"|"CLOSING") && keys.insert((s(route,"checkpointKind")?,n(route,"decisionIndex")?)),"UNIQUE_FROZEN_INTERVAL_ROUTE")?;text(field(route,"intervalId")?)?;text(field(route,"presentationId")?)?;let prior=a(route,"priorIntervals")?;need(prior.len()<=7,"FINITE_PRIOR_INTERVALS")?;let mut intervals=BTreeSet::new();for interval in prior{closed(interval,&["intervalId","presentationId"])?;need(intervals.insert(s(interval,"intervalId")?) && s(interval,"intervalId")?!=s(route,"intervalId")?,"ROUTE_INTERVAL_REUSE")?;text(field(interval,"presentationId")?)?;}}
    Ok(())
}

// Replay the exact original tagged disk encoding. Pair order survives parsing;
// BigInt is not an ordinary object marker in this storage encoding.
fn tagged(v:&J,depth:usize,nodes:&mut usize)->Result<C> {
    *nodes+=1;need(depth<=32 && *nodes<=262144,"REPLICA_EVENT_BOUND")?;
    let parts=array(v)?;let tag=parts.first().and_then(J::as_str).ok_or_else(||invalid("REPLICA_TAG"))?;
    if tag=="null"{need(parts.len()==1,"REPLICA_TAG_SHAPE")?;return Ok(C::Null);}
    need(parts.len()==2,"REPLICA_TAG_SHAPE")?;let body=&parts[1];
    match tag {
        "string"=>Ok(C::String(string(body)?.into())),
        "boolean"=>Ok(C::Bool(body.as_bool().ok_or_else(||invalid("REPLICA_BOOLEAN"))?)),
        "number"=>Ok(C::Integer(number(body)? as i64)),
        "bigint"=>{let s=decimal(body,false)?;Ok(C::BigInt(s.into()))},
        "array"=>Ok(C::Array(array(body)?.iter().map(|v|tagged(v,depth+1,nodes)).collect::<Result<_>>()?)),
        "object"=>{
            let mut out=BTreeMap::new();let mut prior_numeric=None;let mut strings=false;
            for pair in array(body)? {let pair=array(pair)?;need(pair.len()==2,"REPLICA_OBJECT_ENTRY")?;let key=string(&pair[0])?;
                // JS Object.entries lists canonical array-index keys first.
                let index=key.parse::<u32>().ok().filter(|n|*n<u32::MAX && n.to_string()==key);
                if let Some(index)=index{need(!strings && prior_numeric.is_none_or(|p|p<index),"REPLICA_JS_KEY_ORDER")?;prior_numeric=Some(index);}else{strings=true;}
                need(!out.contains_key(key),"REPLICA_DUPLICATE_KEY")?;out.insert(key.into(),tagged(&pair[1],depth+1,nodes)?);
            }Ok(C::Object(out))
        },_=>Err(unsupported("REPLICA_EVENT_TAG")),
    }
}
fn quote(v:&J)->Result<String>{serde_json::to_string(v).map_err(|e|invalid(e.to_string()))}
// Original storage codec hashes JSON.stringify insertion order plus LF, not
// sorted engine canonical. Fixed fields below match exact original source.
fn ordered(parts:&[(&str,String)])->String {format!("{{{}}}",parts.iter().map(|(k,v)|format!("\"{k}\":{v}")).collect::<Vec<_>>().join(","))}
fn raw_hash(bytes:&[u8])->String{wire::hash_bytes(bytes)}
fn legacy_hash(value:&J)->Result<String>{Ok(raw_hash(wire::canonical(value).map_err(invalid)?.as_bytes()))}
fn base64(raw:&str,cap:usize)->Result<Vec<u8>> {
    const ALPHABET:&[u8]=b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    need(raw.len()%4==0 && raw.len()<=4*((cap+2)/3),"BASE64_BOUND")?;let mut out=Vec::new();
    for (i,chunk)in raw.as_bytes().chunks_exact(4).enumerate(){let last=(i+1)*4==raw.len();let sextet=|b:u8|ALPHABET.iter().position(|x|*x==b).map(|n|n as u8).ok_or_else(||invalid("BASE64_ENCODING"));let a=sextet(chunk[0])?;let b=sextet(chunk[1])?;out.push((a<<2)|(b>>4));
        if chunk[2]==b'='{need(last && chunk[3]==b'=' && b&15==0,"BASE64_ENCODING")?;}
        else{let c=sextet(chunk[2])?;out.push((b<<4)|(c>>2));if chunk[3]==b'='{need(last && c&3==0,"BASE64_ENCODING")?;}else{let d=sextet(chunk[3])?;out.push((c<<6)|d);}}
    }need(out.len()<=cap,"BASE64_BOUND")?;Ok(out)
}
fn core_custody(state:&State,heads:&[J],identity:&J,encoded:&J)->Result<J> {
    let encoded=array(encoded)?;need(encoded.len()==state.events().len(),"REPLICA_COMPLETE_PREFIX_COUNT")?;
    let identity_bytes=ordered(&["version","stream","instance","epoch","writer","keyId","source"].iter().map(|k|Ok((*k,quote(field(identity,k)?)?))).collect::<Result<Vec<_>>>()?)+"\n";
    let id=raw_hash(identity_bytes.as_bytes());let mut previous=J::Null;let mut result=J::Null;
    for (position,(raw,event)) in encoded.iter().zip(state.events()).enumerate(){
        let raw=string(raw)?;need(raw.len()<=32768 && raw.ends_with('\n'),"REPLICA_EVENT_BYTES")?;
        let parsed=wire::parse(&raw[..raw.len()-1]).map_err(invalid)?;
        need(serde_json::to_string(&parsed).map_err(|e|invalid(e.to_string()))?+"\n"==raw && tagged(&parsed,0,&mut 0)?==*event,"REPLICA_EXACT_EVENT_SUBSTITUTION")?;
        let head=heads.get(position).ok_or_else(||unavailable("REPLICA_REPLAY_HEAD"))?;
        let head_bytes=ordered(&[("hash",quote(field(head,"hash")?)?),("position",quote(field(head,"position")?)?),("canonicalTime",quote(field(head,"canonicalTime")?)?)]);
        let revision_bytes=ordered(&[("instance",quote(field(identity,"instance")?)?),("generation",(position+1).to_string()),("head",head_bytes)]);
        let event_digest=raw_hash(raw.as_bytes());let sequence=position+1;
        let bytes=ordered(&[("version",quote(&json!("continuity-canonical-q-commit/1"))?),("profile",quote(&json!("continuity-replicated-q/1"))?),("identityDigest",quote(&json!(id))?),("sequence",sequence.to_string()),("previousDigest",quote(&previous)?),("revision",revision_bytes),("eventDigest",quote(&json!(event_digest))?)])+"\n";
        let digest=raw_hash(bytes.as_bytes());result=json!({"version":"continuity-canonical-q-head/1","profile":"continuity-replicated-q/1","identityDigest":id,"sequence":sequence,"digest":digest,"revision":{"instance":field(identity,"instance")?,"generation":sequence,"head":head},"eventDigest":event_digest});previous=json!(digest);
    }Ok(result)
}
pub(crate) fn journal_head(identity:&J,rows:&[J])->Result<J> {
    closed(identity,&["storeId","stream"])?;let mut previous="0".repeat(64);let mut ops=BTreeSet::new();
    need(rows.len()<=262144,"CUSTODY_RECORD_BOUND")?;
    for (i,row) in rows.iter().enumerate(){closed(row,&["sequence","previousDigest","digest","operationId","record"])?;
        need(n(row,"sequence")?==i as u64+1 && s(row,"previousDigest")?==previous && ops.insert(s(row,"operationId")?),"CUSTODY_JOURNAL_CHAIN")?;
        let value=json!({"schema":"continuity.custody.record.v1","storeId":field(identity,"storeId")?,"stream":field(identity,"stream")?,"sequence":i+1,"previousDigest":previous,"operationId":field(row,"operationId")?,"record":field(row,"record")?});
        // Original custody canonical is UTF-16; use unchanged pinned P encoder.
        let actual=legacy_hash(&value)?;need(actual==s(row,"digest")?,"CUSTODY_RECORD_DIGEST")?;previous=actual;
    }
    Ok(json!({"schema":"continuity.custody.head.v1","storeId":field(identity,"storeId")?,"stream":field(identity,"stream")?,"sequence":rows.len(),"digest":previous}))
}
fn retained_intervals(custody:&J,intervals:&[J],through:usize)->Result<()> {
    let retained=a(custody,"intervalArtifacts")?;need(retained.len()==through+1,"RETAINED_INTERVAL_CENSUS")?;let rows=a(custody,"blobRecords")?;
    for (retained,interval)in retained.iter().zip(intervals.iter().take(through+1)){
        closed(retained,&["intervalId","wire"])?;need(retained["intervalId"]==interval["expected"]["intervalId"],"RETAINED_INTERVAL_ORDER")?;let bytes=s(retained,"wire")?.as_bytes();let key=format!("interval:{}",s(retained,"intervalId")?);let prefix=format!("blob:{}",raw_hash(key.as_bytes()));let manifest=rows.iter().find(|r|r["operationId"].as_str()==Some(format!("{prefix}:manifest").as_str())).ok_or_else(||unavailable("RETAINED_INTERVAL_BLOB_MANIFEST"))?;let m=field(manifest,"record")?;closed(m,&["kind","key","sha256","bytes","chunks"])?;need(m["kind"]=="BLOB_MANIFEST" && m["key"]==key && n(m,"bytes")?==bytes.len() as u64 && s(m,"sha256")?==raw_hash(bytes),"RETAINED_INTERVAL_BLOB_CONTENT")?;
        let chunks=a(m,"chunks")?;need(chunks.len()==(bytes.len()+49151)/49152,"BLOB_CHUNK_COUNT")?;let mut assembled=Vec::with_capacity(bytes.len());
        for (index,digest)in chunks.iter().enumerate(){let offset=index*49152;let row=rows.iter().find(|r|r["operationId"].as_str()==Some(format!("{prefix}:{offset}").as_str())).ok_or_else(||unavailable("RETAINED_INTERVAL_BLOB_CHUNK"))?;need(row["digest"]==*digest && n(row,"sequence")?<n(manifest,"sequence")?,"BLOB_CHUNK_MANIFEST_REFERENCE")?;let c=field(row,"record")?;closed(c,&["kind","key","sha256","offset","base64"])?;need(c["kind"]=="BLOB_CHUNK" && c["key"]==key && c["sha256"]==m["sha256"] && n(c,"offset")?==assembled.len() as u64,"BLOB_CHUNK_BINDING")?;let chunk=base64(s(c,"base64")?,49152)?;need(chunk.len()==49152.min(bytes.len()-offset),"BLOB_CHUNK_LENGTH")?;assembled.extend_from_slice(&chunk);}
        need(assembled==bytes,"BLOB_EXACT_RETAINED_INTERVAL_BYTES")?;let mut artifact=wire::parse(s(retained,"wire")?).map_err(invalid)?;closed(&artifact,&["schema","expected","trust","dossier","statement","witness","nextPrivateCarry","bindings","sourceHead"])?;need(s(&artifact,"schema")?=="continuity.case.private-interval.v1","PRIVATE_INTERVAL_BLOB_SCHEMA")?;artifact.as_object_mut().unwrap().remove("schema");need(&artifact==interval,"BLOB_PRIVATE_INTERVAL_CAPTURE_EQUIVALENCE")?;
    }Ok(())
}
/// Exact minimum anchor and complete immutable command/local-record prefix.
/// This proves byte/lineage correspondence; unchanged external Q review still
/// replays command semantics and validates each selected interval/proof.
fn reviewer_lineage(w:&J,e:&J,receipt:&J,interval:&J)->Result<J> {
    let evidence=field(w,"reviewerEvidence")?;closed(evidence,&["identity","importReceipts","transfers","localRecords"])?;
    let identity=field(evidence,"identity")?;closed(identity,&["schema","sourceIdentity","initialLocalFloor"])?;need(s(identity,"schema")?=="continuity.offline-reviewer.v1","OFFLINE_IDENTITY_SCHEMA")?;
    let imports=a(evidence,"importReceipts")?;let transfers=a(evidence,"transfers")?;let records=a(evidence,"localRecords")?;
    need(!imports.is_empty() && imports.len()<=128 && imports.len()==transfers.len() && records.len()<=8192,"OFFLINE_COMPLETE_EVIDENCE_BOUND")?;
    let minimum=field(field(e,"qDeployment")?,"floor")?;closed(minimum,&["schema","receiptCount","receiptDigest","sourceFloor","localFloor"])?;need(s(minimum,"schema")?=="continuity.offline-reviewer.floor.v1" && n(minimum,"receiptCount")?>0,"OFFLINE_MINIMUM_SCHEMA")?;
    let ledger=s(field(identity,"initialLocalFloor")?,"ledgerId")?;digest(&json!(ledger))?;let mut head="0".repeat(64);let mut ops=BTreeSet::new();let mut local_floors=Vec::new();
    for(i,r)in records.iter().enumerate(){closed(r,&["schema","ledgerId","sequence","previousDigest","operationId","command"])?;need(s(r,"schema")?=="continuity.reviewer.record.v1" && s(r,"ledgerId")?==ledger && n(r,"sequence")?==i as u64+1 && s(r,"previousDigest")?==head && ops.insert(s(r,"operationId")?),"EXACT_LOCAL_REVIEWER_RECORD_CHAIN")?;head=wire::digest("continuity/private-case/v1/reviewer-record",r).map_err(invalid)?;local_floors.push(json!({"ledgerId":ledger,"recordCount":i+1,"headDigest":head}));}
    need(local_floors.first()==Some(field(identity,"initialLocalFloor")?),"OFFLINE_INITIAL_LOCAL_PREFIX")?;
    let mut prior_commands:Vec<J>=Vec::new();let mut previous="0".repeat(64);let mut floor=J::Null;let mut commands=Vec::new();let mut anchor=false;
    for(i,(import,raw))in imports.iter().zip(transfers).enumerate(){closed(import,&["schema","sequence","previousDigest","transferSha256","sourceFloor","localFloor"])?;let raw=string(raw)?;need(raw.len()<=8*1024*1024 && s(import,"schema")?=="continuity.reviewer.import-receipt.v1" && n(import,"sequence")?==i as u64+1 && s(import,"previousDigest")?==previous && raw_hash(raw.as_bytes())==s(import,"transferSha256")?,"EXACT_OFFLINE_IMPORT_TRANSFER_CHAIN")?;
        let transfer=wire::parse(raw).map_err(invalid)?;closed(&transfer,&["schema","identity","floor","commands"])?;need(s(&transfer,"schema")?=="continuity.reviewer.command-transfer.v1" && transfer["identity"]==identity["sourceIdentity"] && transfer["floor"]==import["sourceFloor"],"OFFLINE_TRANSFER_SOURCE_BINDING")?;let items=a(&transfer,"commands")?;need(!items.is_empty() && items.len()<=8192 && items.len()>=prior_commands.len() && items[..prior_commands.len()]==prior_commands && n(field(import,"sourceFloor")?,"sequence")?==items.len() as u64 && local_floors.get(items.len()-1)==Some(field(import,"localFloor")?),"FULL_COMMAND_PREFIX_EXTENSION")?;
        let source=field(import,"sourceFloor")?;closed(source,&["schema","storeId","stream","sequence","digest"])?;closed(field(identity,"sourceIdentity")?,&["storeId","stream"])?;need(s(source,"schema")?=="continuity.custody.head.v1" && source["storeId"]==identity["sourceIdentity"]["storeId"] && source["stream"]==identity["sourceIdentity"]["stream"],"OFFLINE_SOURCE_IDENTITY_REQUIRED")?;digest(field(source,"digest")?)?;digest(field(source,"storeId")?)?;text(field(source,"stream")?)?;
        if items.len()==prior_commands.len(){need(import["sourceFloor"]==imports[i-1]["sourceFloor"] && import["transferSha256"]==imports[i-1]["transferSha256"],"SAME_LENGTH_TRANSFER_SUBSTITUTION")?;}
        let mut ids=BTreeSet::new();for(index,item)in items.iter().enumerate(){closed(item,&["operationId","command"])?;need(ids.insert(s(item,"operationId")?) && (index==0)==(item["command"]["kind"].as_str()==Some("ENROLL")),"OFFLINE_COMMAND_ORDER")?;let record=records.get(index).ok_or_else(||invalid("OFFLINE_LOCAL_COMMAND_MISSING"))?;let operation=if index==0{"enroll".into()}else{format!("source:{}:{}",index+1,raw_hash(s(item,"operationId")?.as_bytes()))};need(record["operationId"]==operation && record["command"]==item["command"],"OFFLINE_LOCAL_REPLAY_COMMAND_BYTES")?;}
        previous=wire::digest("continuity/offline-reviewer-receipt/v1",import).map_err(invalid)?;floor=json!({"schema":"continuity.offline-reviewer.floor.v1","receiptCount":i+1,"receiptDigest":previous,"sourceFloor":import["sourceFloor"],"localFloor":import["localFloor"]});if i as u64+1==n(minimum,"receiptCount")?{need(&floor==minimum,"INDEPENDENT_MINIMUM_EXACT_PREFIX")?;anchor=true;}
        prior_commands=items.to_vec();commands=items.iter().map(|item|item["command"].clone()).collect();
    }
    need(anchor && records.len()==prior_commands.len() && floor==receipt["reviewerFloor"],"ACTUAL_CAPTURED_FLOOR_EXTENSION")?;
    let enrolled=commands.first().ok_or_else(||invalid("OFFLINE_ENROLLMENT_COMMAND"))?;need(enrolled["enrollment"]==interval["expected"]["enrollment"],"OFFLINE_CAPTURE_ENROLLMENT")?;
    let mut trust=enrolled["trust"].clone();let mut begin=None;let mut close=None;let mut present=None;
    for command in &commands{match command["kind"].as_str(){Some("TRUST")=>trust=command["trust"].clone(),Some("BEGIN") if command["intervalId"]==interval["expected"]["intervalId"]=>begin=Some(command),Some("CLOSE") if command["envelope"]["payload"]["intervalId"]==interval["expected"]["intervalId"]=>close=Some(command),Some("PRESENT") if command["intervalId"]==interval["expected"]["intervalId"]=>present=Some(command),Some("ENROLL"|"BEGIN"|"POLICY"|"OBSERVE"|"CLOSE"|"PRESENT")=>{},_=>return Err(unsupported("REVIEWER_COMMAND_SURFACE"))}}
    need(trust==interval["trust"] && close.is_some_and(|command|command["envelope"]==interval["dossier"]["end"]),"CAPTURE_EXPECTATION_FROM_RETAINED_REVIEWER_COMMANDS")?;
    let selected=present.or(begin).ok_or_else(||unavailable("REVIEWER_INTERVAL_EXPECTATION_COMMAND"))?;for k in ["audience","purpose","challenge"]{need(selected[k]==interval["expected"][k],"REVIEWER_CAPTURE_EXPECTATION_SELECTION")?;}
    for review in array(field(w,"qReviews")?)?{need(review["result"]["offlineFloor"]==floor && review["result"]["reviewerFloor"]==floor["localFloor"],"ACTUAL_Q_REVIEW_EXACT_CAPTURED_FLOOR")?;}
    Ok(json!({"minimum":minimum,"captured":floor,"lineage":"EXACT_COMPLETE_ENROLLED_MINIMUM_PREFIX","commandSemantics":"REQUIRES_UNCHANGED_EXTERNAL_REVIEWER_REPLAY","cryptographicQ":"REQUIRES_EXTERNAL_ACTUAL_Q_VERIFICATION"}))
}

/// Every prefix admission has exactly one broker/Q charge; every group is
/// accounted for, and selected/intersection usages come from native replay.
fn census(capture:&J,state:&State,interval_index:usize,broker_end:usize,case_id:&str,complete_id:&str,proof:&J,historical:bool)->Result<J> {
    let witness=field(capture,"witness")?;let intervals=a(witness,"intervals")?;let qe=field(field(field(capture,"q")?,"expected")?,"enrollment")?;
    let groups=a(qe,"groups")?;let complete=groups.iter().find(|g|g["id"].as_str()==Some(complete_id)).ok_or_else(||invalid("COMPLETE_GROUP_MISSING"))?;
    need(a(qe,"caseIds")?.iter().all(|id|a(complete,"caseIds").is_ok_and(|ids|ids.contains(id))),"EXPLICIT_CORE_COVERING_GROUP")?;
    let applicable:Vec<_>=groups.iter().filter(|g|a(g,"caseIds").is_ok_and(|ids|ids.iter().any(|id|id.as_str()==Some(case_id)))).collect();need(!applicable.is_empty() && applicable.iter().any(|g|g["id"]==complete["id"]),"COMPLETE_SELECTED_GROUP")?;
    let all_broker=a(field(field(witness,"streams")?,"broker")?,"records")?;need(broker_end<=all_broker.len(),"BROKER_PREFIX_BOUND")?;let broker=&all_broker[..broker_end];
    let mut requests=BTreeMap::new();let mut admitted=BTreeMap::new();
    for row in broker{let record=field(row,"record")?;let kind=s(record,"kind")?;if kind=="REQUEST"{need(requests.insert(s(record,"logicalId")?,record).is_none(),"DUPLICATE_BROKER_REQUEST")?;}if kind=="ADMISSION"{need(admitted.insert(s(record,"logicalId")?,(row,record)).is_none(),"DUPLICATE_BROKER_ADMISSION")?;}}
    let mut core_admitted=BTreeMap::new();for(position,event)in state.events().iter().enumerate(){if event.get("type").and_then(C::string)==Some("TRANSACTION_INTENT_ADMITTED"){let data=wire::core_wire(event.get("data").unwrap());core_admitted.insert(s(&data,"intentId")?.to_owned(),(position,data));}}
    need(core_admitted.len()==admitted.len(),"ALL_CORE_BROKER_ADMISSIONS")?;
    for(id,(position,data))in &core_admitted{let(_,record)=admitted.get(id.as_str()).ok_or_else(||invalid("ADMISSION_BROKER_MISSING"))?;let request=requests.get(id.as_str()).ok_or_else(||invalid("ADMISSION_REQUEST_MISSING"))?;let declaration=state.declaration(id).ok_or_else(||invalid("ADMISSION_DECLARATION_MISSING"))?;let declaration=wire::core_wire(declaration);
        need(n(record,"coreAdmissionPosition")?==*position as u64 && u64s(field(record,"amount")?)?==bigint(field(&declaration,"amount")?)? && field(record,"amount")?==field(field(field(request,"request")?,"capture")?,"amount")?,"ADMISSION_EXACT_CORE_AMOUNT")?;
        need(field(&declaration,"termsCommitment")?==field(request,"termsCommitment")? && field(record,"physicalAttemptId")?==field(request,"physicalAttemptId")? && field(record,"policy")?==field(request,"policy")? && field(record,"groupIds")?==field(field(request,"request")?,"groupIds")? && field(record,"effectiveConstraints")?==field(field(data,"authorizationProof")?,"effectiveConstraints")?,"ADMISSION_NATIVE_CORRESPONDENCE")?;
    }
    let mut totals:BTreeMap<String,(u64,u64)>=groups.iter().map(|g|Ok((s(g,"id")?.to_owned(),(0,0)))).collect::<Result<_>>()?;let mut seen=BTreeSet::new();
    for (index,interval)in intervals.iter().enumerate().take(interval_index+1){
        let d=field(interval,"dossier")?;let start=field(field(d,"start")?,"payload")?;let end=field(field(d,"end")?,"payload")?;
        if index==0{need(s(start,"sequence")?=="0" && a(start,"pending")?.is_empty(),"ZERO_CAPTURE_BOOTSTRAP")?;}
        for group in groups{let gid=s(group,"id")?;let (amount,count)=totals[gid];let opening=a(field(interval,"witness")?,"carries")?.iter().find(|c|c["groupId"].as_str()==Some(gid)).ok_or_else(||invalid("OPENING_GROUP_CENSUS"))?;let public=a(start,"carry")?.iter().find(|c|c["groupId"].as_str()==Some(gid)).ok_or_else(||invalid("OPENING_PUBLIC_CENSUS"))?;need(u64s(field(opening,"value")?)?==amount && u64s(field(public,"count")?)?==count,"OPENING_CORE_CENSUS")?;}
        for row in a(d,"rows")?.iter().filter(|r|r["kind"].as_str()==Some("ADMISSION")){let value=opening(a(interval,"bindings")?,s(field(row,"details")?,"coreAdmissionCommitment")?,"broker-admission")?;let seq=n(value,"sequence")? as usize;let actual=seq.checked_sub(1).and_then(|n|broker.get(n)).ok_or_else(||invalid("ADMISSION_BEYOND_SELECTED_CUSTODY"))?;need(actual==value,"ADMISSION_CUSTODY_SUBSTITUTION")?;let record=field(actual,"record")?;let id=s(record,"logicalId")?;need(seen.insert(id.to_owned()) && core_admitted.contains_key(id),"ADMISSION_CENSUS_DUPLICATE")?;
            let request=requests.get(id).ok_or_else(||invalid("ADMISSION_REQUEST"))?;need(field(field(request,"request")?,"caseId")?==field(row,"caseId")?,"ADMISSION_CASE_BINDING")?;
            let ids:Vec<J>=groups.iter().filter(|g|a(g,"caseIds").is_ok_and(|v|v.contains(&row["caseId"]))).map(|g|g["id"].clone()).collect();need(record["groupIds"]==json!(ids),"EVERY_INTERSECTING_Q_GROUP")?;
            let charge=a(field(interval,"witness")?,"charges")?.iter().find(|c|c["rowId"].as_str()==Some(format!("row:{}",s(row,"sequence").unwrap_or("")).as_str())).ok_or_else(||invalid("EXACT_QUANTITY_CHARGE"))?;need(charge["value"]==record["amount"],"QUANTITY_CORE_AMOUNT")?;
            for gid in ids{let total=totals.get_mut(string(&gid)?).ok_or_else(||invalid("GROUP_UNKNOWN"))?;total.0=total.0.checked_add(u64s(field(record,"amount")?)?).ok_or_else(||invalid("AMOUNT_OVERFLOW"))?;total.1=total.1.checked_add(1).ok_or_else(||invalid("COUNT_OVERFLOW"))?;}
        }
        for group in groups{let gid=s(group,"id")?;let (amount,count)=totals[gid];let opening=a(interval,"nextPrivateCarry")?.iter().find(|c|c["groupId"].as_str()==Some(gid)).ok_or_else(||invalid("CLOSING_GROUP_CENSUS"))?;let public=a(end,"carry")?.iter().find(|c|c["groupId"].as_str()==Some(gid)).ok_or_else(||invalid("CLOSING_PUBLIC_CENSUS"))?;need(u64s(field(opening,"value")?)?==amount && u64s(field(public,"count")?)?==count && quantity::commitment(amount,s(opening,"blinding")?).map_err(invalid)?==s(public,"commitment")?,"CLOSING_CORE_CENSUS_AND_OPENING")?;}
    }
    need(seen.len()==core_admitted.len() && core_admitted.keys().all(|id|seen.contains(id)),"COMPLETE_ALL_ADMISSION_CENSUS")?;
    let projection=core_json(state.projection())?;let mut authority_ids=BTreeSet::new();for grant in a(proof,"permissionPath")?{authority_ids.insert(s(grant,"authorityId")?.to_owned());}for intersection in a(proof,"intersections")?{for grant in a(intersection,"path")?{authority_ids.insert(s(grant,"authorityId")?.to_owned());}}
    need(!authority_ids.is_empty(),"SELECTED_PATH_REQUIRED")?;let mut usage=Vec::new();
    for id in authority_ids{let grant=a(&projection,"authorities")?.iter().find(|v|v[0].as_str()==Some(&id)).ok_or_else(||invalid("REPLAYED_AUTHORITY_REQUIRED"))?;let constraints=&grant[1]["grant"]["constraints"];
        if constraints.get("maxCumulativeAmount").is_some() || constraints.get("maxTransactions").is_some(){let row=a(&projection,"authorityUsage")?.iter().find(|v|v[0].as_str()==Some(&id)).ok_or_else(||invalid("REPLAYED_AUTHORITY_USAGE"))?;let actual=&row[1];let prior=a(proof,"usageSnapshot")?.iter().find(|v|v["authorityId"].as_str()==Some(&id)).ok_or_else(||invalid("NATIVE_PROOF_USAGE_SNAPSHOT"))?;let admitted_amount=bigint(field(actual,"admittedCumulativeAmount")?)?;let admitted_count=n(actual,"admittedTransactionCount")?;
            let mut expected_count=0u64;let mut expected_amount=0u64;for(intent,(_,data))in &core_admitted{if a(field(data,"authorizationProof")?,"controllingAuthorityIds")?.iter().any(|v|v.as_str()==Some(&id)){expected_count=expected_count.checked_add(1).ok_or_else(||invalid("AUTHORITY_COUNT_OVERFLOW"))?;expected_amount=expected_amount.checked_add(bigint(field(&wire::core_wire(state.declaration(intent).unwrap()),"amount")?)?).ok_or_else(||invalid("AUTHORITY_AMOUNT_OVERFLOW"))?;}}
            need(admitted_count==expected_count && admitted_amount==expected_amount,"RECONSTRUCTED_PER_AUTHORITY_ADMISSION_USAGE")?;
            need(if historical{n(prior,"admittedTransactionCount")?<=admitted_count && bigint(field(prior,"admittedCumulativeAmount")?)?<=admitted_amount}else{actual==prior},"ORIGINAL_VERSUS_POSTDECISION_USAGE")?;
            let complete_total=totals[complete_id];need(admitted_amount<=complete_total.0 && admitted_count<=complete_total.1,"COMPLETE_GROUP_COVERS_AUTHORITY_USAGE")?;usage.push(actual.clone());}
    }
    Ok(json!({"groupIds":applicable.iter().map(|g|g["id"].clone()).collect::<Vec<_>>(),"groupCounts":totals.iter().map(|(id,(_,n))|(id.clone(),json!(n.to_string()))).collect::<BTreeMap<_,_>>(),"groupAmounts":totals.iter().map(|(id,(n,_))|(id.clone(),json!(n.to_string()))).collect::<BTreeMap<_,_>>(),"authorityUsage":usage,"completeGroupId":complete_id,"selectedPathDigest":hash(field(proof,"permissionPath")?)?,"requiredIntersectionsDigest":hash(field(proof,"intersections")?)?}))
}

/// Called only by the composition's observer over genuine raw Core replay.
pub(crate) fn derive(w:&J,e:&J,capture:&J,state:&State,heads:&[J],journal:&[J],decision_evidence:&BTreeMap<String,J>,core_edition:&str)->Result<J> {
    closed(w,WITNESS_KEYS)?;enrollment(e)?;need(field(w,"snapshotHead")?==&json!(state.head()),"NUMERIC_GENUINE_SNAPSHOT")?;
    let negative=s(w,"kind")?=="EXHAUSTED_REFUSAL";
    need(negative || (s(w,"kind")?=="INITIAL_DISPATCH"&&field(w,"negativeFrame")?.is_null()),"NUMERIC_TYPED_WITNESS_KIND")?;
    let receipt=field(w,"verificationReceipt")?;closed(receipt,RECEIPT_KEYS)?;need(s(receipt,"schema")?=="continuity.r3_1.numeric-verification-receipt.v1" && receipt["permitsExecution"]==false,"NUMERIC_RECEIPT_SCHEMA")?;
    for k in ["configurationDigest","sourceLockDigest","numericBinaryDigest"]{need(field(receipt,k)?==field(e,k)?,"NUMERIC_INDEPENDENT_CONFIGURATION")?;}
    let purpose=s(receipt,"purpose")?;need(if negative{purpose=="HISTORICAL_EXHAUSTED_REFUSAL"}else{matches!(purpose,"INITIAL_BEFORE_DISPATCH"|"HISTORICAL_AFTER_DECISION")},"NUMERIC_PURPOSE")?;
    let cp_digest=s(receipt,"ordinaryCheckpointDigest")?;let cp_envelope=journal.iter().find(|j|hash(j).ok().as_deref()==Some(cp_digest) && j["payload"]["kind"].as_str()==Some("CHECKPOINT")).ok_or_else(||unavailable("NUMERIC_ORDINARY_CHECKPOINT"))?;let cp=&cp_envelope["payload"]["body"];
    need(field(receipt,"originCheckpointDigest")?==field(receipt,"ordinaryCheckpointDigest")?,"NUMERIC_ORIGIN_CHECKPOINT_IDENTITY")?;
    let agreement_digest=s(cp,"agreementDigest")?;let agreement=journal.iter().find(|j|j["payload"]["kind"].as_str()==Some("AGREEMENT") && hash(&j["payload"]["body"]).ok().as_deref()==Some(agreement_digest)).ok_or_else(||unavailable("NUMERIC_AGREEMENT"))?;let agreement=&agreement["payload"]["body"];
    let prepared=if negative{Some(crate::exhaustion::prepare(w,capture,state,journal,decision_evidence)?)}else{None};
    if let Some(p)=&prepared{need(receipt["headroomNonce"]==p.facts["requestNonce"],"EXHAUSTION_EXACT_RECEIPT_R2_BINDING")?;}
    let context=if let Some(p)=&prepared{&p.context}else{field(cp,"protectedRequest")?};crate::common::context(context)?;
    if negative{need(w["negativeFrame"]["originCheckpointDigest"]==receipt["originCheckpointDigest"],"EXHAUSTION_EXACT_ORIGIN")?;for k in ["coreHead","path","cap","count","metric","x","qContextDigest","qTrustPolicyDigest"]{need(context[k]==cp["protectedRequest"][k],"EXHAUSTION_ORIGIN_CONTEXT_EXCEPT_REQUEST")?;}}
    let config=&e["verificationDescriptor"]["configuration"];let route_kind=if purpose=="INITIAL_BEFORE_DISPATCH"{"INITIAL"}else{"CLOSING"};let route_index=n(field(cp,"receiptRange")?,"throughIndex")?;
    let selected_routes:Vec<_>=a(config,"intervalRoutes")?.iter().filter(|r|r["checkpointKind"].as_str()==Some(route_kind) && r["decisionIndex"].as_u64()==Some(route_index)).collect();need(selected_routes.len()==1,"INDEPENDENT_UNIQUE_SELECTED_INTERVAL_ROUTE")?;let route=selected_routes[0];
    need(cp["kind"]==route["checkpointKind"] && cp["intervalId"]==route["intervalId"] && cp["presentationId"]==route["presentationId"] && w["intervalId"]==route["intervalId"],"AUTHENTICATED_CHECKPOINT_FROZEN_ROUTE")?;
    need(config["coreDomainDigest"].as_str()==Some(hash(&wire::core_wire(state.genesis_data().get("domain").unwrap()))?.as_str()) && config["coreEditionDigest"].as_str()==Some(core_edition),"REDACTED_DESCRIPTOR_CORE_DOMAIN_EDITION")?;
    let input=if let Some(p)=&prepared{&p.input}else{field(w,"authorizationInput")?};need(input["domain"]==wire::core_wire(state.genesis_data().get("domain").unwrap()),"NUMERIC_NATIVE_INPUT_DOMAIN")?;
    let actual=if let Some(p)=&prepared{p.anchor.clone()}else if purpose=="INITIAL_BEFORE_DISPATCH"{
        need(input["expectedHistoryHead"]==json!(state.head()) && n(input,"evaluationTime")?>=state.head().canonical_time && field(w,"postAuthorizationInput")?.is_null() && field(w,"postAuthorizationResult")?.is_null(),"INITIAL_NATIVE_CAPTURED_FRAME")?;
        let encoded=canonical::encode(&wire::core_value(input).map_err(invalid)?).map_err(|e|invalid(e.to_string()))?;core_json(native_core::authorization::authorize_at_state_canonical(state,&encoded).map_err(|e|invalid(e.to_string()))?)?
    }else{
        let id=s(field(receipt,"engineBinding")?,"decisionId")?;let original=decision_evidence.get(id).ok_or_else(||unavailable("ORIGINAL_HISTORICAL_NATIVE_FRAME"))?;
        need(field(original,"authorizationInput")?==input && field(original,"authorizationResult")?==field(w,"authorizationResult")?,"ORIGINAL_SIGNED_NATIVE_FRAME_EQUIVALENCE")?;let source=field(original,"sourceBinding")?;let intent=s(source,"intentId")?;let position=n(field(source,"snapshotHead")?,"position")? as usize;actual_head(state,field(source,"snapshotHead")?)?;
        let native_tail=&state.events()[position+1..];need(native_tail.len()==1 && native_tail[0].get("type").and_then(C::string)==Some("TRANSACTION_INTENT_ADMITTED") && native_tail[0].get("data").and_then(|v|v.get("intentId")).and_then(C::string)==Some(intent),"EXACT_HISTORICAL_ADMISSION_NO_PATH_CONTROL_CHANGE")?;
        let mut post=input.clone();post.as_object_mut().ok_or_else(||invalid("NATIVE_INPUT_OBJECT"))?.remove("binding");post["consequential"]=json!(false);post["expectedHistoryHead"]=json!(state.head());post["evaluationTime"]=json!(state.head().canonical_time);need(&post==field(w,"postAuthorizationInput")?,"EXACT_HISTORICAL_POST_QUERY_INPUT")?;
        let encoded=canonical::encode(&wire::core_value(&post).map_err(invalid)?).map_err(|e|invalid(e.to_string()))?;let post_result=core_json(native_core::authorization::authorize_at_state_canonical(state,&encoded).map_err(|e|invalid(e.to_string()))?)?;need(&post_result==field(w,"postAuthorizationResult")?,"EXACT_HISTORICAL_POST_QUERY_RESULT_NO_ALLOW_CLAIM")?;
        field(original,"authorizationResult")?.clone()
    };
    need(actual["decision"]=="ALLOW" && (negative||&actual==field(w,"authorizationResult")?),"NUMERIC_NATIVE_AUTHORIZATION_RECOMPUTED")?;
    let proof=field(&actual,"proof")?;let request=field(input,"request")?;
    if purpose=="HISTORICAL_AFTER_DECISION"{let id=s(field(receipt,"engineBinding")?,"decisionId")?;let d=decision_evidence.get(id).ok_or_else(||unavailable("ORIGINAL_HISTORICAL_NATIVE_FRAME"))?;let intent=field(field(d,"sourceBinding")?,"intentId")?.as_str().ok_or_else(||invalid("HISTORICAL_INTENT_REQUIRED"))?;need(state.admission(intent).is_some() && field(d,"requestDigest")?.as_str()==Some(hash(request)?.as_str()),"HISTORICAL_ADMITTED_EXACT_REQUEST")?;}
    let witness=field(capture,"witness")?;let intervals=a(witness,"intervals")?;need(intervals.len()<=8,"NUMERIC_INTERVAL_CHAIN_BOUND")?;let interval_index=intervals.iter().position(|i|i["expected"]["intervalId"]==w["intervalId"]).ok_or_else(||unavailable("NUMERIC_INTERVAL_CAPTURE"))?;let interval=&intervals[interval_index];let dossier=field(interval,"dossier")?;let end=field(field(dossier,"end")?,"payload")?;
    let prior=a(route,"priorIntervals")?;need(prior.len()==interval_index && prior.iter().zip(intervals).all(|(r,i)|r["intervalId"]==i["expected"]["intervalId"]),"FROZEN_COMPLETE_PRIOR_INTERVAL_CHAIN")?;
    for r in prior{need(journal.iter().any(|j|j["payload"]["kind"]=="CHECKPOINT" && j["payload"]["body"]["intervalId"]==r["intervalId"] && j["payload"]["body"]["presentationId"]==r["presentationId"]),"AUTHENTICATED_PRIOR_ROUTE_PRESENTATION")?;}
    let reviewer=reviewer_lineage(w,e,receipt,interval)?;
    let closing=a(dossier,"policies")?.iter().find(|p|wire::digest("continuity/private-case/v1/policy",&p["payload"]).ok().as_deref()==Some(s(end,"policyDigest").unwrap_or(""))).ok_or_else(||invalid("AUTHENTICATED_CLOSING_POLICY"))?;let closing=field(closing,"payload")?;
    let policy=opening(a(interval,"bindings")?,s(closing,"coreBinding")?,"core-head")?;need(policy["edition"].as_str()==Some(core_edition),"POLICY_CORE_EDITION")?;let policy_head=field(policy,"head")?;actual_head(state,policy_head)?;
    let tail=&state.events()[n(policy_head,"position")? as usize+1..];need(tail.len()<=1 && tail.iter().all(|event|event.get("type").and_then(C::string)==Some("TRANSACTION_INTENT_DECLARED")),"NONCHARGE_NATIVE_TAIL")?;
    let custody=field(w,"custody")?;
    if negative{closed(custody,&["coreEncodedEvents","cadenceRecords","blobRecords","brokerSequence","intervalArtifacts","serviceRecords","sourceRecords","inventoryRecords","recipientRecords","openingHeads"])?;}else{closed(custody,&["coreEncodedEvents","cadenceRecords","blobRecords","brokerSequence","intervalArtifacts"])?;}
    let broker_sequence=n(custody,"brokerSequence")? as usize;
    retained_intervals(custody,intervals,interval_index)?;
    let broker_stream=field(field(witness,"streams")?,"broker")?;need(broker_stream["identity"]==json!({"storeId":config["custody"]["storeId"],"stream":config["streams"]["broker"]}),"REDACTED_HOST_BROKER_IDENTITY")?;let broker_rows=a(broker_stream,"records")?;need(broker_sequence<=broker_rows.len(),"NUMERIC_BROKER_PREFIX")?;
    let source=n(field(interval,"sourceHead")?,"sequence")? as usize;need(source<=broker_sequence && broker_sequence-source<=1,"NONCHARGE_BROKER_TAIL")?;
    let broker_tail=&broker_rows[source..broker_sequence];need(tail.len()==broker_tail.len(),"MATCHED_NONCHARGE_TAIL")?;
    for row in broker_tail{let r=field(row,"record")?;need(s(r,"kind")?=="REQUEST" && tail[0].get("data").and_then(|d|d.get("intentId")).and_then(C::string)==Some(s(r,"logicalId")?),"NONCHARGE_PENDING_INTENT")?;let b=field(r,"request")?;need(b["caseId"]==e["caseId"] && b["actorId"]==request["actorId"] && b["recipientId"]==request["counterpartyId"] && b["capture"]["resource"]==request["resource"] && b["capture"]["amount"]==request["amount"]["$bigint"] && r["termsCommitment"]==request["termsCommitment"],"PENDING_REQUEST_CORE_Q_EQUIVALENCE")?;}
    let structural=census(capture,state,interval_index,broker_sequence,s(e,"caseId")?,s(e,"completeGroupId")?,proof,negative||purpose=="HISTORICAL_AFTER_DECISION")?;
    let constraints=field(proof,"effectiveConstraints")?;let cumulative=constraints.get("maxCumulativeAmount").ok_or_else(||unavailable("FINITE_NATIVE_AMOUNT_CAP_REQUIRED"))?;let transactions=constraints.get("maxTransactions").ok_or_else(||unavailable("FINITE_NATIVE_COUNT_CAP_REQUIRED"))?;let cumulative=bigint(cumulative)?;let transactions=number(transactions)?;
    for id in a(&structural,"groupIds")?{let cap=a(closing,"groupLimits")?.iter().find(|g|g["groupId"]==*id).ok_or_else(||invalid("EVERY_GROUP_FINITE_CAP"))?;need(u64s(field(cap,"amountLimit")?)?<=cumulative && u64s(field(cap,"countLimit")?)?<=transactions,"Q_CAP_NOT_BROADER_THAN_NATIVE_INTERSECTIONS")?;}
    let selected=a(closing,"groupLimits")?.iter().find(|g|g["groupId"]==e["completeGroupId"]).ok_or_else(||invalid("COMPLETE_GROUP_CAP"))?;
    if negative{crate::exhaustion::finite_caps(capture,e,closing,&structural,proof)?;}
    let metric=s(receipt,"metric")?;let x=s(receipt,"x")?;need(field(receipt,"metric")?==field(agreement,"metric")? && field(receipt,"x")?==field(agreement,"x")? && ((metric=="COUNT" && x=="1") || (metric=="AMOUNT" && request["amount"]["$bigint"].as_str()==Some(x))),"EXACT_SELECTED_METRIC_REQUEST")?;
    let expected_request_digest=if let Some(p)=&prepared{s(&p.facts,"serviceRequestDigest")?.to_owned()}else{hash(request)?};
    let expected_context=json!({"coreHead":hash(&json!(state.head()))?,"requestDigest":expected_request_digest,"path":structural["selectedPathDigest"],"cap":selected[if metric=="COUNT"{"countLimit"}else{"amountLimit"}],"count":u64s(&structural["groupCounts"][s(e,"completeGroupId")?])?,"metric":metric,"x":x,"qContextDigest":interval["statement"]["contextDigest"],"qTrustPolicyDigest":wire::digest("continuity/private-case/v1/trust",field(interval,"trust")?).map_err(invalid)?});
    need(&expected_context==context && s(receipt,"protectedContextDigest")?==hash(context)?,"INDEPENDENT_NUMERIC_PROTECTED_CONTEXT")?;
    let crows=a(custody,"cadenceRecords")?;need(crows.len()<=journal.len() && crows.iter().zip(journal).all(|(row,entry)|row.get("record")==Some(entry)),"COMPLETE_AUTHENTICATED_PREPARATION_JOURNAL")?;let prep=crows.last().map(|r|hash(&r["record"])).transpose()?.unwrap_or("0".repeat(64));need(prep==s(receipt,"preparationJournalDigest")?,"PREPARATION_ENGINE_TIP")?;
    if purpose=="INITIAL_BEFORE_DISPATCH"{need(crows.iter().all(|r|r["record"]["payload"]["kind"]!="DECISION") && crows.iter().any(|r|hash(&r["record"]).ok().as_deref()==Some(cp_digest)),"INITIAL_NUMERIC_PREPARATION_BEFORE_FIRST_DECISION")?;}
    else{let id=s(field(receipt,"engineBinding")?,"decisionId")?;need(crows.iter().any(|r|r["record"]["payload"]["kind"]=="DECISION" && r["record"]["payload"]["body"]["decisionId"].as_str()==Some(id)) && crows.iter().any(|r|hash(&r["record"]).ok().as_deref()==Some(cp_digest)),"HISTORICAL_DECISION_AND_CHECKPOINT_BEFORE_PREPARATION")?;}
    let mut actual_custody=json!({"core":core_custody(state,heads,field(e,"coreIdentity")?,field(custody,"coreEncodedEvents")?)?,"cadence":journal_head(field(e,"cadenceIdentity")?,crows)?,"broker":journal_head(field(broker_stream,"identity")?,&broker_rows[..broker_sequence])?,"blobs":journal_head(field(e,"blobIdentity")?,a(custody,"blobRecords")?)?});
    if negative{crate::exhaustion::custody_heads(w,capture,state,config,journal,&mut actual_custody)?;}
    need(&actual_custody==field(receipt,"custodyHeads")? && field(receipt,"coreHead")?==&json!(state.head()),"RECONSTRUCTED_CUSTODY_HEADS")?;
    let eb=json!({"domainDigest":hash(&wire::core_wire(state.genesis_data().get("domain").unwrap()))?,"coreEditionDigest":core_edition,"coreHeadDigest":hash(&json!(state.head()))?,"requestDigest":hash(request)?,"selectedPathDigest":structural["selectedPathDigest"],"requiredIntersectionsDigest":structural["requiredIntersectionsDigest"],"agreementDigest":agreement_digest,"custodyDigest":hash(&actual_custody)?,"decisionId":field(field(receipt,"engineBinding")?,"decisionId")?});need(&eb==field(receipt,"engineBinding")?,"RECONSTRUCTED_ENGINE_BINDING")?;
    let origin_base=json!({"contextDigest":interval["statement"]["contextDigest"],"enrollmentDigest":wire::digest("continuity/private-case/v1/enrollment",&interval["expected"]["enrollment"]).map_err(invalid)?,"trustPolicyDigest":expected_context["qTrustPolicyDigest"],"checkpointDigest":interval["expected"]["endDigest"],"checkpointRoot":end["root"],"policyDigest":end["policyDigest"],"sequence":end["sequence"],"engineBindingDigest":wire::digest("continuity/headroom/engine-binding/v1",&eb).map_err(invalid)?});
    let mut inputs=Vec::new();let mut statements=Vec::new();let mut proof_inputs=Vec::new();
    for id in a(&structural,"groupIds")?{let carry=a(end,"carry")?.iter().find(|g|g["groupId"]==*id).ok_or_else(||invalid("SELECTED_GROUP_CARRY"))?;let cap=a(closing,"groupLimits")?.iter().find(|g|g["groupId"]==*id).ok_or_else(||invalid("SELECTED_GROUP_CAP"))?;let mut origin=origin_base.clone();for(k,v)in [("groupId",id),("carryCommitment",&carry["commitment"]),("countCarry",&carry["count"]),("amountCap",&cap["amountLimit"]),("countCap",&cap["countLimit"])]{origin[k]=v.clone();}need(carry["count"]==structural["groupCounts"][string(id)?] && u64s(&carry["count"])?.checked_add(1).is_some_and(|count|u64s(&cap["countLimit"]).is_ok_and(|limit|count<=limit)),"EVERY_GROUP_COUNT_PLUS_ONE")?;
        let input=json!({"schema":"continuity-headroom-numeric-input/1","origin":origin,"selection":{"claim":if negative{"AMOUNT_INSUFFICIENT"}else{"AMOUNT_SUFFICIENT"},"x":request["amount"]["$bigint"],"audience":agreement["counterpartyId"],"nonce":receipt["headroomNonce"]}});
        if metric=="COUNT"{inputs.push(json!({"origin":origin}));statements.push(json!({"schema":"continuity.r3_1.current-count-statement.v1","origin":origin,"selection":{"x":"1","audience":agreement["counterpartyId"],"nonce":receipt["headroomNonce"]},"increment":"1","result":"AVAILABLE"}));}
        else{let typed:numeric::Input=serde_json::from_value(input.clone()).map_err(|e|invalid(e.to_string()))?;let opening=a(interval,"nextPrivateCarry")?.iter().find(|c|c["groupId"]==*id).ok_or_else(||invalid("SELECTED_PRIVATE_CARRY"))?;let opening:quantitative::wire::CarryWitness=serde_json::from_value(opening.clone()).map_err(|e|invalid(e.to_string()))?;numeric::witness(&typed,&opening).map_err(|e|invalid(e.to_string()))?;let statement=numeric::statement(&typed).map_err(|e|invalid(e.to_string()))?;proof_inputs.push((id.clone(),quantitative::wire::statement_digest(&statement).map_err(|e|invalid(e.to_string()))?));inputs.push(input);statements.push(serde_json::to_value(statement).map_err(|e|invalid(e.to_string()))?);}
    }
    need(receipt["inputs"]==json!(inputs) && receipt["statements"]==json!(statements) && s(receipt,"statementBundleDigest")?==hash(&json!(statements))?,"EXACT_INDEPENDENT_NUMERIC_STATEMENT_BUNDLE")?;
    let bundle=field(w,"proofBundle")?;closed(bundle,&["originalPresentationBase64","checkpointPresentations","headroomProofs"])?;need(hash(bundle)?==s(receipt,"proofBundleDigest")?,"EXACT_PROOF_BUNDLE_BYTES")?;let proofs=a(bundle,"headroomProofs")?;need(proofs.len()==proof_inputs.len(),"EVERY_GROUP_NUMERIC_PROOF_METADATA")?;
    for(p,(id,statement_digest))in proofs.iter().zip(proof_inputs){closed(p,&["groupId","proof"])?;need(p["groupId"]==id,"NUMERIC_PROOF_GROUP_ORDER")?;let p:quantitative::wire::Proof=serde_json::from_value(p["proof"].clone()).map_err(|e|invalid(e.to_string()))?;need(p.schema==quantitative::wire::PROOF_SCHEMA && p.suite==quantitative::wire::SUITE && p.parameters_digest==numeric::PARAMETERS_DIGEST && p.statement_digest==statement_digest && p.chunks.len()==1 && p.chunks[0].index.0==0 && !p.chunks[0].proof.is_empty(),"NUMERIC_PROOF_STATEMENT_SUITE_METADATA")?;}
    let presentation_bytes=base64(s(bundle,"originalPresentationBase64")?,8*1024*1024)?;let presentation_text=std::str::from_utf8(&presentation_bytes).map_err(|_|invalid("PRESENTATION_UTF8"))?;need(raw_hash(&presentation_bytes)==s(cp,"presentationDigest")?,"ORDINARY_PRESENTATION_SIGNED_BYTES")?;let presentation=wire::parse(presentation_text).map_err(invalid)?;closed(&presentation,&["schema","dossier","proof"])?;need(presentation["schema"]=="continuity.case.presentation.v1" && presentation["dossier"]==*dossier,"ORDINARY_PRESENTATION_DOSSIER_SUBSTITUTION")?;closed(field(&presentation,"proof")?,&["schema","suite","parametersDigest","statementDigest","chunks"])?;
    let checkpoint_presentations=a(bundle,"checkpointPresentations")?;need(!checkpoint_presentations.is_empty() && checkpoint_presentations.len()<=8,"CHECKPOINT_PRESENTATION_BOUND")?;let mut checkpoint_ids=BTreeSet::new();for p in checkpoint_presentations{closed(p,&["checkpointDigest","base64"])?;digest(field(p,"checkpointDigest")?)?;let id=s(p,"checkpointDigest")?;need(checkpoint_ids.insert(id),"CHECKPOINT_PRESENTATION_DUPLICATE")?;let cp=journal.iter().find(|j|j["payload"]["kind"]=="CHECKPOINT" && hash(j).ok().as_deref()==Some(id)).ok_or_else(||unavailable("BUNDLE_AUTHENTICATED_CHECKPOINT"))?;let cp=&cp["payload"]["body"];let bytes=base64(s(p,"base64")?,8*1024*1024)?;need(raw_hash(&bytes)==s(cp,"presentationDigest")?,"BUNDLE_PRESENTATION_SIGNED_BYTES")?;}
    let matching:Vec<_>=a(bundle,"checkpointPresentations")?.iter().filter(|p|p["checkpointDigest"].as_str()==Some(cp_digest)).collect();need(matching.len()==1 && matching[0]["base64"]==bundle["originalPresentationBase64"],"ORDINARY_PRESENTATION_CHECKPOINT_BUNDLE")?;
    let original_statement=native_core::content_derive_bound_public(field(interval,"expected")?,field(interval,"trust")?,dossier).map_err(invalid)?;
    need(original_statement==interval["statement"] && legacy_hash(&original_statement)?==s(cp,"statementDigest")? && legacy_hash(field(&presentation,"proof")?)?==s(cp,"proofDigest")?,"ORDINARY_STATEMENT_PROOF_METADATA")?;
    // Actual Q verification receipts are retained and hashed, never used as
    // caller assertions that math verified. The independent reviewer repeats Q.
    let reviews=a(w,"qReviews")?;need(!reviews.is_empty() && reviews.len()<=8 && hash(field(w,"qReviews")?)?==s(receipt,"qReviewDigest")?,"ACTUAL_Q_REVIEW_RECEIPT_PREIMAGE")?;
    let mut review_ids=BTreeSet::new();for review in reviews{closed(review,&["checkpointDigest","result"])?;let id=s(review,"checkpointDigest")?;need(review_ids.insert(id) && checkpoint_ids.contains(id),"RETAINED_Q_REVIEW_CHECKPOINT_CENSUS")?;let cp=journal.iter().find(|j|j["payload"]["kind"]=="CHECKPOINT" && hash(j).ok().as_deref()==Some(id)).ok_or_else(||unavailable("Q_REVIEW_AUTHENTICATED_CHECKPOINT"))?;let cp=&cp["payload"]["body"];let r=field(review,"result")?;closed(r,&["schema","status","profile","contextDigest","trustPolicyDigest","inventoryCoverage","policyBinding","quantitativeRules","corePolicyComputation","measurementTrust","enforcementCoverage","freshness","outcomes","serviceCompletion","inventoryCount","chargedAdmissions","permitsExecution","expectationCustody","reviewerFloor","witnessedCheckpoints","offlineFloor","presentationSha256"])?;need(r["schema"]=="continuity.case.result.v1" && r["status"]=="VERIFIED_QUANTITATIVE_POLICY" && r["profile"]=="Q" && r["permitsExecution"]==false && r["contextDigest"]==cp["protectedRequest"]["qContextDigest"] && r["trustPolicyDigest"]==cp["protectedRequest"]["qTrustPolicyDigest"] && r["presentationSha256"]==cp["presentationDigest"] && r["freshness"]=="HISTORICAL_INTERVAL","RETAINED_Q_REVIEW_METADATA_CORRESPONDENCE")?;}
    need(review_ids.contains(cp_digest),"CURRENT_ORDINARY_CHECKPOINT_REVIEW_REQUIRED")?;
    let binding=json!({"schema":"continuity.r3_1.headroom-fulfillment-binding.v1","purpose":purpose,"metric":metric,"x":x,"headroomNonce":receipt["headroomNonce"],"ordinaryCheckpointDigest":cp_digest,"originCheckpointDigest":cp_digest,"protectedContextDigest":hash(context)?,"engineBindingDigest":hash(&eb)?,"statementBundleDigest":hash(&json!(statements))?,"proofBundleDigest":hash(bundle)?,"preparationJournalDigest":prep,"verificationReceiptDigest":hash(receipt)?});
    let mut result=json!({"obligationId":field(w,"obligationId")?,"numericBinding":binding,"protectedContext":expected_context,"nativeEvaluationTime":if negative{J::Null}else{json!(n(input,"evaluationTime")?)},"proofBinding":"PROOF_BOUND","quantitativeQVerified":false,"scope":"EXACT_CAPTURED_PREFIX_AND_RETAINED_CUSTODY_BYTES","authorityUsage":structural["authorityUsage"],"reviewerFloor":reviewer,"currentLiveCustody":"UNAVAILABLE","permitsExecution":false});
    if let Some(p)=&prepared{need(statements.len()==1&&proofs.len()==1,"EXHAUSTION_SINGLE_COMPLEMENT_ARTIFACT")?;result["kind"]=json!("EXHAUSTED_REFUSAL");result["negativeFacts"]=p.facts.clone();result["diagnosticEvaluationTime"]=json!(n(input,"evaluationTime")?);result["diagnosticProvenance"]=json!("P_EVALUATED_DIAGNOSTIC");result["complementStatementDigest"]=json!(hash(&statements[0])?);result["complementProofDigest"]=json!(hash(&proofs[0]["proof"])?);}
    Ok(result)
}
