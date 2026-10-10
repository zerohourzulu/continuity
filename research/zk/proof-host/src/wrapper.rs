//! ONE public Mock construction retained through template fit and sole proof.
//! No lazy SDK SVK/SRS global, second constructor, setup or key generation.
use crate::{encoded,fail,guarded,hash,require,Fault,Journal,Result,TemplateContract,
    placement::{placement_event,Recorder}};
use halo2_base::{gates::circuit::{CircuitBuilderStage,MaybeRangeConfig},
    halo2_proofs::{circuit::{Layouter,SimpleFloorPlanner},
        halo2curves::{bn256::{Bn256,Fr,G1Affine,G2Affine},ff::PrimeField},
        plonk::{Circuit,ConstraintSystem,Error,FloorPlanner},
        poly::{commitment::{Params,ParamsProver},kzg::commitment::ParamsKZG},SerdeFormat}};
use openvm_static_verifier::{wrapper::Halo2WrapperProvingKey,keygen::RawEvmProof};
use snark_verifier_sdk::{halo2::aggregation::{AggregationCircuit,AggregationConfigParams,VerifierUniversality},
    Snark,SHPLONK,CircuitExt};
use sha2::{Digest,Sha256};
use std::{cell::Cell,rc::Rc};

pub struct WrapperContract {
    pub template:TemplateContract,pub held_svk:G1Affine,pub held_g2:G2Affine,pub held_s_g2:G2Affine,
    pub static_instances:Vec<Vec<Fr>>,pub max_virtual_advice_cells:usize,
    pub max_virtual_lookup_cells:usize,pub max_virtual_constraint_records:usize,
    pub max_virtual_metadata_bytes:usize,pub max_recorder_events:usize,
    pub max_selector_cells:usize,pub max_permutation_touch_cells:usize,
    pub max_recorder_structural_bytes:usize,
    /// Root must authenticate the actual lock/feature/source closure, not echo
    /// this boolean. The source-bound sparse permutation algorithm rejects the
    /// alternate thread-safe-region implementation.
    pub non_thread_safe_region_source_closure_verified:bool,
}
fn digest_debug<T:std::fmt::Debug>(digest:&mut Sha256,value:&T) {
    let s=format!("{value:?}");digest.update((s.len() as u64).to_le_bytes());digest.update(s.as_bytes());
}
fn semantic_snapshot(circuit:&AggregationCircuit)->Result<String> {
    let mut digest=Sha256::new();
    digest.update(encoded(&circuit.builder.config_params)?);
    digest.update(encoded(&circuit.builder.break_points())?);
    digest.update(encoded(&circuit.instances())?);
    for (phase,manager) in circuit.builder.core().phase_manager.iter().enumerate() {
        digest.update((phase as u64).to_le_bytes());digest.update([manager.witness_gen_only() as u8]);
        for ctx in &manager.threads {
            digest_debug(&mut digest,&ctx.tag());digest.update((ctx.advice.len() as u64).to_le_bytes());
            require(ctx.selector.len()==ctx.advice.len(),"WRAPPER_VIRTUAL_SELECTOR_LENGTH")?;
            for (value,enabled) in ctx.advice.iter().zip(&ctx.selector) {
                digest.update(value.evaluate().to_repr().as_ref());digest.update([*enabled as u8]);
            }
        }
    }
    for manager in circuit.builder.lookup_manager() {
        let queued=manager.cells_to_lookup.lock().map_err(|_|Fault::Stop("WRAPPER_LOOKUP_LOCK_FAILED"))?;
        digest.update((queued.len() as u64).to_le_bytes());
        for (tag,values) in queued.iter() {
            digest_debug(&mut digest,tag);digest.update((values.len() as u64).to_le_bytes());
            for value in values {
                digest.update(value[0].value.evaluate().to_repr().as_ref());digest_debug(&mut digest,&value[0].cell);
            }
        }
    }
    let mut copies=circuit.builder.core().copy_manager.lock().map_err(|_|Fault::Stop("WRAPPER_COPY_LOCK_FAILED"))?;
    // SDK assign_raw performs these exact semantic-preserving sorts. Exclude
    // assigned_advices/assigned_constants/OnceLocks, which are physical caches.
    copies.advice_equalities.sort_unstable();
    copies.constant_equalities.sort_unstable_by(|(a,x),(b,y)|a.cmp(b).then(x.cmp(y)));
    digest.update((copies.advice_equalities.len() as u64).to_le_bytes());
    for pair in &copies.advice_equalities {digest_debug(&mut digest,pair);}
    digest.update((copies.constant_equalities.len() as u64).to_le_bytes());
    for (value,cell) in &copies.constant_equalities {
        digest.update(value.to_repr().as_ref());digest_debug(&mut digest,cell);
    }
    for column in &circuit.builder.assigned_instances {
        digest.update((column.len() as u64).to_le_bytes());
        for value in column {digest.update(value.value.evaluate().to_repr().as_ref());digest_debug(&mut digest,&value.cell);}
    }
    Ok(format!("{:x}",digest.finalize()))
}
/// Contains the original sole constructed circuit. The ordinary proof-library
/// synthesis checks semantic identity before AND after delegation; this does
/// not introduce an extra diagnostic synthesis or constructor.
struct CheckedProofCircuit {
    circuit:AggregationCircuit,semantic_sha256:String,proof_syntheses:Rc<Cell<usize>>,
}
impl Circuit<Fr> for CheckedProofCircuit {
    type Config=<AggregationCircuit as Circuit<Fr>>::Config;
    type FloorPlanner=SimpleFloorPlanner;
    type Params=<AggregationCircuit as Circuit<Fr>>::Params;
    fn params(&self)->Self::Params {self.circuit.params()}
    fn configure_with_params(cs:&mut ConstraintSystem<Fr>,params:Self::Params)->Self::Config {
        AggregationCircuit::configure_with_params(cs,params)
    }
    fn configure(_: &mut ConstraintSystem<Fr>)->Self::Config {fail(Fault::Stop("WRAPPER_UNPARAMETERIZED_CONFIGURE"))}
    fn without_witnesses(&self)->Self {fail(Fault::Stop("WRAPPER_WITHOUT_WITNESSES_UNSELECTED"))}
    fn synthesize(&self,config:Self::Config,layouter:impl Layouter<Fr>)->std::result::Result<(),Error> {
        require(self.proof_syntheses.get()==0,"WRAPPER_EXTRA_PROOF_SYNTHESIS").unwrap_or_else(|f|fail(f));
        require(semantic_snapshot(&self.circuit).unwrap_or_else(|f|fail(f))==self.semantic_sha256,
            "WRAPPER_SEMANTICS_CHANGED_BEFORE_PROOF_SYNTHESIS").unwrap_or_else(|f|fail(f));
        self.proof_syntheses.set(1);
        self.circuit.synthesize(config,layouter)?;
        require(semantic_snapshot(&self.circuit).unwrap_or_else(|f|fail(f))==self.semantic_sha256,
            "WRAPPER_SEMANTICS_CHANGED_DURING_PROOF_SYNTHESIS").unwrap_or_else(|f|fail(f));
        Ok(())
    }
}

pub fn prove_once(pk:&Halo2WrapperProvingKey,params:&ParamsKZG<Bn256>,static_snark:Snark,
    selected:&WrapperContract,journal:&mut dyn Journal)->Result<RawEvmProof> {
    guarded(|| {
        // Actual held-key correspondence below replaces the missing external
        // special-lookup receipt. Hash syntax alone grants no admission.
        for pin in [&selected.template.protocol_sha256,&selected.template.vk_bytes_sha256,
            &selected.template.config_sha256,&selected.template.breakpoints_sha256,&selected.template.source_closure_sha256] {
            require(pin.len()==64 && pin.bytes().all(|b|b.is_ascii_digit() || (b'a'..=b'f').contains(&b)),"WRAPPER_PIN_ENCODING")?;
        }
        if !selected.non_thread_safe_region_source_closure_verified {
            return Err(Fault::Hold("WRAPPER_ACTIVE_FEATURE_CLOSURE_UNVERIFIED"));
        }
        let held=&pk.pinning.metadata.config_params;let vk=pk.pinning.pk.get_vk();
        require(!vk.compress_selectors(),"WRAPPER_HELD_SELECTOR_COMPRESSION_UNSUPPORTED")?;
        require(vk.get_domain().k()==23,"WRAPPER_ACTUAL_HELD_VK_DOMAIN_MISMATCH")?;
        require(held.k==23 && held.lookup_bits==Some(22) && held.num_advice_per_phase.as_slice()==[1]
            && held.num_instance_columns==1 && pk.pinning.metadata.num_pvs==vec![46],"WRAPPER_HELD_PROFILE_MISMATCH")?;
        require(params.k()==23 && params.get_g().first()==Some(&selected.held_svk)
            && params.g2()==selected.held_g2 && params.s_g2()==selected.held_s_g2,"WRAPPER_HELD_SRS_OR_SVK_MISMATCH")?;
        require(hash(&vk.to_bytes(SerdeFormat::RawBytes))==selected.template.vk_bytes_sha256
            && hash(&encoded(held)?)==selected.template.config_sha256
            && hash(&encoded(&pk.pinning.metadata.break_points)?)==selected.template.breakpoints_sha256,
            "WRAPPER_HELD_KEY_OR_LAYOUT_PIN")?;
        require(static_snark.instances==selected.static_instances && selected.static_instances.len()==1
            && selected.static_instances[0].len()==34,"WRAPPER_STATIC_INSTANCE_MISMATCH")?;
        require(hash(&encoded(&static_snark.protocol)?)==selected.template.protocol_sha256,"WRAPPER_STATIC_PROTOCOL_PIN")?;
        if [selected.max_virtual_advice_cells,selected.max_virtual_lookup_cells,
            selected.max_virtual_constraint_records,selected.max_virtual_metadata_bytes,selected.max_recorder_events,
            selected.max_selector_cells,selected.max_permutation_touch_cells,selected.max_recorder_structural_bytes]
            .contains(&0) {return Err(Fault::Hold("WRAPPER_RESOURCE_ENVELOPE_UNSELECTED"));}
        // ONE disclosed entropy-bearing accumulation-scheme proof. Mock means
        // known values AND constraints. No generic MockProver is instantiated.
        journal.reserve("wrapper-accumulation-scheme-proof",0)?;
        let mut circuit=AggregationCircuit::new::<SHPLONK>(CircuitBuilderStage::Mock,
            AggregationConfigParams {degree:23,lookup_bits:22,..Default::default()},params,
            [static_snark],VerifierUniversality::None);
        circuit.expose_previous_instances(false);
        let actual_params=AggregationConfigParams::try_from(held.clone())
            .map_err(|_|Fault::Stop("WRAPPER_HELD_PARAMETER_CONVERSION"))?;
        circuit=circuit.use_params(actual_params).use_break_points(pk.pinning.metadata.break_points.clone());
        require(circuit.num_instance()==vec![46]
            && <AggregationCircuit as CircuitExt<Fr>>::accumulator_indices()==Some((0..12).map(|i|(0,i)).collect()),
            "WRAPPER_ACCUMULATOR_INSTANCE_SHAPE")?;
        let instances=circuit.instances();
        require(instances.len()==1 && instances[0].len()==46 && instances[0][12..]==selected.static_instances[0],
            "WRAPPER_ACTUAL_INSTANCE_JOIN")?;
        let mut cs=ConstraintSystem::<Fr>::default();
        let config=AggregationCircuit::configure_with_params(&mut cs,circuit.params());
        require(cs.num_challenges()==0 && cs.num_instance_columns()==1 && cs.num_advice_columns()==1
            && cs.advice_column_phase()==vk.cs().advice_column_phase(),"WRAPPER_CS_SHAPE_MISMATCH")?;
        let fixed_columns=cs.num_fixed_columns();let selector_columns=cs.num_selectors();
        // directly_convert has no selector compression/row-driven optimizer:
        // one empty row vector per selector is enough for the structural CS.
        // REAL selector rows are compared against held PK by Recorder.
        let (converted,_)=cs.clone().directly_convert_selectors_to_fixed(vec![Vec::new();selector_columns]);
        let actual_cs=format!("{:?}",converted.pinned());let held_cs=format!("{:?}",vk.cs().pinned());
        require(actual_cs==held_cs,"WRAPPER_COMPLETE_CONVERTED_CS_MISMATCH")?;
        let MaybeRangeConfig::WithRange(range)=&config.base else {return Err(Fault::Stop("WRAPPER_RANGE_CONFIG_ABSENT"));};
        let gate=&range.gate;
        require(gate.basic_gates.len()==1 && gate.basic_gates[0].len()==1
            && range.q_lookup.first().is_some_and(Option::is_some)
            && range.lookup_advice.iter().all(Vec::is_empty),"WRAPPER_SPECIAL_LOOKUP_SHAPE")?;
        let n=1usize.checked_shl(23).ok_or(Fault::Stop("WRAPPER_DOMAIN_SIZE_OVERFLOW"))?;
        let usable=n.checked_sub(cs.blinding_factors()+1).ok_or(Fault::Stop("WRAPPER_USABLE_ROWS"))?;
        require(cs.minimum_rows()<=20 && gate.max_rows==n-cs.minimum_rows(),"WRAPPER_GATE_ROWS_MISMATCH")?;
        let managers=&circuit.builder.core().phase_manager;
        require(managers.len()==1 && !managers[0].witness_gen_only() && managers[0].phase()==0
            && managers[0].threads.iter().all(|t|t.phase()==0 && !t.witness_gen_only()),"WRAPPER_MOCK_PHASE_MISMATCH")?;
        let breaks=&pk.pinning.metadata.break_points;
        require(breaks.len()==1 && breaks[0].is_empty(),"WRAPPER_SINGLE_COLUMN_BREAKPOINT_MISMATCH")?;
        let mut expected_digest=Sha256::new();let mut actual_cells=0usize;
        let column=gate.basic_gates[0][0].value.index();
        for thread in &managers[0].threads {
            require(thread.selector.len()==thread.advice.len(),"WRAPPER_THREAD_SELECTOR_LENGTH")?;
            for (value,q) in thread.advice.iter().zip(&thread.selector) {
                // Source-exact single-column no-break rule, including ROTATIONS=4.
                require(actual_cells<gate.max_rows-1 && (!*q || actual_cells.checked_add(4)
                    .is_some_and(|end|end<=gate.max_rows)),"WRAPPER_COLUMN_EXHAUSTION")?;
                placement_event(&mut expected_digest,1,column,actual_cells,value.evaluate());
                actual_cells=actual_cells.checked_add(1).ok_or(Fault::Stop("WRAPPER_ADVICE_COUNT_OVERFLOW"))?;
            }
        }
        let lookup_counts=circuit.builder.lookup_manager().iter().map(|m|m.total_rows()).collect::<Vec<_>>();
        require(lookup_counts.iter().skip(1).all(|n|*n==0),"WRAPPER_LOOKUP_OTHER_PHASE")?;
        let total_lookup=lookup_counts.iter().try_fold(0usize,|a,b|a.checked_add(*b))
            .ok_or(Fault::Stop("WRAPPER_LOOKUP_COUNT_OVERFLOW"))?;
        let copies=circuit.builder.core().copy_manager.lock().map_err(|_|Fault::Stop("WRAPPER_COPY_LOCK_FAILED"))?;
        let constraint_records=copies.advice_equalities.len().checked_add(copies.constant_equalities.len())
            .ok_or(Fault::Stop("WRAPPER_CONSTRAINT_COUNT_OVERFLOW"))?;
        drop(copies);
        // Conservative LOGICAL metadata estimate, excluding allocator/runtime,
        // held PK/SRS and SDK constructor temporaries. Owned 64GiB RSS cap is
        // separate and must already protect construction, not start here.
        let metadata_estimate=actual_cells.checked_mul(128)
            .and_then(|a|constraint_records.checked_mul(192).and_then(|b|a.checked_add(b)))
            .and_then(|a|total_lookup.checked_mul(128).and_then(|b|a.checked_add(b)))
            .and_then(|a|managers[0].threads.len().checked_mul(256).and_then(|b|a.checked_add(b)))
            .ok_or(Fault::Stop("WRAPPER_METADATA_SIZE_OVERFLOW"))?;
        if actual_cells>selected.max_virtual_advice_cells || total_lookup>selected.max_virtual_lookup_cells
            || constraint_records>selected.max_virtual_constraint_records || metadata_estimate>selected.max_virtual_metadata_bytes {
            return Err(Fault::Hold("WRAPPER_VIRTUAL_RESOURCE_BUDGET"));
        }
        let statistics=circuit.builder.statistics();
        require(statistics.gate.total_advice_per_phase==vec![actual_cells]
            && statistics.total_lookup_advice_per_phase==lookup_counts,"WRAPPER_VIRTUAL_STATISTICS_MISMATCH")?;
        let before=semantic_snapshot(&circuit)?;
        let mut recorder=Recorder::new(&pk.pinning.pk,&instances,cs.advice_column_phase(),n,usable,gate.max_rows,
            fixed_columns,selector_columns,range.lookup.inner().index(),1usize<<22,
            selected.max_recorder_events,selected.max_selector_cells,selected.max_permutation_touch_cells,
            selected.max_recorder_structural_bytes)?;
        SimpleFloorPlanner::synthesize(&mut recorder,&circuit,config,cs.constants().clone())
            .map_err(|_|Fault::Stop("WRAPPER_PLACEMENT_SYNTHESIS_FAILED"))?;
        let summary=recorder.finish()?;
        require(summary.advice_placement_sha256==format!("{:x}",expected_digest.finalize())
            && summary.advice_counts==vec![actual_cells],"WRAPPER_POPULATED_PLACEMENT_MISMATCH")?;
        require(before==semantic_snapshot(&circuit)? && circuit.instances()==instances,"WRAPPER_CIRCUIT_SEMANTICS_CHANGED_DURING_GATE")?;
        journal.fit("wrapper",0,&serde_json::json!({"schema":"continuity.r3_1.wrapper-fit.v2",
            "recorder":summary,"semanticCircuitSha256":before,"instancesSha256":hash(&encoded(&instances)?),
            "convertedCsPinnedDebugSha256":hash(actual_cs.as_bytes()),
            "actualLookupCounts":lookup_counts,"actualConstraintRecords":constraint_records,
            "virtualMetadataLogicalEstimateBytes":metadata_estimate,"constructionStage":"Mock",
            "accumulationSchemeProofs":1,"outerProofsBeforeAdmission":0,
            "actualFixedSelectorPermutationTemplateCompared":true,"completeDomainTailsCompared":true,
            "fullConstraintsValidated":false,"gateConstraintSatisfaction":"NOT_PERFORMED",
            "copyEqualityValueSatisfaction":"NOT_PERFORMED","lookupConstraintSatisfaction":"NOT_PERFORMED",
            "permitsExecution":false}))?;
        journal.reserve("wrapper-outer-proof",0)?;
        let proof_syntheses=Rc::new(Cell::new(0));
        let checked=CheckedProofCircuit {circuit,semantic_sha256:before,proof_syntheses:proof_syntheses.clone()};
        // SAME inner circuit consumed ONCE. Ordinary proof synthesis retains
        // metadata and checks semantic pre/post identity through public Circuit.
        let proof=snark_verifier_sdk::evm::gen_evm_proof_shplonk(params,&pk.pinning.pk,checked,instances.clone());
        require(proof_syntheses.get()==1,"WRAPPER_PROOF_SYNTHESIS_COUNT")?;
        Ok(RawEvmProof {instances:instances.into_iter().next().unwrap(),proof})
    })
}
