//! UNBUILT: explicit pinned held-object loading. No SDK/lazy/setup accessor.
use crate::{Fault,Result,require};
use std::{collections::{BTreeMap,BTreeSet},ffi::CString,fs::{self,File},
 io::{self,Read,Seek,SeekFrom,BufReader,Take},os::{fd::{AsRawFd,FromRawFd},
 unix::{ffi::OsStrExt,fs::MetadataExt}},path::{Path,PathBuf}};
use serde::{Serialize,Deserialize,de::DeserializeOwned};
use sha2::{Digest,Sha256};
use openvm_stark_backend::{codec::Decode,StarkProtocolConfig};
use openvm_sdk::{config::AppConfig,types::AppExecutionCommit,F};
use openvm_sdk_config::SdkVmConfig;
use openvm_continuations::RootSC;
use halo2_base::halo2_proofs::{halo2curves::bn256::{Bn256,Fr,G1Affine,G2Affine},
 poly::{commitment::{Params,ParamsProver},kzg::commitment::ParamsKZG},SerdeFormat};
use snark_verifier_sdk::{Snark,PlonkVerifier,SHPLONK,halo2::{PoseidonTranscript,POSEIDON_SPEC},
 snark_verifier::{loader::native::NativeLoader,pcs::kzg::KzgDecidingKey,
 verifier::{SnarkVerifier,plonk::PlonkProtocol}}};
pub const INPUT_CAP:u64=16_776_192;
pub const OBJECT_CAP:u64=2u64<<30;
pub const STREAM_CAP:u64=64u64<<30;
pub const MATRIX:&str="r3_1-headroom-exhaustion-both";
pub const DOMAIN:&str="CONTINUITY-R3_1-APPLICATION-COMMITMENT-V1";
/// Option fields remain REQUIRED; only an explicit JSON null means None.
pub fn required_option<'de,D,T>(d:D)->std::result::Result<Option<T>,D::Error>where D:serde::Deserializer<'de>,T:Deserialize<'de>{Option::<T>::deserialize(d)}
pub fn io<T>(v:io::Result<T>)->Result<T>{v.map_err(|_|Fault::Stop("BOUNDED_IO_FAILED"))}
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq,Eq)]
#[serde(deny_unknown_fields)]
pub struct Pin {pub path:PathBuf,pub bytes:u64,pub sha256:String}
pub fn hex32(s:&str)->Result<[u8;32]>{
 require(s.len()==64&&s.bytes().all(|b|b.is_ascii_digit()||(b'a'..=b'f').contains(&b)),"DIGEST_ENCODING")?;
 let mut out=[0u8;32];for(i,v)in out.iter_mut().enumerate(){*v=u8::from_str_radix(&s[2*i..2*i+2],16).map_err(|_|Fault::Stop("DIGEST_ENCODING"))?;}Ok(out)
}
pub fn regular(path:&Path)->Result<File>{
 require(path.is_absolute(),"ABSOLUTE_PATH_REQUIRED")?;let parts:Vec<_>=path.components().collect();
 require(parts.len()>=2&&parts.iter().skip(1).all(|c|matches!(c,std::path::Component::Normal(_))),"PATH_COMPONENT_REFUSED")?;
 let root=CString::new("/").map_err(|_|Fault::Stop("PATH_ENCODING"))?;
 let raw=unsafe{libc::open(root.as_ptr(),libc::O_RDONLY|libc::O_DIRECTORY|libc::O_CLOEXEC)};
 if raw<0{return Err(Fault::Hold("NOT_READY_PIN_OPEN"));}let mut parent=unsafe{File::from_raw_fd(raw)};
 for(i,p)in parts.iter().enumerate().skip(1){let name=CString::new(p.as_os_str().as_bytes()).map_err(|_|Fault::Stop("PATH_ENCODING"))?;
  let flags=libc::O_RDONLY|libc::O_NOFOLLOW|libc::O_CLOEXEC|libc::O_NONBLOCK|if i+1<parts.len(){libc::O_DIRECTORY}else{0};
  let raw=unsafe{libc::openat(parent.as_raw_fd(),name.as_ptr(),flags)};if raw<0{return Err(Fault::Hold("NOT_READY_PIN_OPEN"));}parent=unsafe{File::from_raw_fd(raw)};
 }
 let m=io(parent.metadata())?;require(m.is_file()&&m.nlink()==1,"PIN_FILE_KIND")?;Ok(parent)
}
pub fn stable(a:&fs::Metadata,b:&fs::Metadata)->Result<()>{require(a.dev()==b.dev()&&a.ino()==b.ino()&&a.len()==b.len()&&a.mtime()==b.mtime()&&a.mtime_nsec()==b.mtime_nsec()&&a.ctime()==b.ctime()&&a.ctime_nsec()==b.ctime_nsec()&&b.nlink()==1,"PIN_CHANGED")}
pub fn hash_file(f:&mut File,expected:u64)->Result<String>{
 require(expected>0&&expected<=STREAM_CAP,"STREAM_SIZE_BOUND")?;let mut h=Sha256::new();let mut block=[0u8;1<<20];let mut left=expected;
 while left>0{let limit=left.min(block.len()as u64)as usize;let n=io(f.read(&mut block[..limit]))?;require(n>0,"PIN_PREMATURE_EOF")?;h.update(&block[..n]);left-=n as u64;}
 require(io(f.read(&mut[0u8;1]))?==0,"PIN_TRAILING_BYTES")?;Ok(format!("{:x}",h.finalize()))
}
pub fn verified(pin:&Pin)->Result<File>{
 let _=hex32(&pin.sha256)?;require(pin.bytes>0&&pin.bytes<=STREAM_CAP,"PIN_SIZE_BOUND")?;
 let mut f=regular(&pin.path)?;let before=io(f.metadata())?;require(before.len()==pin.bytes,"PIN_LENGTH_MISMATCH")?;
 require(hash_file(&mut f,pin.bytes)?==pin.sha256,"PIN_HASH_MISMATCH")?;stable(&before,&io(f.metadata())?)?;io(f.seek(SeekFrom::Start(0)))?;Ok(f)
}
/// Public source/runtime identity only. Private material readers retain positive sizes.
pub fn verified_public_source(pin:&Pin)->Result<File>{
 if pin.bytes>0{return verified(pin);}
 let _=hex32(&pin.sha256)?;
 let mut f=regular(&pin.path)?;let before=io(f.metadata())?;
 require(before.len()==0,"PUBLIC_SOURCE_LENGTH_MISMATCH")?;
 require(io(f.read(&mut[0u8;1]))?==0,"PUBLIC_SOURCE_EXACT_EOF")?;
 require(crate::hash(&[])==pin.sha256,"PUBLIC_SOURCE_HASH_MISMATCH")?;
 stable(&before,&io(f.metadata())?)?;io(f.seek(SeekFrom::Start(0)))?;Ok(f)
}
pub fn bytes(pin:&Pin,cap:u64)->Result<Vec<u8>>{
 require(pin.bytes<=cap,"BUFFER_CAP")?;let mut f=verified(pin)?;let before=io(f.metadata())?;
 let mut out=Vec::new();io(Read::by_ref(&mut f).take(pin.bytes).read_to_end(&mut out))?;
 require(out.len()as u64==pin.bytes&&io(f.read(&mut[0u8;1]))?==0,"BUFFER_EXACT_EOF")?;
 stable(&before,&io(f.metadata())?)?;require(crate::hash(&out)==pin.sha256,"BUFFER_PIN_CHANGED")?;Ok(out)
}
pub fn json<T:DeserializeOwned>(pin:&Pin,cap:u64)->Result<T>{serde_json::from_slice(&bytes(pin,cap)?).map_err(|_|Fault::Stop("CLOSED_JSON_DECODE"))}
pub fn object<T:DeserializeOwned>(pin:&Pin)->Result<T>{bitcode::deserialize(&bytes(pin,OBJECT_CAP)?).map_err(|_|Fault::Stop("BITCODE_DECODE"))}
pub fn streamed<T>(pin:&Pin,cap:u64,parse:impl FnOnce(&mut BufReader<Take<File>>)->io::Result<T>)->Result<T>{
 require(pin.bytes<=cap,"CODEC_CAP")?;let f=verified(pin)?;let before=io(f.metadata())?;
 let mut reader=BufReader::new(f.take(pin.bytes));let value=io(parse(&mut reader))?;
 require(io(reader.read(&mut[0u8;1]))?==0&&reader.get_ref().limit()==0,"CODEC_EXACT_EOF")?;
 let mut f=reader.into_inner().into_inner();stable(&before,&io(f.metadata())?)?;io(f.seek(SeekFrom::Start(0)))?;
 require(hash_file(&mut f,pin.bytes)?==pin.sha256,"CODEC_PIN_CHANGED")?;stable(&before,&io(f.metadata())?)?;Ok(value)
}
pub fn decoded<T:Decode>(pin:&Pin)->Result<T>{streamed(pin,STREAM_CAP,|r|T::decode(r))}
pub fn params(pin:&Pin,k:u32)->Result<ParamsKZG<Bn256>>{
 require(matches!(k,22|23),"SRS_PROFILE")?;
 let p=streamed(pin,STREAM_CAP,|r|{
  let mut header=[0u8;4];r.read_exact(&mut header)?;
  if u32::from_le_bytes(header)!=k{return Err(io::Error::other("SRS_HEADER_K_MISMATCH"));}
  // Validate the allocation-driving header before the held codec sees it.
  let mut joined=std::io::Cursor::new(header).chain(&mut *r);
  ParamsKZG::<Bn256>::read_custom(&mut joined,SerdeFormat::RawBytes)
 })?;
 require(p.k()==k,"SRS_DECODED_K")?;Ok(p)
}
pub fn shared_srs(a:&ParamsKZG<Bn256>,b:&ParamsKZG<Bn256>)->Result<()>{
 let n=a.get_g().len().min(b.get_g().len());require(n>0&&a.get_g()[..n]==b.get_g()[..n]&&a.g2()==b.g2()&&a.s_g2()==b.s_g2(),"SRS_SHARED_POWERS_AND_ANCHORS")
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Closure {pub schema:String,pub status:String,pub acceptance:bool,pub complete:bool,pub files:Vec<Pin>}
pub fn source_closure(pin:&Pin,required:&[PathBuf])->Result<Vec<Pin>>{
 let c:Closure=json(pin,16<<20)?;require(c.schema=="continuity.r3_1.proof-host-source-closure.v1"&&c.status=="ROOT_REVIEWED_COMPLETE_SOURCE_CLOSURE"&&!c.acceptance&&c.complete&&!c.files.is_empty()&&c.files.len()<=100000,"NOT_READY_SOURCE_CLOSURE")?;
 let mut paths=BTreeSet::new();for p in &c.files{require(p.path!=pin.path&&paths.insert(p.path.clone()),"SOURCE_CLOSURE_DUPLICATE_OR_SELF")?;let _=verified_public_source(p)?;}
 require(required.iter().all(|p|paths.contains(p)),"SOURCE_CLOSURE_MEMBER_MISSING")?;Ok(c.files)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Program {
 pub schema:String,pub status:String,pub acceptance:bool,pub program_id:String,
 pub source_closure:Pin,pub input:Pin,pub vmexe:Pin,pub held_config:Pin,pub held_init:Pin,
 pub app_pk:Pin,pub app_vk:Pin,pub held_inventory:Pin,pub execution:AppExecutionCommit,
 pub app_exe_commit:[u32;8],pub public_commitment_hex:String,pub commitment_domain:String,
 pub public_values_bytes:usize,pub app_vm_commit_unchanged:bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HeldInventory {pub schema:String,pub status:String,pub acceptance:bool,pub existing_objects_only:bool,pub files:BTreeMap<String,Pin>}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TraceSpec<C> {pub air_count:usize,pub max_height:usize,#[serde(deserialize_with="required_option")]pub exact_heights:Option<Vec<usize>>,pub cached_commitments:Vec<Option<Vec<C>>>}
impl<C> TraceSpec<C>{pub fn selected(self)->crate::stark_fit::TraceContract<C>{crate::stark_fit::TraceContract{air_count:self.air_count,max_height:self.max_height,exact_heights:self.exact_heights,cached_commitments:self.cached_commitments}}}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AppSpec {pub schema:String,pub program_binding:Pin,pub input:Pin,pub expanded_config:Pin,pub trace:TraceSpec<[F;8]>,pub max_segments:usize,pub segment_max_memory:usize}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NodeSpec {pub layer:usize,pub index:usize,pub children:usize,pub kind:String}
impl NodeSpec{pub fn selected(self)->Result<crate::aggregation::Node>{let kind=match self.kind.as_str(){"app"=>"app","standard-leaf"=>"standard-leaf","standard-internal"=>"standard-internal","recursive-self"=>"recursive-self","selected-final-inner-wrap"=>"selected-final-inner-wrap",_=>return Err(Fault::Stop("AGG_NODE_KIND"))};Ok(crate::aggregation::Node{layer:self.layer,index:self.index,children:self.children,kind})}}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AggSpec {pub schema:String,pub program_binding:Pin,pub retained_application:Pin,pub expected_aggregate_vk:Pin,pub num_children_leaf:usize,pub num_children_internal:usize,pub leaf:TraceSpec<[F;8]>,pub internal_for_leaf:TraceSpec<[F;8]>,pub recursive:TraceSpec<[F;8]>,pub recursive_self:TraceSpec<[F;8]>,pub selected_schedule:Vec<NodeSpec>,pub max_nodes:usize,pub max_recursive_depth:usize,pub final_inner_wraps:usize}
pub type RootDigest=<RootSC as StarkProtocolConfig>::Digest;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RootSpec {pub schema:String,pub program_binding:Pin,pub trace:TraceSpec<RootDigest>}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TemplateSpec {#[serde(deserialize_with="required_option")]pub receipt_sha256:Option<String>,pub protocol_sha256:String,pub vk_bytes_sha256:String,pub config_sha256:String,pub breakpoints_sha256:String,pub source_closure_sha256:String,#[serde(deserialize_with="required_option")]pub special_lookup_correspondence_sha256:Option<String>}
impl TemplateSpec{pub fn selected(self)->crate::TemplateContract{crate::TemplateContract{receipt_sha256:self.receipt_sha256,protocol_sha256:self.protocol_sha256,vk_bytes_sha256:self.vk_bytes_sha256,config_sha256:self.config_sha256,breakpoints_sha256:self.breakpoints_sha256,source_closure_sha256:self.source_closure_sha256,special_lookup_correspondence_sha256:self.special_lookup_correspondence_sha256}}}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StaticSpec {pub schema:String,pub program_binding:Pin,pub retained_root:Pin,pub template:TemplateSpec,pub template_correspondence:Pin,pub expected_instances:Pin,pub max_advice_bytes:usize,pub max_tape_cells:usize,pub root_log_heights:Vec<usize>}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WrapSpec {pub schema:String,pub program_binding:Pin,pub retained_static:Pin,pub template:TemplateSpec,pub static_instances:Pin,pub max_virtual_advice_cells:usize,pub max_virtual_lookup_cells:usize,pub max_virtual_constraint_records:usize,pub max_virtual_metadata_bytes:usize,pub max_recorder_events:usize,pub max_selector_cells:usize,pub max_permutation_touch_cells:usize,pub max_recorder_structural_bytes:usize}
pub fn config(pin:&Pin)->Result<AppConfig<SdkVmConfig>>{toml::from_str(std::str::from_utf8(&bytes(pin,1<<20)?).map_err(|_|Fault::Stop("CONFIG_UTF8"))?).map_err(|_|Fault::Stop("HELD_CONFIG_DECODE"))}
pub fn static_values(v:&[Vec<Fr>],commit:&AppExecutionCommit,pvs:&[u8;32])->Result<()>{
 use halo2_base::halo2_proofs::halo2curves::ff::PrimeField;
 require(v.len()==1&&v[0].len()==34,"STATIC_INSTANCE_SHAPE")?;
 for(i,c)in[commit.app_exe_commit,commit.app_vm_commit].iter().enumerate(){let mut b=v[0][i].to_repr();b.as_mut().reverse();require(b.as_ref()==c.as_slice(),"STATIC_COMMITMENT_VALUE")?;}
 require(v[0][2..].iter().zip(pvs).all(|(a,b)|*a==Fr::from(*b as u64)),"STATIC_FULL_FIELD_PV32")
}
pub fn verify_static(snark:&Snark,protocol:&PlonkProtocol<G1Affine>,anchors:&(G1Affine,G2Affine,G2Affine),program:&Program)->Result<()>{
 crate::identical(&snark.protocol,protocol,"STATIC_PROTOCOL_MISMATCH")?;
 static_values(&snark.instances,&program.execution,&hex32(&program.public_commitment_hex)?)?;
 let dk=KzgDecidingKey::<Bn256>::new(anchors.0,anchors.1,anchors.2);let mut cursor=std::io::Cursor::new(snark.proof.as_slice());
 let mut transcript=PoseidonTranscript::<NativeLoader,_>::from_spec(&mut cursor,POSEIDON_SPEC.clone());
 let proof=<PlonkVerifier<SHPLONK>as SnarkVerifier<G1Affine,NativeLoader>>::read_proof(&dk,protocol,&snark.instances,&mut transcript).map_err(|_|Fault::Stop("STATIC_PROOF_READ_FAILED"))?;
 <PlonkVerifier<SHPLONK>as SnarkVerifier<G1Affine,NativeLoader>>::verify(&dk,protocol,&snark.instances,&proof).map_err(|_|Fault::Stop("STATIC_FULL_PAIRING_FAILED"))?;
 drop(transcript);require(cursor.position()==snark.proof.len()as u64,"STATIC_PROOF_EXACT_EOF")
}
