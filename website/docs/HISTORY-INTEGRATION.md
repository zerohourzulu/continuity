# Continue the same case across local tools and services

This developer preview pairs Core `0.3.0-preview.10`, remote `0.3.0-preview.5`, MCP gateway `0.3.0-preview.10` and evidence MCP `0.3.0-preview.11`. Existing downloaded archives keep their original limits. The fixed evidence workflow is runnable from `examples/protected-evidence/README.md`.

A case can now keep the same history, powers, spent limits, attempts and responsibilities when it grows beyond the old file profile. This profile is finite: 1,024 events and 6 MiB of canonical event data, with room reserved for records belonging to admitted jobs. Moving storage does not renew a grant or resolve an unfinished duty.

## Choose the profile explicitly

Existing `historyFile` configurations keep the managed96 profile. For a working case, stop its writers and use the `prepareMigration`, `stageMigration` and `activateMigration` functions exported by `@ramex-labs/continuity/history-store`. Their existing CLI supports inspection and exact dead-owner recovery. Preserve the migration plan, original file, artifacts and binding. A completed migration replaces the old writable path with a marker; it does not leave two supported writers.

Use the exact binding named in that migration. Remove `historyFile` from the host configuration:

```js
const {historyFile, ...identityAndSigner} = previousLocalConfiguration;
const local = {
  ...identityAndSigner,
  historyProfile: 'continuity-segmented-local/1',
  historyBinding: '/private/case/history-binding.json',
};
```

Paths, profile, identity, signing keys and tool definitions belong to the host, never to an agent's tool arguments. `openLocalOwner`, execution, runtime duty recording, attempt recording and evidence tools use the selected store. MCP gateway configuration and the protected-evidence MCP configuration accept the same selection. Native LangChain tools use their existing executor interface.

## The cooperating destination is a separate migration

Start a fresh destination with `historyProfile: 'continuity-segmented-local/1'`. An existing destination must be stopped and migrated explicitly:

```js
import {migrateDestinationHistory} from '@ramex-labs/continuity-remote';
// Capture these identity fields from the running destination's inspect() result,
// then close it and stop any other owner before migration.
const {version, domain, serviceId, coordinatorKey, serviceKey} = priorState;
const result = await migrateDestinationHistory({
  directory: '/private/destination', quiesced: true,
  expectedIdentity: {version, domain, serviceId, coordinatorKey, serviceKey},
});
```

Migration preserves sequence, times, attempts, business keys, cancellation records and applied results. Original identity/snapshot bytes remain under `migration-v2/`. It changes the destination format to `/2` and replaces an inline checkpoint with a durable reference. It does **not** advance the checkpoint or execute a tool. Reopen with the explicit new profile. The old profile refuses the changed identity.

If a process dies, preserve the directory. Inspect its lock and recover only an exact same-host lock whose process is confirmed absent. Retry the migration using the original expected identity. A mixed identity/snapshot pair remains unavailable until that migration completes. Partial preparation without a complete plan, changed staged bytes, or later service progress require investigation; the function refuses rather than overwrite them. Never restore an old snapshot to make a retry succeed. No age-based unlocking or hostile-administrator rollback protection is claimed.

## Uploading history is not the fence

The executor sends an authenticated manifest and bounded chunks. The service stores each chunk durably, reconstructs and independently replays the complete history, then commits its checkpoint reference in the same destination transaction that preserves its latest attempts and reports. No saved replay-state object is accepted as authority.

Only a durably acknowledged checkpoint fences a still-pending preparation at an older head. Beginning or partially uploading a transfer does not. If a tool applied before the checkpoint changed, its APPLIED result remains available afterward. Exact same-history retries are idempotent and preserve the sequence and existing reference; shorter or divergent histories refuse. A lost acknowledgment remains uncertain until the exact checkpoint is reconciled.

Trusted host clients have `checkpointHistory(verifiedHistory)`, plus `checkpointBegin`, `checkpointChunk` and `checkpointCommit` for explicit transfer recovery. `abortCheckpointTransfer(id)` clears only the selected staging pointer. It never deletes history, undoes a committed checkpoint or cancels an attempt. New competing transfers refuse until the active transfer finishes or its owner explicitly aborts it. Cancellation of a business operation remains a separate authorized operation.

## Finite service storage and failure handling

One destination retains at most 256 attempts, as before. The new transfer directory counts **all** staged and committed files against 64 MiB, 2,048 chunks and 2,048 manifests. Each chunk holds at most 64 events and 2 MiB of the tagged encoding; each manifest is at most 64 KiB. Wire chunks are base64 pieces of at most 4,096 characters, keeping the existing transport scalar limit. The signed request envelope remains `/1`; the checkpoint transfer is `continuity-checkpoint-transfer/1` and the destination state is `/2`.

These are separate limits: fitting the ledger does not promise space in the service. New staging refuses before exceeding its allowance. There is no automatic pruning or quota reset. Exact retries reuse identical files. Corrupt, missing, substituted or partially written required files fail closed; no fallback checkpoint or cache is selected. Preserve failed files for diagnosis. An intact committed checkpoint can still support status when new staging is full; unavailable or corrupt required storage cannot promise status.

## Readers and compatibility

| Entry point | Selected continued-history behavior |
| --- | --- |
| Local owner, execution, simulation, runtime, E5/E6 attempt recorder, protected evidence tool | Explicit binding uses the directory store and complete-history reservations. Signed writes recheck the actual current head and authority. |
| Core `observeContinuationHistory` / `inspectContinuationAttempts` | Verified complete-history handles; historical observations only, never execution capability. |
| Core `observeHistory` / `inspectAttemptHistory`, legacy receipt/array helpers | Original limits remain. Use the new handle APIs for larger histories; no silent array-limit expansion. |
| Remote executor, recovery and native LangChain tools | One shared Core dependency. New profile uses staged checkpoints; recovery remains status-only and does not resend an effect. |
| MCP cooperating gateway | Fixed jobs, inspection, why, recovery, cancellation and E5 observations use the configured history. It remains E5-only; E6 review is not exposed through this gateway. |
| Ordinary MCP gateway and HTTP host | Same selected local store and access checks. HTTP deduplication uses the canonical case directory, not a binding filename alias. No arbitrary-tool safety claim. |
| Gateway operations | `inspectCase` accepts the new location; CLI `inspect --history-binding PATH --storage PATH` selects it. Legacy `snapshotCase` refuses this profile explicitly. Use directory-store/migration inspection; no new restore authority is supplied. |
| Old retained-history CLI/MCP reader | Original Core 0.2 bounded reader. Explicitly refuses new bindings and migration markers with `UNSUPPORTED_HISTORY_PROFILE`. No partial/suffix view. |
| Browser playground, historical examples and generated SDK snapshots | Their original versioned profiles remain. They do not become live directory-store hosts. |
| Mixed Core/remote/gateway tuple or old destination | Unsupported; use the exact coordinated versions and explicitly migrate. No automatic downgrade. |

The remaining numeric limits found in the inventory include per-request identifiers, signatures, observations per review, query output and record counts. They are not history-length limits and are not raised by this work. An output/search budget can still yield INDETERMINATE rather than an authorization answer.

## Reproduce the evaluation

Start in the extracted source directory with Node 22.18 or 24 and npm available on your PATH. Install the pinned build tools once, then check that the packages reproduce:

```sh
npm ci --prefix tools/sdk-build --ignore-scripts --no-audit --no-fund
node tools/release/build.mjs --check
```

You do not need a global TypeScript or pnpm installation. To rebuild after changing source, run `node tools/release/build.mjs`. This compiles one shared Core and packs all four integrations under `sdk/investigation-release/`; it never logs in or publishes. Historical SDK outputs remain unchanged. `tools/release/versions.json` selects versions, and `RELEASE-PACKAGES.json` records exact package hashes. If you change package bytes, update the corresponding local dependency lock integrities before running the installer; `node tools/release/check-locks.mjs` detects a stale lock.

Use `node tools/release/install.mjs /absolute/empty/consumer-directory` to install those exact archives together. Registry access may be needed for pinned third-party dependencies; no lifecycle scripts run. Set `CONTINUITY_OFFLINE=1` with a populated `npm_config_cache` to require offline resolution. The installer refuses a nonempty destination and verifies package bytes and the single shared Core. See `docs/SUPPORTED-PROFILES.md` and `docs/MIGRATE-A-CASE.md` before moving a working case.

Copy `tests/core-0.3/history-installed-consumer.mjs` into that consumer directory and run it with Node 22.18 or 24. The synthetic integration fixture seeds 320 events, migrates them, exercises MCP lost-reply recovery and native LangChain, and checks business-key conflict and revocation. This is distinct from the actual 124-window protected workflow. Legacy readers refuse the new binding explicitly instead of presenting a partial view.

Run `node tools/release/verify.mjs` for the complete fresh-install check, including strict public types, a 320-event MCP/LangChain case, a protected service reopen and a 300-event evidence MCP call/retry. The cases use synthetic local data and private temporary directories.
