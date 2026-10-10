//! UNBUILT r3.1 source proposal. No executable entry point or custody loader.
//! Root must bind the immutable source/dependency closure, independently decode
//! held objects with bounded EOF checks, and implement the journal before use.
pub mod application;
pub mod aggregation;
pub mod stark_fit;
pub mod static_fit;
pub mod placement;
pub mod permutation_fit;
pub mod wrapper;

use serde::Serialize;
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Serialize)]
pub enum Fault { Hold(&'static str), Stop(&'static str) }
pub type Result<T> = std::result::Result<T, Fault>;
pub fn require(ok: bool, code: &'static str) -> Result<()> {
    if ok { Ok(()) } else { Err(Fault::Stop(code)) }
}
pub fn hash(bytes: &[u8]) -> String { format!("{:x}", Sha256::digest(bytes)) }
pub fn encoded<T: Serialize>(value: &T) -> Result<Vec<u8>> {
    bitcode::serialize(value).map_err(|_| Fault::Stop("FIT_ENCODING_FAILED"))
}
pub fn identical<T: Serialize>(a: &T, b: &T, code: &'static str) -> Result<()> {
    require(encoded(a)? == encoded(b)?, code)
}

/// Trusted Root-owned IO implementation is REQUIRED. `fit` must durably save and
/// sync the closed receipt; `reserve` records a nonrefundable one-shot attempt
/// before its actual cryptographic call. No in-memory/no-op implementation here.
/// All receipts join independently administered source/input/key/config/SRS pins
/// through the Root-selected owner contract; they cannot authenticate themselves.
pub trait Journal {
    fn fit(&mut self, stage: &str, index: usize, receipt: &serde_json::Value) -> Result<()>;
    fn reserve(&mut self, stage: &str, index: usize) -> Result<()>;
}

/// SDK callbacks that return unit and void Assignment methods must unwind out
/// of the enclosing stage BEFORE its proof call. The enclosing stage converts
/// any other panic to STOP and never continues, retries or refunds reservations.
pub fn fail(fault: Fault) -> ! { std::panic::resume_unwind(Box::new(fault)) }
pub fn guarded<T>(call: impl FnOnce() -> Result<T>) -> Result<T> {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(call)) {
        Ok(result) => result,
        Err(panic) => match panic.downcast::<Fault>() {
            Ok(fault) => Err(*fault),
            Err(_) => Err(Fault::Stop("UNEXPECTED_STAGE_PANIC")),
        },
    }
}

/// Independently selected BEFORE circuit construction. Missing receipt is HOLD.
/// This joins held VK/config/protocol/fixed-template/source correspondence; it
/// is not a claim that Prover synthesis validates omitted constraints.
#[derive(Clone)]
pub struct TemplateContract {
    pub receipt_sha256: Option<String>,
    pub protocol_sha256: String,
    pub vk_bytes_sha256: String,
    pub config_sha256: String,
    pub breakpoints_sha256: String,
    pub source_closure_sha256: String,
    /// Prover special single-advice-column lookup omits selectors and location
    /// metadata. Only a separately retained held-template correspondence can
    /// establish this bounded template axis. No fabricated default is supplied.
    pub special_lookup_correspondence_sha256: Option<String>,
}
impl TemplateContract {
    pub fn required(&self) -> Result<()> {
        let receipt = self.receipt_sha256.as_ref()
            .ok_or(Fault::Hold("HELD_TEMPLATE_CORRESPONDENCE_UNAVAILABLE"))?;
        for value in [receipt, &self.protocol_sha256, &self.vk_bytes_sha256,
            &self.config_sha256, &self.breakpoints_sha256, &self.source_closure_sha256] {
            require(value.len()==64 && value.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)), "TEMPLATE_PIN_ENCODING")?;
        }
        Ok(())
    }
}
