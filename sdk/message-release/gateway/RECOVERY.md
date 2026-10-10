# Find out what happened without doing it twice

Suppose an agent creates a ticket, then loses its connection. Was the ticket created? A second attempt might create a duplicate. A cooperating service can answer about the original attempt, and sometimes stop work that has not happened yet.

This preview connects that service contract to MCP jobs. It uses the published Continuity remote package and the same shared Core as the ordinary gateway. It does not give an ordinary MCP server capabilities it does not have.

## Try a lost reply

From the extracted source, with Node 22.18+ on the 22 line or Node 24:

```sh
npm ci --ignore-scripts
npm run demo:recovery
```

The example runs an authenticated MCP HTTP client, gateway and synthetic ticket service on loopback. A test relay deliberately loses the reply after the ticket is created. The gateway then finds the original result, requests cancellation, learns that cancellation is too late, and records the result separately. There is one ticket and one commit request. No account, model subscription or external service is needed. Temporary keys and files are removed afterward.

`examples/recovery-demo.mjs` is the complete runnable example; `examples/cooperative-setup.mjs` supplies its case. The relay is a failure-injection fixture, not a production proxy.

## Choose the cooperating profile

Trusted application code imports `createCooperativeGateway` from `@ramex-labs/continuity-mcp-gateway/cooperative`. Supply local Core runtime settings, a private storage directory, an approved tool registry, the pinned destination credentials and fixed operations. The destination contract is the one implemented by `@ramex-labs/continuity-remote@0.3.0-preview.2`.

For authenticated HTTP, set `kind: 'cooperative'` on the binding and put those options in `gateway`. The [HTTP token and caller rules](HTTP.md) still apply. The agent does not select the profile, destination, keys, operation ID or business key. The ordinary stdio CLI remains an ordinary-server profile.

Registry fields have closed schemas. Amounts travel in MCP arguments as canonical decimal strings, such as `"7"`; the trusted registry converts them to exact integers and projects them into Core's budget checks. Leading zeros, numeric amount values and extra fields are refused. Action/resource mappings remain operator decisions.

## Four different operations

All methods require a current runtime and role tenure. Returning job information also requires `inspect-operation` on the job's resource.

| MCP call | Additional authority | What it does |
| --- | --- | --- |
| Configured job, such as `create_incident_ticket` | Original action on the configured resource | Admits new work once. A repeated admitted job only looks up its original attempt. Changed arguments are refused. |
| `continuity_recover` | Inspection permission | Asks the pinned service for a signed report about the original attempt. It never prepares or commits that work again. |
| `continuity_cancel` | `cancel-operation` on the original operation ID | Admits a separate cancellation job in Core, then sends cancellation once. Repeating it reads the saved cancellation result; it never sends cancellation again. |
| `continuity_observe` | `OBSERVE_OUTCOME` on the original operation ID | Records a retained, authenticated APPLIED result in Core. It makes no destination request. |

The three recovery calls take only `{ "job": "create_incident_ticket" }`. Embedded applications use `gateway.recover(name)`, `gateway.cancel(name)` and `gateway.observe(name)`.

`continuity_status` reads the latest locally saved report without contacting the service. `continuity_why` explains current general action permission; it does not predict whether the original admitted path can continue. An old admitted job cannot borrow a new grant when its original grant is revoked. Its reserved allowance is not charged a second time merely to continue it.

## Read the answer carefully

- **APPLIED:** the pinned service reports that its recorded effect happened. This is an authenticated service assertion, not independent proof of an arbitrary real-world outcome.
- **PENDING:** the service has prepared the original attempt. This increment can inspect or cancel it, but provides no command to resume its commit.
- **CANCELLED:** the service reports that pending work was stopped.
- **TOO_LATE:** the effect was already recorded. Cancellation does not undo it.
- **UNKNOWN:** the answer is unavailable or the service has no matching report. It is not proof that nothing happened.

If the cancellation reply is lost, another cancellation call stays unknown and sends nothing. An explicit recovery lookup may establish that the original job is CANCELLED; it does not manufacture the missing cancellation acknowledgment in Core.

A late observation preserves who performed the original work and who later recorded the result. A replacement needs explicit inspection and observation grants. It receives neither execution nor cancellation powers automatically. Recording the late result does not rewrite the original execution outcome, consume its original admission, or discharge a duty. A separate duty/review workflow remains necessary.

## What this preview does and does not establish

The gateway checks the original admitted proof before checkpoint, prepare and commit, and checks caller access during signing and before disclosure. The cooperating service fences work against its acknowledged history checkpoint. An already sent request can still finish after local permission changes; local revocation and a remote effect are not one atomic transaction.

Received signed results are retained before the final disclosure check. Signatures, original request bindings and destination sequence are checked again when reading them. Repeated read-only status reports may have fresh signatures at the same service sequence. Equivalent state is accepted; conflicting or older state is refused. Stored reports are historical observations, not a promise that the destination is currently reachable or unchanged.

This edition selects Core's E5 local execution profile, one active call per context and up to 32 fixed jobs. It retains at most 16 distinct status reports and 16 cancellation reports per job; the private directory is bounded to 4,096 entries. Core history is limited to 256 events; the selected late-observation recorder has a lower 128-event limit. Exhausted capacity refuses further work. No pruning or migration is supplied.

The reference destination atomically records synthetic effects with its deduplication records. It does not demonstrate atomicity with an arbitrary payment, cloud API or physical action. Its endpoint is pinned IPv4 loopback HTTP with signed requests/replies. Public TLS deployment, remote MCP server proxying, real OAuth login, named desktop hosts, progress notifications and subscriptions remain separate work. The optional [polling Tasks profile](TASKS.md) supplies reconnectable handles and stage status without replaying interrupted effects.

The host filesystem, clock, key custody and revocation store remain trusted. Restoring old backups is not anti-rollback-safe recovery. Prevent direct access to the destination and keys when deploying around hostile agents. This is a local development package, not a production security certification.
