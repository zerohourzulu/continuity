import {
  hashCanonical,
  type ContentHash,
} from "./canonical.ts";
import type { AcceptedCanonicalEventShape } from "./event-schema.ts";
import {
  HostTypeError,
  objectFreeze,
  regExpTest,
  stringToLowerCase,
} from "./host-intrinsics.ts";

export const PORTABLE_ADAPTER_IDEMPOTENCY_VERSION =
  "continuity-adapter-idempotency/0.2-local-intake.1" as const;
export const PORTABLE_ADAPTER_SUBMISSION_VERSION =
  "continuity-adapter-submission/0.2-local-intake.1" as const;
export const PORTABLE_ADAPTER_NO_EFFECT_VERSION =
  "continuity-adapter-no-effect/0.2-local-intake.1" as const;
export const PORTABLE_ADAPTER_ACKNOWLEDGMENT_VERSION =
  "continuity-adapter-acknowledgment/0.2-local-intake.1" as const;
export const LOCAL_EVIDENCE_PACKET_ADAPTER_ID = "adapter:local-evidence-packet" as const;

export type PortableAdapterHistoryHead = Readonly<{
  hash: ContentHash;
  position: number;
  canonicalTime: number;
}>;

export type PortableAdapterIdentity = Readonly<{
  idempotencyKey: ContentHash;
  submissionFingerprint: ContentHash;
  durableEventHistoryHash: ContentHash;
  adapterNoEffectReference: ContentHash;
}>;

export type PortableAdapterExternalEvidence = Readonly<{
  kind: "EXTERNAL";
  evidenceType:
    | typeof PORTABLE_ADAPTER_ACKNOWLEDGMENT_VERSION
    | typeof PORTABLE_ADAPTER_NO_EFFECT_VERSION;
  reference: string;
  attesterId: typeof LOCAL_EVIDENCE_PACKET_ADAPTER_ID;
}>;

type PortableAdmissionProofProjection = Readonly<{
  domain: Readonly<{
    protocol: string;
    version: string;
    deploymentId: string;
    chainId: string;
    verifyingContract: string;
  }>;
}>;

type PortableAdmissionDataProjection = Readonly<{
  intentId: string;
  authorizationProof: PortableAdmissionProofProjection;
}>;

export const derivePortableAdapterIdempotencyKey = (
  domain: PortableAdmissionProofProjection["domain"],
  intentId: string,
): ContentHash => hashCanonical([
  PORTABLE_ADAPTER_IDEMPOTENCY_VERSION,
  domain.protocol,
  domain.version,
  domain.deploymentId,
  domain.chainId,
  stringToLowerCase(domain.verifyingContract),
  intentId,
]);

export const derivePortableAdapterNoEffectReference = (
  idempotencyKey: ContentHash,
  submissionFingerprint: ContentHash,
): ContentHash => hashCanonical([
  PORTABLE_ADAPTER_NO_EFFECT_VERSION,
  LOCAL_EVIDENCE_PACKET_ADAPTER_ID,
  idempotencyKey,
  submissionFingerprint,
]);

/**
 * Package-internal Section 10.1/10.2 derivation over one admission already
 * accepted by portable replay and that event's already computed inclusive
 * head. This is not the standalone AdapterIdentityInput operation.
 */
export const derivePortableAdapterIdentityForAcceptedAdmission = (
  admissionEvent: AcceptedCanonicalEventShape,
  admissionHead: PortableAdapterHistoryHead,
): PortableAdapterIdentity => {
  if (
    admissionEvent.type !== "TRANSACTION_INTENT_ADMITTED" ||
    admissionHead.canonicalTime !== admissionEvent.timestamp
  ) {
    throw new HostTypeError(
      "Portable adapter identity requires one accepted admission and its inclusive head.",
    );
  }
  const data = admissionEvent.data as unknown as PortableAdmissionDataProjection;
  const intentId = data.intentId;
  const idempotencyKey = derivePortableAdapterIdempotencyKey(
    data.authorizationProof.domain,
    intentId,
  );
  const durableEventHistoryHash = admissionHead.hash;
  const submissionFingerprint = hashCanonical({
    version: PORTABLE_ADAPTER_SUBMISSION_VERSION,
    intentId,
    admissionEvent,
    durableEventHistoryHash,
  });
  return objectFreeze({
    idempotencyKey,
    submissionFingerprint,
    durableEventHistoryHash,
    adapterNoEffectReference: derivePortableAdapterNoEffectReference(
      idempotencyKey,
      submissionFingerprint,
    ),
  });
};

export const isLocalPacketManifestReference = (value: unknown): value is ContentHash =>
  typeof value === "string" && regExpTest(/^0x[0-9a-f]{64}$/, value);

export const portableAdapterAcknowledgmentEvidence = (
  identity: PortableAdapterIdentity,
  transactionReference?: string,
): PortableAdapterExternalEvidence => {
  // This profile acknowledges only a separately retained local packet manifest.
  // Its SHA-256 reference does not prove incident review or duty fulfillment.
  if (!isLocalPacketManifestReference(transactionReference)) {
    throw new HostTypeError("Local packet acknowledgment requires a manifest SHA-256 reference.");
  }
  return objectFreeze({
    kind: "EXTERNAL" as const,
    evidenceType: PORTABLE_ADAPTER_ACKNOWLEDGMENT_VERSION,
    reference: transactionReference,
    attesterId: LOCAL_EVIDENCE_PACKET_ADAPTER_ID,
  });
};

export const portableAdapterNoEffectEvidence = (
  identity: PortableAdapterIdentity,
): PortableAdapterExternalEvidence => objectFreeze({
  kind: "EXTERNAL" as const,
  evidenceType: PORTABLE_ADAPTER_NO_EFFECT_VERSION,
  reference: identity.adapterNoEffectReference,
  attesterId: LOCAL_EVIDENCE_PACKET_ADAPTER_ID,
});

export const samePortableAdapterEvidence = (
  left: Readonly<Record<string, unknown>>,
  right: PortableAdapterExternalEvidence,
): boolean => left.kind === right.kind &&
  left.evidenceType === right.evidenceType &&
  left.reference === right.reference &&
  left.attesterId === right.attesterId;
