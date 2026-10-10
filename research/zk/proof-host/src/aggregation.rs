//! External copy of the stock hierarchy with a gate at EVERY actual proof call.
//! The selected one final inner wrap is explicit; no RootProver fallback loop.
use crate::{guarded, require, Fault, Journal, Result,
    stark_fit::{context_fit,held_air_fit,TraceContract}};
use openvm_sdk::{prover::{AggProver, InternalLayerMetadata, RootProver},
    config::{MAX_NUM_CHILDREN_LEAF,MAX_NUM_CHILDREN_INTERNAL},
    openvm_circuit::arch::ContinuationVmProof, SC, F};
use openvm_continuations::{circuit::{Circuit,inner::ProofsType},
    prover::ChildVkKind, RootSC};
use openvm_stark_backend::{StarkEngine,
    keygen::types::MultiStarkVerifyingKey, proof::Proof,
    prover::{DeviceDataTransporter,ProverDevice}};
use openvm_stark_sdk::config::baby_bear_poseidon2::{BabyBearPoseidon2CpuEngine as InnerE,CpuTranscript};
use openvm_verify_stark_host::VmStarkProof;

#[derive(Clone,Debug,PartialEq,Eq,serde::Serialize)]
pub struct Node { pub layer: usize, pub index: usize, pub children: usize, pub kind: &'static str }
pub struct LayerContract {
    pub vk: MultiStarkVerifyingKey<SC>,
    pub trace: TraceContract<[F;8]>,
}
pub struct AggregationContract {
    pub leaf: LayerContract,
    pub internal_for_leaf: LayerContract,
    pub recursive: LayerContract,
    pub recursive_self: LayerContract,
    pub selected_schedule: Vec<Node>,
    pub max_nodes: usize,
    pub max_recursive_depth: usize,
    pub final_inner_wraps: usize,
}

/// Pure source-proposed schedule derivation. Root must seal its result after
/// saved application closure, before the first inner proof. No unbounded retry.
pub fn schedule(segments: usize, leaf: usize, internal: usize,
    cap: usize, depth_cap: usize) -> Result<Vec<Node>> {
    require(segments>0 && leaf>0 && leaf<=MAX_NUM_CHILDREN_LEAF && internal>1
        && internal<=MAX_NUM_CHILDREN_INTERNAL, "AGG_TREE_CONFIG_MISMATCH")?;
    let mut nodes=Vec::new(); let mut input=segments; let mut layer=0;
    loop {
        let width=if layer==0 { leaf } else { internal };
        let count=input.div_ceil(width);
        for index in 0..count {
            if nodes.len()>=cap { return Err(Fault::Hold("AGG_NODE_BUDGET_EXCEEDED")); }
            nodes.push(Node {layer,index,children:width.min(input-index*width),
                kind:match layer {0=>"app",1=>"standard-leaf",2=>"standard-internal",_=>"recursive-self"}});
        }
        // Stock always creates recursive layer0, even for one internal-for-leaf
        // proof. The retained root adapter then adds exactly one inner wrap.
        if layer>=2 && count==1 { break; }
        layer+=1;
        if layer.saturating_sub(1)>depth_cap {return Err(Fault::Hold("AGG_DEPTH_BUDGET_EXCEEDED"));}
        input=count;
    }
    if nodes.len()>=cap || layer>depth_cap {return Err(Fault::Hold("AGG_WRAP_BUDGET_EXCEEDED"));}
    nodes.push(Node {layer:layer+1,index:0,children:1,kind:"selected-final-inner-wrap"});
    Ok(nodes)
}

pub fn prove_inner_once(agg: &AggProver, app: ContinuationVmProof<SC>,
    selected: &AggregationContract, journal: &mut dyn Journal) -> Result<(VmStarkProof,InternalLayerMetadata)> {
    guarded(|| {
        require(selected.final_inner_wraps==1, "UNSELECTED_ADDITIONAL_WRAP")?;
        let leaf_width=agg.agg_tree_config.num_children_leaf;
        let internal_width=agg.agg_tree_config.num_children_internal;
        let nodes=schedule(app.per_segment.len(),leaf_width,internal_width,
            selected.max_nodes,selected.max_recursive_depth)?;
        require(nodes==selected.selected_schedule, "SEALED_AGG_SCHEDULE_MISMATCH")?;
        for c in [&selected.leaf,&selected.internal_for_leaf,&selected.recursive,&selected.recursive_self] {
            require(c.trace.air_count==42, "INNER_AIR_CONTRACT_COUNT")?;
        }
        // All concrete layer type differences remain inside the inferred calls.
        macro_rules! node_proof {
            ($prover:expr,$contract:expr,$children:expr,$kind:expr,$node:expr,$serial:expr) => {{
                let prover=$prover; let contract=$contract;
                require(!prover.deferral_enabled(), "INNER_DEFERRAL_UNSUPPORTED")?;
                let pk=prover.get_pk(); let vk=prover.get_vk();
                held_air_fit(&pk,&contract.vk,&prover.get_circuit().airs(),42)?;
                crate::identical(&*vk,&contract.vk,"INNER_HELD_VK_MISMATCH")?;
                let engine=InnerE::<CpuTranscript>::new(pk.params.clone());
                let ctx=prover.generate_proving_ctx($children,$kind,ProofsType::Vm,None,
                    <<InnerE<CpuTranscript> as StarkEngine>::PD as ProverDevice<
                        <InnerE<CpuTranscript> as StarkEngine>::PB,
                        <InnerE<CpuTranscript> as StarkEngine>::TS
                    >>::device_ctx(engine.device()));
                let mut receipt=context_fit(&ctx,&contract.vk,&contract.trace)?;
                receipt["node"]=serde_json::to_value($node).map_err(|_|Fault::Stop("NODE_ENCODING"))?;
                journal.fit("inner",$serial,&receipt)?;
                journal.reserve("inner-proof",$serial)?;
                let d_pk=engine.device().transport_pk_to_device(&*pk);
                engine.prove(&d_pk,ctx).map_err(|_|Fault::Stop("INNER_PROOF_FAILED"))?
            }};
        }
        let mut current=app.per_segment; let mut serial=0; let mut layer=0;
        let mut recursive_layer=0u32; let mut internal_nodes=0usize;
        loop {
            let width=if layer==0 {leaf_width} else {internal_width};
            let mut next=Vec::with_capacity(current.len().div_ceil(width));
            for children in current.chunks(width) {
                let node=&nodes[serial];
                require(node.layer==layer && node.children==children.len(), "AGG_ACTUAL_NODE_MISMATCH")?;
                let proof=match layer {
                    0=>node_proof!(&agg.leaf_prover,&selected.leaf,children,ChildVkKind::App,node,serial),
                    1=>node_proof!(&agg.internal_for_leaf_prover,&selected.internal_for_leaf,children,ChildVkKind::Standard,node,serial),
                    2=>node_proof!(&agg.internal_recursive_prover,&selected.recursive,children,ChildVkKind::Standard,node,serial),
                    _=>node_proof!(&agg.internal_recursive_prover,&selected.recursive_self,children,ChildVkKind::RecursiveSelf,node,serial),
                };
                if layer>0 {internal_nodes+=1;} serial+=1; next.push(proof);
            }
            if layer>=2 { recursive_layer+=1; }
            current=next;
            if layer>=2 && current.len()==1 {break;} layer+=1;
        }
        let node=&nodes[serial];
        require(node.kind=="selected-final-inner-wrap" && current.len()==1, "FINAL_WRAP_NODE_MISMATCH")?;
        let final_inner=node_proof!(&agg.internal_recursive_prover,&selected.recursive_self,
            current.as_slice(),ChildVkKind::RecursiveSelf,node,serial);
        serial+=1; recursive_layer+=1; internal_nodes+=1;
        require(serial==nodes.len() && internal_nodes>0, "INNER_CENSUS_MISMATCH")?;
        journal.fit("inner-closure",serial,&serde_json::json!({"actualProofCount":serial,
            "internalRecursiveLayer":recursive_layer,"additionalFallbackWraps":0,
            "selectedFinalInnerWraps":1,"rootFit":"NOT_ESTABLISHED"}))?;
        Ok((VmStarkProof {inner:final_inner,user_pvs_proof:app.user_public_values,
            deferral_merkle_proofs:None},InternalLayerMetadata {
                internal_recursive_layer:recursive_layer,
                internal_node_idx:(internal_nodes-1).try_into().map_err(|_|Fault::Stop("INNER_INDEX_OVERFLOW"))?,
                proofs_type:ProofsType::Vm}))
    })
}

pub fn prove_root_once(root: &RootProver, carrier: VmStarkProof,
    vk: &MultiStarkVerifyingKey<RootSC>, trace: &TraceContract<<RootSC as openvm_stark_backend::StarkProtocolConfig>::Digest>,
    journal: &mut dyn Journal) -> Result<Proof<RootSC>> {
    guarded(|| {
        require(trace.air_count==42 && trace.exact_heights.as_ref().is_some_and(|x|x.len()==42), "ROOT_HEIGHT_CONTRACT")?;
        let heights=root.0.get_trace_heights().ok_or(Fault::Hold("HELD_ROOT_HEIGHTS_ABSENT"))?;
        require(Some(&heights)==trace.exact_heights.as_ref(), "ROOT_HELD_HEIGHTS_MISMATCH")?;
        let pk=root.0.get_pk();
        held_air_fit(&pk,vk,&root.0.get_circuit().airs(),42)?;
        let engine=root.create_engine();
        let ctx=root.generate_proving_ctx(carrier,&engine)
            .ok_or(Fault::Stop("ROOT_CONTEXT_NONE_NO_WRAP_OR_RETRY"))?;
        let receipt=context_fit(&ctx,vk,trace)?;
        journal.fit("root",0,&receipt)?; journal.reserve("root-proof",0)?;
        root.prove_from_ctx(ctx,&engine).map_err(|_|Fault::Stop("ROOT_PROOF_FAILED"))
    })
}
