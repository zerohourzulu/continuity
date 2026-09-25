# Keep a case through a restart

This private development package adds durable local history storage to the H02 history interface. It preserves the complete case, including spent permissions, revocations, receipts and unfinished duties. It does not yet replace the storage used by the published remote and MCP integrations.

The package is `@ramex-labs/continuity@0.3.0-h03.1`, marked `private: true`. Do not install that version from npm: it has not been published. The source includes the built package in `sdk/history-store` and its source/output hashes in `BUILD-PROVENANCE.json` inside that directory.

## Try the checks

Use Node 22.18 or Node 24. From this source directory:

```sh
npm ci --ignore-scripts
node --experimental-strip-types --test tests/core-0.3/history-store.test.mjs
npm --prefix tools/sdk-build ci --ignore-scripts
node tools/build-history-store.mjs --check
node tools/check-history-store-installed.mjs
```

Dependency installation requires registry access unless already cached. The installed-package check itself uses an offline local tarball in a fresh temporary project. It checks every installed file, JavaScript and TypeScript use, migration, signed administration, reopening and the actual command-line tool. It needs no account, network service, model or private project material. The tests use disposable synthetic data; some intentionally terminate child processes.

The tests exercise 20 cases, including seven write interruption points, seven migration interruption points and competing processes. The storage review records which platforms actually ran them. Initial verification was on macOS arm64 with Node 22.18 and 24.21; Linux integration remains later work. Successful process-kill tests are not a certification against physical power loss.

## How it works

A directory holds digest-named event segments and one current `manifest.json`. Segments are immutable. The manifest names the complete ordered history, its commitments and its storage revision. Reopening reads and checks every required segment and replays from genesis through the same Core engine. It never trusts saved state or silently chooses an older manifest.

Writers compare the expected instance, generation and canonical head while holding an exclusive cooperative lock. They write and sync new data before replacing the manifest, then sync the directory before reporting success. A generation is a local concurrency counter, not chain finality or protection from an administrator restoring the entire disk.

Use `DirectoryHistoryStore.create(path, verifiedBootstrap)` only for a new two-event bootstrap: deployment initialization and principal creation. A working case must use migration. Fresh domain uniqueness remains the application's responsibility. The internal initializer used by synthetic tests is not a supported migration or activation API.

```js
import {
  openHistoryBinding,
  commitHistoryAdministration,
} from '@ramex-labs/continuity/history-store';

// This binding was created by the explicit migration below.
const store = openHistoryBinding('/private/operator/case-binding.json');
const snapshot = store.snapshot();
console.log(snapshot.history.head, snapshot.capacity.mode);

// Supply a valid administrative request and trusted application callbacks.
// The helper signs outside the lock, then rechecks the head, time and authority.
await commitHistoryAdministration(store, request, { signHash, now });
```

This is an integration sketch, not a complete executable scenario: `request`, `signHash` and `now` belong to your application. The independently runnable installed-package check supplies a full example. A snapshot is historical evidence, never permission to dispatch a tool. Low-level storage append validates replay and capacity; your coordinator still owns current-time checks, effect ordering and recovery. No adapter is invoked by this package.

Paths, binding files, signer/clock callbacks and maintenance commands belong to the trusted operator. Do not expose them as agent-controlled tool arguments. Workers must not have direct write access to the ledger, configuration or credentials.

## Move an existing file-backed case

First stop its writers, coordinators and dispatch. Account for outstanding operations. The `quiesced` flag records your assertion; the tool cannot prove all processes have stopped or an outside effect did not happen. Do not start either configuration until migration has been inspected and the intended coordinator can use the new binding.

Use an owner-controlled local directory. New target, plan and binding paths must not already exist. Choose the exact canonical head from your existing case. List any receipt or other artifact files that must be preserved; the tool does not discover them automatically.

Create a JSON settings file with these fields, replacing the illustrative paths and head:

```json
{
  "sourceFile": "/private/operator/case/history.json",
  "targetDirectory": "/private/operator/case/history-directory",
  "planFile": "/private/operator/case/migration-plan.json",
  "expectedHead": { "hash": "REPLACE_WITH_CURRENT_HEAD_HASH", "position": 0, "canonicalTime": 0 },
  "configurationFiles": ["/private/operator/case/binding.json"],
  "artifactFiles": ["/private/operator/case/receipt.json"],
  "quiesced": true
}
```

Run the installed command:

```sh
continuity-history-store prepare-migration settings.json
continuity-history-store stage /private/operator/case/migration-plan.json --quiesced
continuity-history-store activate /private/operator/case/migration-plan.json --quiesced
continuity-history-store migration-status /private/operator/case/migration-plan.json
```

Preparation checks compatibility and records an immutable plan. Staging creates an INACTIVE target, preserves the original file exactly as `source-original.bin`, and copies the selected artifacts. Activation replaces the old writable file with a refusal marker, verifies the exact new binding files, then marks the target ACTIVE. Old supported readers and writers reject that marker. Normal new-store opens verify the marker, original backup, artifacts and binding files again.

Keep the original backup and plan. Do not restore the backup over the marker or point an old application at another writable copy. That would undo the migration fence. A source change before activation is a conflict requiring inspection, not a reason to overwrite new work.

These binding files configure this H03 Core coordinator only. Adapting remote/MCP configuration, checkpoint transfer, LangChain usage and other readers is C03-H04 work. Do not replace an existing application's unrelated configuration file with a binding or infer that `dispatchReady: true` certifies application readiness. It means only that this store's activation checks pass.

## Recover an interruption

If a write reports `WRITE_UNCERTAIN`, stop using that store instance. Preserve the error and files, reopen, and reconcile the operation against the exact committed history. A missing reply does not mean the write failed. Never blindly retry an external effect, promote orphan files or select a convenient older head.

For an interrupted migration, inspect `migration-status`. Resume staging if the source is still original and the target is incomplete; resume activation for a complete staged target or a marked source. Use the same immutable plan and target instance. The implementation checks the actual files, not a journal phase label. A missing or mismatched file causes refusal. Preserve partial/corrupt staging files for diagnosis; no automatic repair path is provided. If activation already succeeded, repeating activation verifies the existing result without starting another case.

An interrupted process may leave its lock. Obtain its exact recorded digest with `lock-info`, then use `recover-lock` with that digest. Recovery succeeds only for the same recorded hostname and an OS-confirmed absent PID. A live, malformed, changed or unknown owner is refused; an old timestamp is not evidence that unlocking is safe.

```sh
continuity-history-store lock-info /private/operator/case/history-directory
continuity-history-store recover-lock /private/operator/case/history-directory EXACT_RECORDED_SHA256
```

The old-file migration lock lives beside that file, named `history.json.writer-lock` in this example. Pass that filename as the final argument to the same commands, with its parent directory. A recovery guard has its own record and requires equally careful exact-record recovery if its owner died. These are explicit maintenance actions, not background retries.

`inspect DIR` reports captured history, phase and capacity; it can inspect an inactive target and is not an activation check. Use `migration-status` and `openHistoryBinding` for migrated readiness.

Failed writes may leave unused segments or temporary manifests. Save needed evidence before cleanup. The explicit cleanup command requires the current revision and complete unchanged orphan inventory:

```sh
continuity-history-store orphans /private/operator/case/history-directory > orphan-inventory.json
continuity-history-store cleanup-orphans /private/operator/case/history-directory orphan-inventory.json
```

There is no automatic deletion. Changed inventory/revision, unexpected files or exhausted orphan bounds require inspection. Cleanup affects only files classified as unused by that current manifest. Incomplete staging without a usable manifest has no automatic cleanup/recovery shortcut.

## Finite space and other limits

The complete case must fit 1,024 events and 6 MiB of canonical event bytes. Admission also reserves room for the established eleven lifecycle record kinds per declared intent and the remaining original eight shared controls. Consumed controls and permissions never reset at a segment boundary or restart. `OPEN` means the conservative reservation check has room for another declaration; `DRAINING` means it does not. Neither grants authority.

Reservations charge canonical bytes, nodes, encoded bytes and descriptors as well as events. A history can fit the raw capture limit and still be incompatible with durable operation because it lacks its reserved tail. The pre-sign administrative check conservatively charges a maximum-size new record; some smaller records may therefore be refused before the physical byte limit.

| Bound | Limit |
| --- | --- |
| Canonical event | 8 KiB, 512 nodes, depth 16, 32 array members |
| Complete canonical history | 1,024 events, 6 MiB, 524,288 nodes |
| Encoded event / history | 32 KiB / 32 MiB |
| Segment | 64 events, 2 MiB encoded |
| Segments / descriptor | 1,024 / 512 bytes |
| Manifest / migration plan | 1 MiB / 32 KiB |
| Unused files | 32 files, 8 MiB total; new writes reserve extra failure space |
| Original source backup | 64 MiB |
| Explicit artifacts | 64 files, 1 MiB each |
| Binding files | 1–16 |

The source backup, artifacts and unused-file allowance are separate budgets. They are not included in the 6 MiB canonical limit. There is no unlimited-work or constant-memory promise. Existing query/output budgets can still return explicit `INDETERMINATE` for a wide authority graph; storage capacity does not guarantee an answer to every query.

The supported storage assumption is a trusted local POSIX host with cooperative writers. The checks reject final symlinks, hardlinked files, wrong ownership and group/world-writable storage. Normal ancestor aliases such as macOS `/var` are resolved. This is not protection against a hostile administrator, arbitrary ancestor replacement, network filesystem failure, compromised kernels or deliberate copying of the complete environment.

In one measured Node 24 macOS run, reopening a 1,007-event case in a fresh process took 274 ms; a signed administrative commit took 2.15 seconds, followed by a 260 ms reopen. Whole-process peak memory was about 312 MiB. This was a small-record fixture near its event reservation cutoff, not a maximum-byte benchmark, a cold OS cache measurement or a latency guarantee. H02 separately measured the larger canonical-byte profile.
