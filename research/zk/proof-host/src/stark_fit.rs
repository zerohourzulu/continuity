//! Real context shape and held AIR checks. No key derivation or constraint proof.
use crate::{encoded, hash, identical, require, Fault, Result};
use openvm_stark_backend::{AirRef, StarkProtocolConfig,
    air_builders::symbolic::{get_symbolic_builder, SymbolicConstraintsDag},
    keygen::types::{MultiStarkProvingKey, MultiStarkVerifyingKey, TraceWidth},
    p3_matrix::Matrix,
    prover::{MatrixDimensions, MatrixView, ProverBackend, ProvingContext,
        stacked_pcs::StackedLayout}};
use serde::Serialize;

/// Commitments come from independently bound program/child-VK preprocessing,
/// never copied from the context being admitted. None on a cached AIR is HOLD.
pub struct TraceContract<C> {
    pub air_count: usize,
    pub max_height: usize,
    pub exact_heights: Option<Vec<usize>>,
    pub cached_commitments: Vec<Option<Vec<C>>>,
}

pub fn held_air_fit<SC>(pk: &MultiStarkProvingKey<SC>,
    expected: &MultiStarkVerifyingKey<SC>, airs: &[AirRef<SC>], count: usize) -> Result<()>
where SC: StarkProtocolConfig, SC::F: Serialize, SC::Digest: Serialize {
    identical(&pk.get_vk(), expected, "HELD_STARK_VK_MISMATCH")?;
    require(airs.len()==count && pk.per_air.len()==count, "ORDERED_AIR_COUNT_MISMATCH")?;
    // Stored maximum is the configured ceiling (keygen/mod.rs), not necessarily
    // the maximum symbolic degree actually used by an AIR.
    require(pk.max_constraint_degree==expected.inner.params.max_constraint_degree
        && pk.per_air.iter().all(|k|k.vk.max_constraint_degree as usize<=pk.max_constraint_degree),
        "STARK_DEGREE_MISMATCH")?;
    for (air, key) in airs.iter().zip(&pk.per_air) {
        let prep = air.preprocessed_trace();
        let width = TraceWidth { preprocessed: prep.as_ref().map(Matrix::width),
            cached_mains: air.cached_main_widths(), common_main: air.common_main_width() };
        identical(&width, &key.vk.params.width, "AIR_WIDTH_MISMATCH")?;
        require(air.num_public_values()==key.vk.params.num_public_values, "AIR_PV_WIDTH_MISMATCH")?;
        let symbolic = get_symbolic_builder(air.as_ref(), &width).constraints();
        require(symbolic.max_constraint_degree()==key.vk.max_constraint_degree as usize, "AIR_DEGREE_MISMATCH")?;
        let dag = SymbolicConstraintsDag::from(symbolic);
        identical(&dag, &key.vk.symbolic_constraints, "ORDERED_AIR_CONSTRAINTS_MISMATCH")?;
        require((dag.constraints.max_rotation()==1)==key.vk.params.need_rot
            && dag.constraints.max_rotation()<=1, "AIR_ROTATION_MISMATCH")?;
        match (prep, &key.preprocessed_data, &key.vk.preprocessed_data) {
            (None, None, None) => (),
            (Some(trace), Some(data), Some(vdata)) => {
                identical(&data.commit().map_err(|_| Fault::Stop("PREPROCESS_COMMIT_UNAVAILABLE"))?,
                    &vdata.commit, "PREPROCESS_COMMIT_MISMATCH")?;
                let view = data.mat_view(0);
                require(Matrix::height(&trace)==MatrixDimensions::height(&view)
                    && Matrix::width(&trace)==MatrixDimensions::width(&view), "PREPROCESS_SHAPE_MISMATCH")?;
                for r in 0..Matrix::height(&trace) { for c in 0..Matrix::width(&trace) {
                    require(Matrix::get(&trace,r,c)==MatrixView::get(&view,r,c).copied(), "PREPROCESS_VALUES_MISMATCH")?;
                }}
            },
            _ => return Err(Fault::Stop("PREPROCESS_PRESENCE_MISMATCH")),
        }
    }
    Ok(())
}

pub fn context_fit<PB, SC>(ctx: &ProvingContext<PB>, vk: &MultiStarkVerifyingKey<SC>,
    contract: &TraceContract<PB::Commitment>) -> Result<serde_json::Value>
where PB: ProverBackend, SC: StarkProtocolConfig<F=PB::Val,Digest=PB::Commitment>,
    PB::Val: Serialize, PB::Commitment: Serialize {
    let keys=&vk.inner.per_air;
    require(keys.len()==contract.air_count && contract.cached_commitments.len()==keys.len(), "TRACE_CONTRACT_COUNT")?;
    require(contract.max_height>0 && contract.max_height.is_power_of_two(), "TRACE_MAX_HEIGHT_ENCODING")?;
    if let Some(exact)=&contract.exact_heights { require(exact.len()==keys.len(), "HELD_HEIGHTS_COUNT")?; }
    let mut heights=vec![0usize; keys.len()]; let mut rows=Vec::with_capacity(ctx.per_trace.len());
    let mut previous=None;
    for (id, air) in &ctx.per_trace {
        require(*id<keys.len() && previous.is_none_or(|p| p<*id), "TRACE_ID_ORDER_OR_DUPLICATE")?;
        previous=Some(*id); let k=&keys[*id]; let h=air.height();
        require(h>0 && h.is_power_of_two() && h<=contract.max_height, "TRACE_HEIGHT_MISMATCH")?;
        heights[*id]=h;
        require(air.common_main.width()==k.params.width.common_main
            && air.public_values.len()==k.params.num_public_values
            && air.cached_mains.len()==k.params.width.cached_mains.len(), "TRACE_PART_SHAPE_MISMATCH")?;
        let commitments=air.cached_mains.iter().map(|m| m.commitment.clone()).collect::<Vec<_>>();
        for (m,w) in air.cached_mains.iter().zip(&k.params.width.cached_mains) {
            require(m.height()==h && m.trace.width()==*w, "CACHED_TRACE_SHAPE_MISMATCH")?;
        }
        if !commitments.is_empty() {
            let selected=contract.cached_commitments[*id].as_ref()
                .ok_or(Fault::Hold("CACHED_TRACE_EXPECTATION_UNAVAILABLE"))?;
            identical(&commitments, selected, "CACHED_TRACE_COMMITMENT_MISMATCH")?;
        } else if let Some(selected)=&contract.cached_commitments[*id] {
            require(selected.is_empty(), "CACHED_TRACE_PRESENCE_MISMATCH")?;
        }
        rows.push(serde_json::json!({"airId":id,"height":h,"commonWidth":air.common_main.width(),
            "cachedWidths":k.params.width.cached_mains,"numPublicValues":air.public_values.len(),
            "cachedCommitmentsSha256":hash(&encoded(&commitments)?),
            "heldAirSha256":hash(&encoded(k)?)}));
    }
    for (id,key) in keys.iter().enumerate() {
        require(!key.is_required || heights[id]>0, "REQUIRED_AIR_MISSING")?;
        if let Some(exact)=&contract.exact_heights { require(heights[id]==exact[id], "ORDERED_HELD_HEIGHT_MISMATCH")?; }
    }
    // Match the held verifier's actual stacking and padded-height semantics.
    // These public layouts contain only metadata, not trace data or commitments.
    let params=&vk.inner.params;
    let log_stacked=params.l_skip.checked_add(params.n_stack)
        .ok_or(Fault::Stop("STACKING_HEIGHT_OVERFLOW"))?;
    let minimum=1usize.checked_shl(u32::try_from(params.l_skip)
        .map_err(|_| Fault::Stop("STACKING_SKIP_OVERFLOW"))?)
        .ok_or(Fault::Stop("STACKING_SKIP_OVERFLOW"))?;
    require(log_stacked<(usize::BITS as usize), "STACKING_HEIGHT_OVERFLOW")?;
    for h in heights.iter().filter(|h| **h>0) {
        require(h.trailing_zeros() as usize<=log_stacked,
            "STACKING_HELD_HEIGHT_MISMATCH")?;
    }
    let effective=heights.iter().map(|h| if *h==0 {0} else {(*h).max(minimum)})
        .collect::<Vec<_>>();
    let mut present=ctx.per_trace.iter().collect::<Vec<_>>();
    present.sort_by(|(ia,a),(ib,b)| b.height().cmp(&a.height()).then(ia.cmp(ib)));
    let common=present.iter().map(|(id,a)|
        (keys[*id].params.width.common_main,a.height().trailing_zeros() as usize))
        .collect::<Vec<_>>();
    let layout=StackedLayout::new(params.l_skip,log_stacked,common)
        .map_err(|_| Fault::Stop("STACKING_COMMON_SHAPE_MISMATCH"))?;
    let mut total=layout.width();
    let mut widths=vec![layout.width()];
    for (id,a) in present {
        let width=&keys[*id].params.width;
        for w in width.preprocessed.iter().chain(&width.cached_mains) {
            let layout=StackedLayout::new(params.l_skip,log_stacked,
                vec![(*w,a.height().trailing_zeros() as usize)])
                .map_err(|_| Fault::Stop("STACKING_AUX_SHAPE_MISMATCH"))?;
            total=total.checked_add(layout.width())
                .ok_or(Fault::Stop("STACKING_WIDTH_OVERFLOW"))?;
            widths.push(layout.width());
        }
    }
    require(total<=params.w_stack, "STACKING_HELD_WIDTH_MISMATCH")?;
    // SDK uses strict < with PRESENT heights padded to 2^l_skip. Absent is zero.
    // Checked u128 prevents arithmetic wraparound.
    for constraint in &vk.inner.trace_height_constraints {
        require(constraint.coefficients.len()==heights.len(), "LINEAR_HEIGHT_CONTRACT_WIDTH")?;
        let mut sum=0u128;
        for (c,h) in constraint.coefficients.iter().zip(&effective) {
            sum=sum.checked_add((*c as u128)*(*h as u128)).ok_or(Fault::Stop("HEIGHT_ARITHMETIC_OVERFLOW"))?;
        }
        require(sum<(constraint.threshold as u128), "LINEAR_HEIGHT_CONSTRAINT_MISMATCH")?;
    }
    require(!vk.inner.trace_height_constraints.is_empty(), "HEIGHT_CONSTRAINTS_ABSENT")?;
    Ok(serde_json::json!({"schema":"continuity.r3_1.stark-fit.v1","orderedHeights":heights,
        "effectiveLinearHeights":effective,"stackingWidths":widths,
        "totalStackedWidth":total,"heldStackedWidth":params.w_stack,
        "lSkip":params.l_skip,"nStack":params.n_stack,
        "actualTraces":rows,"vkSha256":hash(&encoded(vk)?),"maxHeight":contract.max_height,
        "airConstraintEquality":true,"fullConstraintsValidated":false,
        "downstreamFit":"NOT_ESTABLISHED","permitsExecution":false}))
}
