//! UNBUILT metadata-only controls for inclusion in the SAME native binary.
//! All fixture bodies are synthetic public source. Never guest::evaluate.
use crate::{derive,read_io::{self,Pin,Result,require,verified,verified_source},journal::Journal,completion,closure,record,HERE,GUEST};
use serde::Deserialize;
use serde_json::{json,Value as J};
use sha2::{Digest,Sha256};
use std::{collections::BTreeSet,path::{Path,PathBuf},cell::Cell};
const LANE:&str="${CONTINUITY_SOURCE_ROOT}/tmp/agent-state/20261007-r3_1-native-controls/v4/";
#[derive(Deserialize)]#[serde(deny_unknown_fields)]
struct Gate{schema:String,status:String,acceptance:bool,source_manifest:Pin,guest_source_manifest:Pin,actual_binary:Pin,actual_build_disposition:Pin,source_review:Pin,root_authority:Pin,plan:Pin,literal_oracle_plan:Pin,literal_oracle_source:Pin,case_pins:Vec<Pin>,maximum_group_attempts:usize,automatic_retry:bool,output_root:PathBuf}
#[derive(Clone,Debug,PartialEq,Deserialize)]#[serde(tag="kind",deny_unknown_fields)]
enum Expected{ALLOWED_METADATA,REFUSED_NATIVE_METADATA{code:String}}
#[derive(Clone,Copy,PartialEq,Deserialize)]enum Operation{InputSelection,ResultSelection,Canonical,DomainLiteral,Completed,PrefixLaterRefusal,PrefixSinkRefusal,JournalExclusive}
#[derive(Deserialize)]#[serde(deny_unknown_fields)]
struct Case{id:String,fixture:Pin,operation:Operation,expected:Expected}
#[derive(Deserialize)]#[serde(deny_unknown_fields)]
struct Plan{schema:String,status:String,acceptance:bool,scope:String,signed_guest_negatives:String,cases:Vec<Case>}
#[derive(Deserialize)]#[serde(deny_unknown_fields)]
struct Fixture{schema:String,id:String,scope:String,input:J,result:J,program:String,value:J,expected_canonical:J,expected_observation:J,expected_preimage:J}
fn names()->BTreeSet<String>{
 let mut ids:BTreeSet<String>=["INPUT_ALLOW_METADATA_ONLY","RESULT_ALLOW_METADATA_ONLY","INPUT_OLD_SCHEMA","INPUT_OLD_EDITION","INPUT_OLD_PROGRAM","RESULT_OLD_SCHEMA","RESULT_OLD_EDITION","RESULT_OLD_PROGRAM","OUTCOME_22_KEYS","OUTCOME_24_KEYS","NONZERO_ADMISSIONS","NONZERO_CHARGES","NONZERO_DISPATCHES","REQUEST_CALLER_ID","SOURCE_WRONG_LOGICAL_ID","DECISION_WRONG_OP_ID","HEAD_WRONG_POSITION","HEAD_WRONG_HASH","HEAD_WRONG_TIME","DIGEST_MALFORMED","DIGEST_WRONG_RECEIPT","DIGEST_WRONG_ORIGIN","DIGEST_WRONG_REFUSAL","DIGEST_WRONG_RELEASE","UTF8_LITERAL","NUL_STRING_LITERAL","SAFE_INTEGER_MAX","SAFE_INTEGER_MIN","UNSAFE_INTEGER_MAX","UNSAFE_INTEGER_MIN","FRACTIONAL_INTEGER","DOMAIN_NUL_LITERAL","DOMAIN_OLD_LITERAL","DOMAIN_MISSING_NUL_LITERAL","COMPLETED_LITERAL","PREFIX_BEFORE_CANONICAL_REFUSAL","FAILED_PREFIX_SUPPRESSES_NEXT","JOURNAL_EXCLUSIVE_NO_OVERWRITE"].into_iter().map(str::to_owned).collect();
 for field in ["orderClaimScope","limitDimension","coreCumulativeStatus","effectsScope"]{for variant in["MISSING","NULL","WRONG_TYPE","WRONG_VALUE"]{ids.insert(format!("SCOPE_{field}_{variant}"));}}
 for field in derive::BOOLS{for variant in["MISSING","NULL","WRONG_TYPE","WRONG_VALUE"]{ids.insert(format!("FLAG_{field}_{variant}"));}}ids
}
fn observe(result:Result<()>)->Expected{match result{Ok(())=>Expected::ALLOWED_METADATA,Err(e)=>Expected::REFUSED_NATIVE_METADATA{code:e.to_string()}}}
fn oracle(id:&str)->Result<(Operation,Expected)>{
 use Operation::*;
 let(op,code)=if id.starts_with("SCOPE_"){(ResultSelection,Some(if id.ends_with("_MISSING"){"CLOSED_OBJECT"}else{"NEGATIVE_OUTCOME_VALUES"}))}else if id.starts_with("FLAG_"){(ResultSelection,Some("RESULT_BOOLEAN_PRESENCE_TYPE_VALUE"))}else{match id{
  "INPUT_ALLOW_METADATA_ONLY"=>(InputSelection,None),"RESULT_ALLOW_METADATA_ONLY"=>(ResultSelection,None),
  "INPUT_OLD_SCHEMA"|"INPUT_OLD_EDITION"|"INPUT_OLD_PROGRAM"=>(InputSelection,Some("EXACT_SUCCESSOR_SELECTION")),
  "RESULT_OLD_SCHEMA"|"RESULT_OLD_EDITION"|"RESULT_OLD_PROGRAM"=>(ResultSelection,Some("RESULT_IDENTITY")),
  "OUTCOME_22_KEYS"|"OUTCOME_24_KEYS"=>(ResultSelection,Some("CLOSED_OBJECT")),
  "NONZERO_ADMISSIONS"|"NONZERO_CHARGES"|"NONZERO_DISPATCHES"=>(ResultSelection,Some("NEGATIVE_OUTCOME_VALUES")),
  "REQUEST_CALLER_ID"|"DECISION_WRONG_OP_ID"=>(ResultSelection,Some("PUBLISHED_SERVICE_OPERATION_ID")),
  "SOURCE_WRONG_LOGICAL_ID"=>(ResultSelection,Some("ACTUAL_SERVICE_PAIR_CENSUS")),
  "HEAD_WRONG_POSITION"=>(ResultSelection,Some("RESULT_CENSUS_NO_AUTHORITY")),
  "HEAD_WRONG_HASH"|"HEAD_WRONG_TIME"=>(ResultSelection,Some("EXACT_CAPTURED_HEAD")),
  "DIGEST_MALFORMED"=>(ResultSelection,Some("DIGEST_SHAPE")),
  "DIGEST_WRONG_RECEIPT"|"DIGEST_WRONG_ORIGIN"|"DIGEST_WRONG_REFUSAL"|"DIGEST_WRONG_RELEASE"=>(ResultSelection,Some("HISTORICAL_ENVELOPE_DIGESTS")),
  "UTF8_LITERAL"|"NUL_STRING_LITERAL"|"SAFE_INTEGER_MAX"|"SAFE_INTEGER_MIN"=>(Canonical,None),
  "UNSAFE_INTEGER_MAX"|"UNSAFE_INTEGER_MIN"|"FRACTIONAL_INTEGER"=>(Canonical,Some("CANONICAL_INTEGER")),
  "DOMAIN_NUL_LITERAL"=>(DomainLiteral,None),"DOMAIN_OLD_LITERAL"|"DOMAIN_MISSING_NUL_LITERAL"=>(DomainLiteral,Some("CONTROL_LITERAL_COMMITMENT_DIFFERENCE")),
  "COMPLETED_LITERAL"=>(Completed,None),"PREFIX_BEFORE_CANONICAL_REFUSAL"=>(PrefixLaterRefusal,Some("CANONICAL_INTEGER")),
  "FAILED_PREFIX_SUPPRESSES_NEXT"=>(PrefixSinkRefusal,Some("SYNTHETIC_RETENTION_FAILURE")),"JOURNAL_EXCLUSIVE_NO_OVERWRITE"=>(JournalExclusive,None),
  _=>return Err("CONTROL_UNSELECTED_ORACLE_ID".into()),
 }};Ok((op,match code{None=>Expected::ALLOWED_METADATA,Some(code)=>Expected::REFUSED_NATIVE_METADATA{code:code.to_owned()}}))
}
fn wire(e:&Expected)->J{match e{Expected::ALLOWED_METADATA=>json!({"kind":"ALLOWED_METADATA"}),Expected::REFUSED_NATIVE_METADATA{code}=>json!({"kind":"REFUSED_NATIVE_METADATA","code":code})}}
fn wrap(id:&str,observation:&J)->J{json!({"schema":"continuity.r3_1.native-control-helper-observation.v1","caseId":id,"scope":"SYNTHETIC_PUBLIC_METADATA_ONLY","actualProductionHelperObservation":observation,"guestEvaluations":0,"signatureVerifications":0,"QCalls":0,"proofCalls":0,"acceptance":false,"permitsExecution":false})}
fn perform(c:&Case,f:&Fixture,j:&mut Journal,case_root:&Path)->Result<()> {
 match c.operation {
  Operation::InputSelection=>derive::selected(&f.input,&f.program),
  Operation::ResultSelection=>derive::complete_before(&f.result,|v|completion(j,&wrap(&c.id,v)),||derive::result_selection(&f.result,&f.input,&f.program)),
  Operation::Canonical=>{let actual=derive::canonical(&f.value)?;require(f.expected_canonical.as_str()==Some(actual.as_str()),"CONTROL_LITERAL_CANONICAL_DIFFERENCE")},
  Operation::DomainLiteral=>{
   // crosscheck calls only guest::commitment on PUBLIC metadata; never evaluate.
   let(canonical,actual)=derive::crosscheck(&f.value)?;
   require(f.expected_canonical.as_str()==Some(canonical.as_str()),"CONTROL_LITERAL_CANONICAL_DIFFERENCE")?;
   let preimage=f.expected_preimage.as_str().ok_or("CONTROL_LITERAL_PREIMAGE_TYPE")?;
   let wanted:[u8;32]=Sha256::digest(preimage.as_bytes()).into();require(actual==wanted,"CONTROL_LITERAL_COMMITMENT_DIFFERENCE")
  },
  Operation::Completed=>{let actual=derive::completed(&f.result);completion(j,&wrap(&c.id,&actual))?;require(actual==f.expected_observation,"CONTROL_LITERAL_COMPLETED_DIFFERENCE")},
  Operation::PrefixLaterRefusal=>{
   let reached=Cell::new(false);let retained=Cell::new(false);
   let answer=derive::complete_before(&f.result,|v|{completion(j,&wrap(&c.id,v))?;retained.set(true);Ok(())},||{
    reached.set(true);require(retained.get(),"CONTROL_NEXT_BEFORE_RETENTION")?;
    // CASE_STARTED is event0; production completion must save event1 first.
    let path=case_root.join("EVENT-0001.json");let p=Pin{bytes:read_io::regular(&path)?.metadata()?.len(),path,sha256:format!("{:x}",Sha256::digest(serde_json::to_vec_pretty(&wrap(&c.id,&derive::completed(&f.result)))?))};
    let actual:J=read_io::json(&p,1<<20)?;require(actual==wrap(&c.id,&f.expected_observation),"CONTROL_PREFIX_DURABLE_OBSERVATION")?;
    // A genuine error returned by the production canonical helper AFTER prefix.
    derive::canonical(&f.value).map(|_|())
   });
   require(reached.get()&&retained.get(),"CONTROL_NEXT_NOT_REACHED")?;answer
  },
  Operation::PrefixSinkRefusal=>{
   let reached=Cell::new(false);let retained=Cell::new(false);
   let answer:Result<()>=derive::complete_before(&f.result,|v|{
    completion(j,&wrap(&c.id,v))?;retained.set(true);
    // Explicit synthetic sink refusal after actual fsynced retention; no disk
    // failure is invented. Production complete_before must suppress its next.
    Err("SYNTHETIC_RETENTION_FAILURE".into())
   },||{reached.set(true);Ok(())});
   require(retained.get()&&!reached.get(),"CONTROL_FAILED_SINK_CALLED_NEXT")?;answer
  },
  Operation::JournalExclusive=>{
   let pin=j.save("EXCLUSIVE.public.raw",b"literal-original",4096)?;
   require(j.save("EXCLUSIVE.public.raw",b"replacement",4096).is_err(),"CONTROL_OUTPUT_OVERWRITE_ADMITTED")?;
   require(read_io::bytes(&pin,4096)?.as_slice()==b"literal-original","CONTROL_OUTPUT_ORIGINAL_CHANGED")?;Ok(())
  },
 }
}
// Separate custody-role observations; these are not additional roster cases.
// Use only zero-byte Pins already admitted by the complete source closures.
fn source_role_observations(source_originals:&[Pin],journal:&mut Journal)->Result<()> {
 let empty:Vec<&Pin>=source_originals.iter().filter(|p|p.bytes==0).collect();
 require(empty.len()==33,"CONTROL_FROZEN_EMPTY_SOURCE_CENSUS")?;
 let mut observations=Vec::new();
 for p in empty{
  let public_actual=observe(verified_source(p).map(|_|()));
  let positive_actual=observe(verified(p).map(|_|()));
  let observation=json!({"schema":"continuity.r3_1.native-public-source-role-observation.v1","sourcePin":p,"publicSourceActual":wire(&public_actual),"positiveReaderActual":wire(&positive_actual),"scope":"ENROLLED_PUBLIC_SOURCE_CUSTODY_ONLY","privateBodiesRead":0,"guestEvaluations":0,"signatureVerifications":0,"captureCalls":0,"QCalls":0,"proofCalls":0,"acceptance":false,"permitsExecution":false});
  // Retain genuine outcomes before asserting the prospective source-role oracle.
  completion(journal,&observation)?;
  require(public_actual==Expected::ALLOWED_METADATA,"CONTROL_EMPTY_PUBLIC_SOURCE_REFUSED")?;
  require(positive_actual==(Expected::REFUSED_NATIVE_METADATA{code:"PIN_SIZE_BOUND".to_owned()}),"CONTROL_POSITIVE_READER_EMPTY_SOURCE_ADMITTED")?;
  observations.push(observation);
 }
 let artifact=journal.save("PUBLIC-SOURCE-ROLE-OBSERVATIONS.json",&serde_json::to_vec_pretty(&json!({"schema":"continuity.r3_1.native-public-source-role-observations.v1","sourceCount":observations.len(),"observations":observations,"rosterCaseCount":90,"rosterUnchanged":true,"scope":"ENROLLED_PUBLIC_SOURCE_CUSTODY_ONLY","rootEnrollmentRequired":true,"acceptance":false,"permitsExecution":false}))?,derive::MAX)?;
 completion(journal,&json!({"kind":"PUBLIC_SOURCE_ROLE_OBSERVATIONS_RETAINED","artifact":artifact,"sourceCount":33,"rosterUnchanged":true,"acceptance":false}))?;Ok(())
}
pub fn run()->Result<()> {
 let args:Vec<String>=std::env::args().collect();require(args.len()==6&&args[1]=="controls"&&args[2]=="--gate"&&args[4]=="--gate-sha256","CONTROL_EXACT_ARGUMENTS")?;
 let path=PathBuf::from(&args[3]);let gp=Pin{bytes:read_io::regular(&path)?.metadata()?.len(),path,sha256:args[5].clone()};let g:Gate=read_io::json(&gp,1<<20)?;
 require(g.schema=="continuity.r3_1.native-metadata-controls-gate.v1"&&g.status=="ROOT_AUTHORIZED_METADATA_CONTROLS_ONCE"&&!g.acceptance&&g.maximum_group_attempts==1&&!g.automatic_retry,"NOT_READY_METADATA_CONTROL_GATE")?;
 require(g.case_pins.len()==names().len()&&g.case_pins.iter().all(|p|p.bytes>0&&p.bytes<=1<<20&&p.path.starts_with(Path::new(LANE).join("fixtures"))),"CONTROL_BOUNDED_PUBLIC_CASE_PINS_BEFORE_READ")?;
 require(g.actual_binary.path==std::env::current_exe()?&&g.output_root==Path::new(LANE).join("runs/controls-01"),"CONTROL_SAME_BINARY_EXCLUSIVE_OUTPUT")?;
 require(g.source_manifest.path==Path::new(HERE).join("ROOT-SOURCE-CLOSURE.json")&&g.guest_source_manifest.path==Path::new(HERE).join("GUEST-SOURCE-CLOSURE.json"),"NOT_READY_ACTUAL_SOURCE_CLOSURES")?;
 let mut originals=vec![gp.clone(),g.source_manifest.clone(),g.guest_source_manifest.clone(),g.actual_binary.clone(),g.actual_build_disposition.clone(),g.source_review.clone(),g.root_authority.clone(),g.plan.clone(),g.literal_oracle_plan.clone(),g.literal_oracle_source.clone()];originals.extend(g.case_pins.iter().cloned());for p in &originals{let _=verified(p)?;}
 let native_required:Vec<PathBuf>=["src/main.rs","src/controls.rs","src/derive.rs","src/read_io.rs","src/journal.rs","Cargo.toml","Cargo.lock"].into_iter().map(|p|Path::new(HERE).join(p)).collect();
 let guest_required:Vec<PathBuf>=["src/lib.rs","src/common.rs","src/cadence.rs","src/exhaustion.rs","src/numeric_bridge.rs","src/counterparty.rs","src/mode_relation.rs","src/main.rs","Cargo.toml","Cargo.lock"].into_iter().map(|p|Path::new(GUEST).join(p)).collect();
 let mut source_originals=closure(&g.source_manifest,"NATIVE",&native_required)?;source_originals.extend(closure(&g.guest_source_manifest,"GUEST",&guest_required)?);
 let plan:Plan=read_io::json(&g.plan,1<<20)?;require(plan.schema=="continuity.r3_1.native-metadata-control-plan.v1"&&plan.status=="ROOT_SELECTED_PUBLIC_METADATA_CASES_ONCE"&&!plan.acceptance&&plan.scope=="SYNTHETIC_PUBLIC_METADATA_ONLY"&&plan.signed_guest_negatives=="SEPARATE_NOT_READY","CONTROL_EXACT_PLAN_SCOPE")?;
 let ids:BTreeSet<String>=plan.cases.iter().map(|c|c.id.clone()).collect();require(ids==names()&&ids.len()==plan.cases.len(),"CONTROL_EXACT_CASE_CENSUS_NO_SKIP")?;
 for c in &plan.cases{let(op,expected)=oracle(&c.id)?;require(c.operation==op&&c.expected==expected,"CONTROL_LITERAL_OPERATION_OUTCOME_ORACLE")?;}
 require(g.case_pins.len()==plan.cases.len()&&plan.cases.iter().zip(&g.case_pins).all(|(c,p)|c.fixture.path==p.path&&c.fixture.bytes==p.bytes&&c.fixture.sha256==p.sha256),"CONTROL_ORDERED_INDEPENDENT_CASE_PINS")?;
 let mut fixture_paths=BTreeSet::new();require(g.case_pins.iter().all(|p|p.path.starts_with(Path::new(LANE).join("fixtures"))&&fixture_paths.insert(p.path.clone())),"CONTROL_PUBLIC_FIXTURE_ROUTES")?;
 require(g.literal_oracle_plan.path==Path::new(LANE).join("LITERAL-ORACLE-PLAN.raw.json")&&g.literal_oracle_source.path==Path::new(LANE).join("LITERAL-ORACLE-SOURCE.raw.rs"),"CONTROL_LITERAL_ORACLE_SOURCE")?;
 let _=record(&g.actual_build_disposition,"continuity.r3_1.native-build-disposition.v1","ROOT_REVIEWED_SCOPED_ARTIFACT",json!({"artifact":g.actual_binary,"sourceManifest":g.source_manifest,"guestSourceManifest":g.guest_source_manifest,"sourceClosureReviewed":true}),&[])?;
 let binding=json!({"sourceManifest":g.source_manifest,"guestSourceManifest":g.guest_source_manifest,"actualBinary":g.actual_binary,"actualBuildDisposition":g.actual_build_disposition,"controlPlan":g.plan,"casePins":g.case_pins,"literalOraclePlan":g.literal_oracle_plan,"literalOracleSource":g.literal_oracle_source});
 let _=record(&g.source_review,"continuity.r3_1.native-metadata-controls-source-review.v1","ROOT_REVIEWED_ACTUAL_GUARDS_LITERAL_ORACLES",json!({"binding":binding,"unchangedEvaluatePath":true,"syntheticFixturesOnly":true,"signedGuestNegativesRemainRequired":true,"noProductionGuardChanges":true}),&[])?;
 let _=record(&g.root_authority,"continuity.r3_1.native-metadata-controls-authority.v1","ROOT_AUTHORIZED_METADATA_CONTROLS_ONCE",json!({"binding":binding,"maximumGroupAttempts":1,"automaticRetry":false,"guestEvaluationsAllowed":0,"captureCallsAllowed":0,"signingCallsAllowed":0,"QCallsAllowed":0,"proofCallsAllowed":0,"permitsExecution":false}),&[])?;
 // Do not consume a control-result disposition here: that would be circular.
 for p in &originals{let _=verified(p)?;}
 for p in &source_originals{let _=verified_source(p)?;}
 let mut journal=Journal::new(&g.output_root)?;
 journal.save("GROUP-RESERVATION.json",&serde_json::to_vec_pretty(&json!({"schema":"continuity.r3_1.native-metadata-controls-reservation.v1","binding":binding,"gate":gp,"nonrefundable":true,"retryAllowed":false,"maximumAttempts":1,"acceptance":false}))?,1<<20)?;
 source_role_observations(&source_originals,&mut journal)?;
 let mut outcomes=Vec::new();
 for c in &plan.cases{
  let f:Fixture=read_io::json(&c.fixture,1<<20)?;require(f.schema=="continuity.r3_1.synthetic-native-metadata-fixture.v1"&&f.id==c.id&&f.scope=="SYNTHETIC_PUBLIC_METADATA_ONLY","CONTROL_CLOSED_FIXTURE_IDENTITY")?;
  let case_root=g.output_root.join(&c.id);let mut j=Journal::new(&case_root)?;
  j.event(&json!({"kind":"CASE_STARTED","caseId":c.id,"fixture":c.fixture,"guestEvaluations":0,"syntheticMetadata":true,"acceptance":false}))?;
  let actual=match std::panic::catch_unwind(std::panic::AssertUnwindSafe(||perform(c,&f,&mut j,&case_root))){Ok(result)=>observe(result),Err(_)=>{
   let observation=json!({"kind":"CONTROL_UNEXPECTED_PANIC_STOP","caseId":c.id,"retryAllowed":false,"acceptance":false});let _=completion(&mut j,&observation);return Err("CONTROL_UNEXPECTED_PANIC_STOP".into());
  }};
  // Genuine returned helper outcome retained BEFORE oracle equality checks.
  let observation=json!({"schema":"continuity.r3_1.native-metadata-control-outcome.v1","caseId":c.id,"fixture":c.fixture,"actual":wire(&actual),"expected":wire(&c.expected),"scope":"SYNTHETIC_PUBLIC_METADATA_ONLY","guestEvaluations":0,"signatureVerifications":0,"QCalls":0,"proofCalls":0,"acceptance":false,"permitsExecution":false});completion(&mut j,&observation)?;
  require(actual==c.expected,"CONTROL_UNEXPECTED_OUTCOME_STOP_NO_RETRY")?;outcomes.push(observation);
 }
 for p in &originals{let _=verified(p)?;}
 for p in &source_originals{let _=verified_source(p)?;}
 let output=journal.save("METADATA-CONTROL-RESULT.json",&serde_json::to_vec_pretty(&json!({"schema":"continuity.r3_1.native-metadata-control-result.v1","status":"ACTUAL_METADATA_GUARDS_ALL_SELECTED_CASES_MATCHED","binding":binding,"gate":gp,"cases":outcomes,"caseCount":plan.cases.len(),"skippedCases":0,"guestEvaluations":0,"signatureVerifications":0,"captureCalls":0,"signingCalls":0,"QCalls":0,"proofCalls":0,"signedGuestNegatives":"SEPARATE_NOT_READY","rootEnrollmentRequired":true,"ownedCleanup":"ROOT_MUST_CONFIRM","acceptance":false,"proofAccepted":false,"quantitativeQVerified":false,"permitsExecution":false}))?,derive::MAX)?;
 completion(&mut journal,&json!({"kind":"METADATA_CONTROL_RESULT_RETAINED","artifact":output,"acceptance":false,"signedGuestNegatives":"SEPARATE_NOT_READY"}))?;Ok(())
}
