//! One application pipeline, actual contexts retained through their callbacks.
use std::sync::Arc;
use crate::{encoded, guarded, fail, hash, identical, require, Fault, Journal, Result,
    stark_fit::{context_fit, held_air_fit, TraceContract}};
use openvm_sdk::{config::AppConfig,keygen::{AppProvingKey, AppVerifyingKey},
    prover::{vm::new_local_prover, verify_app_proof_with_expected_exe_commit},
    openvm_circuit::{arch::{instructions::exe::VmExe, VmCircuitConfig, PROGRAM_AIR_ID},
        system::program::trace::compute_exe_commit_from_mem_config},
    DefaultStarkEngine, F, SC, StdIn};
use openvm_sdk_config::{SdkVmConfig, SdkVmCpuBuilder};
use openvm_stark_backend::AirRef;
use p3_field::{PrimeCharacteristicRing, TwoAdicField};

pub struct ApplicationContract {
    pub expanded_config: AppConfig<SdkVmConfig>,
    pub execution_commit: [F;8],
    pub public_result: [u8;32],
    pub trace: TraceContract<[F;8]>,
    pub max_segments: usize,
    pub segment_max_memory: usize,
    pub frozen_input_sha256: String,
}

/// Held material and input pin/EOF verification are Root-owned prerequisites.
/// This function has no default constructor or SDK lazy/keygen accessor.
pub fn prove_once(pk: &AppProvingKey<SdkVmConfig>, vk: &AppVerifyingKey,
    exe: Arc<VmExe<F>>, raw_input: &[u8], contract: &ApplicationContract,
    journal: &mut dyn Journal) -> Result<openvm_sdk::openvm_circuit::arch::ContinuationVmProof<SC>> {
    guarded(|| {
        require(hash(raw_input)==contract.frozen_input_sha256, "FROZEN_CAPTURE_INPUT_MISMATCH")?;
        identical(&pk.app_config(), &contract.expanded_config, "APP_CONFIG_MISMATCH")?;
        identical(&pk.get_app_vk(), vk, "APP_HELD_VK_MISMATCH")?;
        require(vk.num_user_pvs==32 && pk.vm_config().deferral.is_none(), "APP_UNSUPPORTED_PROFILE")?;
        require(contract.max_segments>0 && contract.trace.air_count==38, "APP_TRACE_CONTRACT")?;
        let system=&pk.vm_config().system.config;
        // segmentation_max_memory is serde-skipped: serialized config equality
        // cannot establish this independently selected execution-only setting.
        require(contract.segment_max_memory==2usize<<30
            && system.segmentation_max_memory==contract.segment_max_memory,
            "APP_SEGMENTATION_PROFILE_MISMATCH")?;
        require(system.num_public_values==32, "APP_PV32_MISMATCH")?;
        let degree=system.max_constraint_degree;
        require(degree>1 && degree==vk.vk.inner.params.max_constraint_degree, "APP_MAX_DEGREE_MISMATCH")?;
        let log_blowup=(degree-1).next_power_of_two().trailing_zeros() as usize;
        require(log_blowup<F::TWO_ADICITY && contract.trace.max_height==1usize<<(F::TWO_ADICITY-log_blowup), "APP_HEIGHT_BOUND_MISMATCH")?;
        let airs=pk.vm_config().create_airs().map_err(|_| Fault::Stop("APP_AIR_CREATION_FAILED"))?
            .into_airs().map(|a| a as AirRef<SC>).collect::<Vec<_>>();
        held_air_fit(&pk.app_vm_pk.vm_pk, &vk.vk, &airs, 38)?;
        for (i,k) in vk.vk.inner.per_air.iter().enumerate() {
            require(k.is_required==system.is_required_air_id(i), "APP_REQUIRED_AIR_MISMATCH")?;
        }
        let mut instance=new_local_prover::<DefaultStarkEngine,SdkVmCpuBuilder>(
            SdkVmCpuBuilder::default(), &pk.app_vm_pk, exe)
            .map_err(|_| Fault::Stop("APP_INSTANCE_FAILED"))?;
        let actual_exe=compute_exe_commit_from_mem_config(instance.program_commitment(),
            instance.exe(), &system.memory_config);
        require(actual_exe==contract.execution_commit, "APP_EXECUTION_COMMIT_MISMATCH")?;
        let actual_program=*instance.program_commitment();
        let selected=contract.trace.cached_commitments.get(PROGRAM_AIR_ID)
            .and_then(|x| x.as_ref()).ok_or(Fault::Hold("PROGRAM_CACHE_EXPECTATION_UNAVAILABLE"))?;
        require(selected.as_slice()==[actual_program], "PROGRAM_CACHE_MISMATCH")?;
        let mut stdin=StdIn::default(); stdin.write_bytes(raw_input);
        let mut segments=0;
        let proof=instance.prove_continuations(stdin, |index,ctx| {
            let gate=(|| {
                require(index==segments, "APP_SEGMENT_INDEX_MISMATCH")?;
                if index>=contract.max_segments { return Err(Fault::Hold("APP_SEGMENT_BUDGET_EXCEEDED")); }
                let mut receipt=context_fit(ctx, &vk.vk, &contract.trace)?;
                receipt["segmentIndex"]=serde_json::json!(index);
                receipt["inputSha256"]=serde_json::json!(&contract.frozen_input_sha256);
                receipt["expandedConfigSha256"]=serde_json::json!(hash(&encoded(&pk.app_config())?));
                receipt["segmentationMaxMemory"]=serde_json::json!(system.segmentation_max_memory);
                journal.fit("application", index, &receipt)?;
                journal.reserve("application-segment-proof", index)?;
                segments+=1; Ok(())
            })();
            if let Err(fault)=gate { fail(fault); }
            // SDK invokes engine.prove immediately after this callback, using
            // this SAME context. No cloned execution or context reconstruction.
        }).map_err(|_| Fault::Stop("APPLICATION_RUN_FAILED"))?;
        require(segments>0 && proof.per_segment.len()==segments, "APP_SEGMENT_CENSUS_MISMATCH")?;
        verify_app_proof_with_expected_exe_commit::<DefaultStarkEngine>(vk, &proof,
            Some(contract.execution_commit)).map_err(|_| Fault::Stop("APP_SELF_VERIFICATION_FAILED"))?;
        require(proof.user_public_values.public_values.len()==32
            && proof.user_public_values.public_values.iter().zip(&contract.public_result)
                .all(|(a,b)| *a==F::from_u8(*b)), "APP_PUBLIC_RESULT_MISMATCH")?;
        journal.fit("application-closure", segments, &serde_json::json!({"segments":segments,
            "selfVerified":true,"downstreamFit":"NOT_ESTABLISHED","permitsExecution":false}))?;
        Ok(proof)
    })
}
