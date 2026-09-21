# What did we just demonstrate?

You asked an investigator to collect a small evidence packet and review it. The investigator was replaced before the review was finished. **The unfinished work still needs an owner; the replacement still needs its own permission.** Those are separate questions.

The tutorial makes both visible. It uses synthetic data, public test signing keys and a local deterministic engine. No model, chain, wallet or service account is needed.

| Before replacement | After replacement |
| --- | --- |
| A has an explicit collection grant. | A is terminated in the protocol and its collection grant is explicitly revoked. |
| A's acknowledged intake creates an OPEN review duty. | B receives the performance assignment; the duty stays OPEN. |
| A's selected request is admitted. | The old signed request is refused before executor invocation. |
| Review authority is an explicit grant. | B may review only while its separate review grant remains valid; it cannot collect another packet. |

**Try changing one input:** the tutorial option `--successor-review deny` revokes B's review permission. B still has the duty. Continuity reports that conflict instead of inventing permission or declaring the work finished.

## Find the evidence

After following the [tutorial](TUTORIAL.md), these files are in your own package directory. `CASE` is `first-look` or `no-review-power`:

| Question | Evidence to inspect | Expected answer |
| --- | --- | --- |
| What happened to A's old signed request? | `integrations/core-0.2-reference/cases/CASE/stale-request.json` | `status: DENIED`, `executorInvoked: false`. |
| Who owes the work now? | `runs/CASE/summary.json`, or the reader's SURVIVES query for `a:CASE` | Duty OPEN; performer `b:CASE`. This is the recorded performance assignment, not proof of completed work. |
| Can B review? | `runs/CASE/successor-authority.json`, or the reader's check for B | ALLOW in first-look; DENY in no-review-power. |
| Can B collect another packet? | `runs/CASE/successor-collection.json` | DENY in both cases. |
| Are these the retained records? | `node tutorial/cli.mjs inspect CASE` | Replay ACCEPTED, matching saved head/hashes, continuing OPEN duty. Local hashes are not an external trust anchor. |

The [operator path](OPERATOR.md) gives copyable reader commands. WHY explains a decision; RESPONSIBLE reports protocol attribution; SURVIVES shows what remains. Read each response's head, evaluation time and scope alongside its answer.

## Five questions you should be able to answer

1. Does starting B automatically grant it A's permissions? **No.** B's grants are evaluated separately.
2. If B cannot review, does the duty disappear? **No.** It remains OPEN and assigned to B.
3. Did default mode actually copy evidence or complete the investigation? **No.** The executor outcome is simulated; the investigation remains unresolved. Optional packet mode copies only bundled synthetic logs and may write a note; that still does not discharge the duty.
4. Does a reader ALLOW mean a later tool call is safe to execute? **No.** It is an observation at a supplied head. A consequential action needs current admission, pre-use checks and an enforcing adapter.
5. Was A killed as an operating-system process? **No.** The tutorial uses protocol actors, not two isolated live agents. Refusal is demonstrated at the mediated operation, not across every possible host access route.

Signatures identify the declared fixture signer; they do not prove an allegation true. Recorded attribution is not a legal liability judgment. A locally valid earlier history can still be stale relative to the world. These limits are part of the result, not missing output.

[Return to the three paths](../README.md#choose-your-path) · [Security boundaries](../SECURITY.md)
