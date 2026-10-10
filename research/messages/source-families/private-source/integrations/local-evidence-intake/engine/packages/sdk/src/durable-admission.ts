import {
  derivePortableAdapterIdentity,
  hashCanonical,
  immutableProtocolValue,
  immutableProtocolInput,
  inspectPortableAdmittedIntent,
  proposePortableIntentAdmission,
  replayPortable,
  PORTABLE_REPLAY_VERSION,
  LOCAL_EVIDENCE_PACKET_ADAPTER_ID,
  PORTABLE_ADAPTER_ACKNOWLEDGMENT_VERSION,
  isLocalPacketManifestReference,
} from "../../core/src/index.ts";
import type {
  PortableAdmittedIntentInspection,
  PortableAdapterIdentityResult,
  PortableCanonicalEvent,
  PortableHistoryHead,
  PortableIntentAdmissionEvent,
  PortableIntentAdmissionInput,
  PortableIntentAdmissionResult,
  PortableReplayEvidenceReference,
} from "../../core/src/index.ts";
import { PortableFileEventStore, PortableStoreConflictError } from "../../indexer/src/portable-file-event-store.ts";
import type { AdapterSubmissionResult, AdmittedTransactionSubmission, TransactionAdapter } from "../../payment-adapters/src/index.ts";

export type DurableAdmissionInput = PortableIntentAdmissionInput;
export interface PreparedDurableAdmission {
  readonly proposal: PortableIntentAdmissionResult;
}
export interface AdmittedInvocationCapability {
  readonly intentId: string;
  readonly admissionEventId: string;
  readonly admissionHead: PortableHistoryHead;
}
export type PortableAdmittedResult = Readonly<{
  operationVersion: "continuity-intent-admission/0.2-local-intake.1";
  status: "ADMITTED";
  authorization: Extract<PortableIntentAdmissionResult, { status: "PROPOSED" }>["authorization"];
  admissionEvent: PortableIntentAdmissionEvent;
  newHead: PortableHistoryHead;
}>;
export type DurableAdmissionCommitResult =
  | Readonly<{ status: "INVALID_PREPARATION"; reason: string }>
  | Readonly<{ status: "UNAVAILABLE"; reason: string; admissionMayHavePersisted: boolean }>
  | Readonly<{ status: "NOT_ADMITTED"; result: Exclude<PortableIntentAdmissionResult, { status: "PROPOSED" }> }>
  | Readonly<{ status: "ADMITTED"; result: PortableAdmittedResult; capability: AdmittedInvocationCapability }>;
export type PortableInvocationResult =
  | Readonly<{ status: "NOT_INVOKED"; reason: string }>
  | Readonly<{ status: "OUTCOME_UNKNOWN"; reason: string; idempotencyKey?: string; submissionFingerprint?: string }>
  | Readonly<{ status: "TERMINAL"; head: PortableHistoryHead; evidence: PortableReplayEvidenceReference }>
  | Readonly<{ status: "IDEMPOTENCY_FINGERPRINT_CONFLICT"; disposition: Extract<AdapterSubmissionResult, { status: "IDEMPOTENCY_FINGERPRINT_CONFLICT" }> }>
  | Readonly<{
      status: "SUBMITTED" | "RETRY";
      disposition: Extract<AdapterSubmissionResult, { status: "SUBMITTED" | "RETRY" }>;
      recorded: true;
      head: PortableHistoryHead;
    }>;
export type DurableAdmissionResult = Readonly<{
  admission: DurableAdmissionCommitResult;
  invocation?: PortableInvocationResult;
}>;

type Admitted = Extract<PortableAdmittedIntentInspection, { status: "ADMITTED" }>;
type InvocationRecord = Readonly<{
  submission: AdmittedTransactionSubmission;
  identity: PortableAdapterIdentityResult;
  admissionHead: PortableHistoryHead;
}>;
const sameHead = (a: PortableHistoryHead | undefined, b: PortableHistoryHead): boolean =>
  a !== undefined && a.hash === b.hash && a.position === b.position && a.canonicalTime === b.canonicalTime;
const headOf = (events: readonly PortableCanonicalEvent[]): PortableHistoryHead => {
  const replay = replayPortable({ operationVersion: PORTABLE_REPLAY_VERSION, events });
  if (replay.status !== "ACCEPTED") throw new Error("Durable history is unavailable.");
  return replay.head;
};
const submissionFor = (events: readonly PortableCanonicalEvent[], observed: Admitted): AdmittedTransactionSubmission =>
  immutableProtocolValue({
    operationVersion: "continuity-adapter-submission/0.2-local-intake.1" as const,
    domain: observed.admissionEvent.data.authorizationProof.domain,
    intentId: observed.admissionEvent.data.intentId,
    admissionEvent: observed.admissionEvent,
    admittedHistory: events.slice(0, observed.admissionHead.position + 1),
  });
const unknownOutcome = (reason: string, identity?: PortableAdapterIdentityResult): PortableInvocationResult =>
  Object.freeze({ status: "OUTCOME_UNKNOWN" as const, reason,
    ...(identity === undefined ? {} : { idempotencyKey: identity.idempotencyKey, submissionFingerprint: identity.submissionFingerprint }) });
const exactKeys = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean => {
  const keys = Object.keys(value);
  return required.every(key => Object.hasOwn(value, key)) &&
    keys.every(key => required.includes(key) || optional.includes(key));
};
const evidenceKind = (value: unknown): "ACK" | undefined => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const e = value as Record<string, unknown>;
  if (!exactKeys(e, ["kind", "evidenceType", "reference", "attesterId"]) ||
      e.kind !== "EXTERNAL" || e.attesterId !== LOCAL_EVIDENCE_PACKET_ADAPTER_ID ||
      e.evidenceType !== PORTABLE_ADAPTER_ACKNOWLEDGMENT_VERSION ||
      !isLocalPacketManifestReference(e.reference)) return undefined;
  return "ACK";
};
const captureDisposition = (input: unknown, identity: PortableAdapterIdentityResult): AdapterSubmissionResult => {
  const captured = immutableProtocolInput(input);
  if (captured === null || typeof captured !== "object" || Array.isArray(captured)) throw new TypeError("Malformed adapter response.");
  const value = captured as Record<string, unknown>;
  if (value.idempotencyKey !== identity.idempotencyKey) throw new TypeError("Adapter key mismatch.");
  if (value.status === "IDEMPOTENCY_FINGERPRINT_CONFLICT") {
    if (!exactKeys(value, ["status", "idempotencyKey", "retainedFingerprint", "suppliedFingerprint"]) ||
        value.suppliedFingerprint !== identity.submissionFingerprint ||
        typeof value.retainedFingerprint !== "string" || !/^0x[0-9a-f]{64}$/.test(value.retainedFingerprint) ||
        value.retainedFingerprint === value.suppliedFingerprint) throw new TypeError("Malformed fingerprint conflict.");
    return captured as AdapterSubmissionResult;
  }
  if (value.submissionFingerprint !== identity.submissionFingerprint) throw new TypeError("Adapter fingerprint mismatch.");
  const common = ["status", "idempotencyKey", "submissionFingerprint"];
  switch (value.status) {
    case "SUBMITTED": {
      if (!exactKeys(value, [...common, "evidence"]) ||
          evidenceKind(value.evidence) !== "ACK") throw new TypeError("Malformed adapter evidence.");
      break;
    }
    case "RETRY":
      if (!exactKeys(value, [...common, "retainedEvidence"]) || evidenceKind(value.retainedEvidence) === undefined) throw new TypeError("Malformed retained evidence.");
      break;
    case "OUTCOME_UNKNOWN":
      if (!exactKeys(value, common, ["latestEvidence"]) ||
          (value.latestEvidence !== undefined && evidenceKind(value.latestEvidence) === undefined)) throw new TypeError("Malformed uncertain outcome.");
      break;
    default: throw new TypeError("Unknown adapter disposition.");
  }
  return captured as AdapterSubmissionResult;
};

/**
 * Controlled local reference integration. The store, adapter and clock are
 * approved executable configuration. Only data and identity tokens enter the
 * public methods; replay facts alone never issue first-invocation authority.
 */
export class DurableAdmissionCoordinator {
  readonly store: PortableFileEventStore;
  readonly adapter: TransactionAdapter;
  readonly #now: () => number;
  readonly #prepared = new WeakMap<object, PortableIntentAdmissionResult>();
  readonly #invocations = new WeakMap<object, InvocationRecord>();

  constructor(store: PortableFileEventStore, adapter: TransactionAdapter, options: { authoritativeNow: () => number }) {
    this.store = store;
    this.adapter = adapter;
    this.#now = options.authoritativeNow;
  }

  prepare(input: unknown): PreparedDurableAdmission {
    // The portable operation owns original input capture and its precedence.
    const proposal = proposePortableIntentAdmission(input);
    const prepared = Object.freeze({ proposal });
    this.#prepared.set(prepared, proposal);
    return prepared;
  }

  admit(prepared: unknown): DurableAdmissionCommitResult {
    if (prepared === null || typeof prepared !== "object") return Object.freeze({ status: "INVALID_PREPARATION", reason: "An unused preparation from this coordinator is required." });
    const proposal = this.#prepared.get(prepared);
    if (proposal === undefined) return Object.freeze({ status: "INVALID_PREPARATION", reason: "An unused preparation from this coordinator is required." });
    this.#prepared.delete(prepared);
    if (proposal.status !== "PROPOSED") {
      if (proposal.status === "RETRY") {
        try {
          const matches = this.store.withExclusiveWriter(writer => {
            const events = writer.readAll();
            const current = inspectPortableAdmittedIntent(events, proposal.intentId, headOf(events).canonicalTime);
            return current.status === "ADMITTED" && current.admissionEvent.id === proposal.existingAdmissionEventId &&
              sameHead(current.admissionHead, proposal.existingAdmissionHead);
          });
          if (!matches) throw new Error("Supplied retry is absent from this durable history.");
        } catch {
          return Object.freeze({ status: "UNAVAILABLE", reason: "The supplied retry does not establish this store's original admission.", admissionMayHavePersisted: false });
        }
      }
      return Object.freeze({ status: "NOT_ADMITTED", result: proposal });
    }
    let appendStarted = false;
    try {
      const record = this.store.withExclusiveWriter(writer => {
        const events = writer.readAll();
        const observedHead = events.length ? headOf(events) : undefined;
        if (!sameHead(observedHead, proposal.expectedHead)) throw new PortableStoreConflictError(observedHead);
        const prospective = [...events, proposal.admissionEvent];
        const observed = inspectPortableAdmittedIntent(prospective, proposal.admissionEvent.data.intentId, proposal.admissionEvent.timestamp);
        if (observed.status !== "ADMITTED") throw new Error("Proposed admission could not be reconstructed.");
        const submission = submissionFor(prospective, observed);
        const identity = derivePortableAdapterIdentity(submission);
        appendStarted = true;
        const newHead = writer.appendAtExpectedHead(proposal.admissionEvent, proposal.expectedHead);
        if (!sameHead(newHead, proposal.prospectiveHead)) throw new Error("Durable append returned a different head.");
        return { submission, identity, admissionHead: newHead };
      });
      const capability = immutableProtocolValue({ intentId: proposal.admissionEvent.data.intentId,
        admissionEventId: proposal.admissionEvent.id, admissionHead: record.admissionHead });
      this.#invocations.set(capability, Object.freeze(record));
      return Object.freeze({ status: "ADMITTED", capability, result: Object.freeze({
        operationVersion: "continuity-intent-admission/0.2-local-intake.1", status: "ADMITTED",
        authorization: proposal.authorization, admissionEvent: proposal.admissionEvent, newHead: record.admissionHead,
      }) });
    } catch (error) {
      if (!appendStarted && error instanceof PortableStoreConflictError && error.observedHead !== undefined) {
        return Object.freeze({ status: "NOT_ADMITTED", result: Object.freeze({ operationVersion: "continuity-intent-admission/0.2-local-intake.1",
          status: "CONFLICT", expectedHead: proposal.expectedHead, observedHead: error.observedHead }) });
      }
      return Object.freeze({ status: "UNAVAILABLE", reason: "Durable admission could not be established; reconcile before any retry.", admissionMayHavePersisted: appendStarted });
    }
  }

  async invoke(capability: unknown): Promise<PortableInvocationResult> {
    if (capability === null || typeof capability !== "object") return Object.freeze({ status: "NOT_INVOKED", reason: "An unused invocation capability is required." });
    const record = this.#invocations.get(capability);
    if (record === undefined) return Object.freeze({ status: "NOT_INVOKED", reason: "An unused invocation capability is required." });
    // A failed or stale use cannot turn the same object into another attempt.
    this.#invocations.delete(capability);
    let called = false;
    let pending: Promise<AdapterSubmissionResult>;
    try {
      const start = this.store.withExclusiveWriter(writer => {
        const history = writer.readAll();
        const current = inspectPortableAdmittedIntent(history, record.submission.intentId, this.#now());
        if (current.status !== "ADMITTED" || !sameHead(current.admissionHead, record.admissionHead) ||
            current.admissionEvent.id !== record.submission.admissionEvent.id ||
            current.consumption !== undefined || current.terminal !== undefined || !current.currentControl) return undefined;
        called = true;
        // Synchronous call entry is protected by the lock. Its await is not.
        return { pending: this.adapter.submit(record.submission) };
      });
      if (start === undefined) return Object.freeze({ status: "NOT_INVOKED", reason: "The original admission is consumed, terminal, replaced or no longer under its admitted control tuple." });
      pending = start.pending;
    } catch {
      return called ? unknownOutcome("Adapter invocation may have started.", record.identity)
        : Object.freeze({ status: "NOT_INVOKED", reason: "Current durable history, time or serialized control could not be established." });
    }
    let disposition: AdapterSubmissionResult;
    try {
      disposition = captureDisposition(await pending, record.identity);
      if (disposition.status !== "SUBMITTED" && disposition.status !== "OUTCOME_UNKNOWN") {
        throw new TypeError("First invocation requires a new acknowledgment or uncertain outcome.");
      }
    }
    catch { return unknownOutcome("The adapter response is missing, invalid or exceptional.", record.identity); }
    return this.#recordDisposition(record, disposition);
  }

  #recordDisposition(record: InvocationRecord, disposition: AdapterSubmissionResult): PortableInvocationResult {
    if (disposition.status === "OUTCOME_UNKNOWN") return unknownOutcome("The adapter cannot establish a definitive outcome.", record.identity);
    if (disposition.status === "IDEMPOTENCY_FINGERPRINT_CONFLICT") return Object.freeze({ status: disposition.status, disposition });
    const evidence = disposition.status === "RETRY" ? disposition.retainedEvidence : disposition.evidence;
    const kind = evidenceKind(evidence);
    if (kind !== "ACK") return unknownOutcome("Local packet acknowledgment is invalid.", record.identity);
    try {
      const head = this.store.withExclusiveWriter(writer => {
        const events = writer.readAll();
        const now = this.#now();
        const current = inspectPortableAdmittedIntent(events, record.submission.intentId, now);
        if (current.status !== "ADMITTED" || !sameHead(current.admissionHead, record.admissionHead)) throw new Error("Original durable admission changed.");
        if (kind === "ACK" && current.consumption !== undefined) {
          if (hashCanonical(current.consumption.evidenceReference) !== hashCanonical(evidence)) throw new Error("Different acknowledgment already recorded.");
          return current.head;
        }
        const id = `event:local:consumption:${hashCanonical([record.submission.intentId, record.submission.admissionEvent.id]).slice(2)}`;
        const external = evidence as Extract<PortableReplayEvidenceReference, { kind: "EXTERNAL" }>;
        const event: PortableCanonicalEvent = {
          id, type: "TRANSACTION_INTENT_CONSUMED", timestamp: now,
          data: { intentId: record.submission.intentId, adapterId: LOCAL_EVIDENCE_PACKET_ADAPTER_ID,
            idempotencyKey: record.identity.idempotencyKey, submissionFingerprint: record.identity.submissionFingerprint,
            status: "SUBMITTED", evidenceReference: evidence, transactionReference: external.reference },
        };
        // Replay rechecks current control and terminal order; no stale tuple by backdating.
        return writer.appendAtExpectedHead(event, current.head);
      });
      return Object.freeze({ status: disposition.status, disposition, recorded: true, head });
    } catch { return unknownOutcome("The local packet acknowledgment could not be durably recorded.", record.identity); }
  }

  async reconcile(intentId: string): Promise<PortableInvocationResult> {
    let record: InvocationRecord;
    try {
      const observed = this.store.withExclusiveWriter(writer => {
        const events = writer.readAll();
        const current = inspectPortableAdmittedIntent(events, intentId, headOf(events).canonicalTime);
        if (current.status !== "ADMITTED") throw new Error("No original admission.");
        const submission = submissionFor(events, current);
        return { current, record: { submission, identity: derivePortableAdapterIdentity(submission), admissionHead: current.admissionHead } };
      });
      record = observed.record;
      const { current } = observed;
      if (current.terminal !== undefined) {
        return Object.freeze({ status: "TERMINAL", head: current.head, evidence: current.terminal.evidenceReference });
      }
      const retained = current.consumption?.evidenceReference;
      if (retained !== undefined) {
        return Object.freeze({ status: "RETRY", recorded: true, head: current.head, disposition: immutableProtocolValue({
          status: "RETRY" as const, idempotencyKey: record.identity.idempotencyKey,
          submissionFingerprint: record.identity.submissionFingerprint, retainedEvidence: retained,
        }) });
      }
    } catch { return unknownOutcome("The original durable admission is unavailable."); }
    let disposition: AdapterSubmissionResult;
    try {
      disposition = captureDisposition(await this.adapter.reconcile(record.submission), record.identity);
      if (disposition.status === "SUBMITTED") throw new Error("Reconciliation returned a new-submission disposition.");
    } catch { return unknownOutcome("Retained adapter evidence is unavailable or invalid.", record.identity); }
    return this.#recordDisposition(record, disposition);
  }

  async commit(prepared: unknown): Promise<DurableAdmissionResult> {
    const admission = this.admit(prepared);
    if (admission.status === "ADMITTED") return Object.freeze({ admission, invocation: await this.invoke(admission.capability) });
    if (admission.status === "NOT_ADMITTED" && admission.result.status === "RETRY") {
      return Object.freeze({ admission, invocation: await this.reconcile(admission.result.intentId) });
    }
    return Object.freeze({ admission });
  }

  async execute(input: unknown): Promise<DurableAdmissionResult> { return this.commit(this.prepare(input)); }
}
