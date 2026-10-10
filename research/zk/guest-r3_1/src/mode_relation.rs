//! Narrow historical mode relation. This is reached only after the evaluator's
//! unchanged replay/Q-context/receipt/cadence/numeric and enrollment checks.
//! Public enrollment and executable identity must be independently verified.
use crate::common::*;
use serde_json::Value as J;

pub(crate) struct ModeRelation {
    pub authenticated_session_mode: Option<String>,
    pub proof_mode: String,
    pub relationship: &'static str,
}

/// The exact pre-existing raw selection predicate, called once at its original
/// early evaluation boundary. No additional full-capture hash is introduced.
pub(crate) fn verify_capture_selection(selection: &J, proof_mode: &str, capture_wire: &str) -> Result<()> {
    need(
        selection.get("mode").and_then(J::as_str) == Some(proof_mode)
            && s(selection, "inputDigest")?
                == native_core::policy::wire::hash_bytes(capture_wire.as_bytes()),
        "EXACT_RAW_CAPTURE_SELECTION",
    )
}

pub(crate) fn derive(
    configured: bool,
    selection: &J,
    proof_mode: &str,
    predicate: &str,
    active_agreement: Option<&J>,
    pending_request: &J,
    pending_context: &J,
) -> Result<ModeRelation> {
    // The unchanged early selection/enrollment boundaries already authenticated
    // these exact capture bytes and proof mode. This private helper cannot
    // replace those checks or invent a future digest or signed session setting.
    if !configured {
        need(active_agreement.is_none(), "RETAINED_AUTHENTICATED_SESSION_ABSENT")?;
        return Ok(ModeRelation {
            authenticated_session_mode: None,
            proof_mode: proof_mode.to_owned(),
            relationship: "NOT_CONFIGURED",
        });
    }
    let active = active_agreement
        .ok_or_else(|| unavailable("AUTHENTICATED_SESSION_MODE_UNAVAILABLE"))?;
    let session_mode = s(active, "pMode")?;
    need(matches!(session_mode, "BUDGET" | "STATE" | "BOTH"), "ACTIVE_AGREEMENT_P_MODE")?;
    let relationship = if s(selection, "matrixId")? == "r3-handover-state" {
        need(
            proof_mode == "STATE"
                && session_mode == "BOTH"
                && predicate == "CAPTURED_ENGINE"
                && pending_request.is_null()
                && pending_context.is_null(),
            "ACTIVE_AGREEMENT_P_MODE",
        )?;
        "HISTORICAL_STATE_PROJECTION"
    } else {
        need(session_mode == proof_mode, "ACTIVE_AGREEMENT_P_MODE")?;
        "MATCHED"
    };
    Ok(ModeRelation {
        authenticated_session_mode: Some(session_mode.to_owned()),
        proof_mode: proof_mode.to_owned(),
        relationship,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // Data-only guard vectors; these cannot stand for a captured engine, Core
    // replay, signature, Q proof, guest execution or independent enrollment.
    fn selection(matrix: &str, mode: &str) -> J {
        json!({"matrixId":matrix,"mode":mode,
            "inputDigest":native_core::policy::wire::hash_bytes(b"guard-vector")})
    }
    fn call(matrix:&str, proof:&str, session:&str, predicate:&str, pending:&J, context:&J) -> Result<ModeRelation> {
        let selected=selection(matrix,proof);verify_capture_selection(&selected,proof,"guard-vector")?;
        derive(true,&selected,proof,predicate,
            Some(&json!({"pMode":session})),pending,context)
    }
    fn refused(result: Result<ModeRelation>, code:&str) {
        match result {
            Err(reason) => {assert_eq!(reason.category,"INVALID_INPUT");assert_eq!(reason.code,code);},
            Ok(_) => panic!("Expected narrowly refused mode relation"),
        }
    }
    #[test]
    fn explicit_historical_state_projection_and_matched_modes() {
        let r=call("r3-handover-state","STATE","BOTH","CAPTURED_ENGINE",&J::Null,&J::Null).unwrap();
        assert_eq!(r.authenticated_session_mode.as_deref(),Some("BOTH"));
        assert_eq!(r.proof_mode,"STATE");assert_eq!(r.relationship,"HISTORICAL_STATE_PROJECTION");
        for mode in ["BUDGET","STATE","BOTH"] {
            let r=call("matched-guard-vector",mode,mode,"CAPTURED_ENGINE",&J::Null,&J::Null).unwrap();
            assert_eq!(r.relationship,"MATCHED");assert_eq!(r.authenticated_session_mode.as_deref(),Some(mode));
        }
    }
    #[test]
    fn wrong_matrix_or_selected_mode_or_raw_digest_refuses() {
        refused(call("r3-core-count-both","STATE","BOTH","CAPTURED_ENGINE",&J::Null,&J::Null),"ACTIVE_AGREEMENT_P_MODE");
        let mut s=selection("r3-handover-state","STATE");
        s["mode"]=json!("BOTH");
        match verify_capture_selection(&s,"STATE","guard-vector") {Err(reason)=>assert_eq!(reason.code,"EXACT_RAW_CAPTURE_SELECTION"),Ok(_)=>panic!("Wrong selected mode accepted")};
        s["mode"]=json!("STATE");s["inputDigest"]=json!("0".repeat(64));
        match verify_capture_selection(&s,"STATE","guard-vector") {Err(reason)=>assert_eq!(reason.code,"EXACT_RAW_CAPTURE_SELECTION"),Ok(_)=>panic!("Wrong raw capture digest accepted")};
    }
    #[test]
    fn wrong_predicate_session_or_downgrade_refuses() {
        for predicate in ["CAPTURED_HISTORY","PROTECTED_DISPATCH"] {
            refused(call("r3-handover-state","STATE","BOTH",predicate,&J::Null,&J::Null),"ACTIVE_AGREEMENT_P_MODE");
        }
        refused(call("r3-handover-state","STATE","BUDGET","CAPTURED_ENGINE",&J::Null,&J::Null),"ACTIVE_AGREEMENT_P_MODE");
        refused(call("r3-handover-state","STATE","STATE","CAPTURED_ENGINE",&J::Null,&J::Null),"ACTIVE_AGREEMENT_P_MODE");
        refused(call("r3-handover-state","BUDGET","BOTH","CAPTURED_ENGINE",&J::Null,&J::Null),"ACTIVE_AGREEMENT_P_MODE");
        refused(call("r3-handover-state","BOTH","STATE","CAPTURED_ENGINE",&J::Null,&J::Null),"ACTIVE_AGREEMENT_P_MODE");
    }
    #[test]
    fn nonnull_pending_and_missing_pending_fields_are_not_null() {
        for value in [json!({}),json!(false),json!(""),json!([])] {
            refused(call("r3-handover-state","STATE","BOTH","CAPTURED_ENGINE",&value,&J::Null),"ACTIVE_AGREEMENT_P_MODE");
            refused(call("r3-handover-state","STATE","BOTH","CAPTURED_ENGINE",&J::Null,&value),"ACTIVE_AGREEMENT_P_MODE");
        }
        // Outer evaluator uses field(...), so missing fields never reach this
        // typed helper as J::Null. Full-envelope controls assert that boundary.
    }
    #[test]
    fn retained_mode_is_explicitly_not_configured_and_missing_session_is_unavailable() {
        let r=derive(false,&selection("full100","BUDGET"),"BUDGET","CAPTURED_HISTORY",None,&J::Null,&J::Null).unwrap();
        assert!(r.authenticated_session_mode.is_none());assert_eq!(r.relationship,"NOT_CONFIGURED");
        let r=derive(true,&selection("r3-handover-state","STATE"),"STATE","CAPTURED_ENGINE",None,&J::Null,&J::Null);
        match r {Err(reason)=>{assert_eq!(reason.category,"UNAVAILABLE");assert_eq!(reason.code,"AUTHENTICATED_SESSION_MODE_UNAVAILABLE");},Ok(_)=>panic!("Missing authenticated session accepted")};
    }
}
