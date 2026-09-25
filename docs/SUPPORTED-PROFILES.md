# Choose the history profile that fits your case

Continuity keeps permissions and unfinished work with the case when an agent changes. This release adds a larger local history profile. It does not make history unlimited or give the replacement additional powers.

| Profile | Intended use | Limit and behavior |
| --- | --- | --- |
| Existing managed file (`historyFile`) | Existing local tools and short evaluations | 96 bounded events; reserves room for admitted work and shared control records. Unchanged. |
| `continuity-segmented-local/1` (`historyBinding`) | A continuing local case shared by configured tools and cooperating services | Up to 1,024 events and 6 MiB of canonical event data, with lifecycle reservations and additional storage/input budgets. Explicit migration required for an existing case. |
| Original array and historical readers | Existing Core 0.2 examples and evaluation artifacts | Original 128/256 limits remain. Old readers refuse the new binding; they never show a suffix as the whole case. |
| Browser playground | Learning and hypothetical scenarios | Preserved browser profile; no live execution or access to your case files. |

Use the four packages together: Core `0.3.0-preview.10`, remote `0.3.0-preview.5`, gateway `0.3.0-preview.10`, evidence MCP `0.3.0-preview.11`. They share one Core. The source installer verifies their exact bytes; npm offers the same versions. Remote and gateway support Node 22.18 and 24. This tuple supports Node22.18 and24; Node26 results for earlier packages are historical. All profile claims concern trusted local POSIX storage; Windows durability is not established.

The new profile supports local ownership, signed administration, runtime and attempt records, native LangChain tools, cooperating MCP jobs and the evidence MCP tool. The gateway exposes E5 outcome observations; E6 review remains a separate Core API. The gateway operations CLI can inspect a selected binding. Its old snapshot/restore interface refuses this profile.

A cooperating destination is another durable store with its own limit: 256 attempts, 64 MiB of retained transfer files, 2,048 chunks and 2,048 manifests. Space in the case does not guarantee space there. There is no automatic pruning, history reset or downgrade. Large authority graphs can still exhaust a query/output budget and return INDETERMINATE. A storage or query limit is never permission.

## What this release protects

The fixed evidence example makes a service enforce access to a named local bundle. It preserves a restriction through restart, records a lost reply without blindly repeating the action, denies the retired worker and allows a separately authorized restoration. The original example leaves its investigation OPEN. An explicitly activated investigation can now be completed under its local rules, require review after new evidence, or remain CONTESTED after an authorized challenge. A report, replacement or restoration alone does not complete it. See [the investigation walkthrough](INVESTIGATION-WALKTHROUGH.md).

The protected-service restart example closes the service before reopening it. An abrupt death can leave its Unix socket path behind; startup deliberately refuses an existing path. Automatic stale-socket cleanup is not provided. An operator must establish that the original service is stopped before removing its stale socket and reopening the same durable state. Checkpoint crash tests cover the cooperating destination; they do not establish unattended recovery of the protected reader.

The host, service process, signer custody and filesystem remain trusted. A host administrator can bypass local controls or roll storage back; this release does not prevent that. Workers must not inherit the service's file access, sockets or credentials. Already delivered copies cannot be recalled, and a read authorized before closure may finish afterward. The Linux example separates accounts to demonstrate that boundary; it is not a general hostile-agent sandbox.

Start with [migration and recovery](MIGRATE-A-CASE.md), [integration details](HISTORY-INTEGRATION.md) or the [runnable evidence example](../examples/protected-evidence/README.md).
