import {createLocalDomain,createLocalAttemptOwner,openLocalOwner,type LocalOwnerOptions} from '@ramex-labs/continuity/local';
import {openLocalAttemptRecorder,type AttemptDuty} from '@ramex-labs/continuity/attempts';
import {openLocalDutyPolicy,inspectContinuationDutyPolicy,type DutyPolicySelection,type DutyPolicyActivation,type PortableDutyPolicyDescriptor,type DutyDisposition,type DutyContest,type DutyChecklist,type DutyFindingSigner,type LocalDutyPolicy} from '@ramex-labs/continuity/duties';
import {DirectoryHistoryStore,prepareMigration,stageMigration,activateMigration,type Snapshot,type Revision} from '@ramex-labs/continuity/history-store';
import {captureContinuationHistory,exportContinuationEvents,type VerifiedHistory} from '@ramex-labs/continuity/history';
import {openLocalExecution,type LocalExecutionOptions} from '@ramex-labs/continuity/adapter';
import type {LocalRuntimeOptions} from '@ramex-labs/continuity/runtime';
import type {HistoryHead,HistoryEvent} from '@ramex-labs/continuity';

declare const options: LocalRuntimeOptions;
declare const historical: VerifiedHistory;
declare const migration: Parameters<typeof prepareMigration>[0];
const host: LocalOwnerOptions = options;
createLocalDomain();createLocalAttemptOwner(host);openLocalOwner(host);
const duty: AttemptDuty={id:'duty',intent:'job',description:'Synthetic local investigation',deadline:1000};
void openLocalAttemptRecorder(options).createDuty(duty);
const duties: LocalDutyPolicy=openLocalDutyPolicy(options);
const selection: DutyPolicySelection={duty:'duty',incidentSourceDigest:{algorithm:'sha256',value:'0xabc'},attesterRole:'role'};
const selected=duties.describe(selection);
const descriptor: PortableDutyPolicyDescriptor=selected.descriptor;
const limits: readonly [4,2]=[descriptor.dispositionLimit,descriptor.contestLimit];
const activation: DutyPolicyActivation={id:'activation',descriptor,activationAuthority:'grant'};
async function consume() {
  const result=await duties.activate(activation);
  const head: HistoryHead=result.head;
  const duplicate: boolean=result.alreadyRecorded;
  if(result.view) {
    const status:'OPEN'|'COMPLETED_UNDER_POLICY'|'ESCALATED'|'NEEDS_REVIEW'|'CONTESTED'=result.view.dutyDisposition;
    const outstanding:boolean=result.view.outstanding;
    const outcome:'NOT_PROVEN'=result.view.externalOutcome;
    const version:'continuity-attempt-duty-view/1'=result.view.version;
    void [status,outstanding,outcome,version,head,duplicate];
  }
}
const inspection=inspectContinuationDutyPolicy(historical,'duty');
const authority:false=inspection.executionCapability;
const capturedOnly:'CAPTURED_HISTORY_ONLY'=duties.inspect('duty').scope;
const store=new DirectoryHistoryStore('/private/tmp/example-only');
const snapshot: Snapshot=store.snapshot();
const revision: Revision=snapshot.revision;
const events: readonly HistoryEvent[]=exportContinuationEvents(snapshot.history);
prepareMigration(migration);stageMigration('/private/tmp/plan',{quiesced:true});activateMigration('/private/tmp/plan',{quiesced:true});
const captureInput: Parameters<typeof captureContinuationHistory>[0]={events};
const executionOptions: LocalExecutionOptions=options;
const openExecution: typeof openLocalExecution=openLocalExecution;
// @ts-expect-error D1 document digests have a closed algorithm.
const badDigest: DutyPolicySelection={...selection,incidentSourceDigest:{algorithm:'sha512',value:'0xabc'}};
// @ts-expect-error D1 never accepts caller-selected disposition limits.
const badDescriptor: PortableDutyPolicyDescriptor={...descriptor,dispositionLimit:5};
// @ts-expect-error The activation API has no arbitrary policy callback.
duties.activate({...activation,policy:()=>true});
void [consume,limits,authority,capturedOnly,revision,events,captureInput,executionOptions,openExecution,badDigest,badDescriptor];

declare const checklist: DutyChecklist;
const operation: DutyDisposition={id:'complete',duty:'duty',disposition:'COMPLETED_UNDER_POLICY',checklist,reportDigest:{algorithm:'sha256',value:'0xabc'},nextStep:null,attestationAuthority:'finding',dispositionAuthority:'disposition'};
const findingSigner: DutyFindingSigner={session:'attester',signHash:options.signHash};
const distinct=openLocalDutyPolicy(options,findingSigner);
const prepared=distinct.prepareDisposition(operation);
const noCapability:false=prepared.executionCapability;
const purpose:'DISPOSITION'|'CONTEST'=prepared.challenge.purpose;
void distinct.dispose(operation);
const contest: DutyContest={id:'contest',duty:'duty',targetDispositionId:'duty-disposition:complete',reason:'Review this report',reportDigest:operation.reportDigest,attestationAuthority:'finding',dispositionAuthority:'disposition'};
void distinct.contest(contest);void distinct.prepareContest(contest);
// @ts-expect-error The public operation cannot supply its own attester identity or session.
distinct.dispose({...operation,attesterId:'intruder'});
// @ts-expect-error Outside completion is not a supported disposition.
distinct.dispose({...operation,disposition:'EXTERNALLY_PROVEN'});
// @ts-expect-error The contest does not accept an arbitrary policy callback.
distinct.contest({...contest,policy:()=>true});
void [noCapability,purpose];
