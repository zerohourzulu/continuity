//! UNBUILT concrete exclusive/fsynced metadata journal and permanent attempts.
use crate::{Fault,Result,require,Journal};
use crate::loader::{self,Pin};
use std::{collections::BTreeSet,fs::{self,File,OpenOptions},io::{Write,BufWriter},
 os::unix::fs::{DirBuilderExt,OpenOptionsExt},path::{Path,PathBuf}};
use serde_json::{json,Value as J};
use openvm_stark_backend::codec::Encode;
pub struct Durable {root:PathBuf,stage:String,owner:J,next:u32,fits:BTreeSet<(String,usize)>,reserved:BTreeSet<(String,usize)>}
fn closed(v:&J,ks:&[&str])->Result<()>{let o=v.as_object().ok_or(Fault::Stop("FIT_OBJECT"))?;require(o.len()==ks.len()&&ks.iter().all(|k|o.contains_key(*k)),"FIT_CLOSED_KEYS")}
fn receipt_keys(stage:&str)->Result<Vec<&'static str>>{
 let mut stark=vec!["schema","orderedHeights","effectiveLinearHeights","stackingWidths","totalStackedWidth","heldStackedWidth","lSkip","nStack","actualTraces","vkSha256","maxHeight","airConstraintEquality","fullConstraintsValidated","downstreamFit","permitsExecution"];
 match stage {
  "application"=>{stark.extend(["segmentIndex","inputSha256","expandedConfigSha256","segmentationMaxMemory"]);Ok(stark)},
  "inner"=>{stark.push("node");Ok(stark)},"root"=>Ok(stark),
  "application-closure"=>Ok(vec!["segments","selfVerified","downstreamFit","permitsExecution"]),
  "inner-closure"=>Ok(vec!["actualProofCount","internalRecursiveLayer","additionalFallbackWraps","selectedFinalInnerWraps","rootFit"]),
  "static"=>Ok(vec!["schema","adviceCells","lookupCells","columnLengths","gateUsedRows","usableRows","denseRequiredWitnessBytes","actualInstancesSha256","protocolSha256","templateReceiptSha256","placementChecked","fullConstraintsValidated","wrapperFit","permitsExecution"]),
  "wrapper"=>Ok(vec!["schema","recorder","semanticCircuitSha256","instancesSha256","convertedCsPinnedDebugSha256","actualLookupCounts","actualConstraintRecords","virtualMetadataLogicalEstimateBytes","constructionStage","accumulationSchemeProofs","outerProofsBeforeAdmission","actualFixedSelectorPermutationTemplateCompared","completeDomainTailsCompared","fullConstraintsValidated","gateConstraintSatisfaction","copyEqualityValueSatisfaction","lookupConstraintSatisfaction","permitsExecution"]),
  _=>Err(Fault::Stop("FIT_STAGE_UNSELECTED")),
 }
}
impl Durable {
 pub fn new(root:&Path,stage:&str,owner:J)->Result<Self>{
  require(root.is_absolute()&&root.components().all(|c|matches!(c,std::path::Component::RootDir|std::path::Component::Normal(_))),"OUTPUT_PATH")?;
  for p in root.parent().ok_or(Fault::Stop("OUTPUT_PARENT"))?.ancestors(){let m=loader::io(fs::symlink_metadata(p))?;require(m.is_dir()&&!m.file_type().is_symlink(),"OUTPUT_PARENT_SYMLINK")?;}
  loader::io(fs::DirBuilder::new().mode(0o700).create(root))?;
  loader::io(loader::io(File::open(root.parent().ok_or(Fault::Stop("OUTPUT_PARENT"))?))?.sync_all())?;
  let mut j=Self{root:root.to_owned(),stage:stage.to_owned(),owner,next:0,fits:BTreeSet::new(),reserved:BTreeSet::new()};
  // Before retained-proof verification, SDK constructors or any new crypto.
  j.reservation("owned-stage",0,None)?;Ok(j)
 }
 fn output_file(&self,name:&str)->Result<File>{require(!name.is_empty()&&!name.contains('/')&&name!="."&&name!="..","OUTPUT_NAME")?;loader::io(OpenOptions::new().write(true).create_new(true).mode(0o600).custom_flags(libc::O_NOFOLLOW).open(self.root.join(name)))}
 fn output_pin(&self,name:&str,cap:u64)->Result<Pin>{
  let path=self.root.join(name);let mut f=loader::regular(&path)?;let before=loader::io(f.metadata())?;require(before.len()>0&&before.len()<=cap,"OUTPUT_CAP")?;
  let sha256=loader::hash_file(&mut f,before.len())?;loader::stable(&before,&loader::io(f.metadata())?)?;Ok(Pin{path,bytes:before.len(),sha256})
 }
 pub fn save(&self,name:&str,raw:&[u8],cap:u64)->Result<Pin>{
  require(!raw.is_empty()&&raw.len()as u64<=cap,"OUTPUT_CAP")?;let mut f=self.output_file(name)?;loader::io(f.write_all(raw))?;loader::io(f.sync_all())?;
  loader::io(loader::io(File::open(&self.root))?.sync_all())?;let pin=self.output_pin(name,cap)?;require(pin.sha256==crate::hash(raw),"OUTPUT_READBACK")?;Ok(pin)
 }
 pub fn encode<T:Encode>(&self,name:&str,value:&T,cap:u64)->Result<Pin>{
  let f=self.output_file(name)?;let mut writer=Bounded{inner:BufWriter::new(f),cap,used:0};loader::io(value.encode(&mut writer))?;
  loader::io(writer.flush())?;loader::io(writer.inner.get_ref().sync_all())?;drop(writer);
  loader::io(loader::io(File::open(&self.root))?.sync_all())?;self.output_pin(name,cap)
 }
 pub fn event(&mut self,value:&J)->Result<Pin>{let name=format!("EVENT-{:04}.json",self.next);self.next=self.next.checked_add(1).ok_or(Fault::Stop("EVENT_COUNT_OVERFLOW"))?;
  let raw=serde_json::to_vec_pretty(value).map_err(|_|Fault::Stop("JOURNAL_ENCODING"))?;self.save(&name,&raw,1<<20)
 }
 /// Genuine source observations/faults reach BOTH raw logs and an attempted
 /// durable event before receipt guards, posthash or further stage work.
 pub fn prefix(&mut self,value:&J)->Result<()>{
  let raw=serde_json::to_vec(value).map_err(|_|Fault::Stop("PREFIX_ENCODING"))?;let mut log_failed=false;
  for mut stream in[Box::new(std::io::stdout())as Box<dyn Write>,Box::new(std::io::stderr())as Box<dyn Write>]{let attempt=(||->std::io::Result<()>{stream.write_all(&raw)?;stream.write_all(b"\n")?;stream.flush()})();if attempt.is_err(){log_failed=true;}}
  let event=self.event(value); // Attempt the event even if either raw log fails.
  if log_failed{return Err(Fault::Stop("PREFIX_LOG_WRITE_FAILED"));}event?;Ok(())
 }
 fn reservation(&mut self,operation:&str,index:usize,fit:Option<Pin>)->Result<()>{
  self.prefix(&json!({"schema":"continuity.r3_1.reservation-request-observation.v1","owner":self.owner,"selectedStage":self.stage,"operation":operation,"index":index,"fitReceipt":fit,"reservationState":"REQUESTED_UNCONFIRMED","reservationGuards":"NOT_YET_PERFORMED","durableReservationEstablished":false,"proofAccepted":false,"permitsExecution":false}))?;
  require(self.reserved.insert((operation.to_owned(),index)),"ATTEMPT_ALREADY_RESERVED")?;
  let v=json!({"schema":"continuity.r3_1.proof-attempt-reservation.v1","owner":self.owner,"selectedStage":self.stage,"operation":operation,"index":index,"fitReceipt":fit,"reserved":true,"nonrefundable":true,"refundAllowed":false,"automaticRetryAllowed":false,"proofAccepted":false,"permitsExecution":false});
  let name=format!("RESERVATION-{operation}-{index:04}.json");let raw=serde_json::to_vec_pretty(&v).map_err(|_|Fault::Stop("RESERVATION_ENCODING"))?;let retained=self.save(&name,&raw,1<<20)?;
  self.prefix(&json!({"schema":"continuity.r3_1.reservation-established-observation.v1","owner":self.owner,"selectedStage":self.stage,"operation":operation,"index":index,"durableReservation":retained,"durableReservationEstablished":true,"nonrefundable":true,"proofAccepted":false,"permitsExecution":false}))?;Ok(())
 }
 pub fn closure(&mut self,artifact:&Pin,self_verified:bool)->Result<Pin>{self.event(&json!({"schema":"continuity.r3_1.proof-stage-closure.v1","owner":self.owner,"stage":self.stage,"artifact":artifact,"selfVerified":self_verified,"freshIndependentFinalRequired":true,"proofAccepted":false,"quantitativeQVerified":false,"permitsExecution":false,"acceptance":false}))}
}
impl Journal for Durable {
 fn fit(&mut self,stage:&str,index:usize,receipt:&J)->Result<()>{
  self.prefix(&json!({"schema":"continuity.r3_1.module-fit-observation.v1","owner":self.owner,"stage":stage,"index":index,"actualSourceReceipt":receipt,"journalGuards":"NOT_YET_PERFORMED","proofAccepted":false,"permitsExecution":false}))?;
  closed(receipt,&receipt_keys(stage)?)?;
  require(match self.stage.as_str(){"application"=>stage.starts_with("application"),"root"=>matches!(stage,"inner"|"inner-closure"|"root"),"static"=>stage=="static","wrap"=>stage=="wrapper",_=>false},"FIT_SELECTED_STAGE")?;
  require(self.fits.insert((stage.to_owned(),index)),"FIT_ALREADY_RETAINED")?;
  let v=json!({"schema":"continuity.r3_1.proof-fit-receipt.v1","owner":self.owner,"selectedStage":self.stage,"stage":stage,"index":index,"actualSourceReceipt":receipt,"actualSourceReceiptSha256":crate::hash(&serde_json::to_vec(receipt).map_err(|_|Fault::Stop("FIT_ENCODING"))?),"disposition":"ACTUAL_CONTEXT_FIT_RETAINED","fullConstraintValidation":"NOT_PERFORMED","downstreamFit":"NOT_ESTABLISHED","proofAccepted":false,"permitsExecution":false});
  let raw=serde_json::to_vec_pretty(&v).map_err(|_|Fault::Stop("FIT_ENCODING"))?;let _=self.save(&format!("FIT-{stage}-{index:04}.json"),&raw,1<<20)?;Ok(())
 }
 fn reserve(&mut self,stage:&str,index:usize)->Result<()>{
  self.prefix(&json!({"schema":"continuity.r3_1.module-reservation-observation.v1","owner":self.owner,"selectedStage":self.stage,"actualRequestedOperation":stage,"index":index,"selectionAndFitGuards":"NOT_YET_PERFORMED","durableReservationEstablished":false,"proofAccepted":false,"permitsExecution":false}))?;
  let expected=match stage{"application-segment-proof" if self.stage=="application"=>Some("application"),"inner-proof" if self.stage=="root"=>Some("inner"),"root-proof" if self.stage=="root"=>Some("root"),"static-proof" if self.stage=="static"=>Some("static"),"wrapper-outer-proof" if self.stage=="wrap"=>Some("wrapper"),"wrapper-accumulation-scheme-proof" if self.stage=="wrap"&&index==0=>None,_=>return Err(Fault::Stop("PROOF_OPERATION_UNSELECTED"))};
  let fit=if let Some(kind)=expected{require(self.fits.contains(&(kind.to_owned(),index)),"FIT_REQUIRED_BEFORE_PROOF")?;Some(self.output_pin(&format!("FIT-{kind}-{index:04}.json"),1<<20)?)}else{None};
  self.reservation(stage,index,fit)
 }
}
struct Bounded<W>{inner:W,cap:u64,used:u64}
impl<W:Write>Write for Bounded<W>{
 fn write(&mut self,b:&[u8])->std::io::Result<usize>{let end=self.used.checked_add(b.len()as u64).ok_or_else(||std::io::Error::other("OUTPUT_CAP"))?;if end>self.cap{return Err(std::io::Error::other("OUTPUT_CAP"));}let n=self.inner.write(b)?;self.used+=n as u64;Ok(n)}
 fn flush(&mut self)->std::io::Result<()>{self.inner.flush()}
}
