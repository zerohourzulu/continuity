// Read-only typed preparation: derive cache contracts and encode expected values.
// No guest execution, proving, keygen, setup or Q calls.
#[path="${CONTINUITY_SOURCE_ROOT}/tmp/agent-state/20261007-r3_1-uncapped-root/v1/proof-host-v5/src/lib.rs"]mod host;
pub use host::{application,aggregation,stark_fit,static_fit,placement,permutation_fit,wrapper,Fault,Result,require,hash,encoded,identical,Journal,TemplateContract,guarded,fail};
mod loader;
use std::{sync::Arc,fs::OpenOptions,io::Write,path::Path};
use serde_json::{Value as J,json};
use openvm_sdk::{keygen::{AppProvingKey,AppVerifyingKey,AggProvingKey},prover::AggProver,config::AggregationTreeConfig,F,SC};
use openvm_sdk_config::SdkVmConfig;
use openvm_stark_backend::keygen::types::MultiStarkVerifyingKey;
use p3_field::{PrimeCharacteristicRing,TwoAdicField};
use halo2_base::halo2_proofs::halo2curves::{bn256::Fr,ff::PrimeField};
fn save(out:&Path,name:&str,raw:&[u8])->std::result::Result<J,Box<dyn std::error::Error>>{let p=out.join(name);let mut f=OpenOptions::new().create_new(true).write(true).open(&p)?;f.write_all(raw)?;f.sync_all()?;Ok(json!({"path":p,"bytes":raw.len(),"sha256":hash(raw)}))}
fn trace(vk:&MultiStarkVerifyingKey<SC>,c:[F;8])->std::result::Result<J,Box<dyn std::error::Error>>{
 let mut cached=Vec::new();let mut count=0;for k in &vk.inner.per_air{if k.params.width.cached_mains.is_empty(){cached.push(J::Null);}else{if k.params.width.cached_mains.len()!=1{return Err("CACHED_WIDTH_CENSUS".into());}count+=1;cached.push(json!([c]));}}
 if count!=1{return Err("EXPECTED_ONE_VK_CACHED_TRACE".into());}
 Ok(json!({"air_count":vk.inner.per_air.len(),"max_height":1usize<<(vk.inner.params.l_skip+vk.inner.params.n_stack),"exact_heights":null,"cached_commitments":cached}))
}
fn fault<T>(v:Result<T>)->std::result::Result<T,Box<dyn std::error::Error>>{v.map_err(|f|format!("{f:?}").into())}
fn run()->std::result::Result<(),Box<dyn std::error::Error>>{
 let a:Vec<String>=std::env::args().collect();if a.len()!=3{return Err("PLAN_OUTPUT_ARGS".into());}let raw=std::fs::read(&a[1])?;if raw.len()>16384{return Err("PLAN_BOUND".into());}let plan:J=serde_json::from_slice(&raw)?;if plan["status"]!="ROOT_SELECTED_TYPED_PROOF_METADATA_ONCE"{return Err("PLAN_STATUS".into());}
 let get=|n:&str|->std::result::Result<loader::Pin,Box<dyn std::error::Error>>{Ok(serde_json::from_value(plan["materials"][n].clone())?)};
 let pk:AppProvingKey<SdkVmConfig>=fault(loader::object(&get("app-pk")?))?;let vk:AppVerifyingKey=fault(loader::object(&get("app-vk")?))?;fault(identical(&pk.get_app_vk(),&vk,"APP_VK_IDENTITY"))?;
 let aggpk:AggProvingKey=fault(loader::object(&get("agg-pk")?))?;let agg=AggProver::from_pk(Arc::new(vk.vk.clone()),aggpk,AggregationTreeConfig{num_children_leaf:4,num_children_internal:3},None);
 let out=Path::new(&a[2]);std::fs::create_dir(out)?;let config=save(out,"expanded-config.bin",&fault(encoded(&pk.app_config()))?)?;
 let program_vec:Vec<u32>=serde_json::from_value(plan["programPcsCanonicalU32"].clone())?;if program_vec.len()!=8{return Err("PROGRAM_DIGEST_COUNT".into());}let c:[F;8]=program_vec.into_iter().map(F::from_u32).collect::<Vec<_>>().try_into().map_err(|_|"DIGEST_COUNT")?;
 let degree=vk.vk.inner.params.max_constraint_degree;let log=(degree-1).next_power_of_two().trailing_zeros()as usize;let mut appcached=vec![J::Null;38];appcached[0]=json!([c]);
 let app=json!({"air_count":38,"max_height":1usize<<(F::TWO_ADICITY-log),"exact_heights":null,"cached_commitments":appcached});
 let leaf=trace(&agg.leaf_prover.get_vk(),agg.leaf_prover.get_vk_commit(false).cached_commit)?;let internal=trace(&agg.internal_for_leaf_prover.get_vk(),agg.internal_for_leaf_prover.get_vk_commit(false).cached_commit)?;let recursive=trace(&agg.internal_recursive_prover.get_vk(),agg.internal_recursive_prover.get_vk_commit(false).cached_commit)?;let recursive_self=trace(&agg.internal_recursive_prover.get_vk(),agg.internal_recursive_prover.get_vk_commit(true).cached_commit)?;
 let mut values=Vec::new();for k in ["app_exe_commit","app_vm_commit"]{let s=plan["execution"][k].as_str().ok_or("EXEC_HEX")?.strip_prefix("0x").ok_or("EXEC_PREFIX")?;let mut b=fault(loader::hex32(s))?;b.reverse();let f=Option::<Fr>::from(Fr::from_repr(b)).ok_or("FR_COMMIT_ENCODING")?;values.push(f);}
 let pv=fault(loader::hex32(plan["publicCommitmentHex"].as_str().ok_or("PV_HEX")?))?;values.extend(pv.iter().map(|b|Fr::from(*b as u64)));let instances=save(out,"expected-static-instances.bin",&fault(encoded(&vec![values]))?)?;
 let root:retained::RootVk=fault(loader::object(&get("root-vk")?))?;if root.inner.per_air.iter().any(|k|!k.params.width.cached_mains.is_empty()){return Err("ROOT_MUST_USE_COMMON_VK_TRACE".into());}let roottrace=json!({"air_count":42,"max_height":1usize<<(root.inner.params.l_skip+root.inner.params.n_stack),"exact_heights":plan["heldRootHeights"],"cached_commitments":vec![J::Null;42]});
 let result=json!({"schema":"continuity.r3_1.typed-proof-metadata.v1","status":"TYPED_EXISTING_KEYS_AND_NEW_PUBLIC_VALUES_PREPARED","planSha256":hash(&raw),"expandedConfig":config,"staticInstances":instances,"applicationTrace":app,"leafTrace":leaf,"internalTrace":internal,"recursiveStandardTrace":recursive,"recursiveSelfTrace":recursive_self,"rootTrace":roottrace,"newKeygen":0,"newSRS":0,"guestExecutions":0,"proofCalls":0,"QCalls":0,"fullWitnessFit":"NOT_ESTABLISHED","permitsExecution":false});save(out,"RESULT.json",&serde_json::to_vec(&result)?)?;println!("{}",serde_json::to_string(&result)?);Ok(())
}
fn main(){if let Err(e)=run(){eprintln!("METADATA_REFUSAL:{e}");std::process::exit(2);}}
