# One retained history, one observation

This experimental reader wraps the unchanged Core0.2.2 engine. It answers questions about supplied records; it does not start agents, sign, write histories or authorize real effects. An observed `ALLOW` is not an execution capability. Consequential work still needs current admission, pre-use checks and an enforcing adapter. Duty does not grant power.

Use Node24 and the locked dependency setup in [Testing](TESTING.md). From this package directory:

```sh
node bin/continuity.mjs status --file tests/fixtures/handover-history.jsonl
node bin/continuity.mjs check --file tests/fixtures/handover-history.jsonl --actor b:first-look --action record-review-progress --resource obligation:first-look --json
node bin/continuity.mjs survives --file tests/fixtures/handover-history.jsonl --agent a:first-look --json
```

The first command describes both declared agents. The second observes `ALLOW` for B's separately granted review action. The third shows A's OPEN duty assigned to B. Repeat the second with `a:first-look`: it returns `DENY` (exit3). These committed synthetic fixtures are an inspection exercise; the [tutorial](TUTORIAL.md) creates a new local execution story.

## Supported interface

The commands are `verify`, `status`, `check`, `why`, `responsible`, `survives` and `handover_report`. `--help` lists arguments. The CLI requires an explicit regular file; it does not guess a case, scan directories or accept an arbitrary research command. JSON output is always available; without `--json` it is indented for reading.

| Operation | Question / output |
| --- | --- |
| verify | Can the captured sequence replay? Includes replay status, event count, head and evaluation time. Rejected replay has a null head; no question uses rejected state. |
| status / handover_report | One captured sequence and one time, plus each declared agent's complete Core SURVIVES projection in evidence mode. |
| check | ALLOW, DENY or INDETERMINATE for actor/action/resource at that head. Evidence mode includes the scoped engine result. |
| why | Core WHY envelope, including epistemic status, scope, assumptions and the authorization if established. |
| responsible | Core protocol attributions, not a legal liability finding. |
| survives | Core lifecycle, continuing duties, assignments, role/authority consequences and unresolved outcomes. |

All answers identify `source`, `head`, `evaluationTime`, `configHash`, `disclosure`, `replayStatus`, `eventCount`, `assurance` and `scopeNote`. The CLI source label is `local-file`; host paths are not returned. MCP configuration has a SHA256 byte identity; local CLI has null configHash. The declared domain/policy and root-recognition rule come from the captured history and unchanged Core. Their inclusion does not authenticate real-world roots.

Default evaluation time is the **observed canonical head time**, never the wall clock. `--at`/`at` must be a canonical nonnegative decimal string no greater than9007199254740991. It changes the evaluation parameter; it does not select/truncate a history prefix or establish freshness. A Core scope labeled `CURRENT` means evaluation and observation use the same supplied head, not that the world has supplied its latest history. No signature/finality/availability upgrade is implied.

For check/why/responsible, `amount` is an optional canonical decimal string from0 to2^256−1 inclusive. Omission stays omitted; `"0"` is present zero. JSON numbers, signs, whitespace, leading zeros, exponents and larger amounts are refused. Output BigInts use the exact single-key object `{"$continuity.bigint":"2500"}`. A malformed or incomplete answer is not ALLOW. Query envelopes can be non-established even when the transport succeeds.

CLI exit0 means a readable observation;3 means direct `check` returned DENY;4 means direct INDETERMINATE, rejected replay or a non-established individual query;2 means input/source/worker failure. For WHY, inspect `result.answer.authorization.decision`; a successfully explained DENY is not a CLI transport failure. Composite results retain each query's epistemic status: inspect each member, not just the top-level replay status. No exit code is an execution permission.

## Files and disclosure

Inputs are either canonical `continuity-portable-file-store/0.2` JSONL (complete newline-terminated records with checked hash chain) or a strict JSON array of canonical events. Array BigInts use the single-key marker above. JSON duplicate decoded keys, malformed UTF8, excessive nesting/nodes and nonfinite numbers are refused. Core validates event schemas, ordering and semantics. There is no lenient repair/diagnose fallback. Valid suffix removal can still yield a valid earlier history: neither format supplies global freshness.

The MCP server uses [admin configuration](../integrations/retained-evidence-mcp/README.md) and named sources. Every connected stdio client receives the same configured access. It is not a multi-user authentication service.

* `summary`: verify/status expose consistency, count, head and time; check additionally exposes the request's decision/code. WHY, RESPONSIBLE, SURVIVES and handover_report are refused. No agent list, grant path or raw evidence is returned.
* `evidence`: permits the supported Core evidence projections for that source and its allowed operations. This can disclose identifiers, relationships and external evidence references. It is not field-level filtering. Publish only a history whose supported projections the connected client may read.

Both modes disclose history-derived information (including hashes/counts and, when enabled, decisions). Summary is not a secrecy/noninterference guarantee. Do not configure a sensitive mixed-disclosure history as evidence and expect individual records to be hidden. Coarser operations/source selection is deliberate; proof-based selective disclosure is future optional work.

## Bounds and trust boundary

| Resource | Bound |
| --- | --- |
| MCP request |16KiB/frame, nesting16,2048JSON values; no batch requests |
| Startup configuration |64KiB, depth8,2048values,32sources |
| History |2MiB,256events, JSON depth64/100000values per array or record; Core's own stricter limits also apply |
| Composite |32declared agents maximum |
| Result |256KiB inner JSON; escaped MCP envelope bounded separately |
| Execution |One child/request,15seconds hard timeout,256MiB Node old-space cap (not a total OS memory bound) |
| Framing/output |15seconds from the first pending frame fragment (incoming bytes do not restart it), or15seconds for a stalled output write; complete idle sessions remain open |

The server processes one request at a time with input/output backpressure, so callers cannot build an unbounded queued worker set. It has no listener, signer, mutation API or network operation. Child isolation here bounds runtime; it is **not an OS privilege sandbox**. Its process runs with the launching user's filesystem rights.

Configured relative paths cannot contain traversal and must resolve inside the configured root without symlink aliases. Final symlinks, devices, FIFOs and multiply linked files are refused. Bytes are read once through an opened descriptor, size/metadata checked, then decoded and captured. Atomic replacement after capture cannot mix a report; concurrent in-place changes may be refused. Configuration is immutable for the server lifetime; restart to change policy.

Local administrators, source parent directories, interpreter/dependencies and configuration are trusted. Realpath checks are not race-proof confinement against an attacker able to replace ancestor directories or manipulate the host. The reader cannot establish truth, global latest state, hostile-host containment or persistent availability. Error responses use codes, not private paths, exception stacks or hidden record values. A deliberately configured protocol identifier is evidence, not a host-path sanitization target.

## Verification and recovery

`node --test tests/reader.test.mjs tests/reader-mcp.test.mjs tests/reader-timeouts.test.mjs` runs actual CLI/stdio calls, replacement during a composite, quantity boundaries, configuration/disclosure denials, malformed/oversized data and worker termination. The timeout tests use the real15second bounds for trickled input and an unread output pipe. The [full command](TESTING.md) also runs original Core checks. These are local development checks, not a production-security certificate or proof that every MCP host is compatible.

Common errors: `SOURCE_DENIED` means the name is not configured; `OPERATION_DENIED` means it is not enabled; `DISCLOSURE_DENIED` means summary mode does not reveal that evidence. `SOURCE_PATH_DENIED`/`SOURCE_UNAVAILABLE` require the operator to inspect the configured regular-file location. `SOURCE_CHANGED` means retry only after the writer settles. `HISTORY_INTEGRITY`/`HISTORY_REJECTED` mean preserve and inspect the original evidence; do not rewrite it merely to make a check pass. `READER_TIMEOUT` and output limits leave the observation unavailable, not allowed.
