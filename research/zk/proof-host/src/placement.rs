//! Streaming constrained Mock-stage Assignment; held fixed/sigma comparison.
//! No dense advice/fixed/selector domain arrays; full constraints NOT checked.
use crate::{fail,require,Fault,Result,permutation_fit::{PermutationFit,PermutationSummary}};
use halo2_base::halo2_proofs::{circuit::Value,
    halo2curves::{bn256::{Fr,G1Affine},ff::{Field,PrimeField}},
    plonk::{Advice,Any,Assigned,Assignment,Challenge,Column,Error,Fixed,Instance,Selector,ProvingKey}};
use std::{cell::Cell,collections::HashSet};
use sha2::{Digest,Sha256};

pub fn placement_event(digest:&mut Sha256,tag:u8,col:usize,row:usize,value:Fr) {
    digest.update([tag]);digest.update((col as u64).to_le_bytes());
    digest.update((row as u64).to_le_bytes());digest.update(value.to_repr().as_ref());
}
#[derive(serde::Serialize)]
pub struct Summary {
    pub advice_counts:Vec<usize>,pub advice_last_rows:Vec<Option<usize>>,
    pub fixed_assignment_counts:Vec<usize>,pub fixed_table_cells:usize,pub fixed_tail_cells:usize,
    pub events:usize,pub phases:usize,pub advice_placement_sha256:String,
    pub ordered_operations_sha256:String,pub complete_fixed_sha256:String,
    pub selector_assignments:usize,pub unique_selector_cells:usize,
    pub selector_set_capacity:usize,pub selector_accounting_bytes:usize,
    pub copy_assignments:usize,pub instance_queries:usize,pub instance_rows_constrained:u64,
    pub permutation:PermutationSummary,pub full_constraints_validated:bool,
}
pub struct Recorder<'a> {
    pk:&'a ProvingKey<G1Affine>,instances:&'a [Vec<Fr>],n:usize,
    phases:Vec<u8>,usable_rows:usize,gate_rows:usize,fixed_columns:usize,selector_columns:usize,
    table_column:usize,table_rows:usize,table_next:usize,tail_done:bool,
    counts:Vec<usize>,last:Vec<Option<usize>>,fixed_counts:Vec<usize>,
    selectors:HashSet<(usize,usize)>,selector_calls:usize,max_selector_cells:usize,
    max_selector_bytes:usize,permutation:PermutationFit,instance_queries:Cell<usize>,instance_mask:u64,
    max_events:usize,events:usize,advice_digest:Sha256,operation_digest:Sha256,
    in_region:bool,namespace_depth:usize,
}
impl<'a> Recorder<'a> {
    #[allow(clippy::too_many_arguments)]
    pub fn new(pk:&'a ProvingKey<G1Affine>,instances:&'a [Vec<Fr>],phases:Vec<u8>,
        n:usize,usable_rows:usize,gate_rows:usize,fixed_columns:usize,selector_columns:usize,
        table_column:usize,table_rows:usize,max_events:usize,max_selector_cells:usize,
        max_copy_cells:usize,max_structural_bytes:usize)->Result<Self> {
        require(phases==vec![0] && gate_rows<=usable_rows && usable_rows<n
            && table_rows<=gate_rows && table_column<fixed_columns
            && instances.len()==1 && instances[0].len()==46,
            "RECORDER_CONFIG_MISMATCH")?;
        if max_events==0 || max_selector_cells==0 || max_copy_cells==0 || max_structural_bytes<8192 {
            return Err(Fault::Hold("RECORDER_RESOURCE_BUDGET_UNSELECTED"));
        }
        require(pk.fixed_values().len()==fixed_columns.checked_add(selector_columns)
                .ok_or(Fault::Stop("FIXED_COLUMN_COUNT_OVERFLOW"))?
            && pk.fixed_values().iter().all(|p|p.len()==n),"HELD_FIXED_DIMENSIONS")?;
        let permutation=PermutationFit::new(pk.get_vk().cs().permutation().get_columns(),n,
            max_copy_cells,max_structural_bytes/2)?;
        // Exact selected profile has one advice column. Small dimension vectors
        // are bounded by held CS shape; dynamic sets use checked reservations.
        Ok(Self {pk,instances,n,counts:vec![0;phases.len()],last:vec![None;phases.len()],
            fixed_counts:vec![0;fixed_columns],phases,usable_rows,gate_rows,fixed_columns,selector_columns,
            table_column,table_rows,table_next:0,tail_done:false,selectors:HashSet::new(),selector_calls:0,
            max_selector_cells,max_selector_bytes:max_structural_bytes/2,permutation,
            instance_queries:Cell::new(0),instance_mask:0,max_events,events:0,
            advice_digest:Sha256::new(),operation_digest:Sha256::new(),in_region:false,namespace_depth:0})
    }
    fn check(&self,ok:bool,code:&'static str) {if !ok {fail(Fault::Stop(code));}}
    fn event(&mut self,tag:u8,col:usize,row:usize,value:Fr) {
        if self.events>=self.max_events {fail(Fault::Hold("RECORDER_EVENT_BUDGET_EXCEEDED"));}
        self.events+=1;placement_event(&mut self.operation_digest,tag,col,row,value);
    }
    fn known(value:Value<Assigned<Fr>>)->Assigned<Fr> {
        let mut selected=None;let _=value.map(|v|selected=Some(v));
        selected.unwrap_or_else(||fail(Fault::Hold("RECORDER_UNKNOWN_ASSIGNMENT")))
    }
    fn selector_accounting(cap:usize)->Result<usize> {
        cap.checked_mul(std::mem::size_of::<(usize,usize)>()+32)
            .and_then(|x|x.checked_add(4096)).ok_or(Fault::Stop("SELECTOR_SIZE_OVERFLOW"))
    }
    fn endpoint(&self,column:Column<Any>,row:usize) {
        self.check(row<self.usable_rows,"COPY_USABLE_ROW_BOUNDS");
        match column.column_type() {
            Any::Advice(_)=>self.check(column.index()<self.phases.len()
                && self.last[column.index()].is_some_and(|last|row<=last),"COPY_UNASSIGNED_ADVICE"),
            Any::Fixed=>self.check(column.index()<self.fixed_columns
                && (row<self.fixed_counts[column.index()] || (column.index()==self.table_column
                    && self.tail_done && row>=self.table_rows)),"COPY_UNASSIGNED_FIXED"),
            Any::Instance=>self.check(column.index()==0 && row<46,"COPY_INSTANCE_BOUNDS"),
        }
    }
    pub fn finish(self)->Result<Summary> {
        require(!self.in_region && self.namespace_depth==0 && self.table_next==self.table_rows
            && self.tail_done && self.instance_mask==((1u64<<46)-1),"RECORDER_INCOMPLETE_SYNTHESIS")?;
        // Compare EVERY held fixed-domain entry. Assigned values were checked
        // on callbacks; these scans require complete unassigned holes/tails ZERO.
        let mut digest=Sha256::new();
        for col in 0..self.fixed_columns {
            for row in 0..self.n {
                let assigned=row<self.fixed_counts[col] || (col==self.table_column
                    && self.tail_done && row>=self.table_rows && row<self.usable_rows);
                let value=self.pk.fixed_values()[col][row];
                if !assigned {require(value==Fr::ZERO,"HELD_FIXED_UNASSIGNED_NONZERO")?;}
                placement_event(&mut digest,2,col,row,value);
            }
        }
        for selector in 0..self.selector_columns {
            let col=self.fixed_columns+selector;
            for row in 0..self.n {
                let expected=if self.selectors.contains(&(selector,row)) {Fr::ONE} else {Fr::ZERO};
                require(self.pk.fixed_values()[col][row]==expected,"HELD_SELECTOR_COMPLETE_VALUE_MISMATCH")?;
                placement_event(&mut digest,4,col,row,expected);
            }
        }
        let copy_assignments=self.permutation.finish(self.pk)?;
        Ok(Summary {advice_counts:self.counts,advice_last_rows:self.last,
            fixed_assignment_counts:self.fixed_counts,fixed_table_cells:self.table_next,
            fixed_tail_cells:self.usable_rows-self.table_rows,events:self.events,phases:1,
            advice_placement_sha256:format!("{:x}",self.advice_digest.finalize()),
            ordered_operations_sha256:format!("{:x}",self.operation_digest.finalize()),
            complete_fixed_sha256:format!("{:x}",digest.finalize()),selector_assignments:self.selector_calls,
            unique_selector_cells:self.selectors.len(),selector_set_capacity:self.selectors.capacity(),
            selector_accounting_bytes:Self::selector_accounting(self.selectors.capacity())?,
            copy_assignments:copy_assignments.copies,instance_queries:self.instance_queries.get(),
            instance_rows_constrained:self.instance_mask,permutation:copy_assignments,full_constraints_validated:false})
    }
}
impl Assignment<Fr> for Recorder<'_> {
    fn enter_region<NR:Into<String>,N:FnOnce()->NR>(&mut self,_:N) {
        self.check(!self.in_region,"RECORDER_NESTED_REGION");self.in_region=true;self.event(10,0,0,Fr::ZERO);
    }
    fn annotate_column<A:FnOnce()->AR,AR:Into<String>>(&mut self,_:A,column:Column<Any>) {
        match column.column_type() {
            Any::Advice(_)=>self.check(column.index()<self.phases.len(),"RECORDER_ADVICE_ANNOTATION"),
            Any::Fixed=>self.check(column.index()<self.fixed_columns,"RECORDER_FIXED_ANNOTATION"),
            Any::Instance=>self.check(column.index()==0,"RECORDER_INSTANCE_ANNOTATION"),
        }
    }
    fn exit_region(&mut self) {
        self.check(self.in_region,"RECORDER_REGION_NOT_ENTERED");self.in_region=false;self.event(11,0,0,Fr::ZERO);
    }
    fn enable_selector<A:FnOnce()->AR,AR:Into<String>>(&mut self,_:A,selector:&Selector,row:usize)->std::result::Result<(),Error> {
        let index=selector.index();
        self.check(self.in_region && index<self.selector_columns && row<self.gate_rows,"RECORDER_SELECTOR_BOUNDS");
        self.check(self.pk.fixed_values()[self.fixed_columns+index][row]==Fr::ONE,"HELD_SELECTOR_ASSIGNED_VALUE_MISMATCH");
        if !self.selectors.contains(&(index,row)) {
            if self.selectors.len()>=self.max_selector_cells {fail(Fault::Hold("RECORDER_SELECTOR_TOUCH_CAP"));}
            let next=self.selectors.capacity().max(4).checked_mul(2)
                .unwrap_or_else(||fail(Fault::Stop("SELECTOR_SIZE_OVERFLOW")));
            if self.selectors.len()==self.selectors.capacity()
                && Self::selector_accounting(next).unwrap_or_else(|f|fail(f))>self.max_selector_bytes {
                fail(Fault::Hold("RECORDER_SELECTOR_ALLOCATION_CAP"));
            }
            self.selectors.try_reserve(1).unwrap_or_else(|_|fail(Fault::Hold("RECORDER_SELECTOR_ALLOCATION_FAILED")));
            self.check(Self::selector_accounting(self.selectors.capacity()).unwrap_or_else(|f|fail(f))<=self.max_selector_bytes,
                "RECORDER_SELECTOR_ACTUAL_CAPACITY");
            self.selectors.insert((index,row));
        }
        self.selector_calls=self.selector_calls.checked_add(1).unwrap_or_else(||fail(Fault::Stop("SELECTOR_COUNT_OVERFLOW")));
        self.event(4,index,row,Fr::ONE);Ok(())
    }
    fn query_instance(&self,column:Column<Instance>,row:usize)->std::result::Result<Value<Fr>,Error> {
        self.check(column.index()==0 && row<self.usable_rows,"RECORDER_INSTANCE_BOUNDS");
        let count=self.instance_queries.get();
        if count>=self.max_events {fail(Fault::Hold("RECORDER_INSTANCE_QUERY_CAP"));}
        self.instance_queries.set(count+1);
        Ok(Value::known(self.instances[0].get(row).copied().unwrap_or(Fr::ZERO)))
    }
    fn assign_advice<'v>(&mut self,column:Column<Advice>,row:usize,to:Value<Assigned<Fr>>)->Value<&'v Assigned<Fr>> {
        let col=column.index();
        self.check(self.in_region && col<self.phases.len() && self.phases[col]==0
            && column.column_type().phase()==0 && row<self.gate_rows,"RECORDER_ADVICE_BOUNDS_OR_PHASE");
        self.check(self.last[col].is_none_or(|last|row==last+1),"RECORDER_ADVICE_COLLISION_OR_HOLE");
        self.check(self.last[col].is_some() || row==0,"RECORDER_ADVICE_START_ROW");
        let value=Self::known(to).evaluate();self.last[col]=Some(row);self.counts[col]+=1;
        placement_event(&mut self.advice_digest,1,col,row,value);self.event(1,col,row,value);
        // Pinned assign_with_constraints consumes only physical Cell location;
        // returned value references are unused. Source drift invalidates recipe.
        Value::unknown()
    }
    fn assign_fixed(&mut self,column:Column<Fixed>,row:usize,to:Assigned<Fr>) {
        let col=column.index();
        self.check(self.in_region && col<self.fixed_columns && row==self.fixed_counts[col]
            && row<self.gate_rows,"RECORDER_FIXED_COLLISION_OR_HOLE");
        let value=to.evaluate();self.check(self.pk.fixed_values()[col][row]==value,"HELD_FIXED_ASSIGNED_VALUE_MISMATCH");
        if col==self.table_column {
            self.check(row==self.table_next && row<self.table_rows && !self.tail_done
                && value==Fr::from(row as u64),"RECORDER_FIXED_TABLE_VALUE");self.table_next+=1;
        }
        self.fixed_counts[col]+=1;self.event(2,col,row,value);
    }
    fn copy(&mut self,l:Column<Any>,lr:usize,r:Column<Any>,rr:usize) {
        self.endpoint(l,lr);self.endpoint(r,rr);
        if matches!(l.column_type(),Any::Instance) || matches!(r.column_type(),Any::Instance) {
            self.check(!matches!(l.column_type(),Any::Instance) || !matches!(r.column_type(),Any::Instance),
                "RECORDER_INSTANCE_TO_INSTANCE_COPY");
            let row=if matches!(l.column_type(),Any::Instance) {lr} else {rr};
            self.check(self.instance_mask&(1u64<<row)==0,"RECORDER_DUPLICATE_INSTANCE_CONSTRAINT");
            self.instance_mask|=1u64<<row;
        }
        self.permutation.copy(l,lr,r,rr).unwrap_or_else(|f|fail(f));
        self.event(5,l.index(),lr,Fr::ZERO);
        self.operation_digest.update(format!("{:?}:{:?}:{rr}",l.column_type(),r).as_bytes());
    }
    fn fill_from_row(&mut self,column:Column<Fixed>,row:usize,to:Value<Assigned<Fr>>)->std::result::Result<(),Error> {
        self.check(!self.in_region && column.index()==self.table_column && row==self.table_rows
            && self.table_next==row && !self.tail_done,"RECORDER_FIXED_FILL_OVERLAP");
        let value=Self::known(to).evaluate();self.check(value==Fr::ZERO,"RECORDER_FIXED_FILL_VALUE");
        for r in row..self.usable_rows {self.check(self.pk.fixed_values()[column.index()][r]==value,"HELD_FIXED_FILL_VALUE_MISMATCH");}
        self.event(3,column.index(),row,value);self.operation_digest.update((self.usable_rows as u64).to_le_bytes());
        self.tail_done=true;Ok(())
    }
    fn get_challenge(&self,_:Challenge)->Value<Fr> {fail(Fault::Hold("RECORDER_CHALLENGE_UNSUPPORTED"))}
    fn push_namespace<NR:Into<String>,N:FnOnce()->NR>(&mut self,_:N) {
        self.check(self.namespace_depth<64,"RECORDER_NAMESPACE_DEPTH");self.namespace_depth+=1;
    }
    fn pop_namespace(&mut self,_:Option<String>) {
        self.check(self.namespace_depth>0,"RECORDER_NAMESPACE_UNDERFLOW");self.namespace_depth-=1;
    }
    fn next_phase(&mut self) {fail(Fault::Hold("RECORDER_PHASE_ADVANCE_UNSUPPORTED"))}
}
