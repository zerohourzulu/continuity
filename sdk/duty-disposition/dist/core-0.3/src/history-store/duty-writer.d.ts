import type { ContentHash } from '../../../core-0.2/src/core/canonical.ts';
import { DirectoryHistoryStore } from './store.ts';
export declare function commitHistoryDutyFinding(store: DirectoryHistoryStore, input: unknown, options: {
    signFinding: (hash: ContentHash) => Promise<unknown>;
    signTransition: (hash: ContentHash) => Promise<unknown>;
    now: () => number;
}): Promise<Readonly<{
    history: import("../../../core-0.2/src/history/index.ts").VerifiedHistory;
    revision: import("./store.ts").Revision;
    manifest: import("./store.ts").Manifest;
    capacity: ReturnType<typeof import("./capacity.ts").historyCapacity>;
}>>;
