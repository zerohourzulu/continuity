//! UNBUILT concrete successor stage CLI. Each invocation selects ONE stage.
//! Include unchanged sibling public fit/proof modules; Root owns integration.
#[path="${CONTINUITY_SOURCE_ROOT}/tmp/agent-state/20261007-r3_1-uncapped-root/v1/proof-host-v5/src/lib.rs"]mod host;
pub use host::{application,aggregation,stark_fit,static_fit,placement,permutation_fit,wrapper,
 Fault,Result,require,hash,encoded,identical,Journal,TemplateContract,guarded,fail};
mod loader;
mod journal;
use loader::{Pin,Program};
use std::{collections::BTreeMap,io::Write,path::{Path,PathBuf},sync::Arc};
use serde::Deserialize;
use serde_json::{json,Value as J};
use openvm_sdk::{keygen::{AppProvingKey,AppVerifyingKey,AggProvingKey,RootProvingKey},
 prover::{AggProver,RootProver,verify_app_proof_with_expected_exe_commit},
 config::AggregationTreeConfig,openvm_circuit::arch::{instructions::exe::VmExe,ContinuationVmProof},
 types::EvmProof,DefaultStarkEngine,Sdk,F,SC};
use openvm_sdk_config::SdkVmConfig;
use openvm_verify_stark_host::vk::VmStarkVerifyingKey;
use openvm_stark_backend::keygen::types::MultiStarkVerifyingKey;
use openvm_static_verifier::{StaticVerifierProvingKey,Halo2WrapperProvingKey};
use p3_field::PrimeCharacteristicRing;
use halo2_base::halo2_proofs::{halo2curves::bn256::{Fr,G1Affine,G2Affine},
 poly::commitment::{Params,ParamsProver}};
use snark_verifier_sdk::{Snark,snark_verifier::verifier::plonk::PlonkProtocol};
const HERE:&str="${CONTINUITY_SOURCE_ROOT}/tmp/agent-state/20261007-r3_1-uncapped-root/v1/proof-loader-v5/";
const SIBLING:&str="${CONTINUITY_SOURCE_ROOT}/tmp/agent-state/20261007-r3_1-uncapped-root/v1/proof-host-v5/";
const MATERIALS:[&str;21]=["input","vmexe","held-config","held-init","app-pk","app-vk","agg-pk","aggregate-vk","leaf-vk","internal-for-leaf-vk","recursive-vk","root-pk","root-vk","static-pk","static-vk","static-protocol","static-anchors","wrapper-pk","wrapper-vk","srs22","srs23"];
const CONTRACTS:[&str;5]=["application","aggregation","root","static","wrap"];
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Gate {
 schema:String,status:String,acceptance:bool,stage:String,matrix_id:String,mode:String,predicate:String,
 threads:usize,rss_limit_bytes:u64,segment_max_memory:usize,#[serde(deserialize_with="loader::required_option")]wall_termination_limit:Option<u64>,
 maximum_stage_attempts:usize,automatic_retry:bool,source_closure:Pin,actual_binary:Pin,
 root_authority:Pin,source_review:Pin,build_disposition:Pin,control_plan:Pin,control_result:Pin,controls_disposition:Pin,
 feature_disposition:Pin,resource_enrollment:Pin,held_inventory:Pin,program_binding:Pin,
 materials:BTreeMap<String,Pin>,contracts:BTreeMap<String,Pin>,#[serde(deserialize_with="loader::required_option")]previous_checkpoint:Option<Pin>,
 #[serde(deserialize_with="loader::required_option")]retained_artifact:Option<Pin>,output_root:PathBuf,
}
fn pin<'a>(g:&'a Gate,k:&str)->Result<&'a Pin>{g.materials.get(k).ok_or(Fault::Hold("NOT_READY_MATERIAL_PIN"))}
fn contract<'a>(g:&'a Gate,k:&str)->Result<&'a Pin>{g.contracts.get(k).ok_or(Fault::Hold("NOT_READY_CONTRACT_PIN"))}
fn closed(v:&J,ks:&[&str])->Result<()>{let o=v.as_object().ok_or(Fault::Stop("ROOT_RECORD_OBJECT"))?;require(o.len()==ks.len()&&ks.iter().all(|k|o.contains_key(*k)),"ROOT_RECORD_CLOSED_KEYS")}
fn root_record(pin:&Pin,schema:&str,status:&str,fields:J)->Result<()> {
 let value:J=loader::json(pin,1<<20)?;let o=fields.as_object().ok_or(Fault::Stop("ROOT_RECORD_SHAPE"))?;
 let mut keys:Vec<&str>=o.keys().map(String::as_str).collect();keys.extend(["schema","status","acceptance"]);closed(&value,&keys)?;
 require(value["schema"]==schema&&value["status"]==status&&value["acceptance"].as_bool()==Some(false)&&o.iter().all(|(k,v)|value.get(k)==Some(v)),"NOT_READY_ROOT_RECORD_BINDING")
}
fn source_members()->Vec<PathBuf>{
 let mut files:Vec<PathBuf>=["src/main.rs","src/loader.rs","src/journal.rs","Cargo.toml","Cargo.lock"].iter().map(|p|Path::new(HERE).join(p)).collect();
 files.extend(["src/lib.rs","src/application.rs","src/aggregation.rs","src/stark_fit.rs","src/static_fit.rs","src/wrapper.rs","src/placement.rs","src/permutation_fit.rs"].iter().map(|p|Path::new(SIBLING).join(p)));files
}
fn program(g:&Gate)->Result<Program>{
 let p:Program=loader::json(&g.program_binding,1<<20)?;
 require(p.schema=="continuity.r3_1.proof-host-program-binding.v1"&&p.status=="ROOT_REVIEWED_NEW_EXE_HELD_VM_PV32"&&!p.acceptance&&p.source_closure==g.source_closure&&p.held_inventory==g.held_inventory&&p.input==*pin(g,"input")?&&p.vmexe==*pin(g,"vmexe")?&&p.held_config==*pin(g,"held-config")?&&p.held_init==*pin(g,"held-init")?&&p.app_pk==*pin(g,"app-pk")?&&p.app_vk==*pin(g,"app-vk")?&&p.commitment_domain==loader::DOMAIN&&p.public_values_bytes==32&&p.app_vm_commit_unchanged,"NOT_READY_PROGRAM_HELD_BINDING")?;
 let _=loader::hex32(&p.program_id)?;let _=loader::hex32(&p.public_commitment_hex)?;
 require(p.app_exe_commit.iter().all(|n|*n<2_013_265_921)&&openvm_continuations::CommitBytes::from(p.app_exe_commit)==p.execution.app_exe_commit,"INDEPENDENT_NEW_EXE_COMMITMENT")?;Ok(p)
}
fn previous(g:&Gate)->Result<()> {
 let expected=match g.stage.as_str(){"application"=>{require(g.previous_checkpoint.is_none()&&g.retained_artifact.is_none(),"APPLICATION_HAS_NO_RETAINED_PROOF")?;return Ok(())},"root"=>"application","static"=>"root","wrap"=>"static",_=>return Err(Fault::Stop("STAGE_UNSELECTED"))};
 let p=g.previous_checkpoint.as_ref().ok_or(Fault::Hold("NOT_READY_PREVIOUS_CHECKPOINT"))?;let artifact=g.retained_artifact.as_ref().ok_or(Fault::Hold("NOT_READY_RETAINED_ARTIFACT"))?;
 require(artifact.bytes<=if g.stage=="wrap"{16u64<<20}else{loader::OBJECT_CAP},"RETAINED_STAGE_ARTIFACT_CAP")?;
 let v:J=loader::json(p,1<<20)?;closed(&v,&["schema","owner","stage","artifact","selfVerified","freshIndependentFinalRequired","proofAccepted","quantitativeQVerified","permitsExecution","acceptance"])?;
 require(v["schema"]=="continuity.r3_1.proof-stage-closure.v1"&&v["stage"]==expected&&v["artifact"]==serde_json::to_value(artifact).map_err(|_|Fault::Stop("PIN_ENCODING"))?&&v["selfVerified"].as_bool()==Some(true)&&v["freshIndependentFinalRequired"].as_bool()==Some(true)&&["proofAccepted","quantitativeQVerified","permitsExecution","acceptance"].iter().all(|k|v[*k].as_bool()==Some(false)),"PREVIOUS_CLOSURE_BINDING")?;
 for(k,p)in[("sourceClosure",&g.source_closure),("actualBinary",&g.actual_binary),("programBinding",&g.program_binding),("heldInventory",&g.held_inventory),("input",pin(g,"input")?)]{require(v["owner"][k]==serde_json::to_value(p).map_err(|_|Fault::Stop("PIN_ENCODING"))?,"PREVIOUS_OWNER_LINEAGE")?;}
 let _=loader::verified(artifact)?;Ok(())
}
fn environment(g:&Gate)->Result<()> {
 require(std::env::var_os("RANDOM_SRS").is_none(),"RANDOM_SRS_REFUSED")?;
 require(g.threads==15&&g.rss_limit_bytes==64u64<<30&&g.segment_max_memory==2usize<<30&&g.wall_termination_limit.is_none(),"UNCHANGED_RESOURCE_PROFILE")?;
 // This explicit pool initialization is not an SDK key/SRS lazy global.
 std::env::set_var("RAYON_NUM_THREADS","15");std::env::set_var("GRAPH_EXE_THREADS","15");
 rayon::ThreadPoolBuilder::new().num_threads(15).build_global().map_err(|_|Fault::Stop("THREAD_POOL_INITIALIZATION_FAILED"))?;Ok(())
}
fn application_stage(g:&Gate,p:&Program,j:&mut journal::Durable,originals:&mut Vec<Pin>)->Result<Pin>{
 let spec:loader::AppSpec=loader::json(contract(g,"application")?,4<<20)?;
 require(spec.schema=="continuity.r3_1.application-fit-selection.v1"&&spec.program_binding==g.program_binding&&spec.input==*pin(g,"input")?&&spec.segment_max_memory==g.segment_max_memory&&spec.max_segments>0,"APPLICATION_INDEPENDENT_CONTRACT")?;
 originals.push(spec.expanded_config.clone());
 let expanded:openvm_sdk::config::AppConfig<SdkVmConfig>=loader::object(&spec.expanded_config)?;
 identical(&expanded,&loader::config(pin(g,"held-config")?)?,"HELD_EXPANDED_CONFIG_MISMATCH")?;
 let mut pk:AppProvingKey<SdkVmConfig>=loader::object(pin(g,"app-pk")?)?;let vk:AppVerifyingKey=loader::object(pin(g,"app-vk")?)?;
 require(pk.vm_config().deferral.is_none()&&vk.num_user_pvs==32,"APP_PROFILE")?;
 let inner=Arc::get_mut(&mut pk.app_vm_pk).ok_or(Fault::Stop("APP_KEY_SHARED_BEFORE_SEGMENT_PROFILE"))?;
 inner.vm_config.system.config.set_segmentation_max_memory(g.segment_max_memory);
 let exe:VmExe<F>=loader::object(pin(g,"vmexe")?)?;let raw=loader::bytes(pin(g,"input")?,loader::INPUT_CAP)?;
 let selected=application::ApplicationContract{expanded_config:expanded,execution_commit:p.app_exe_commit.map(F::from_u32),public_result:loader::hex32(&p.public_commitment_hex)?,trace:spec.trace.selected(),max_segments:spec.max_segments,segment_max_memory:spec.segment_max_memory,frozen_input_sha256:pin(g,"input")?.sha256.clone()};
 let proof=application::prove_once(&pk,&vk,Arc::new(exe),&raw,&selected,j)?;
 let raw=bitcode::serialize(&proof).map_err(|_|Fault::Stop("APP_PROOF_ENCODING"))?;j.save("private-app.proof",&raw,loader::OBJECT_CAP)
}
fn root_stage(g:&Gate,p:&Program,j:&mut journal::Durable,originals:&mut Vec<Pin>)->Result<Pin>{
 let retained=g.retained_artifact.as_ref().ok_or(Fault::Hold("NOT_READY_APPLICATION_PROOF"))?;
 let app:ContinuationVmProof<SC>=loader::object(retained)?;let app_vk:AppVerifyingKey=loader::object(pin(g,"app-vk")?)?;
 verify_app_proof_with_expected_exe_commit::<DefaultStarkEngine>(&app_vk,&app,Some(p.app_exe_commit.map(F::from_u32))).map_err(|_|Fault::Stop("RETAINED_APP_VERIFICATION_FAILED"))?;
 let pv=loader::hex32(&p.public_commitment_hex)?;require(app_vk.num_user_pvs==32&&app.user_public_values.public_values.len()==32&&app.user_public_values.public_values.iter().zip(pv).all(|(a,b)|*a==F::from_u8(b)),"RETAINED_APP_PV32")?;
 let spec:loader::AggSpec=loader::json(contract(g,"aggregation")?,16<<20)?;let rs:loader::RootSpec=loader::json(contract(g,"root")?,4<<20)?;
 require(spec.schema=="continuity.r3_1.aggregation-fit-selection.v1"&&rs.schema=="continuity.r3_1.root-fit-selection.v1"&&spec.program_binding==g.program_binding&&rs.program_binding==g.program_binding&&spec.retained_application==*retained,"ROOT_INDEPENDENT_CONTRACTS")?;
 let held_vk:VmStarkVerifyingKey=loader::object(pin(g,"aggregate-vk")?)?;
 originals.push(spec.expected_aggregate_vk.clone());
 // The existing aggregate VK stays unchanged. A NEW independently pinned
 // metadata envelope may bind its same MVK to the prospective app_exe commit.
 let expected_vk:VmStarkVerifyingKey=loader::object(&spec.expected_aggregate_vk)?;
 identical(&held_vk.mvk,&expected_vk.mvk,"AGGREGATE_HELD_MVK_CHANGED")?;
 let mut permitted_baseline=held_vk.baseline.clone();permitted_baseline.app_exe_commit=p.app_exe_commit.map(F::from_u32);
 identical(&permitted_baseline,&expected_vk.baseline,"AGGREGATE_BASELINE_CHANGED_BEYOND_NEW_EXE")?;
 require(expected_vk.baseline.expected_def_hook_commit.is_none()&&expected_vk.baseline.num_user_pvs==32&&expected_vk.baseline.app_exe_commit==p.app_exe_commit.map(F::from_u32),"AGGREGATE_NEW_EXE_HELD_PROFILE")?;
 identical(&expected_vk.baseline.memory_dimensions,&app_vk.memory_dimensions,"AGGREGATE_HELD_MEMORY_DIMENSIONS")?;
 let key:AggProvingKey=loader::object(pin(g,"agg-pk")?)?;
 let leaf:MultiStarkVerifyingKey<SC>=loader::object(pin(g,"leaf-vk")?)?;let internal:MultiStarkVerifyingKey<SC>=loader::object(pin(g,"internal-for-leaf-vk")?)?;let recursive:MultiStarkVerifyingKey<SC>=loader::object(pin(g,"recursive-vk")?)?;
 identical(&key.prefix.leaf.get_vk(),&leaf,"LEAF_HELD_VK")?;identical(&key.prefix.internal_for_leaf.get_vk(),&internal,"INTERNAL_FOR_LEAF_HELD_VK")?;identical(&key.internal_recursive.get_vk(),&recursive,"RECURSIVE_HELD_VK")?;identical(&recursive,&held_vk.mvk,"HELD_AGGREGATE_RECURSIVE_VK")?;
 let agg=AggProver::from_pk(Arc::new(app_vk.vk.clone()),key,AggregationTreeConfig{num_children_leaf:spec.num_children_leaf,num_children_internal:spec.num_children_internal},None);
 // Strict actual held VK-chain and VM identity checks happen BEFORE the
 // first inner proof. A producer declaration or post-proof rejection is insufficient.
 identical(&agg.leaf_prover.get_vk_commit(false),&expected_vk.baseline.app_vk_commit,"APP_HELD_VK_COMMIT_BEFORE_INNER")?;
 identical(&agg.internal_for_leaf_prover.get_vk_commit(false),&expected_vk.baseline.leaf_vk_commit,"LEAF_HELD_VK_COMMIT_BEFORE_INNER")?;
 identical(&agg.internal_recursive_prover.get_vk_commit(false),&expected_vk.baseline.internal_for_leaf_vk_commit,"INTERNAL_FOR_LEAF_HELD_VK_COMMIT_BEFORE_INNER")?;
 identical(&agg.internal_recursive_prover.get_vk_commit(true),&expected_vk.baseline.internal_recursive_vk_commit,"RECURSIVE_HELD_VK_COMMIT_BEFORE_INNER")?;
 let actual_vm_commit:openvm_continuations::CommitBytes=agg.vm_or_hook_commit().into();
 require(actual_vm_commit==p.execution.app_vm_commit,"HELD_VM_COMMIT_BEFORE_INNER")?;
 let selected=aggregation::AggregationContract{leaf:aggregation::LayerContract{vk:leaf,trace:spec.leaf.selected()},internal_for_leaf:aggregation::LayerContract{vk:internal,trace:spec.internal_for_leaf.selected()},recursive:aggregation::LayerContract{vk:recursive.clone(),trace:spec.recursive.selected()},recursive_self:aggregation::LayerContract{vk:recursive,trace:spec.recursive_self.selected()},selected_schedule:spec.selected_schedule.into_iter().map(loader::NodeSpec::selected).collect::<Result<Vec<_>>>()?,max_nodes:spec.max_nodes,max_recursive_depth:spec.max_recursive_depth,final_inner_wraps:spec.final_inner_wraps};
 let(carrier,_metadata)=aggregation::prove_inner_once(&agg,app,&selected,j)?;
 Sdk::verify_proof(expected_vk.mvk.clone(),expected_vk.baseline.clone(),&carrier).map_err(|_|Fault::Stop("INNER_SELF_VERIFICATION_FAILED"))?;
 require(carrier.user_pvs_proof.public_values.len()==32&&carrier.user_pvs_proof.public_values.iter().zip(pv).all(|(a,b)|*a==F::from_u8(b)),"INNER_FULL_FIELD_PV32")?;
 let key:RootProvingKey=loader::object(pin(g,"root-pk")?)?;let vk:retained::RootVk=loader::object(pin(g,"root-vk")?)?;
 identical(&key.root_pk.get_vk(),&vk,"ROOT_HELD_VK")?;
 let recursive_commit=agg.internal_recursive_prover.get_self_vk_pcs_data().ok_or(Fault::Hold("RECURSIVE_SELF_COMMIT_UNAVAILABLE"))?.commitment.into();
 let root=RootProver::from_pk(agg.internal_recursive_prover.get_vk(),recursive_commit,key.root_pk,app_vk.memory_dimensions,32,None,Some(key.trace_heights));
 let trace=rs.trace.selected();let proof=aggregation::prove_root_once(&root,carrier,&vk,&trace,j)?;
 retained::verify_root(&proof,&vk,&p.execution,&pv).map_err(|_|Fault::Stop("ROOT_SELF_VERIFICATION_FAILED"))?;
 j.encode("root.proof",&proof,loader::OBJECT_CAP)
}
fn static_stage(g:&Gate,p:&Program,j:&mut journal::Durable,originals:&mut Vec<Pin>)->Result<Pin>{
 let saved=g.retained_artifact.as_ref().ok_or(Fault::Hold("NOT_READY_ROOT_PROOF"))?;let root:retained::RootProof=loader::decoded(saved)?;
 let vk:retained::RootVk=loader::object(pin(g,"root-vk")?)?;retained::verify_root(&root,&vk,&p.execution,&loader::hex32(&p.public_commitment_hex)?).map_err(|_|Fault::Stop("RETAINED_ROOT_VERIFICATION_FAILED"))?;
 let spec:loader::StaticSpec=loader::json(contract(g,"static")?,4<<20)?;
 require(spec.schema=="continuity.r3_1.static-fit-selection.v1"&&spec.program_binding==g.program_binding&&spec.retained_root==*saved&&spec.template.source_closure_sha256==g.source_closure.sha256&&spec.template.vk_bytes_sha256==pin(g,"static-vk")?.sha256,"STATIC_INDEPENDENT_CONTRACT")?;
 require(spec.template.receipt_sha256.as_deref()==Some(spec.template_correspondence.sha256.as_str()),"STATIC_TEMPLATE_RECEIPT_IDENTITY")?;
 root_record(&spec.template_correspondence,"continuity.r3_1.static-held-template-correspondence.v1","ROOT_REVIEWED_ACTUAL_HELD_TEMPLATE_CORRESPONDENCE",json!({"sourceClosure":g.source_closure,"heldInventory":g.held_inventory,"staticPk":pin(g,"static-pk")?,"staticVk":pin(g,"static-vk")?,"staticProtocol":pin(g,"static-protocol")?,"configSha256":spec.template.config_sha256,"breakpointsSha256":spec.template.breakpoints_sha256,"heldTemplateCorrespondenceReviewed":true}))?;
 originals.extend([spec.template_correspondence.clone(),spec.expected_instances.clone()]);
 let instances:Vec<Vec<Fr>>=loader::object(&spec.expected_instances)?;loader::static_values(&instances,&p.execution,&loader::hex32(&p.public_commitment_hex)?)?;
 let protocol:PlonkProtocol<G1Affine>=loader::object(pin(g,"static-protocol")?)?;let anchors:(G1Affine,G2Affine,G2Affine)=loader::object(pin(g,"static-anchors")?)?;
 let pk:StaticVerifierProvingKey=loader::decoded(pin(g,"static-pk")?)?;let params=loader::params(pin(g,"srs22")?,22)?;
 require(params.get_g().first()==Some(&anchors.0)&&params.g2()==anchors.1&&params.s_g2()==anchors.2,"STATIC_INDEPENDENT_SRS_ANCHORS")?;
 let selected=static_fit::StaticContract{template:spec.template.selected(),expected_instances:instances,held_protocol:protocol.clone(),held_g1:anchors.0,max_advice_bytes:spec.max_advice_bytes,max_tape_cells:spec.max_tape_cells,root_log_heights:spec.root_log_heights};
 let snark=static_fit::prove_once(&pk,&params,&root,&selected,15,j)?;
 // Full native pairing verification, not just accumulator/protocol matching.
 loader::verify_static(&snark,&protocol,&anchors,p)?;
 let raw=bitcode::serialize(&snark).map_err(|_|Fault::Stop("STATIC_SNARK_ENCODING"))?;j.save("static.snark",&raw,16<<20)
}
fn wrapper_stage(g:&Gate,p:&Program,j:&mut journal::Durable,originals:&mut Vec<Pin>)->Result<Pin>{
 let saved=g.retained_artifact.as_ref().ok_or(Fault::Hold("NOT_READY_STATIC_SNARK"))?;let snark:Snark=loader::object(saved)?;
 let protocol:PlonkProtocol<G1Affine>=loader::object(pin(g,"static-protocol")?)?;let anchors:(G1Affine,G2Affine,G2Affine)=loader::object(pin(g,"static-anchors")?)?;
 loader::verify_static(&snark,&protocol,&anchors,p)?;
 let spec:loader::WrapSpec=loader::json(contract(g,"wrap")?,4<<20)?;
 require(spec.schema=="continuity.r3_1.wrapper-fit-selection.v2"&&spec.program_binding==g.program_binding&&spec.retained_static==*saved&&spec.template.source_closure_sha256==g.source_closure.sha256&&spec.template.vk_bytes_sha256==pin(g,"wrapper-vk")?.sha256,"WRAPPER_INDEPENDENT_CONTRACT")?;
 originals.push(spec.static_instances.clone());
 let instances:Vec<Vec<Fr>>=loader::object(&spec.static_instances)?;loader::static_values(&instances,&p.execution,&loader::hex32(&p.public_commitment_hex)?)?;
 let pk:Halo2WrapperProvingKey=loader::decoded(pin(g,"wrapper-pk")?)?;
 let params22=loader::params(pin(g,"srs22")?,22)?;let params23=loader::params(pin(g,"srs23")?,23)?;loader::shared_srs(&params22,&params23)?;
 require(params22.get_g().first()==Some(&anchors.0)&&params22.g2()==anchors.1&&params22.s_g2()==anchors.2,"WRAPPER_INDEPENDENT_SRS_ANCHORS")?;drop(params22);
 let selected=wrapper::WrapperContract{template:spec.template.selected(),held_svk:anchors.0,held_g2:anchors.1,held_s_g2:anchors.2,static_instances:instances,max_virtual_advice_cells:spec.max_virtual_advice_cells,max_virtual_lookup_cells:spec.max_virtual_lookup_cells,max_virtual_constraint_records:spec.max_virtual_constraint_records,max_virtual_metadata_bytes:spec.max_virtual_metadata_bytes,max_recorder_events:spec.max_recorder_events,max_selector_cells:spec.max_selector_cells,max_permutation_touch_cells:spec.max_permutation_touch_cells,max_recorder_structural_bytes:spec.max_recorder_structural_bytes,non_thread_safe_region_source_closure_verified:true};
 // Root feature/source record was independently pinned and checked before this
 // literal true is set. No producer-owned boolean supplies the evidence.
 let raw=wrapper::prove_once(&pk,&params23,snark,&selected,j)?;
 // Conversion truncates PV fields in SDK, so enforce full fields FIRST.
 require(raw.instances.len()==46,"WRAPPER_RAW_INSTANCE_SHAPE")?;loader::static_values(&[raw.instances[12..].to_vec()],&p.execution,&loader::hex32(&p.public_commitment_hex)?)?;
 let proof=EvmProof::try_from(raw).map_err(|_|Fault::Stop("EVM_ENVELOPE_CONVERSION"))?;retained::check_envelope(&proof,&p.execution,&loader::hex32(&p.public_commitment_hex)?).map_err(|_|Fault::Stop("EVM_ENVELOPE_MISMATCH"))?;
 // The pinned gen_evm_proof_shplonk delegate verifies/finalizes its generated
 // proof before returning; its failure unwinds to STOP. Fresh final is separate.
 let raw=serde_json::to_vec(&proof).map_err(|_|Fault::Stop("FINAL_PROOF_ENCODING"))?;j.save("candidate.evm.proof",&raw,2<<20)
}
fn run()->Result<()> {
 require(std::env::var_os("RANDOM_SRS").is_none(),"RANDOM_SRS_REFUSED")?;
 let a:Vec<String>=std::env::args().collect();require(a.len()==8&&matches!(a[1].as_str(),"application"|"root"|"static"|"wrap")&&a[2]=="--gate"&&a[4]=="--gate-sha256"&&a[6]=="--output","EXACT_STAGE_ARGUMENTS")?;
 let gate_path=PathBuf::from(&a[3]);let gate_pin=Pin{bytes:loader::io(loader::regular(&gate_path)?.metadata())?.len(),path:gate_path,sha256:a[5].clone()};
 let g:Gate=loader::json(&gate_pin,1<<20)?;
 require(g.schema=="continuity.r3_1.proof-host-stage-gate.v1"&&g.status=="ROOT_AUTHORIZED_SELECTED_STAGE_ONCE"&&!g.acceptance&&g.stage==a[1]&&g.matrix_id==loader::MATRIX&&g.mode=="BOTH"&&g.predicate=="CAPTURED_HEADROOM_EXHAUSTION"&&g.maximum_stage_attempts==1&&!g.automatic_retry,"NOT_READY_STAGE_SELECTION")?;
 require(g.materials.len()==MATERIALS.len()&&MATERIALS.iter().all(|k|g.materials.contains_key(*k))&&g.contracts.len()==CONTRACTS.len()&&CONTRACTS.iter().all(|k|g.contracts.contains_key(*k)),"EXACT_INDEPENDENT_MATERIAL_AND_CONTRACT_CENSUS")?;
 require(pin(&g,"input")?.bytes<=loader::INPUT_CAP&&pin(&g,"vmexe")?.bytes<=64<<20&&pin(&g,"held-config")?.bytes<=1<<20&&pin(&g,"held-init")?.bytes<=1<<20&&pin(&g,"app-pk")?.bytes<=1<<30&&pin(&g,"app-vk")?.bytes<=1<<30&&pin(&g,"static-protocol")?.bytes<=64<<20&&pin(&g,"static-anchors")?.bytes<=4096,"UNCHANGED_NAMED_INPUT_CAPS")?;
 require(g.actual_binary.path==std::env::current_exe().map_err(|_|Fault::Stop("CURRENT_BINARY_PATH"))?&&g.output_root==PathBuf::from(&a[7])&&g.output_root==Path::new(HERE).join(format!("runs/{}-01",g.stage)),"SAME_BINARY_EXCLUSIVE_STAGE_OUTPUT")?;
 let mut originals=vec![gate_pin.clone(),g.source_closure.clone(),g.actual_binary.clone(),g.root_authority.clone(),g.source_review.clone(),g.build_disposition.clone(),g.control_plan.clone(),g.control_result.clone(),g.controls_disposition.clone(),g.feature_disposition.clone(),g.resource_enrollment.clone(),g.held_inventory.clone(),g.program_binding.clone()];originals.extend(g.materials.values().cloned());originals.extend(g.contracts.values().cloned());originals.extend(g.previous_checkpoint.iter().cloned());originals.extend(g.retained_artifact.iter().cloned());
 for p in &originals{let _=loader::verified(p)?;}
 let source_originals=loader::source_closure(&g.source_closure,&source_members())?;
 let inventory:loader::HeldInventory=loader::json(&g.held_inventory,1<<20)?;
 let held:BTreeMap<String,Pin>=g.materials.iter().filter(|(k,_)|!matches!(k.as_str(),"input"|"vmexe")).map(|(k,p)|(k.clone(),p.clone())).collect();
 require(inventory.schema=="continuity.r3_1.existing-held-material-inventory.v1"&&inventory.status=="ROOT_REVIEWED_EXISTING_HELD_IDENTITIES"&&!inventory.acceptance&&inventory.existing_objects_only&&inventory.files==held,"NOT_READY_UNCHANGED_HELD_OBJECT_IDENTITIES")?;
 let common=json!({"sourceClosure":g.source_closure,"actualBinary":g.actual_binary,"programBinding":g.program_binding,"heldInventory":g.held_inventory,"input":pin(&g,"input")?,"selectedMatrixId":g.matrix_id,"selectedStage":g.stage});
 root_record(&g.build_disposition,"continuity.r3_1.proof-host-build-disposition.v1","ROOT_REVIEWED_SCOPED_ARTIFACT",json!({"sourceClosure":g.source_closure,"actualBinary":g.actual_binary,"noDependencyOrFeatureFallback":true}))?;
 root_record(&g.source_review,"continuity.r3_1.proof-host-source-review.v1","ROOT_REVIEWED_LOADER_JOURNAL_ALL_PROOF_BOUNDARIES",json!({"sourceClosure":g.source_closure,"exactEOFLoadersReviewed":true,"durableReservationsReviewed":true,"sameContextFitReviewed":true,"singleMockWrapperReviewed":true,"staticFullPairingReviewed":true}))?;
 root_record(&g.feature_disposition,"continuity.r3_1.proof-host-feature-disposition.v1","ROOT_REVIEWED_ACTIVE_NON_THREAD_SAFE_REGION_CLOSURE",json!({"sourceClosure":g.source_closure,"actualBinary":g.actual_binary,"buildDisposition":g.build_disposition,"threadSafeRegionEnabled":false,"heldUncompressedSelectors":true,"actualLockAndFeaturesReviewed":true}))?;
 root_record(&g.controls_disposition,"continuity.r3_1.proof-host-controls-disposition.v1","ROOT_REVIEWED_REQUIRED_CONTROLS_SAME_ARTIFACT",json!({"binding":common,"controlPlan":g.control_plan,"controlResult":g.control_result,"allRequiredControlsPassed":true,"ownedCleanupConfirmed":true,"permitsExecution":false}))?;
 root_record(&g.root_authority,"continuity.r3_1.proof-host-stage-authority.v1","ROOT_AUTHORIZED_SELECTED_STAGE_ONCE",json!({"binding":common,"contracts":g.contracts,"materials":g.materials,"maximumStageAttempts":1,"newKeygenAllowed":false,"newSrsAllowed":false,"fallbackAllowed":false,"retryAllowed":false,"permitsExecution":false}))?;
 root_record(&g.resource_enrollment,"continuity.r3_1.proof-host-owned-resource-enrollment.v1","ROOT_ENROLLED_ACTIVE_OWNED_SUPERVISION",json!({"binding":common,"pid":std::process::id(),"rssLimitBytes":64u64<<30,"threads":15,"segmentMaxMemory":2usize<<30,"wallTerminationLimit":null,"ownedProcessGroup":true,"cleanupOwnerEstablished":true,"limitsCoverDecodeAndConstruction":true}))?;
 let p=program(&g)?;previous(&g)?;environment(&g)?;
 for item in &originals{let _=loader::verified(item)?;}
 for item in &source_originals{let _=loader::verified_public_source(item)?;}
 let owner=json!({"gate":gate_pin,"sourceClosure":g.source_closure,"actualBinary":g.actual_binary,"programBinding":g.program_binding,"heldInventory":g.held_inventory,"input":pin(&g,"input")?,"materials":g.materials,"contracts":g.contracts,"resourceEnrollment":g.resource_enrollment,"mode":"BOTH","predicate":"CAPTURED_HEADROOM_EXHAUSTION","matrixId":g.matrix_id});
 let mut journal=journal::Durable::new(&g.output_root,&g.stage,owner)?;
 let stage_result=guarded(||match g.stage.as_str(){"application"=>application_stage(&g,&p,&mut journal,&mut originals),"root"=>root_stage(&g,&p,&mut journal,&mut originals),"static"=>static_stage(&g,&p,&mut journal,&mut originals),"wrap"=>wrapper_stage(&g,&p,&mut journal,&mut originals),_=>Err(Fault::Stop("STAGE_UNSELECTED"))});
 let artifact=match stage_result{Ok(p)=>p,Err(fault)=>{let event=json!({"schema":"continuity.r3_1.proof-stage-failure.v1","stage":g.stage,"fault":fault,"retryAllowed":false,"reservationRefundAllowed":false,"proofAccepted":false,"permitsExecution":false});let _=journal.prefix(&event);return Err(fault);}};
 let completion=guarded(||{
  for item in &originals{let _=loader::verified(item)?;}
 for item in &source_originals{let _=loader::verified_public_source(item)?;}
  let closure=journal.closure(&artifact,true)?;
  let out=json!({"schema":"continuity.r3_1.proof-host-stage-output.v1","stage":g.stage,"artifact":artifact,"closure":closure,"freshIndependentFinalRequired":true,"proofAccepted":false,"permitsExecution":false});
  println!("{}",serde_json::to_string(&out).map_err(|_|Fault::Stop("OUTPUT_ENCODING"))?);loader::io(std::io::stdout().flush())?;Ok(())
 });
 if let Err(fault)=completion{let event=json!({"schema":"continuity.r3_1.proof-stage-completion-failure.v1","stage":g.stage,"fault":fault,"artifact":artifact,"retryAllowed":false,"reservationRefundAllowed":false,"proofAccepted":false,"permitsExecution":false});let _=journal.prefix(&event);return Err(fault);}Ok(())
}
fn main(){std::panic::set_hook(Box::new(|_|eprintln!("PROOF_HOST_PANIC_PRIVATE_DIAGNOSTICS_SUPPRESSED")));if let Err(fault)=guarded(run){let out=json!({"schema":"continuity.r3_1.proof-host-refusal.v1","fault":fault,"retryAllowed":false,"reservationRefundAllowed":false,"proofAccepted":false,"permitsExecution":false});eprintln!("{out}");let _=std::io::stderr().flush();std::process::exit(2)}}
