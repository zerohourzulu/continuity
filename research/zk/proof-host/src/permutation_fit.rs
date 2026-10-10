//! Source-bound sparse replica of Halo2 non-thread-safe Assembly::copy.
//! Untouched cells are implicit singletons. No key generation or commitments.
use crate::{require,Fault,Result};
use halo2_base::halo2_proofs::{halo2curves::{bn256::{Fr,G1Affine},ff::{Field,PrimeField}},
    plonk::{Any,Column,ProvingKey}};
use std::collections::HashMap;
use sha2::{Digest,Sha256};

type Position=(usize,usize);
#[derive(Clone,Copy)]
struct Node {mapping:Position,aux:Position,size:usize}
pub struct PermutationFit {
    columns:Vec<Column<Any>>, n:usize, max_touch:usize, max_bytes:usize,
    nodes:HashMap<Position,Node>, copies:usize,
}
#[derive(serde::Serialize)]
pub struct PermutationSummary {
    pub copies:usize,pub touched_cells:usize,pub map_capacity:usize,
    pub map_accounting_bytes:usize,pub compared_domain_cells:usize,
    pub complete_sigma_sha256:String,pub algorithm:&'static str,
}
impl PermutationFit {
    pub fn new(columns:Vec<Column<Any>>,n:usize,max_touch:usize,max_bytes:usize)->Result<Self> {
        if max_touch==0 || max_bytes==0 {return Err(Fault::Hold("PERMUTATION_BUDGET_UNSELECTED"));}
        require(n>0 && !columns.is_empty(),"PERMUTATION_PROFILE_EMPTY")?;
        // The active source feature closure MUST exclude thread-safe-region.
        // Its sorted-cycle algorithm is intentionally unsupported here.
        Ok(Self {columns,n,max_touch,max_bytes,nodes:HashMap::new(),copies:0})
    }
    fn node(&self,p:Position)->Node {
        self.nodes.get(&p).copied().unwrap_or(Node {mapping:p,aux:p,size:1})
    }
    fn accounting(cap:usize)->Result<usize> {
        // Conservative logical bucket accounting; allocator/RSS is separate.
        cap.checked_mul(std::mem::size_of::<(Position,Node)>()+32)
            .and_then(|x|x.checked_add(4096)).ok_or(Fault::Stop("PERMUTATION_SIZE_OVERFLOW"))
    }
    fn insert_singleton(&mut self,p:Position)->Result<()> {
        if !self.nodes.contains_key(&p) {
            if self.nodes.len()>=self.max_touch {return Err(Fault::Hold("PERMUTATION_TOUCH_CAP"));}
            // Predict worst-case next hash-table growth BEFORE allocation.
            let next=self.nodes.capacity().max(4).checked_mul(2)
                .ok_or(Fault::Stop("PERMUTATION_SIZE_OVERFLOW"))?;
            if self.nodes.len()==self.nodes.capacity() && Self::accounting(next)?>self.max_bytes {
                return Err(Fault::Hold("PERMUTATION_ALLOCATION_CAP"));
            }
            self.nodes.try_reserve(1).map_err(|_|Fault::Hold("PERMUTATION_ALLOCATION_FAILED"))?;
            require(Self::accounting(self.nodes.capacity())?<=self.max_bytes,"PERMUTATION_ACTUAL_CAPACITY")?;
            self.nodes.insert(p,Node {mapping:p,aux:p,size:1});
        }
        Ok(())
    }
    pub fn copy(&mut self,l:Column<Any>,lr:usize,r:Column<Any>,rr:usize)->Result<()> {
        let lc=self.columns.iter().position(|c|*c==l).ok_or(Fault::Stop("COPY_COLUMN_NOT_IN_HELD_PERMUTATION"))?;
        let rc=self.columns.iter().position(|c|*c==r).ok_or(Fault::Stop("COPY_COLUMN_NOT_IN_HELD_PERMUTATION"))?;
        require(lr<self.n && rr<self.n,"COPY_DOMAIN_BOUNDS")?;
        let left=(lc,lr);let right=(rc,rr);
        self.insert_singleton(left)?;self.insert_singleton(right)?;
        self.copies=self.copies.checked_add(1).ok_or(Fault::Stop("COPY_COUNT_OVERFLOW"))?;
        let mut left_cycle=self.node(left).aux;let mut right_cycle=self.node(right).aux;
        if left_cycle==right_cycle {return Ok(());}
        if self.node(left_cycle).size<self.node(right_cycle).size {
            std::mem::swap(&mut left_cycle,&mut right_cycle);
        }
        let merged=self.node(left_cycle).size.checked_add(self.node(right_cycle).size)
            .ok_or(Fault::Stop("PERMUTATION_CYCLE_SIZE_OVERFLOW"))?;
        self.nodes.get_mut(&left_cycle).ok_or(Fault::Stop("PERMUTATION_ROOT_MISSING"))?.size=merged;
        let mut i=right_cycle;let mut visits=0usize;
        loop {
            let next=self.node(i).mapping;
            self.nodes.get_mut(&i).ok_or(Fault::Stop("PERMUTATION_CYCLE_NODE_MISSING"))?.aux=left_cycle;
            visits=visits.checked_add(1).ok_or(Fault::Stop("PERMUTATION_VISIT_OVERFLOW"))?;
            require(visits<=self.nodes.len(),"PERMUTATION_CYCLE_LOOP")?;
            i=next;if i==right_cycle {break;}
        }
        // Source-exact final swap uses original endpoint cells, not cycle roots.
        let lm=self.node(left).mapping;let rm=self.node(right).mapping;
        self.nodes.get_mut(&left).unwrap().mapping=rm;
        self.nodes.get_mut(&right).unwrap().mapping=lm;
        Ok(())
    }
    pub fn finish(self,pk:&ProvingKey<G1Affine>)->Result<PermutationSummary> {
        let held=pk.permutation().permutations();
        require(held.len()==self.columns.len() && held.iter().all(|p|p.len()==self.n),
            "HELD_SIGMA_DIMENSIONS")?;
        require(pk.get_vk().cs().permutation().get_columns()==self.columns,"HELD_PERMUTATION_COLUMN_ORDER")?;
        let omega=pk.get_vk().get_domain().get_omega();
        let mut digest=Sha256::new();let mut delta=Fr::ONE;
        for (col,poly) in held.iter().enumerate() {
            let mut row_label=Fr::ONE;
            for row in 0..self.n {
                let mapped=self.node((col,row)).mapping;
                let expected=if mapped==(col,row) {delta*row_label} else {
                    require(mapped.0<held.len() && mapped.1<self.n,"SIGMA_MAPPING_BOUNDS")?;
                    Fr::DELTA.pow_vartime([mapped.0 as u64])*omega.pow_vartime([mapped.1 as u64])
                };
                require(poly[row]==expected,"HELD_SIGMA_VALUE_MISMATCH")?;
                digest.update((col as u64).to_le_bytes());digest.update((row as u64).to_le_bytes());
                digest.update(expected.to_repr().as_ref());row_label*=omega;
            }
            delta*=Fr::DELTA;
        }
        Ok(PermutationSummary {copies:self.copies,touched_cells:self.nodes.len(),
            map_capacity:self.nodes.capacity(),map_accounting_bytes:Self::accounting(self.nodes.capacity())?,
            compared_domain_cells:self.n.checked_mul(held.len()).ok_or(Fault::Stop("SIGMA_COUNT_OVERFLOW"))?,
            complete_sigma_sha256:format!("{:x}",digest.finalize()),algorithm:"halo2-5e4f0e5-non-thread-safe-union-swap"})
    }
}
