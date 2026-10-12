/** Fixed D1 finding semantics. Internal reducers use complete prior replay state. */
import { type ContentHash } from './canonical.ts';
import { DUTY_POLICY_VERSION, DUTY_POLICY_RULES_HASH, type PortableDutyDocumentDigest, type PortableDutyPolicyActivation } from './duty-policy.ts';
import { type PortableAuthorityReplayState, type PortableAdministrativeRequirements } from './portable-authority-engine.ts';
import { type PortableReplayState, type PortableAuthorizationDomain, type PortableHistoryHead, type PortableAttemptDutyState } from './portable-replay.ts';
import type { AcceptedCanonicalEventShape } from './event-schema.ts';
export declare const DUTY_FINDING_VERSION: "continuity-duty-finding/1";
export declare const DUTY_CRITERIA: readonly ["SOURCE_REVIEWED", "HISTORY_REVIEWED", "FINDING_RECORDED", "CONTROL_REVIEWED"];
export type PortableDutyChecklist = Readonly<Record<typeof DUTY_CRITERIA[number], Readonly<{
    state: 'SATISFIED' | 'UNAVAILABLE' | 'UNRESOLVED';
    reason: string;
}>>>;
export type PortableDutyDispositionOperation = Readonly<{
    disposition: 'COMPLETED_UNDER_POLICY' | 'ESCALATED';
    checklist: PortableDutyChecklist;
    reportDigest: PortableDutyDocumentDigest;
    nextStep: string | null;
}>;
export type PortableDutyContestOperation = Readonly<{
    targetDispositionEventId: string;
    reason: string;
    reportDigest: PortableDutyDocumentDigest;
}>;
export type PortableDutyOperation = PortableDutyDispositionOperation | PortableDutyContestOperation;
export type PortableDutyTransitionType = 'ATTEMPT_DUTY_DISPOSITION_RECORDED' | 'ATTEMPT_DUTY_CONTEST_RECORDED';
export type PortableDutyFindingChallenge = Readonly<{
    version: typeof DUTY_FINDING_VERSION;
    purpose: 'DISPOSITION' | 'CONTEST';
    domain: PortableAuthorizationDomain;
    rulesHash: typeof DUTY_POLICY_RULES_HASH;
    descriptorHash: ContentHash;
    activationEventId: string;
    dutyId: string;
    sourceAdmissionEventId: string;
    transitionEventId: string;
    transitionEventType: PortableDutyTransitionType;
    evaluationTime: number;
    priorHead: PortableHistoryHead;
    latestAssignmentEventId: string;
    previousDispositionEventId: string | null;
    evidenceIndexHash: ContentHash;
    operation: PortableDutyOperation;
    attesterId: string;
    runtimeSessionId: string;
    credentialKeyId: string;
    controlEpoch: number;
    roleId: string;
    roleTenureId: string;
    attestationAuthorityId: string;
    dispositionAuthorityId: string;
    authorityProofHash: ContentHash;
}>;
export type PortableDutyFinding = Readonly<{
    challenge: PortableDutyFindingChallenge;
    runtimeSignature: `0x${string}`;
}>;
export type PortableDutyDispositionData = Readonly<{
    version: typeof DUTY_POLICY_VERSION;
    rulesHash: typeof DUTY_POLICY_RULES_HASH;
    dutyId: string;
    actorId: string;
    dispositionAuthorityId: string;
    finding: PortableDutyFinding;
}>;
export type PortableDutyFindingRequest = Readonly<{
    dutyId: string;
    actorId: string;
    attesterId: string;
    attesterRuntimeSessionId: string;
    attestationAuthorityId: string;
    dispositionAuthorityId: string;
    operation: PortableDutyOperation;
}>;
export type DutyDispositionState = PortableAuthorityReplayState & Readonly<{
    attemptDuties: ReadonlyMap<string, PortableAttemptDutyState>;
    attemptDutyPolicies: ReadonlyMap<string, PortableDutyPolicyActivation>;
}>;
export type DutyUnsignedTransition = Readonly<{
    id: string;
    type: PortableDutyTransitionType;
    timestamp: number;
    data: PortableDutyDispositionData;
}>;
export declare function portableDutyRecords(state: DutyDispositionState, dutyId: string, type: PortableDutyTransitionType): AcceptedCanonicalEventShape[];
export declare function derivePortableDutyEvidenceIndex(state: DutyDispositionState, dutyId: string): {
    version: string;
    domain: Readonly<{
        protocol: "continuity";
        version: "0.2";
        deploymentId: string;
        chainId: string;
        verifyingContract: string;
    }>;
    dutyId: string;
    dutyCreationEventId: string;
    activationEventId: string;
    sourceAdmissionEventId: string;
    latestAssignmentEventId: string;
    recordCount: number;
    counts: Record<string, number>;
    records: {
        eventId: string;
        eventType: "DEPLOYMENT_INITIALIZED" | "PRINCIPAL_CREATED" | "AGENT_CREATED" | "ROLE_CREATED" | "SUCCESSION_RULE_DECLARED" | "AGENT_APPOINTED" | "AGENT_UNAPPOINTED" | "ROLE_TRANSFERRED" | "RUNTIME_SESSION_ADMITTED" | "CONTROL_EPOCH_ADVANCED" | "AUTHORITY_GRANTED" | "AUTHORITY_REVOKED" | "TRANSACTION_INTENT_DECLARED" | "TRANSACTION_INTENT_ADMITTED" | "TRANSACTION_INTENT_CONSUMED" | "TRANSACTION_OUTCOME_RECORDED" | "RECEIPT_RECORDED" | "OBLIGATION_CREATED" | "OBLIGATION_PERFORMANCE_ASSIGNED" | "OBLIGATION_STATUS_RECORDED" | "AGENT_TERMINATED" | "OUTCOME_OBSERVATION_RECORDED" | "ATTEMPT_DUTY_CREATED" | "ATTEMPT_DUTY_ASSIGNED" | "ATTEMPT_DUTY_REVIEW_CLOSED" | "ATTEMPT_DUTY_POLICY_ACTIVATED" | "ATTEMPT_DUTY_DISPOSITION_RECORDED" | "ATTEMPT_DUTY_CONTEST_RECORDED";
        contentHash: `0x${string}`;
    }[];
};
export declare function portableDutyRequirements(state: DutyDispositionState, dutyId: string, actorId: string, authorityId: string, attestation: boolean, time: number): PortableAdministrativeRequirements | undefined;
/** Internal: request has already undergone the closed schema capture. */
export declare function derivePortableDutyFinding(state: DutyDispositionState, event: Readonly<{
    id: string;
    type: PortableDutyTransitionType;
    timestamp: number;
    data: PortableDutyFindingRequest;
}>): {
    readonly version: "continuity-duty-finding/1";
    readonly purpose: "DISPOSITION" | "CONTEST";
    readonly domain: Readonly<{
        protocol: "continuity";
        version: "0.2";
        deploymentId: string;
        chainId: string;
        verifyingContract: string;
    }>;
    readonly rulesHash: "0xf7fb2b7de27abb77c6c3d03af6f61dce11afda5a510af20c8036085cd10a5f94";
    readonly descriptorHash: `0x${string}`;
    readonly activationEventId: string;
    readonly dutyId: string;
    readonly sourceAdmissionEventId: string;
    readonly transitionEventId: string;
    readonly transitionEventType: PortableDutyTransitionType;
    readonly evaluationTime: number;
    readonly priorHead: Readonly<{
        hash: ContentHash;
        position: number;
        canonicalTime: number;
    }>;
    readonly latestAssignmentEventId: string;
    readonly previousDispositionEventId: string | null;
    readonly evidenceIndexHash: `0x${string}`;
    readonly operation: PortableDutyOperation;
    readonly attesterId: string;
    readonly runtimeSessionId: string;
    readonly credentialKeyId: string;
    readonly controlEpoch: number;
    readonly roleId: string;
    readonly roleTenureId: string;
    readonly attestationAuthorityId: string;
    readonly dispositionAuthorityId: string;
    readonly authorityProofHash: `0x${string}`;
};
export declare function validatePortableDutyFinding(state: DutyDispositionState, event: DutyUnsignedTransition): boolean;
/** Original signed time is checked first; new eligibility never substitutes into the signed challenge. */
export declare function validatePortableDutyFreshEligibility(state: PortableReplayState, event: DutyUnsignedTransition, outerRuntimeSessionId: string, freshTime: number): boolean;
export declare function portableDutyDispositionProjection(state: DutyDispositionState, dutyId: string): {
    readonly dutyDisposition: "OPEN" | "CONTESTED";
    readonly outstanding: true;
    readonly lastRecordedDisposition: null;
    readonly reasons: readonly ["NO_DISPOSITION_RECORDED"];
} | {
    readonly dutyDisposition: "COMPLETED_UNDER_POLICY" | "ESCALATED" | "NEEDS_REVIEW" | "CONTESTED";
    readonly outstanding: boolean;
    readonly lastRecordedDisposition: {
        readonly eventId: string;
        readonly eventPosition: number;
        readonly timestamp: number;
        readonly disposition: "COMPLETED_UNDER_POLICY" | "ESCALATED";
        readonly findingHash: `0x${string}`;
        readonly evidenceIndexHash: `0x${string}`;
        readonly reportDigest: Readonly<{
            algorithm: "sha256";
            value: ContentHash;
        }>;
    };
    readonly reasons: readonly ["ACCEPTED_CONTEST" | "RELEVANT_EVIDENCE_CHANGED" | "ATTENTION_REQUESTED" | "ALL_LOCAL_CRITERIA_SATISFIED"];
};
