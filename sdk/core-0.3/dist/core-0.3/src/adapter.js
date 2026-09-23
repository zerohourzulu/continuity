/** Trusted integration-host interface. Never expose these handles as agent tools. */
export { PORTABLE_ADAPTER_POLICY_E5_HASH, REMOTE_SERVICE_REPORT_ADAPTER_ID, approvedPortableAdapterProfileForPolicy, canonicalEncode, createRemoteServiceReportAcknowledgment, derivePortableAdapterIdentity, hashCanonical, immutableProtocolValue, portableAdapterAcknowledgmentEvidence, } from "../../core-0.2/src/core/index.js";
export { PortableFileEventStore } from "../../core-0.2/src/indexer/portable-file-event-store.js";
export { portableAdmissionControlIsCurrent } from "../../core-0.2/src/core/portable-replay.js";
export { evaluatePortableReceiptPolicy } from "../../core-0.2/src/core/portable-authority-engine.js";
export { openLocalExecution } from "./execution.js";
export { stateOf } from "./local-store.js";
export { captureHistory } from "./observation.js";
export { captureData, record, identifier, requireCondition } from "./input.js";
export { capacityOf, LOCAL_CAPACITY_PROFILE } from "./capacity.js";
