/** Experimental local intake interface only; no simulator implementation or initialization. */
import type { ContentHash, PortableAdapterIdentityInput, PortableReplayEvidenceReference } from "../../core/src/index.ts";

export type AdmittedTransactionSubmission = PortableAdapterIdentityInput;

export type AdapterSubmissionResult =
  | { status: "SUBMITTED"; idempotencyKey: ContentHash; submissionFingerprint: ContentHash; evidence: PortableReplayEvidenceReference }
  | { status: "RETRY"; idempotencyKey: ContentHash; submissionFingerprint: ContentHash; retainedEvidence: PortableReplayEvidenceReference }
  | { status: "OUTCOME_UNKNOWN"; idempotencyKey: ContentHash; submissionFingerprint: ContentHash; latestEvidence?: PortableReplayEvidenceReference }
  | { status: "IDEMPOTENCY_FINGERPRINT_CONFLICT"; idempotencyKey: ContentHash; retainedFingerprint: ContentHash; suppliedFingerprint: ContentHash };

export interface TransactionAdapter {
  submit(input: AdmittedTransactionSubmission): Promise<AdapterSubmissionResult>;
  reconcile(input: AdmittedTransactionSubmission): AdapterSubmissionResult | Promise<AdapterSubmissionResult>;
}

