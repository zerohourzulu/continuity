import { replayPortable, PORTABLE_REPLAY_VERSION, type PortableReplayResult, type PortableActionRequest } from '@continuity/core-0.2';
import { DurableAdmissionCoordinator, type PreparedDurableAdmission } from '@continuity/core-0.2/sdk/admission';
import { DurableReceiptCoordinator } from '@continuity/core-0.2/sdk/receipt';
import { PortableFileEventStore } from '@continuity/core-0.2/store';
import { prepareAdministrativeEvent } from '@continuity/core-0.2/administration';
import { DeterministicSimulatedAdapter, type TransactionAdapter } from '@continuity/core-0.2/adapters';
const result: PortableReplayResult = replayPortable({operationVersion:PORTABLE_REPLAY_VERSION,events:[]});
const store=new PortableFileEventStore('/unused/typecheck-only.jsonl');
const adapter: TransactionAdapter=new DeterministicSimulatedAdapter();
const coordinator=new DurableAdmissionCoordinator(store,adapter,{authoritativeNow:()=>1});
const preparation:PreparedDurableAdmission=coordinator.prepare({});
void [result,preparation,new DurableReceiptCoordinator(store),prepareAdministrativeEvent];
const request:PortableActionRequest={actorId:'a',action:'read',resource:'r',claimedAt:1};
// @ts-expect-error quantities must be bigint, never rounded JavaScript numbers.
const badAmount:PortableActionRequest={...request,amount:1};
// @ts-expect-error unknown coordinator method is not a supported API.
coordinator.allowEverything();
