//! Proposed application successor. No source evaluation is proof acceptance.
#[cfg(not(feature = "openvm-secp"))]
compile_error!("Select the unchanged explicit c05 OpenVM secp configuration");

// Unchanged selected OpenVM defaults provide deny-only0.2/0.3 backends.
// Do not register a second __getrandom_custom symbol in this root binary.

openvm::init!();

fn main() {
    let bytes = openvm::io::read_vec();
    assert!(bytes.len() <= continuity_r3_application_guest::MAX_INPUT_BYTES, "RAW_ENVELOPE_BOUND");
    let input = std::str::from_utf8(&bytes).expect("UTF8");
    let result = continuity_r3_application_guest::evaluate(input).expect("R3_ENGINE_REFUSED");
    assert!(result["requiredPredicateSatisfied"] == serde_json::Value::Bool(true), "R3_REQUIRED_PREDICATE_UNAVAILABLE_OR_FALSE");
    openvm::io::reveal_bytes32(continuity_r3_application_guest::commitment(&result).expect("RESULT_COMMITMENT"));
}
