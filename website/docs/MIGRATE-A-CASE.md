# Move a case without losing its past

Migration changes where a case is stored. It preserves its identity, complete history, revoked permissions, spent allowances, attempts and unfinished duties. It does not start a fresh case or permit retrying an uncertain action.

Use the coordinated versions in [supported profiles](https://github.com/zerohourzulu/continuity/blob/main/docs/SUPPORTED-PROFILES.md). Install the bundled archives with `node tools/release/install.mjs /absolute/empty/consumer-directory`. The commands below then use that directory's `node_modules/.bin/continuity-history-store`. Keep all paths, keys and maintenance commands under operator control; never expose them as agent tools.

## Plan and stop writers

Stop the case owner, gateway and dispatchers. Stop every other process that can write this history. Preserve the complete working case and its private host configuration. Do not publish it. A backup is useful for investigation; it is not permission to roll a live case back.

Obtain the expected complete head from the stopped owner's verified view (`head.hash`, `head.position`, `head.canonicalTime`). Do not guess a head or use an arbitrary old snapshot. Create a JSON configuration with these fields:

```json
{
  "sourceFile": "/private/case/history.jsonl",
  "targetDirectory": "/private/case/continued",
  "planFile": "/private/case/migration-plan.json",
  "expectedHead": {"hash": "REPLACE_WITH_VERIFIED_0x_HASH", "position": 42, "canonicalTime": 0},
  "configurationFiles": ["/private/case/history-binding.json"],
  "artifactFiles": [],
  "quiesced": true
}
```

The head above is an illustrative placeholder. Use your actual verified values. Target, plan and binding paths must not already exist; their parent directories must exist. Include associated artifacts that must be preserved, within the documented artifact budgets. `quiesced: true` is your assertion that writers are stopped, not a command that stops them.

```sh
node_modules/.bin/continuity-history-store prepare-migration /private/case/migrate.json
node_modules/.bin/continuity-history-store stage /private/case/migration-plan.json --quiesced
node_modules/.bin/continuity-history-store migration-status /private/case/migration-plan.json
node_modules/.bin/continuity-history-store activate /private/case/migration-plan.json --quiesced
node_modules/.bin/continuity-history-store inspect /private/case/continued
```

Preparation validates the full source and capacity. Staging preserves original bytes and artifacts. Activation replaces the old writable path with a migration marker, creates the exact selected binding and enables the directory store. Keep the original plan and all migration files. Configure the host with `historyProfile: 'continuity-segmented-local/1'` and `historyBinding` pointing to that binding; remove `historyFile`. Do not fabricate another binding or run an old writer against the marker.

A cooperating destination requires its own stopped-service migration. Follow [the destination procedure](https://github.com/zerohourzulu/continuity/blob/main/docs/HISTORY-INTEGRATION.md#the-cooperating-destination-is-a-separate-migration), using its actual captured identity. Case migration alone does not migrate that service, advance its checkpoint or execute anything. Verify both stores and their exact configuration before resuming dispatch.

## If migration or a write is interrupted

Keep all files, including partial writes. Inspect migration status with the original plan. Stage and activate are designed to resume their recorded transition; changed source bytes, artifacts, bindings or later progress are reasons to stop and investigate. Never clear files or restore an old snapshot simply to get a command to pass.

A writer lock may remain after a process dies. `lock-info DIR [NAME]` reports its exact record and hash. Only recover a lock when its same-host owner process is confirmed absent, using `recover-lock DIR SHA256 [NAME]`. The tool rechecks the exact lock and process. For a source-file migration, use the source parent directory and `<source basename>.writer-lock`; the directory store uses `.writer-lock`. Age alone is not evidence of death. An unknown host, reused/live PID or changed lock must remain blocked.

`orphans DIR` identifies unreferenced files against an exact revision. `cleanup-orphans DIR INVENTORY.json` accepts only that selected inventory/revision. It is maintenance, not permission to promote a partial event or delete required history. Preserve failure evidence before cleanup.

## Resume uncertain work by asking what happened

Restart the destination with its existing identity, storage and host-held keys. The protected evidence factory defaults to reopening; `initialize: true` is only for a fresh empty destination. Missing state on restart must not silently reopen access.

Use the gateway's recovery operation for the existing attempt. It asks for status and records available evidence; it does not resend the effect. An applied result remains applied even if the checkpoint later advances. Uploading history is not a fence: only the destination's durably acknowledged checkpoint fences pending work at an older head. If the answer remains unknown, preserve that uncertainty and the duty to investigate.

Run the [installed integration checks](https://github.com/zerohourzulu/continuity/blob/main/docs/HISTORY-INTEGRATION.md#reproduce-the-evaluation) on a disposable case before operating your own. These procedures assume cooperative local writers and trusted storage; they do not provide automatic disaster recovery, key recovery or protection from a hostile host.
