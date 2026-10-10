// Human display only: fixed source-established causes/actions; no raw details.
const knownCodes=new Set([
  "ACCEPTED",
  "ADMINISTRATIVE_READBACK_MISMATCH",
  "ADMISSION_NOT_DURABLE_AT_EXECUTOR_ENTRY",
  "ADMITTED",
  "AGENT_APPOINTED",
  "AGENT_CREATED",
  "AGENT_TERMINATED",
  "ALLOW",
  "APPEND_READBACK_MISMATCH",
  "APPLICATION_RECORDED_WORK",
  "ASSIGN_PERFORMANCE",
  "AUTHORITY_GRANTED",
  "AWAITING_INTAKE",
  "BEFORE_PACKET_WRITE",
  "CAPTURED",
  "CASE_CONFIG_DOMAIN",
  "CASE_CONFIG_FIELDS",
  "CASE_CONFIG_TERMS",
  "CASE_EVENT_LIMIT",
  "CASE_HISTORY_DOMAIN",
  "CASE_HISTORY_LIMIT",
  "CASE_ID_MUST_BE_LOWERCASE_SLUG",
  "CASE_TERMS_CHANGED",
  "COMPLETE",
  "CONTROL_EPOCH_ADVANCED",
  "DENIED",
  "DEPLOYMENT_INITIALIZED",
  "DIRECTORY_MUST_NOT_BE_ALIASED",
  "EEXIST",
  "ENOENT",
  "EVENT_TIMESTAMP",
  "EXPERIMENTAL_PROFILE",
  "EXPORTED",
  "EXPORT_ALREADY_EXISTS",
  "EXTERNAL",
  "HANDOVER_ALREADY_COMPLETE",
  "HANDOVER_COMPLETE",
  "HANDOVER_DUPLICATE_STEP",
  "HANDOVER_INTERLEAVED_HISTORY",
  "HANDOVER_NONPREFIX_STEPS",
  "HANDOVER_OPTIONS",
  "HANDOVER_PARTIAL_HISTORY_CHANGED",
  "HANDOVER_PAUSED",
  "HANDOVER_PREDECESSOR_STATE",
  "HANDOVER_REQUIRED",
  "HANDOVER_STEP_MISMATCH",
  "HANDOVER_STOP_STEP",
  "HANDOVER_UNEXPECTED_START",
  "HISTORICAL_SIGNATURE_AND_SCOPE_VERIFIED",
  "HISTORY_CAPTURE_FAILED",
  "IDEMPOTENCY_FINGERPRINT_CONFLICT",
  "INTENT_ALREADY_DECLARED_RECONCILE_FIRST",
  "INVALID_LOCAL_JSON",
  "IN_PROGRESS",
  "LOCAL_ONLY",
  "LOCAL_PACKET_WRITE",
  "NOT_ADMITTED",
  "NOT_PROVEN",
  "NOT_STARTED",
  "NO_CORE_DUTY_RECONCILE_INTAKE_FIRST",
  "NO_RECORDS",
  "OBLIGATE",
  "OBLIGATION_CREATED",
  "OBLIGATION_PERFORMANCE_ASSIGNED",
  "OBLIGATION_STATUS_RECORDED",
  "OLD_WORKER_NO_LONGER_CURRENT",
  "OPEN",
  "OUTCOME_UNKNOWN",
  "PACKET_DOES_NOT_MATCH_CANONICAL_ACKNOWLEDGMENT",
  "PACKET_NOT_VERIFIED",
  "PACKET_UNAVAILABLE_REVIEW_UNRESOLVED",
  "PACKET_VERIFIED",
  "PERMISSION",
  "PRINCIPAL_CREATED",
  "PUBLIC_DEVELOPMENT_KEYS",
  "RECEIPT_RECORDED",
  "RECONCILIATION_ONLY",
  "RECONCILIATION_REQUIRED",
  "REPLAY_VERIFIED",
  "RESPONSIBLE",
  "RETAINED_PACKET_VERIFIED",
  "RETRY",
  "REVIEWED",
  "REVIEW_ACTOR_BINDING",
  "REVIEW_ACTOR_UNKNOWN",
  "REVIEW_AGENT_INACTIVE",
  "REVIEW_ALREADY_RECORDED",
  "REVIEW_ASSIGNMENT_REQUIRED",
  "REVIEW_AUTHORITY_REQUIRED",
  "REVIEW_AUTHORIZATION_BINDING",
  "REVIEW_DUTY",
  "REVIEW_FILE_NOT_SELECTED",
  "REVIEW_HEAD_CHANGED",
  "REVIEW_HISTORY_BINDING",
  "REVIEW_HISTORY_ORDER",
  "REVIEW_INDEPENDENT_GRANT_REQUIRED",
  "REVIEW_NOTE_ID_CONFLICT",
  "REVIEW_PACKET_BINDING",
  "REVIEW_PACKET_UNAVAILABLE",
  "REVIEW_PROGRESS_INVALID",
  "REVIEW_RECORDED",
  "REVIEW_RECORD_CHAIN",
  "REVIEW_RECORD_MEMBERSHIP",
  "REVIEW_ROLE_NOT_CURRENT",
  "REVIEW_SESSION_EXPIRED",
  "REVIEW_SESSION_FENCED",
  "REVIEW_SIGNATURE_INVALID",
  "ROLE_CREATED",
  "ROLE_TRANSFERRED",
  "RUNTIME_SESSION_ADMITTED",
  "STALE_REQUEST_CHANGED_PACKET",
  "STALE_WORKER_NOT_DENIED",
  "SUBMITTED",
  "SUCCESSION",
  "SUCCESSION_RULE_DECLARED",
  "SUCCESSOR_OPEN_DUTY_REQUIRED",
  "SURVIVES",
  "SYNTHETIC",
  "SYNTHETIC_LOCAL_CASE",
  "TERMINATED",
  "TRANSACTION_INTENT_DECLARED",
  "TRANSACTION_OUTCOME_RECORDED",
  "TRUSTED_COOPERATIVE_OPERATOR",
  "UNCERTAIN",
  "WHY",
  "WRITE_INCOMPLETE"
]);
const groups=[
  {
    "id": "review-permission",
    "codes": [
      "REVIEW_AUTHORITY_REQUIRED",
      "REVIEW_INDEPENDENT_GRANT_REQUIRED"
    ],
    "message": "The command could not establish the separate permission needed for review progress in the history being checked.",
    "action": "Ask the operator to inspect the review-progress grant at the relevant recorded time before another note. Changing current permissions does not repair an older note’s recorded evidence."
  },
  {
    "id": "review-assignment",
    "codes": [
      "REVIEW_AGENT_INACTIVE",
      "REVIEW_ROLE_NOT_CURRENT",
      "REVIEW_ASSIGNMENT_REQUIRED"
    ],
    "message": "In the history being checked, the selected reviewer does not have the required active identity, role or duty assignment.",
    "action": "Inspect the reviewer, role holder and assigned performer at the relevant recorded review time before deciding how to continue."
  },
  {
    "id": "review-session",
    "codes": [
      "REVIEW_SESSION_EXPIRED",
      "REVIEW_SESSION_FENCED"
    ],
    "message": "The selected review session does not meet the control or time checks in the history being checked.",
    "action": "Inspect the session, control epoch and relevant recorded review time. Do not automatically substitute a new session or retry the note."
  },
  {
    "id": "review-context",
    "codes": [
      "REVIEW_HEAD_CHANGED"
    ],
    "message": "The selected history, snapshot, proposal or prior notes do not match the review context checked by this command.",
    "action": "Keep the original selection and expected version. Inspect existing case state before separately reviewing any new context; do not automatically replace trusted values."
  },
  {
    "id": "packet-review-binding",
    "codes": [
      "REVIEW_PACKET_BINDING",
      "REVIEW_HISTORY_BINDING",
      "REVIEW_ACTOR_BINDING",
      "REVIEW_AUTHORIZATION_BINDING"
    ],
    "message": "The retained review record could not be bound to its expected case, packet, history or reviewer authorization.",
    "action": "Keep the original record and packet. Ask the operator to reconcile those bindings; do not edit the record or journal to make the check pass."
  },
  {
    "id": "packet-unavailable",
    "codes": [
      "REVIEW_PACKET_UNAVAILABLE",
      "PACKET_UNAVAILABLE_REVIEW_UNRESOLVED"
    ],
    "message": "The acknowledged packet required for this review was not established.",
    "action": "Keep the existing duty, intake records and packet. Inspect retained intake state before any new collection or review; this is not a verdict that the source material is false."
  },
  {
    "id": "review-record",
    "codes": [
      "REVIEW_PROGRESS_INVALID",
      "REVIEW_RECORD_CHAIN",
      "REVIEW_HISTORY_ORDER",
      "REVIEW_SIGNATURE_INVALID",
      "REVIEW_RECORD_MEMBERSHIP"
    ],
    "message": "A review note or its retained sequence failed the required format, membership or signature checks.",
    "action": "Preserve the submitted and retained notes and journal. Ask the operator to reconcile the review evidence; do not rewrite prior notes or history."
  },
  {
    "id": "review-note-conflict",
    "codes": [
      "REVIEW_NOTE_ID_CONFLICT"
    ],
    "message": "The requested note identifier conflicts with an existing review record.",
    "action": "Inspect the exact retained note and selection before another write. Do not overwrite the note or pick a fresh identifier as an automatic recovery step."
  },
  {
    "id": "case-history-limit",
    "codes": [
      "CASE_HISTORY_LIMIT",
      "CASE_EVENT_LIMIT"
    ],
    "message": "The bounded case-history check did not pass: this application needs a nonempty history of at most 80 events and room within that limit for an append.",
    "action": "Keep the full journal and report the selected command to the maintainer. Do not trim, reset or replay history to make the check pass."
  },
  {
    "id": "selected-file",
    "codes": [
      "REVIEW_FILE_NOT_SELECTED"
    ],
    "message": "The requested review file is not in this case’s selected file list.",
    "action": "Check the original selection and exact recorded file name before preparing a note. The status CASE_ID --json command can show the retained case observation."
  },
  {
    "id": "durable-reconcile",
    "codes": [
      "WRITE_INCOMPLETE",
      "ADMINISTRATIVE_READBACK_MISMATCH",
      "APPEND_READBACK_MISMATCH",
      "ADMISSION_NOT_DURABLE_AT_EXECUTOR_ENTRY",
      "INTENT_ALREADY_DECLARED_RECONCILE_FIRST"
    ],
    "message": "The command could not confirm the required durable write, admission or readback, or found a prior intake declaration. Earlier changes may have persisted.",
    "action": "Keep all retained case files and history. Ask the operator to reconcile them before another write, collection or note; do not delete partial files or retry automatically."
  },
  {
    "id": "existing-output",
    "codes": [
      "EXPORT_ALREADY_EXISTS"
    ],
    "message": "The requested retained export, snapshot or supplement slot already exists.",
    "action": "Inspect the existing output and original case. Do not overwrite it, delete it or choose a new slot as an automatic recovery step."
  },
  {
    "id": "existing-local-slot",
    "codes": [
      "EEXIST"
    ],
    "message": "An existing local file, directory or command lock prevented creation of a new slot. This code does not identify which slot or whether earlier work completed.",
    "action": "Inspect the original case and retained outputs before another operation. Do not automatically delete a lock or create a new case."
  },
  {
    "id": "handover-state",
    "codes": [
      "HANDOVER_REQUIRED",
      "HANDOVER_PREDECESSOR_STATE",
      "SUCCESSOR_OPEN_DUTY_REQUIRED",
      "NO_CORE_DUTY_RECONCILE_INTAKE_FIRST"
    ],
    "message": "The case does not meet this command’s required handover or open-duty state.",
    "action": "Inspect the duty assignment, intake acknowledgment and retained handover progress before deciding how to continue."
  },
  {
    "id": "handover-history",
    "codes": [
      "HANDOVER_DUPLICATE_STEP",
      "HANDOVER_NONPREFIX_STEPS",
      "HANDOVER_INTERLEAVED_HISTORY",
      "HANDOVER_STEP_MISMATCH",
      "HANDOVER_PARTIAL_HISTORY_CHANGED",
      "HANDOVER_UNEXPECTED_START"
    ],
    "message": "The retained handover history does not match the required sequence or starting point.",
    "action": "Keep the journal and ask the operator to reconcile the recorded steps before any resume. Do not delete, reorder or replay history as a fix."
  },
  {
    "id": "case-settings",
    "codes": [
      "CASE_CONFIG_FIELDS",
      "CASE_CONFIG_DOMAIN",
      "CASE_CONFIG_TERMS",
      "CASE_TERMS_CHANGED",
      "CASE_HISTORY_DOMAIN"
    ],
    "message": "The saved case settings, terms, adapter profile or history domain do not match this case’s required bindings.",
    "action": "Keep the original case configuration and journal. Ask the operator to reconcile their source and identities; do not replace the saved settings to make the check pass."
  },
  {
    "id": "argument-shape",
    "codes": [
      "CASE_ID_MUST_BE_LOWERCASE_SLUG",
      "HANDOVER_OPTIONS",
      "HANDOVER_STOP_STEP",
      "REVIEW_ACTOR_UNKNOWN"
    ],
    "message": "A supplied case, reviewer, snapshot, handover option or reviewed-context value is outside this command’s supported format or choices.",
    "action": "Use node src/cli.mjs --help and compare the original selection with the documented fields. Keep existing case data while correcting the command."
  },
  {
    "id": "local-file",
    "codes": [
      "ENOENT",
      "DIRECTORY_MUST_NOT_BE_ALIASED",
      "INVALID_LOCAL_JSON"
    ],
    "message": "A required local path could not be found or did not meet the command’s original-directory and bounded JSON file checks.",
    "action": "Ask the maintainer to inspect the selected original case files and their format. Do not replace missing evidence or substitute an aliased directory."
  }
];
const explanations=new Map(groups.flatMap(group=>group.codes.map(code=>[code,group])));
export function humanCaseError(error) {
 const message=error && typeof error==='object'?Object.getOwnPropertyDescriptor(error,'message')?.value:undefined;
 const typed=error && typeof error==='object'?Object.getOwnPropertyDescriptor(error,'code')?.value:undefined;
 const code=typeof typed==='string'&&(explanations.has(typed)||knownCodes.has(typed))?typed:typeof message==='string'&&(explanations.has(message)||knownCodes.has(message))?message:undefined;
 if(message==='INVALID_ARGUMENTS — use --help')return 'The command arguments were not accepted. Use node src/cli.mjs --help. Detail: INVALID_ARGUMENTS — use --help.';
 const group=explanations.get(code);
 if(group)return group.message+' '+group.action+' Code: '+code+'.';
 if(code!==undefined)return 'This value does not identify a supported failure cause here. Keep the existing case and inspect its state before deciding what to do next. Code: '+code+'.';
 return 'The case command stopped, and the cause was not identified. This does not establish how far the operation got. Keep the retained case and give the command to the maintainer without private contents.';
}
