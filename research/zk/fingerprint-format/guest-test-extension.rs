// Separate native test overlay only. The original lib.rs prefix and all other
// guest modules remain byte-identical. No call to the full guest evaluator.
pub fn fingerprint_format_controls(fixture: &J) -> Result<J> {
    need(fixture["schema"] == "continuity.fingerprint-format-control.fixture.v1"
        && fixture["publicSynthetic"] == true, "FORMAT_PUBLIC_FIXTURE")?;
    let request = &fixture["request"];
    let envelope = &fixture["envelope"];
    for (value, name) in [(request, "requestFormats"), (envelope, "envelopeFormats")] {
        need(wire::canonical(value).map_err(invalid)? == fixture[name]["legacyUtf16KeyOrder"]["canonical"], "FORMAT_LEGACY_REFERENCE_BYTES")?;
        need(common::canonical(value)? == fixture[name]["engineUtf8KeyOrder"]["canonical"], "FORMAT_ENGINE_REFERENCE_BYTES")?;
        need(wire::hash_bytes(wire::canonical(value).map_err(invalid)?.as_bytes()) == fixture[name]["legacyUtf16KeyOrder"]["sha256"], "FORMAT_LEGACY_REFERENCE_DIGEST")?;
        need(common::hash(value)? == fixture[name]["engineUtf8KeyOrder"]["sha256"], "FORMAT_ENGINE_REFERENCE_DIGEST")?;
        need(fixture[name]["legacyUtf16KeyOrder"]["sha256"] != fixture[name]["engineUtf8KeyOrder"]["sha256"], "FORMAT_FIXTURE_MUST_DISTINGUISH_ORDER")?;
    }
    let legacy_request = fixture["requestFormats"]["legacyUtf16KeyOrder"]["sha256"].clone();
    let engine_request = fixture["requestFormats"]["engineUtf8KeyOrder"]["sha256"].clone();
    let legacy_row = fixture["envelopeFormats"]["legacyUtf16KeyOrder"]["sha256"].clone();
    let engine_row = fixture["envelopeFormats"]["engineUtf8KeyOrder"]["sha256"].clone();
    let mut results = Vec::new();
    exhaustion::request_record_digest(&json!({"requestDigest":engine_request}), request,
        &json!({"serviceRequestDigest":engine_request}))?;
    results.push(json!({"id":"engine-request-positive","expected":"ACCEPT","observed":"ACCEPT","guard":"request_record_digest"}));
    let wrong = exhaustion::request_record_digest(&json!({"requestDigest":legacy_request}), request,
        &json!({"serviceRequestDigest":legacy_request})).expect_err("Old-format request fingerprint unexpectedly accepted");
    need(wrong.category == "INVALID_INPUT" && wrong.code == "EXHAUSTION_REQUEST_RECORD_DIGEST", "FORMAT_EXACT_REQUEST_REFUSAL")?;
    results.push(json!({"id":"legacy-request-in-engine-slot","expectedCategory":"INVALID_INPUT","expectedCode":"EXHAUSTION_REQUEST_RECORD_DIGEST","observed":wrong.as_json(),"guard":"request_record_digest"}));

    let store = &fixture["identity"]["storeId"];
    let service_stream = &fixture["identity"]["stream"];
    let config = json!({"custody":{"storeId":store},"streams":{"service":service_stream,"source":"public-source","inventory":"public-inventory","recipient":"public-recipient"}});
    let row = json!({"sequence":1,"previousDigest":"0".repeat(64),"digest":legacy_row,"operationId":envelope["operationId"],"record":request});
    let custody = json!({"serviceRecords":[row],"sourceRecords":[],"inventoryRecords":[],"recipientRecords":[]});
    let mut heads = json!({});
    heads["service"] = json!({"schema":"continuity.custody.head.v1","storeId":store,"stream":service_stream,"sequence":1,"digest":legacy_row});
    for (name, stream) in [("source","public-source"),("inventory","public-inventory"),("recipient","public-recipient")] {
        heads[name] = json!({"schema":"continuity.custody.head.v1","storeId":store,"stream":stream,"sequence":0,"digest":"0".repeat(64)});
    }
    exhaustion::final_custody_heads(&config, &heads, &custody)?;
    results.push(json!({"id":"legacy-custody-positive","expected":"ACCEPT","observed":"ACCEPT","guard":"final_custody_heads"}));
    let mut wrong_custody = custody.clone();
    wrong_custody["serviceRecords"][0]["digest"] = engine_row.clone();
    let mut wrong_heads = heads.clone();
    wrong_heads["service"]["digest"] = engine_row;
    let wrong = exhaustion::final_custody_heads(&config, &wrong_heads, &wrong_custody)
        .expect_err("Engine-format custody record unexpectedly accepted");
    need(wrong.category == "INVALID_INPUT" && wrong.code == "CUSTODY_RECORD_DIGEST", "FORMAT_EXACT_CUSTODY_RECORD_REFUSAL")?;
    results.push(json!({"id":"engine-record-in-legacy-custody-slot","expectedCategory":"INVALID_INPUT","expectedCode":"CUSTODY_RECORD_DIGEST","observed":wrong.as_json(),"guard":"final_custody_heads/journal_head"}));
    let wrong = exhaustion::final_custody_heads(&config, &wrong_heads, &custody)
        .expect_err("Swapped-convention final head unexpectedly accepted");
    need(wrong.category == "INVALID_INPUT" && wrong.code == "EXHAUSTION_SIGNED_FINAL_CUSTODY_HEAD", "FORMAT_EXACT_FINAL_TIP_REFUSAL")?;
    results.push(json!({"id":"engine-tip-over-unchanged-legacy-record","expectedCategory":"INVALID_INPUT","expectedCode":"EXHAUSTION_SIGNED_FINAL_CUSTODY_HEAD","observed":wrong.as_json(),"guard":"final_custody_heads"}));
    Ok(json!({"schema":"continuity.fingerprint-format-control.results.v1","status":"FIVE_NATIVE_FUNCTION_CONTROLS_PASSED","records":results,"directFunctionCalls":5,"positiveControls":2,"formatSwapRefusals":3,"fullGuestEvaluations":0,"proofCalls":0,"QCalls":0,"captureCalls":0,"signingCalls":0,"permitsExecution":false,"scope":"Exact unchanged guest functions on public synthetic Unicode data; no new signature or zkVM proof claim"}))
}
