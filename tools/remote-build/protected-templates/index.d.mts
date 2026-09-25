import type {KeyObject} from 'node:crypto';
import type {PortableAuthorizationDomain, PortableCanonicalEvent, PortableHistoryHead, RemoteServiceReportAcknowledgment} from '@ramex-labs/continuity/adapter';
import type {LocalExecutionOptions, openLocalExecution, HistoryLocation, VerifiedHistory, createHistoryTransfer} from '@ramex-labs/continuity/adapter';

export type Hash = `0x${string}`;
export type Data = null | boolean | number | string | bigint | readonly Data[] | {readonly [key: string]: Data};
export type Arguments = Readonly<Record<string, Data>>;
export type Field = 'text' | 'integer' | 'boolean' | 'amount' | 'identifier' | readonly string[];
export type ToolDefinition = Readonly<{id: string; action: string; resource: string; fields: Readonly<Record<string, Field>>;
  projection?: Readonly<{amount?: string; counterparty?: string; unit?: string}>;
  compensates?: Readonly<{tool: string; businessKeyField: string}>}>;
export type Operation = Readonly<{intentId: string; tool: string; arguments: Arguments; businessKey: string; contractId: string}>;
export type NormalizedOperation = Operation & Readonly<{idempotencyKey: Hash; submissionFingerprint: Hash}>;
export type ReportIdentity = Readonly<{key: Hash; fingerprint: Hash; intentId: string; tool: string; businessKey: string; contractId: string; checkpointHash: Hash}>;
export type PendingReport = ReportIdentity & Readonly<{state: 'PENDING'}>;
export type CancelledReport = ReportIdentity & Readonly<{state: 'CANCELLED'}>;
export type AppliedReport = ReportIdentity & Readonly<{state: 'APPLIED'; effectId: string}>;
export type AttemptReport = PendingReport | CancelledReport | AppliedReport;
export type RefusalCode = 'NO_CHECKPOINT' | 'CHECKPOINT_CONFLICT' | 'CHECKPOINT_CHANGED' | 'OPERATION_CONFLICT' |
  'BUSINESS_KEY_CONFLICT' | 'AUTHORIZATION_REFUSED' | 'CLOCK_INVALID' | 'CAPACITY_EXHAUSTED' | 'INVALID_OPERATION' | 'STORAGE_UNAVAILABLE' | 'UNSUPPORTED_HISTORY_PROFILE' | 'TRANSFER_INVALID' | 'TRANSFER_CONFLICT' | 'TRANSFER_CHUNK_INVALID' | 'TRANSFER_STORAGE_LIMIT';
export type Refusal = Readonly<{state: 'REFUSED'; code: RefusalCode}>;
export type UnknownReport = Readonly<{state: 'UNKNOWN'; key: Hash}>;
export type CheckpointReport = Readonly<{state: 'CHECKPOINTED'; head: PortableHistoryHead}>;
export type TooLateReport = Readonly<{state: 'TOO_LATE'; report: AppliedReport}>;
export type TransferReport = Readonly<{state:'CHECKPOINT_STAGED'|'CHECKPOINT_ABORTED';transferId:string}> | Readonly<{state:'CHECKPOINT_CHUNKED';transferId:string;index:number}>;
export type ServiceResult = TransferReport | AttemptReport | Refusal | UnknownReport | CheckpointReport | TooLateReport;
export type SignedResponse<R extends ServiceResult = ServiceResult> = Readonly<{
  body: Readonly<{version: 'continuity-cooperative-response/1'; serviceId: string; requestDigest: Hash; sequence: number; result: R}>;
  signature: string;
}>;
export type CooperativeReply<R extends ServiceResult = ServiceResult> = Readonly<{sequence: number; result: R; receipt: SignedResponse<R>}>;

export interface ToolRegistry {
  readonly contractId: Hash;
  readonly serviceId: string;
  readonly account: string;
  readonly tools: readonly ToolDefinition[];
  capture(operation: Operation): Readonly<{wire: Operation; action: string; resource: string; termsCommitment: Hash; quantities: Readonly<{amount?: bigint; counterparty?: string}>}>;
  validateOperation(events: readonly PortableCanonicalEvent[], operation: Operation, now: number, destinationState?: DestinationState): NormalizedOperation;
}
export declare const REFERENCE_TOOLS: readonly ToolDefinition[];
export declare function createToolRegistry(options: Readonly<{serviceId: string; account: string; tools: readonly ToolDefinition[]}>): ToolRegistry;

export interface CooperativeClient {
  checkpointHistory(history:VerifiedHistory):Promise<CooperativeReply<CheckpointReport|Refusal>>;
  checkpointBegin(manifest:ReturnType<typeof createHistoryTransfer>['manifest'],transferId:string):Promise<CooperativeReply<TransferReport|Refusal>>;
  checkpointChunk(transferId:string,index:number,bytes:readonly string[]):Promise<CooperativeReply<TransferReport|Refusal>>;
  checkpointCommit(transferId:string):Promise<CooperativeReply<CheckpointReport|Refusal>>;
  abortCheckpointTransfer(transferId:string):Promise<CooperativeReply<TransferReport|Refusal>>;
  checkpoint(events: readonly PortableCanonicalEvent[]): Promise<CooperativeReply<CheckpointReport | Refusal>>;
  prepare(operation: Operation): Promise<CooperativeReply<AttemptReport | Refusal>>;
  commit(key: Hash): Promise<CooperativeReply<AttemptReport | UnknownReport | Refusal>>;
  status(key: Hash): Promise<CooperativeReply<AttemptReport | UnknownReport | Refusal>>;
  cancel(key: Hash): Promise<CooperativeReply<AttemptReport | UnknownReport | TooLateReport | Refusal>>;
  inspectResponse(envelope: unknown, expectedRequestDigest: Hash): CooperativeReply;
}
/** Trusted application keys and pinned destination; never expose this whole handle to an agent. */
export declare function createCooperativeClient(options: Readonly<{
  url: string; serviceId: string; coordinatorPrivateKey: KeyObject; servicePublicKey: KeyObject; timeoutMs?: number;
}>): CooperativeClient;

export type StoredAttempt = Readonly<{
  key: Hash; fingerprint: Hash; intentId: string; operation: Operation; normalized: NormalizedOperation;
  checkpointHead: PortableHistoryHead; preparedAt: number; report: AttemptReport;
}>;
export type DestinationState = Readonly<{
  version: 'continuity-cooperative-destination/1'|'continuity-cooperative-destination/2'; domain: PortableAuthorizationDomain; serviceId: string;
  coordinatorKey: Hash; serviceKey: Hash; sequence: number; lastTime: number;
  checkpoint: null | Readonly<{head: PortableHistoryHead; events: readonly PortableCanonicalEvent[]}> | Readonly<{head:PortableHistoryHead;reference:string}>;
  attempts: readonly StoredAttempt[];
  businessKeys: readonly Readonly<{businessKey: string; key: Hash; intentId: string}>[];
  effects: readonly Readonly<{effectId: string; key: Hash; fingerprint: Hash; tool: string; arguments: Arguments; businessKey: string; contractId: string}>[];
}>;
export interface CooperativeDestination {
  readonly url: string;
  inspect(): DestinationState;
  close(): Promise<void>;
}
/** Local synthetic destination: no real external effect or arbitrary execution callback. */
export declare function createCooperativeDestination(options: Readonly<{
  historyProfile?:'continuity-segmented-local/1';
  directory: string; domain: PortableAuthorizationDomain; serviceId: string;
  coordinatorPublicKey: KeyObject; servicePrivateKey: KeyObject; now: () => number;
  validateOperation: (events: readonly PortableCanonicalEvent[], operation: Operation, now: number, destinationState?: DestinationState) => NormalizedOperation;
}>): Promise<CooperativeDestination>;

export type ToolRequest = Readonly<{operationId: string; businessKey: string; tool: string; arguments: Arguments}>;
export type ExecutionResult = Awaited<ReturnType<ReturnType<typeof openLocalExecution>['run']>>;
export type CooperativeExecutionResult = Readonly<{
  execution: ExecutionResult;
  serviceReport: CooperativeReply | null;
  externalOutcome: 'NOT_PROVEN';
  revocationBoundary: 'DESTINATION_ACKNOWLEDGED_CHECKPOINT';
}>;
export interface CooperativeExecutor {
  run(request: ToolRequest): Promise<CooperativeExecutionResult>;
  checkpoint(): Promise<CooperativeReply<CheckpointReport | Refusal>>;
}
/** Root-selected local identity and policy; request data cannot choose them. */
export declare function createCooperativeExecutor(options: Readonly<{
  local: LocalExecutionOptions & Readonly<{additionalPolicy?: never}>;
  client: CooperativeClient; registry: ToolRegistry; role: string; tenure: string;
}>): CooperativeExecutor;

export type RecoveryResult = Readonly<{serviceReport: CooperativeReply; observationAcknowledgment: RemoteServiceReportAcknowledgment | null; externalOutcome: 'NOT_PROVEN';
  dispatchPerformed: false; retryPolicy: 'NO_AUTOMATIC_REDELIVERY'}>;
export interface CooperativeRecovery {lookup(request: ToolRequest): Promise<RecoveryResult>; cancel(request: ToolRequest): Promise<RecoveryResult>}
export declare function createCooperativeRecovery(options: Readonly<{local: HistoryLocation & Pick<LocalExecutionOptions,'domain'>;
  client: CooperativeClient; registry: ToolRegistry}>): CooperativeRecovery;
export type DestinationLock = Readonly<{version: 'continuity-destination-lock/1'; hostname: string; pid: number; instance: string}>;
export declare function inspectDestinationLock(options: Readonly<{directory: string}>): DestinationLock;
export declare function recoverDestinationLock(options: Readonly<{directory: string; expectedLock: DestinationLock}>):
  Readonly<{recovered: true; retainedLock: string; lock: DestinationLock}>;

/** Stop the destination first. Recovery is explicit; original bytes are retained. */
export declare function migrateDestinationHistory(options:Readonly<{directory:string;quiesced:true;expectedIdentity:Pick<DestinationState,'version'|'domain'|'serviceId'|'coordinatorKey'|'serviceKey'>}>):Promise<Readonly<{status:'DESTINATION_MIGRATED';sequence:number;checkpointHead:PortableHistoryHead|null;attempts:number;automaticEffectReplay:false}>>;


/** Trusted fixed local evidence bundle; workers cannot supply this configuration. */
export interface ProtectedEvidenceConfiguration {
 readonly bundleDirectory:string;
 readonly files:readonly Readonly<{name:string;bytes:number;sha256:string}>[];
 readonly resource:string;
 readonly reviewerTokenHash:string;
 readonly socketPath:string;
}
export interface ProtectedEvidenceDestination extends CooperativeDestination {
 readonly readerSocket:string;
 readonly registry:ToolRegistry;
}
export declare function createProtectedEvidenceDestination(options:Readonly<{
 initialize?:boolean;directory:string;domain:PortableAuthorizationDomain;evidence:ProtectedEvidenceConfiguration;
 coordinatorPublicKey:KeyObject;servicePrivateKey:KeyObject;now:()=>number;
 historyProfile?:'continuity-segmented-local/1';
}>):Promise<ProtectedEvidenceDestination>;
export declare function readProtectedEvidence(options:Readonly<{socketPath:string;token:string}>):Promise<Readonly<{
 status:number;body:Readonly<{resource:string;sequence:number;files:readonly Readonly<{name:string;sha256:string;bytes:number;base64:string}>[]}>|Readonly<{error:string}>;
}>>;
