//! Retain generate_witness output and graph tapes; inspect actual populated
//! placement before the sole gen_snark_from_base call. CPU-only proposal.
use crate::{encoded,guarded,hash,require,Fault,Journal,Result,TemplateContract};
use halo2_base::{gates::circuit::{builder::BaseCircuitBuilder,MaybeRangeConfig},
    halo2_proofs::{halo2curves::{bn256::{Bn256,Fr,G1Affine},ff::Field},
        plonk::{Circuit,ConstraintSystem},poly::{commitment::{Params,ParamsProver}, kzg::commitment::ParamsKZG},SerdeFormat}};
use openvm_static_verifier::{keygen::StaticVerifierProvingKey,
    tracegen::graph_executor::GraphExecutorState};
use openvm_continuations::RootSC;
use openvm_stark_backend::proof::Proof;
use snark_verifier_sdk::{Snark,
    snark_verifier::{system::halo2::{compile,Config},verifier::plonk::PlonkProtocol}};

pub struct StaticContract {
    pub template: TemplateContract,
    pub expected_instances: Vec<Vec<Fr>>,
    pub held_protocol: PlonkProtocol<G1Affine>,
    pub held_g1: G1Affine,
    pub max_advice_bytes: usize,
    pub max_tape_cells: usize,
    pub root_log_heights: Vec<usize>,
}

pub fn prove_once(pk:&StaticVerifierProvingKey, params:&ParamsKZG<Bn256>,
    root:&Proof<RootSC>, selected:&StaticContract, threads:usize,
    journal:&mut dyn Journal) -> Result<Snark> {
    guarded(|| {
        selected.template.required()?;
        let config=&pk.pinning.metadata.config_params;
        require(config.k==22 && config.lookup_bits==Some(21) && config.num_instance_columns==1
            && pk.pinning.metadata.num_pvs==vec![34] && pk.shape.k==22
            && pk.shape.lookup_bits==21 && pk.shape.minimum_rows==20 && pk.shape.instance_columns==1,
            "STATIC_HELD_PROFILE_MISMATCH")?;
        require(params.k()==22 && params.get_g().first()==Some(&selected.held_g1), "STATIC_SRS_ANCHOR_MISMATCH")?;
        require(hash(&pk.pinning.pk.get_vk().to_bytes(SerdeFormat::RawBytes))==selected.template.vk_bytes_sha256,
            "STATIC_HELD_VK_PIN")?;
        require(hash(&encoded(config)?)==selected.template.config_sha256
            && hash(&encoded(&pk.pinning.metadata.break_points)?)==selected.template.breakpoints_sha256,
            "STATIC_HELD_LAYOUT_PIN")?;
        require(selected.expected_instances.len()==1 && selected.expected_instances[0].len()==34,
            "STATIC_EXPECTATION_SHAPE")?;
        require(pk.circuit.log_heights_per_air==selected.root_log_heights, "STATIC_LOG_HEIGHTS_MISMATCH")?;
        let protocol=compile(params,pk.pinning.pk.get_vk(),Config::kzg().with_num_instance(vec![34]));
        crate::identical(&protocol,&selected.held_protocol,"STATIC_PROTOCOL_MISMATCH")?;
        require(hash(&encoded(&protocol)?)==selected.template.protocol_sha256, "STATIC_PROTOCOL_PIN")?;
        let mut cs=ConstraintSystem::<Fr>::default();
        let layout=BaseCircuitBuilder::<Fr>::configure_with_params(&mut cs,config.clone());
        let MaybeRangeConfig::WithRange(range)=&layout.base else {return Err(Fault::Stop("STATIC_LOOKUP_CONFIG_MISSING"));};
        require(cs.minimum_rows()<=20 && layout.gate().max_rows==(1usize<<22)-cs.minimum_rows(),
            "STATIC_USABLE_ROWS_MISMATCH")?;
        require(cs.num_advice_columns()==pk.pinning.pk.get_vk().cs().num_advice_columns()
            && cs.advice_column_phase().iter().all(|p|*p==0)
            && config.num_advice_per_phase.len()==1
            && config.num_lookup_advice_per_phase==vec![1,0,0], "STATIC_COLUMNS_OR_PHASE_MISMATCH")?;
        // Preserve the exact held phase vector: only phase zero is populated.
        require(range.gate.basic_gates.len()==1 && !range.gate.basic_gates[0].is_empty()
            && range.lookup_advice.len()==config.num_lookup_advice_per_phase.len()
            && range.lookup_advice[0].len()==config.num_lookup_advice_per_phase[0]
            && range.lookup_advice.iter().skip(1).all(Vec::is_empty)
            && range.q_lookup.len()==config.num_lookup_advice_per_phase.len()
            && range.q_lookup.iter().all(Option::is_none), "STATIC_EMPTY_LOOKUP_PHASE_TAILS")?;
        let gate=layout.gate().basic_gates.first().ok_or(Fault::Stop("STATIC_GATE_COLUMNS_MISSING"))?;
        let lookup=range.lookup_advice.first().ok_or(Fault::Stop("STATIC_LOOKUP_COLUMNS_MISSING"))?;
        require(!lookup.is_empty() && gate.iter().enumerate().all(|(i,g)|g.value.index()==i),
            "STATIC_FUSED_COLUMN_MAPPING_MISMATCH")?;
        let gate_count=gate.len(); let cols=cs.num_advice_columns(); let n=1usize<<22;
        require(gate_count+lookup.len()==cols && lookup.iter().enumerate().all(|(i,c)|c.index()==gate_count+i),
            "STATIC_COLUMN_OVERLAP_OR_HOLE")?;
        let breaks=pk.pinning.metadata.break_points.first().ok_or(Fault::Stop("STATIC_BREAKPOINTS_MISSING"))?;
        require(pk.pinning.metadata.break_points.len()==1 && breaks.len()<gate_count
            && breaks.iter().all(|b|*b>0 && *b<layout.gate().max_rows), "STATIC_BREAKPOINT_BOUNDS")?;
        let a=pk.graph_program.advice_cells(); let l=pk.graph_program.lookup_cells();
        let required_bytes=cols.checked_mul(n).and_then(|v|v.checked_mul(std::mem::size_of::<Fr>()))
            .ok_or(Fault::Stop("STATIC_RESOURCE_OVERFLOW"))?;
        if required_bytes>selected.max_advice_bytes || a.checked_add(l).is_none_or(|v|v>selected.max_tape_cells) {
            return Err(Fault::Hold("STATIC_WITNESS_RESOURCE_BUDGET"));
        }
        require(threads==15, "STATIC_THREAD_PROFILE_MISMATCH")?;
        // Reject overflow before the SDK's dense required witness allocation.
        let mut start=0usize; let mut ends=Vec::with_capacity(gate_count);
        for b in breaks {
            start=start.checked_add(*b).ok_or(Fault::Stop("STATIC_BREAKPOINT_SUM_OVERFLOW"))?;
            require(start<a,"STATIC_UNUSED_BREAKPOINT")?;
            ends.push(*b+1);
        }
        let tail=a.checked_sub(start).ok_or(Fault::Stop("STATIC_GATE_CAPACITY"))?;
        require(tail>0 && tail<=layout.gate().max_rows, "STATIC_GATE_CAPACITY")?;
        ends.push(tail); ends.resize(gate_count,0);
        require(l.div_ceil(lookup.len())<=layout.gate().max_rows, "STATIC_LOOKUP_CAPACITY")?;
        let mut state=GraphExecutorState::new(&pk.graph_program);
        let (advice,instances)=pk.generate_witness(root,threads,&mut state);
        require(instances==selected.expected_instances, "STATIC_ACTUAL_INSTANCE_MISMATCH")?;
        require(advice.len()==cols && advice.iter().all(|c|c.len()==n), "STATIC_ACTUAL_ADVICE_SHAPE")?;
        let tape=state.advice(&pk.graph_program); let lookups=state.lookups(&pk.graph_program);
        require(tape.len()==a && lookups.len()==l, "STATIC_TAPE_SHAPE")?;
        // Independently walk the COMPLETE actual tape through the held mapping.
        // Each breakpoint duplicates its one boundary value into the next column.
        let mut offset=0usize;
        for (col,end) in ends.iter().enumerate() {
            for row in 0..*end {
                require(advice[col][row]==tape[offset+row], "STATIC_GATE_PLACEMENT_MISMATCH")?;
            }
            if col<breaks.len() {offset+=breaks[col];}
            for value in &advice[col][*end..] {require(*value==Fr::ZERO,"STATIC_UNUSED_GATE_ROW_NONZERO")?;}
        }
        for (i,value) in lookups.iter().enumerate() {
            require(advice[lookup[i%lookup.len()].index()][i/lookup.len()]==*value, "STATIC_LOOKUP_PLACEMENT_MISMATCH")?;
        }
        for (i,col) in lookup.iter().enumerate() {
            let used=if l<=i {0} else {(l-i).div_ceil(lookup.len())};
            for value in &advice[col.index()][used..] {require(*value==Fr::ZERO,"STATIC_UNUSED_LOOKUP_ROW_NONZERO")?;}
        }
        journal.fit("static",0,&serde_json::json!({"schema":"continuity.r3_1.static-fit.v1",
            "adviceCells":a,"lookupCells":l,"columnLengths":advice.iter().map(Vec::len).collect::<Vec<_>>(),
            "gateUsedRows":ends,"usableRows":layout.gate().max_rows,"denseRequiredWitnessBytes":required_bytes,
            "actualInstancesSha256":hash(&encoded(&instances)?),"protocolSha256":selected.template.protocol_sha256,
            "templateReceiptSha256":selected.template.receipt_sha256,"placementChecked":true,
            "fullConstraintsValidated":false,"wrapperFit":"NOT_ESTABLISHED","permitsExecution":false}))?;
        drop(state);
        journal.reserve("static-proof",0)?;
        // SAME populated columns. No second witness/graph construction.
        let snark=snark_verifier_sdk::halo2::gen_snark_from_base(params,&pk.pinning.pk,advice,instances);
        crate::identical(&snark.protocol,&selected.held_protocol,"STATIC_OUTPUT_PROTOCOL_MISMATCH")?;
        require(snark.instances==selected.expected_instances,"STATIC_OUTPUT_INSTANCE_MISMATCH")?;
        Ok(snark)
    })
}
