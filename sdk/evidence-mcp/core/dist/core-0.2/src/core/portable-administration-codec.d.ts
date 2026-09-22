import type { ContentHash } from "./canonical.ts";
import type { AcceptedCanonicalEventShape } from "./event-schema.ts";
import type { PortableActionRequest, PortableAuthorizationProof } from "./portable-authority-engine.ts";
import type { PortableAuthorizationDomain, PortableReplayEvidenceReference } from "./portable-replay.ts";
export type PortableObligationStatus = "OPEN" | "OUTCOME_UNKNOWN" | "DISPUTED" | "DISCHARGED" | "IMPOSSIBLE_OR_ESCALATED";
export type PortableObligationTransitionPolicy = Readonly<{
    fromStatus: PortableObligationStatus;
    toStatus: PortableObligationStatus;
    acceptedAttesterIds: readonly string[];
    action: string;
    requiredAuthorityIds: readonly string[];
}>;
/** Immutable creation record; subsequent status and assignee are separate replay state. */
export type PortableObligationRecord = Readonly<{
    obligationId: string;
    sourceIntentId: string;
    causalReceiptContentHash: ContentHash;
    durableRoleId: string;
    creationRoleTenureId: string;
    description: string;
    trigger: string;
    deadline: number;
    status: "OPEN" | "OUTCOME_UNKNOWN";
    beneficiaryId: string;
    counterpartyId?: string;
    termsCommitment: ContentHash;
    performanceAssigneeId: string;
    successionRuleId: string;
    transitionPolicies: readonly PortableObligationTransitionPolicy[];
}>;
export type PortableAdministrativeTransitionEffect = Readonly<{
    transitionEventType: "OBLIGATION_CREATED";
    record: PortableObligationRecord;
    actorId: string;
}> | Readonly<{
    transitionEventType: "OBLIGATION_PERFORMANCE_ASSIGNED";
    obligationId: string;
    fromAgentId: string;
    toAgentId: string;
    successionRuleId: string;
    actorId: string;
}> | Readonly<{
    transitionEventType: "OBLIGATION_STATUS_RECORDED";
    obligationId: string;
    fromStatus: PortableObligationStatus;
    toStatus: PortableObligationStatus;
    actorId: string;
    action: string;
    attesterId: string;
    evidenceReference: PortableReplayEvidenceReference;
}>;
export type PortableAdministrativeAuthorizationChallenge = Readonly<{
    version: "continuity-administrative-authorization/0.2";
    domain: PortableAuthorizationDomain;
    request: PortableActionRequest;
    authoritative: true;
    consequential: true;
    evaluationTime: number;
    policyVersion: string;
    rootRecognitionPolicy: "declared-principal-root/0.2";
    eventHistoryHash: ContentHash;
    eventHistoryPosition: number;
    transitionEventId: string;
    transitionEventType: PortableAdministrativeTransitionEffect["transitionEventType"];
    transitionEffectHash: ContentHash;
    runtimeSessionId: string;
    credentialKeyId: string;
    controlEpoch: number;
    roleId: string;
    roleTenureId: string;
    authorityProofHash: ContentHash;
}>;
export type PortableAdministrativeAuthorization = Readonly<{
    challenge: PortableAdministrativeAuthorizationChallenge;
    authorityProof: PortableAuthorizationProof;
    runtimeSignature: `0x${string}`;
}>;
/**
 * @internal Section 7.5 projection of an already captured, schema-validated event.
 * This is neither raw-input validation nor evidence of transition authority.
 * Nested values retain the accepted snapshot, including the entire creation record.
 */
export declare const portableAdministrativeTransitionEffect: (event: AcceptedCanonicalEventShape) => PortableAdministrativeTransitionEffect;
