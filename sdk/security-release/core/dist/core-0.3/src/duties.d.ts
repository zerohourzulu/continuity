/** Host-owned policy selection for one existing investigation duty. No agent tool or dispatch. */
import * as core from "../../core-0.2/src/core/index.ts";
import { type PortableDutyPolicyDescriptor } from "../../core-0.2/src/core/duty-policy.ts";
import type { LocalRuntimeOptions } from "./runtime.ts";
export type DutyPolicySelection = Readonly<{
    duty: string;
    incidentSourceDigest: Readonly<{
        algorithm: "sha256";
        value: core.ContentHash;
    }>;
    attesterRole: string;
}>;
export type DutyPolicyActivation = Readonly<{
    id: string;
    descriptor: PortableDutyPolicyDescriptor;
    activationAuthority: string;
}>;
export type DutyCriterion = "SOURCE_REVIEWED" | "HISTORY_REVIEWED" | "FINDING_RECORDED" | "CONTROL_REVIEWED";
export type DutyChecklist = Readonly<Record<DutyCriterion, Readonly<{
    state: "SATISFIED" | "UNAVAILABLE" | "UNRESOLVED";
    reason: string;
}>>>;
export type DutyDisposition = Readonly<{
    id: string;
    duty: string;
    disposition: "COMPLETED_UNDER_POLICY" | "ESCALATED";
    checklist: DutyChecklist;
    reportDigest: Readonly<{
        algorithm: "sha256";
        value: core.ContentHash;
    }>;
    nextStep: string | null;
    attestationAuthority: string;
    dispositionAuthority: string;
}>;
export type DutyContest = Readonly<{
    id: string;
    duty: string;
    targetDispositionId: string;
    reason: string;
    reportDigest: Readonly<{
        algorithm: "sha256";
        value: core.ContentHash;
    }>;
    attestationAuthority: string;
    dispositionAuthority: string;
}>;
/** Trusted host configuration, never an agent-supplied operation argument. */
export type DutyFindingSigner = Readonly<Pick<LocalRuntimeOptions, "session" | "signHash">>;
export type { PortableDutyPolicyDescriptor };
/** Historical inspection only. The supplied handle must come from complete verified replay. */
export declare function inspectContinuationDutyPolicy(history: unknown, duty: string): {
    scope: "CAPTURED_HISTORY_ONLY";
    executionCapability: false;
    head: Readonly<{
        hash: core.ContentHash;
        position: number;
        canonicalTime: number;
    }>;
    policy: Readonly<{
        version: typeof core.DUTY_VIEW_VERSION;
        dutyId: string;
        dutyDisposition: "OPEN" | "COMPLETED_UNDER_POLICY" | "ESCALATED" | "NEEDS_REVIEW" | "CONTESTED";
        outstanding: boolean;
        externalOutcome: "NOT_PROVEN";
        policy: core.PortableDutyPolicyActivation;
        observedHead: core.PortableHistoryHead;
        currentAssigneeId: string;
        latestAssignmentEventId: string;
        lastRecordedDisposition: ReturnType<typeof import("../../core-0.2/src/core/duty-disposition.ts").portableDutyDispositionProjection>["lastRecordedDisposition"];
        evidenceScope: Readonly<{
            kind: "COMPLETE_CAPTURED_HISTORY";
            head: core.PortableHistoryHead;
        }>;
        reasons: readonly string[];
    }> | null;
};
export declare function openLocalDutyPolicy(options: LocalRuntimeOptions, findingSigner?: DutyFindingSigner): Readonly<{
    prepareDisposition: (input: DutyDisposition) => {
        head: Readonly<{
            hash: core.ContentHash;
            position: number;
            canonicalTime: number;
        }>;
        executionCapability: false;
        challenge: {
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
            readonly transitionEventType: core.PortableDutyTransitionType;
            readonly evaluationTime: number;
            readonly priorHead: Readonly<{
                hash: core.ContentHash;
                position: number;
                canonicalTime: number;
            }>;
            readonly latestAssignmentEventId: string;
            readonly previousDispositionEventId: string | null;
            readonly evidenceIndexHash: `0x${string}`;
            readonly operation: import("../../core-0.2/src/core/duty-disposition.ts").PortableDutyOperation;
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
        signingHash: `0x${string}`;
    };
    prepareContest: (input: DutyContest) => {
        head: Readonly<{
            hash: core.ContentHash;
            position: number;
            canonicalTime: number;
        }>;
        executionCapability: false;
        challenge: {
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
            readonly transitionEventType: core.PortableDutyTransitionType;
            readonly evaluationTime: number;
            readonly priorHead: Readonly<{
                hash: core.ContentHash;
                position: number;
                canonicalTime: number;
            }>;
            readonly latestAssignmentEventId: string;
            readonly previousDispositionEventId: string | null;
            readonly evidenceIndexHash: `0x${string}`;
            readonly operation: import("../../core-0.2/src/core/duty-disposition.ts").PortableDutyOperation;
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
        signingHash: `0x${string}`;
    };
    dispose: (input: DutyDisposition) => Promise<{
        eventId: string;
        head: Readonly<{
            hash: core.ContentHash;
            position: number;
            canonicalTime: number;
        }>;
        alreadyRecorded: boolean;
        view: Readonly<{
            version: typeof core.DUTY_VIEW_VERSION;
            dutyId: string;
            dutyDisposition: "OPEN" | "COMPLETED_UNDER_POLICY" | "ESCALATED" | "NEEDS_REVIEW" | "CONTESTED";
            outstanding: boolean;
            externalOutcome: "NOT_PROVEN";
            policy: core.PortableDutyPolicyActivation;
            observedHead: core.PortableHistoryHead;
            currentAssigneeId: string;
            latestAssignmentEventId: string;
            lastRecordedDisposition: ReturnType<typeof import("../../core-0.2/src/core/duty-disposition.ts").portableDutyDispositionProjection>["lastRecordedDisposition"];
            evidenceScope: Readonly<{
                kind: "COMPLETE_CAPTURED_HISTORY";
                head: core.PortableHistoryHead;
            }>;
            reasons: readonly string[];
        }> | undefined;
    }>;
    contest: (input: DutyContest) => Promise<{
        eventId: string;
        head: Readonly<{
            hash: core.ContentHash;
            position: number;
            canonicalTime: number;
        }>;
        alreadyRecorded: boolean;
        view: Readonly<{
            version: typeof core.DUTY_VIEW_VERSION;
            dutyId: string;
            dutyDisposition: "OPEN" | "COMPLETED_UNDER_POLICY" | "ESCALATED" | "NEEDS_REVIEW" | "CONTESTED";
            outstanding: boolean;
            externalOutcome: "NOT_PROVEN";
            policy: core.PortableDutyPolicyActivation;
            observedHead: core.PortableHistoryHead;
            currentAssigneeId: string;
            latestAssignmentEventId: string;
            lastRecordedDisposition: ReturnType<typeof import("../../core-0.2/src/core/duty-disposition.ts").portableDutyDispositionProjection>["lastRecordedDisposition"];
            evidenceScope: Readonly<{
                kind: "COMPLETE_CAPTURED_HISTORY";
                head: core.PortableHistoryHead;
            }>;
            reasons: readonly string[];
        }> | undefined;
    }>;
    describe(input: DutyPolicySelection): {
        descriptor: Readonly<{
            version: typeof core.DUTY_POLICY_VERSION;
            rulesHash: typeof core.DUTY_POLICY_RULES_HASH;
            criteriaProfile: "local-investigation/1";
            domain: core.PortableAuthorizationDomain;
            genesisHash: core.ContentHash;
            baseAdapterPolicyHash: core.ContentHash;
            dutyId: string;
            dutyCreationEventId: string;
            dutyRecordHash: core.ContentHash;
            sourceIntentId: string;
            sourceAdmissionEventId: string;
            durableRoleId: string;
            principalId: string;
            incidentSourceDigest: core.PortableDutyDocumentDigest;
            acceptedAttesterRoleId: string;
            dispositionLimit: 4;
            contestLimit: 2;
        }>;
        descriptorHash: `0x${string}`;
        activationAction: "ACTIVATE_DUTY_POLICY";
        activationResource: string;
        head: Readonly<{
            hash: core.ContentHash;
            position: number;
            canonicalTime: number;
        }>;
        grantsAuthority: false;
    };
    activate(input: DutyPolicyActivation): Promise<{
        eventId: string;
        head: Readonly<{
            hash: core.ContentHash;
            position: number;
            canonicalTime: number;
        }>;
        alreadyRecorded: boolean;
        view: Readonly<{
            version: typeof core.DUTY_VIEW_VERSION;
            dutyId: string;
            dutyDisposition: "OPEN" | "COMPLETED_UNDER_POLICY" | "ESCALATED" | "NEEDS_REVIEW" | "CONTESTED";
            outstanding: boolean;
            externalOutcome: "NOT_PROVEN";
            policy: core.PortableDutyPolicyActivation;
            observedHead: core.PortableHistoryHead;
            currentAssigneeId: string;
            latestAssignmentEventId: string;
            lastRecordedDisposition: ReturnType<typeof import("../../core-0.2/src/core/duty-disposition.ts").portableDutyDispositionProjection>["lastRecordedDisposition"];
            evidenceScope: Readonly<{
                kind: "COMPLETE_CAPTURED_HISTORY";
                head: core.PortableHistoryHead;
            }>;
            reasons: readonly string[];
        }> | undefined;
    }>;
    inspect(duty: string): {
        scope: "CAPTURED_HISTORY_ONLY";
        executionCapability: false;
        head: Readonly<{
            hash: core.ContentHash;
            position: number;
            canonicalTime: number;
        }>;
        policy: Readonly<{
            version: typeof core.DUTY_VIEW_VERSION;
            dutyId: string;
            dutyDisposition: "OPEN" | "COMPLETED_UNDER_POLICY" | "ESCALATED" | "NEEDS_REVIEW" | "CONTESTED";
            outstanding: boolean;
            externalOutcome: "NOT_PROVEN";
            policy: core.PortableDutyPolicyActivation;
            observedHead: core.PortableHistoryHead;
            currentAssigneeId: string;
            latestAssignmentEventId: string;
            lastRecordedDisposition: ReturnType<typeof import("../../core-0.2/src/core/duty-disposition.ts").portableDutyDispositionProjection>["lastRecordedDisposition"];
            evidenceScope: Readonly<{
                kind: "COMPLETE_CAPTURED_HISTORY";
                head: core.PortableHistoryHead;
            }>;
            reasons: readonly string[];
        }> | null;
    };
}>;
export type LocalDutyPolicy = ReturnType<typeof openLocalDutyPolicy>;
