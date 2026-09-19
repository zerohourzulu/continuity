# Walkthrough: replace a security reviewer without losing its duty

Run the commands in the [README](../README.md). Budget roughly ten minutes for installation and reading; execution timing depends on the host. No claim of a benchmark or universal latency bound is made.

## Read the seven checkpoints

| Checkpoint | Expected result | Meaning |
|---|---|---|
| A may collect | ALLOW | An explicit grant permits this action/resource. |
| Intake acknowledged | OPEN | A receipt exists and a separate review duty was created. |
| Handover | HANDOVER_COMPLETE | Epoch advance, protocol termination, role transfer, B session and duty assignment are committed in order. |
| A grant revoked | DENY | A is no longer current and its collection grant is now explicitly revoked. |
| Old signed request | DENIED, executorInvoked false | Current admission refuses the obsolete worker. |
| B inherits duty | OPEN, performer b:CASE | The duty did not disappear with A. |
| B review permission | ALLOW, collectionDecision DENY | The replacement has a narrow independent review grant, not general powers. |

With `--successor-review deny`, the final review decision is DENY, while the duty remains OPEN. Revocation occurs after the fixed handover sequence, not during it. The A denial combines replacement and explicit grant revocation; it is not an isolated measurement of either mechanism.

## Simulation versus packet mode

Default `--mode simulated` creates history, an authenticated fixture receipt and local evidence files. Its executor result is SIMULATED_SUBMISSION. No evidence packet is actually copied and no review note is written. The policy check is a real Core decision; the external outcome is simulated.

`--mode packet` uses the existing local packet executor to copy the two bundled synthetic logs, verify a retained manifest, and return LOCAL_PACKET_CREATED. If B has review power, it writes one signed application review note. If B lacks that power, the note call is refused. Neither result discharges the OPEN duty.

Try the negative packet case:

```sh
node tutorial/cli.mjs run --case blocked-note --mode packet --successor-review deny
node tutorial/cli.mjs inspect blocked-note
```

Expect `B note write is refused despite the assigned duty: DENIED`. There is no signed note in that case. Ordinary Unix file permissions and a trusted operator underpin this local example; the two agents are not isolated processes.

## Open the evidence

For `first-look`, begin at `runs/first-look/result.json` and `runs/first-look/summary.json`. Compare `authority-before.json`, `authority-after.json`, and `successor-authority.json` for decision/proof details.

Raw application evidence lives under `integrations/core-0.2-reference/cases/first-look/`:

- `history.jsonl`: append-only reference events, including revocations and handover.
- `receipt.json`: fixture-signed receipt, with its simulator or packet assurance.
- `stale-request.json`: old signed input, admission denial and no executor invocation.
- `export/`: selected history, receipt, queries, state and summary for inspection.

`node tutorial/cli.mjs inspect first-look` checks selected raw files against the saved local hashes, replays the export with Core, compares its head with the current case, and confirms the surviving duty. These local hashes are not signatures or an independently trusted checkpoint. An attacker controlling both result and evidence can replace both. Historical evidence is never fresh execution authority.

## Leave, repeat, clean up

A successful run has no background service. Stop reading whenever you wish; its local files remain. Run `inspect` later to reconstruct it. To repeat, choose another case name. To clean up, manually delete only the matching `runs/CASE` and `integrations/core-0.2-reference/cases/CASE` directories after retaining anything you want. Deletion removes that tutorial's evidence. There is no automatic repair, resend or cleanup of a partial failure.

[Developer example](DEVELOPER.md) · [Troubleshooting](TROUBLESHOOTING.md)
