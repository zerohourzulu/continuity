//! UNBUILT SOURCE PROPOSAL. One complete selected historical envelope, once.
//! Root must create the manifests, actual build, controls and runtime enrollment.
mod read_io;
mod journal;
mod derive;
mod controls;
use std::{collections::{BTreeMap,BTreeSet},io::{self,Write},path::{Path,PathBuf}};
use serde::Deserialize;
use serde_json::{json,Value as J};
use read_io::{Pin,Result,require,verified,verified_source,bytes};
use journal::Journal;
const HERE:&str="${CONTINUITY_SOURCE_ROOT}/tmp/agent-state/20261007-r3_1-native/v4/";
const GUEST:&str="${CONTINUITY_SOURCE_ROOT}/tmp/agent-state/20261007-r3_1-guest/v3/";
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Gate {
 schema:String,status:String,acceptance:bool,matrix_id:String,mode:String,predicate:String,
 maximum_evaluations:usize,maximum_chains:usize,automatic_seven_chains:bool,whole_populated_fit:String,
 source_manifest:Pin,guest_source_manifest:Pin,reader_source_manifest:Pin,assembler_source_manifest:Pin,
 root_authority:Pin,root_source_review:Pin,actual_binary:Pin,actual_build_disposition:Pin,
 control_plan:Pin,control_result:Pin,control_disposition:Pin,assembly_disposition:Pin,
 observer_disposition:Pin,provenance_disposition:Pin,program_binding:Pin,input:Pin,
 expected_predicates:BTreeMap<String,bool>,output_root:PathBuf,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields,rename_all="camelCase")]
struct SourceClosure {schema:String,status:String,acceptance:bool,lane:String,source_closure_complete:bool,files:Vec<Pin>}
fn closed(v:&J,keys:&[&str])->Result<()>{let o=v.as_object().ok_or("NOT_READY_CLOSED_ROOT_RECORD")?;require(o.len()==keys.len()&&keys.iter().all(|k|o.contains_key(*k)),"NOT_READY_CLOSED_ROOT_RECORD")}
fn record(pin:&Pin,schema:&str,status:&str,expected:J,extra:&[&str])->Result<J>{
 let value:J=read_io::json(pin,1<<20)?;let fields=expected.as_object().ok_or("INTERNAL_ROOT_RECORD_SHAPE")?;
 let mut keys:Vec<&str>=fields.keys().map(String::as_str).collect();keys.extend(["schema","status","acceptance"]);keys.extend(extra);closed(&value,&keys)?;
 require(value["schema"]==schema&&value["status"]==status&&value["acceptance"].as_bool()==Some(false)&&fields.iter().all(|(k,v)|value.get(k)==Some(v)),"NOT_READY_ACTUAL_ROOT_RECORD_BINDING")?;Ok(value)
}
fn closure(pin:&Pin,lane:&str,required:&[PathBuf])->Result<Vec<Pin>>{
 let value:SourceClosure=read_io::json(pin,derive::MAX as u64)?;
 require(value.schema=="continuity.r3_1.root-source-closure.v1"&&value.status=="ROOT_REVIEWED_COMPLETE_SOURCE_CLOSURE"&&!value.acceptance&&value.lane==lane&&value.source_closure_complete&&!value.files.is_empty()&&value.files.len()<=100_000,"NOT_READY_SOURCE_CLOSURE")?;
 let mut paths=BTreeSet::new();for p in &value.files{require(paths.insert(p.path.clone())&&p.path!=pin.path,"NOT_READY_DUPLICATE_OR_SELF_SOURCE_PIN")?;let _=verified_source(p)?;}
 require(required.iter().all(|p|paths.contains(p)),"NOT_READY_REQUIRED_SOURCE_MEMBER")?;Ok(value.files)
}
fn completion(j:&mut Journal,observation:&J)->Result<()> {
 // Retain the genuine completed/refused prefix in BOTH original logs before
 // canonicalization, assertions, carrier serialization, readback or followup.
 let prefix=serde_json::to_vec(observation)?;let mut first=None;
 for mut stream in[Box::new(io::stdout())as Box<dyn Write>,Box::new(io::stderr())as Box<dyn Write>]{let attempt=(||->io::Result<()>{stream.write_all(&prefix)?;stream.write_all(b"\n")?;stream.flush()})();if let Err(e)=attempt{if first.is_none(){first=Some(e);}}}
 let event=j.event(observation); // All three sinks attempted, even if a log fails.
 if let Some(e)=first{return Err(e.into());}event?;Ok(())
}
fn run()->Result<()> {
 let args:Vec<String>=std::env::args().collect();
 require(args.len()==7&&args[1]=="--gate"&&args[3]=="--gate-sha256"&&args[5]=="--output","NOT_READY_EXACT_ARGUMENTS")?;
 // The externally Root-pinned gate hash is the administrative trust entry.
 let gp=PathBuf::from(&args[2]);let gate_pin=Pin{bytes:read_io::regular(&gp)?.metadata()?.len(),path:gp,sha256:args[4].clone()};let g:Gate=read_io::json(&gate_pin,1<<20)?;
 require(g.schema=="continuity.r3_1.exhaustion-native-result-gate.v1"&&g.status=="ROOT_AUTHORIZED_NATIVE_APPLICATION_RESULT_ONCE"&&!g.acceptance&&g.matrix_id==derive::MATRIX&&g.mode=="BOTH"&&g.predicate==derive::PREDICATE&&g.maximum_evaluations==1&&g.maximum_chains==1&&!g.automatic_seven_chains&&g.whole_populated_fit=="UNKNOWN","NOT_READY_ROOT_ONE_EXHAUSTION_SELECTION")?;
 require(g.expected_predicates==derive::expected(),"NOT_READY_EXACT_NINE_PREDICATES")?;
 require(g.output_root==PathBuf::from(&args[6])&&g.output_root==Path::new(HERE).join(format!("runs/native-{}-01",derive::MATRIX)),"NOT_READY_EXCLUSIVE_OUTPUT_ROOT")?;
 require(g.source_manifest.path==Path::new(HERE).join("ROOT-SOURCE-CLOSURE.json")&&g.guest_source_manifest.path==Path::new(HERE).join("GUEST-SOURCE-CLOSURE.json"),"NOT_READY_ROOT_ACTUAL_SOURCE_MANIFESTS")?;
 require(g.actual_binary.path==std::env::current_exe()?,"NOT_READY_SAME_COMPILED_BINARY")?;
 let mut originals=vec![gate_pin.clone(),g.source_manifest.clone(),g.guest_source_manifest.clone(),g.reader_source_manifest.clone(),g.assembler_source_manifest.clone(),g.root_authority.clone(),g.root_source_review.clone(),g.actual_binary.clone(),g.actual_build_disposition.clone(),g.control_plan.clone(),g.control_result.clone(),g.control_disposition.clone(),g.assembly_disposition.clone(),g.observer_disposition.clone(),g.provenance_disposition.clone(),g.program_binding.clone(),g.input.clone()];
 for p in &originals{let _=verified(p)?;}
 let native_required:Vec<PathBuf>=["src/main.rs","src/derive.rs","src/read_io.rs","src/journal.rs","Cargo.toml","Cargo.lock"].iter().map(|p|Path::new(HERE).join(p)).collect();
 let guest_required:Vec<PathBuf>=["src/lib.rs","src/common.rs","src/cadence.rs","src/exhaustion.rs","src/numeric_bridge.rs","src/counterparty.rs","src/mode_relation.rs","src/main.rs","Cargo.toml","Cargo.lock"].iter().map(|p|Path::new(GUEST).join(p)).collect();
 let mut source_originals=closure(&g.source_manifest,"NATIVE",&native_required)?;
 source_originals.extend(closure(&g.guest_source_manifest,"GUEST",&guest_required)?);
 source_originals.extend(closure(&g.reader_source_manifest,"READER",&[])?);
 source_originals.extend(closure(&g.assembler_source_manifest,"ASSEMBLER",&[])?);
 let _=record(&g.actual_build_disposition,"continuity.r3_1.native-build-disposition.v1","ROOT_REVIEWED_SCOPED_ARTIFACT",json!({"artifact":g.actual_binary,"sourceManifest":g.source_manifest,"guestSourceManifest":g.guest_source_manifest,"sourceClosureReviewed":true}),&[])?;
 let _=record(&g.root_source_review,"continuity.r3_1.native-source-review.v1","ROOT_REVIEWED_EXHAUSTION_NATIVE_RESULT_SOURCE",json!({"sourceManifest":g.source_manifest,"guestSourceManifest":g.guest_source_manifest,"readerSourceManifest":g.reader_source_manifest,"assemblerSourceManifest":g.assembler_source_manifest,"exactNativeGuestAndHistoricalScopeReviewed":true}),&[])?;
 let program=record(&g.program_binding,"continuity.r3_1.actual-program-binding.v1","ACTUAL_PROGRAM_BOUND",json!({"guestSourceManifest":g.guest_source_manifest,"profile":derive::PROFILE,"engineEdition":derive::EDITION,"commitmentDomain":derive::DOMAIN,"publicValuesBytes":32}),&["programId","heldCompatibility"])?;
 let program_id=program["programId"].as_str().ok_or("NOT_READY_ACTUAL_PROGRAM_ID")?;
 require(program_id.len()==64&&program_id.bytes().all(|v|v.is_ascii_digit()||(b'a'..=b'f').contains(&v)),"NOT_READY_PROGRAM_DIGEST")?;
 let held=&program["heldCompatibility"];closed(held,&["status","selectedMatrixId","maximumChains","automaticSevenChains","wholePopulatedFitBeforeFirstProof","compatibilityDisposition"])?;
 require(held["status"]=="ROOT_REVIEWED_FOR_ONE_PROVISIONAL_CHAIN"&&held["selectedMatrixId"]==derive::MATRIX&&held["maximumChains"]==1&&held["automaticSevenChains"]==false&&held["wholePopulatedFitBeforeFirstProof"]=="UNKNOWN","NOT_READY_ACTUAL_HELD_COMPATIBILITY")?;
 let compatibility:Pin=serde_json::from_value(held["compatibilityDisposition"].clone())?;let _=verified(&compatibility)?;originals.push(compatibility);
 let _=record(&g.root_authority,"continuity.r3_1.native-run-authority.v1","ROOT_AUTHORIZED_NATIVE_APPLICATION_RESULT_ONCE",json!({"selectedMatrixId":g.matrix_id,"mode":g.mode,"predicate":g.predicate,"sourceManifest":g.source_manifest,"guestSourceManifest":g.guest_source_manifest,"actualBinary":g.actual_binary,"programBinding":g.program_binding,"input":g.input,"maximumEvaluations":1,"maximumChains":1,"captureCallsAllowed":0,"QCallsAllowed":0,"proofCallsAllowed":0,"signingCallsAllowed":0,"permitsExecution":false}),&[])?;
 let _=record(&g.control_disposition,"continuity.r3_1.native-controls-disposition.v1","ROOT_REVIEWED_REQUIRED_EXHAUSTION_NATIVE_CONTROLS_ONCE",json!({"selectedMatrixId":g.matrix_id,"mode":g.mode,"predicate":g.predicate,"sourceManifest":g.source_manifest,"guestSourceManifest":g.guest_source_manifest,"actualBinary":g.actual_binary,"programBinding":g.program_binding,"controlPlan":g.control_plan,"controlResult":g.control_result,"allRequiredControlsPassed":true,"ownedCleanupConfirmed":true,"permitsExecution":false}),&[])?;
 let _=record(&g.observer_disposition,"continuity.r3_1.assembler-observer-disposition.v1","ROOT_REVIEWED_REQUIRED_EXHAUSTION_ASSEMBLER_CONTROLS_ONCE",json!({"selectedMatrixId":g.matrix_id,"mode":g.mode,"predicate":g.predicate,"assemblerSourceManifest":g.assembler_source_manifest,"readerSourceManifest":g.reader_source_manifest,"allRequiredControlsPassed":true,"candidateCalls":0,"privateBodyReads":0,"proofAccepted":false,"permitsExecution":false,"ownedCleanupConfirmed":true}),&["controlPlan","controlResult"])?;
 let observer:J=read_io::json(&g.observer_disposition,1<<20)?;
 for k in["controlPlan","controlResult"]{let p:Pin=serde_json::from_value(observer[k].clone())?;let _=verified(&p)?;originals.push(p);}
 let _=record(&g.assembly_disposition,"continuity.r3_1.exhaustion-native-assembly-bridge.v1","ROOT_REVIEWED_ONE_EXHAUSTION_ASSEMBLED_INPUT",json!({"selectedMatrixId":g.matrix_id,"mode":g.mode,"predicate":g.predicate,"input":g.input,"programBinding":g.program_binding,"observerDisposition":g.observer_disposition,"assemblerSourceManifest":g.assembler_source_manifest,"exactSavedCaptureAndSealedBytesReviewed":true}),&[])?;
 let _=record(&g.provenance_disposition,"continuity.r3_1.native-provenance-disposition.v1","ROOT_REVIEWED_EXACT_NATIVE_SOURCE_BINARY_PROGRAM_INPUT",json!({"selectedMatrixId":g.matrix_id,"mode":g.mode,"predicate":g.predicate,"sourceManifest":g.source_manifest,"guestSourceManifest":g.guest_source_manifest,"readerSourceManifest":g.reader_source_manifest,"assemblerSourceManifest":g.assembler_source_manifest,"actualBinary":g.actual_binary,"actualBuildDisposition":g.actual_build_disposition,"controlDisposition":g.control_disposition,"assemblyDisposition":g.assembly_disposition,"programBinding":g.program_binding,"input":g.input,"allExactPinsJoined":true,"permitsExecution":false}),&[])?;
 let input=bytes(&g.input,derive::MAX as u64)?;let wire=std::str::from_utf8(&input)?;let input_value:J=serde_json::from_str(wire)?;derive::selected(&input_value,program_id)?;
 // Recheck every enrolled original immediately before the sole evaluate call.
 for p in &originals{let _=verified(p)?;}
 for p in &source_originals{let _=verified_source(p)?;}
 let mut j=Journal::new(&g.output_root)?;
 j.event(&json!({"kind":"ROOT_INPUT_SOURCE_ARTIFACT_BOUND","gate":gate_pin,"input":g.input,"sourceManifest":g.source_manifest,"guestSourceManifest":g.guest_source_manifest,"actualBinary":g.actual_binary,"maximumEvaluations":1,"acceptance":false}))?;
 let result=match guest::evaluate(wire){
  Ok(v)=>v,
  Err(r)=>{let observation=json!({"kind":"ACTUAL_TYPED_GUEST_REFUSAL","refusal":r.as_json(),"missingResult":"UNKNOWN","acceptance":false,"permitsExecution":false});completion(&mut j,&observation)?;return Err("ACTUAL_GUEST_TYPED_REFUSAL_NO_RESULT".into());}
 };
 // Capture all genuinely returned booleans before any result canonicalization,
 // identity checks, public commitment calculation, or result-carrier write.
 let(canonical,commitment)=derive::complete_before(&result,|observation|completion(&mut j,observation),||derive::crosscheck(&result))?;
 let result_pin=j.save("EXPECTED-RESULT.private.json",&serde_json::to_vec_pretty(&result)?,derive::MAX)?;
 let canonical_pin=j.save("CANONICAL-RESULT.private.raw",canonical.as_bytes(),derive::MAX)?;
 let commitment_hex=commitment.iter().map(|b|format!("{b:02x}")).collect::<String>();
 let public_pin=j.save("PUBLIC-COMMITMENT.json",&serde_json::to_vec_pretty(&json!({"domain":derive::DOMAIN,"publicValuesBytes":32,"publicCommitmentHex":commitment_hex,"canonicalResult":canonical_pin,"result":result_pin,"resultFileShaIsCustodyOnly":true,"acceptance":false}))?,1<<20)?;
 j.event(&json!({"kind":"ACTUAL_RESULT_CANONICAL_COMMITMENT_RETAINED","result":result_pin,"canonicalResult":canonical_pin,"publicCommitment":public_pin,"input":g.input,"acceptance":false}))?;
 derive::result_selection(&result,&input_value,program_id)?;
 for k in derive::BOOLS{require(result.get(k).and_then(J::as_bool)==g.expected_predicates.get(k).copied(),"ACTUAL_RESULT_PREDICATE_DIFFERENCE")?;}
 for p in &originals{let _=verified(p)?;}
 for p in &source_originals{let _=verified_source(p)?;}
 let report=j.save("RESULT-OBSERVATIONS.json",&serde_json::to_vec_pretty(&json!({"schema":"continuity.r3_1.native-complete-result-observations.v1","status":"ACTUAL_NATIVE_RESULT_RETAINED_ROOT_ENROLLMENT_REQUIRED","gate":gate_pin,"input":g.input,"result":result_pin,"canonicalResult":canonical_pin,"publicCommitment":public_pin,"publicCommitmentHex":commitment_hex,"sourceManifest":g.source_manifest,"guestSourceManifest":g.guest_source_manifest,"actualBinary":g.actual_binary,"programBinding":g.program_binding,"matrixId":g.matrix_id,"mode":g.mode,"predicate":g.predicate,"nativeEvaluations":1,"VmCalls":0,"proofCalls":0,"captureCalls":0,"QCalls":0,"clockCaptureCalls":0,"CoreWrites":0,"signingCalls":0,"quantitativeQVerified":false,"permitsExecution":false,"acceptance":false}))?,1<<20)?;
 println!("{}",serde_json::to_string(&json!({"observations":report,"acceptance":false}))?);io::stdout().flush()?;Ok(())
}
fn main(){std::panic::set_hook(Box::new(|_|eprintln!("NATIVE_RESULT_PANIC_PRIVATE_DIAGNOSTICS_SUPPRESSED")));if (if std::env::args().nth(1).as_deref()==Some("controls"){controls::run()}else{run()}).is_err(){eprintln!("NATIVE_RESULT_NOT_READY_OR_REFUSED_NO_ACCEPTANCE_RETAINED_COMPLETION_IS_INDEPENDENT");std::process::exit(2)}}
