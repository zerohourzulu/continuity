# Put a few approved tools behind Continuity

An agent can lose its connection after a tool has already done the work. Starting again might create a second ticket. Giving the job to another agent should not give that replacement every permission the first one had.

This **local development preview** puts a Continuity check between an MCP client and operator-approved MCP tools. Your application chooses the worker, job and permissions. The agent supplies the tool arguments. The gateway remembers the original operation and will not send it again just because the caller retries or restarts.

For a service that supports signed status and cancellation, try the new [recovery story](RECOVERY.md) with `npm run demo:recovery`. For reconnectable long-running work, see [Tasks](TASKS.md) and `npm run demo:tasks`. Ordinary servers keep the original behavior described below.

It uses the published shared Core. It does not replace or change the existing `continuity-evidence` server.

## Try the story

Use Node22.18+ on the22 line, or Node24, and npm. From `packages/mcp-gateway` in the complete source download:

```sh
npm ci --ignore-scripts
npm run demo
```

No model account, API key, network service, VM or chain is needed to run the demo. npm installation needs access to its registry unless packages are already cached.

The demo starts a gateway and two separate, ordinary MCP servers. One reads a synthetic incident; the other records a local ticket. Neither server imports Continuity. You should see:

```text
Available: read_incident, create_incident_ticket, continuity_status, continuity_why
Read incident; created one ticket; repeating the job inspected the original response.
Status: RESPONSE_RETAINED
Retired worker is still connected but cannot use the job or inspect private results.
Pass: two ordinary upstream MCP servers, shared Core, one durable ticket and no automatic retry.
```

The demonstration creates disposable keys and files in a temporary private directory, then cleans them up. Tests also demonstrate a separately authorized replacement inspecting the original response without executing the job.

## Connect your MCP client

Create a private case in a new directory:

```sh
node examples/setup.mjs /absolute/path/to/new-case
```

Configure your host to start:

```text
/path/to/node /path/to/this/package/src/cli.mjs --config /absolute/path/to/new-case/gateway.json
```

Adapt that command to your host's MCP settings. The official SDK client and modern/legacy protocol paths are tested; a broad desktop-host compatibility matrix is still future work. The CLI serves stdio. For authenticated local HTTP, use the separate [HTTP guide](HTTP.md) and `npm run demo:http`.

The private configuration contains paths to keys and history. Keep the case out of Git and outside the agent's writable/readable folders. Running everything under your own unrestricted user is a demonstration, not isolation from malicious agent code.

## Give the agent jobs, not administrative controls

Your trusted application prepares `operations`. Each entry fixes:

- A tool name visible to the agent, such as `create_incident_ticket`.
- The approved upstream server and tool definition.
- A business key such as `incident:42:ticket`.
- The action, resource, role and tenure that Core must authorize.

An agent calls `create_incident_ticket` with `{ "title": "Investigate incident 42" }`. It does not choose a runtime, credential, URL, business key or operation ID. The gateway derives the operation ID from the domain and business key. Repeating the same job uses that original ID; changed arguments are refused. Renaming the tool alias does not make it new work.

Each job is **one durable operation**. To authorize another piece of work, the trusted application creates another business job. This intentionally differs from a general tool that the model can invoke indefinitely. Restarting does not reset the job. Reusing a domain with an old backup is not safe recovery.

For an embedded trusted application:

```js
import {createGateway} from '@ramex-labs/continuity-mcp-gateway';

const gateway = await createGateway({
  local,       // Shared Core runtime settings and application-owned signer
  storage,     // Existing private directory for attempts and responses
  upstreams,   // Approved absolute commands and arguments; no shell
  operations,  // Jobs described above; see examples/setup.mjs
});
try {
  const result = await gateway.run('create_incident_ticket', {
    title: 'Investigate incident 42',
  });
  console.log(result.status);
} finally {
  await gateway.close();
}
```

The installable package is `@ramex-labs/continuity-mcp-gateway@0.3.0-preview.8`. Install the exact release tarball or npm version; do not assume the `latest` tag selects this preview. It depends on exactly `@ramex-labs/continuity@0.3.0-preview.8` and contains no engine copy.

## What the results mean

| Result | What to do |
| --- | --- |
| `RESPONSE_RETAINED` | The gateway stored the upstream reply. Read its `isError` field; a reply is not proof of business success. |
| `RECONCILIATION_ONLY` | You received the original stored response. No new tool call was sent. |
| `OUTCOME_UNKNOWN` | An operation was admitted but its response is unavailable or unusable. Investigate; do not invent a new job ID to retry. |
| `DENIED` / `REFUSED` | Read the reason. Do not change identity or arguments to evade it. |
| `BUSY` | Another call is active in this gateway. Repeat the same job later. |

`continuity_status` takes `{ "job": "create_incident_ticket" }`. It reads a summary of the original attempt without calling the upstream server. It does not expose old response content or private history. `continuity_why` checks current permission; it is an explanation, not an execution token. Both require current runtime/role membership and a separate `inspect-operation` grant on the resource. That permission can be granted to a replacement without granting the original action.

If a reply arrives after retirement, it can be retained locally while Core's canonical outcome remains unknown. Those are distinct facts. The ordinary-server profile does not automatically record a late observation, close a duty or contact the upstream to investigate. The separate [cooperating profile](RECOVERY.md) adds explicit lookup, cancellation and observation calls.

## What operators must decide

Tool discovery is not approval. Configure the exact accepted input/output schemas and behavior annotations; the gateway checks them before new admissions. This preview requires an object input schema. The gateway closes its client-facing top-level arguments with `additionalProperties:false`, while continuing to pin the original upstream definition. Arguments must fit that schema. Tool names, descriptions and read-only annotations do not prove what a server will actually do.

Map the action/resource to the tool's actual scope. If a tool accepts arbitrary paths or accounts, a friendly resource label does not restrict them. Use schemas that constrain the arguments, a trusted wrapper or a downstream enforcement rule. This increment uses fixed resource mappings; quantitative budget projections and dynamic resource mappings are not supplied.

Upstream programs are trusted executable integrations. They run as subprocesses under the gateway OS user; this is not a sandbox. A real deployment must separate the agent from keys, history, upstream credentials and direct access routes. No incoming tool argument can select an executable or launch configuration. Upstream stdout is parsed with byte/depth/duplicate-key limits; stderr is discarded to avoid leaking secrets.

## Limits worth knowing

- Stdio or authenticated loopback HTTP; one bound runtime and one active operation per gateway, up to8 approved servers and32 jobs. The HTTP profile gives each configured caller/agent binding a distinct case; see [its isolation and limits](HTTP.md). No public service deployment is provided.
- Current MCP2026-07-28 upstreams; modern and legacy downstream clients tested through the official SDK. Legacy upstreams require an explicit `protocol: 'legacy'` setting; see [tested hosts and servers](COMPATIBILITY.md).
- One bounded tool-list page, at most64 tools. Text/JSON responses only,16KiB retained response limit. Unsupported links, binary content, input-required flows and tasks preserve uncertainty after admission.
- The protected subprocess transport allows64KiB frames, bounded JSON depth and1,024 inbound frames per process. Client-facing input retains16KiB/frame and1,024-message limits. Restart using the same configuration; it grants no new authority.
- Shared Core uses a managed 96-event profile with reserved lifecycle/control space; see OPERATIONS.md. Capacity is finite; restarting or deleting records is not a supported way to recover capacity. No history pruning or migration is introduced here.
- The gateway checks authority before forwarding; an ordinary upstream may finish after permission changes. Revocation cannot undo an already sent request. Stronger downstream fencing, cancellation and status lookup need a cooperating adapter.
- Private storage and clock are trusted. Fsync and response digests protect ordinary crash recovery and detect mismatch with recorded acknowledgments; they do not establish anti-rollback protection for restored backups. A locally retained unrecorded late reply is host-held evidence, not an independently authenticated provider attestation.
- Prompts, resources, subscriptions, sampling and elicitation are not exposed. Optional cooperating HTTP bindings support the [selected polling Tasks profile](TASKS.md). Selected [host compatibility](COMPATIBILITY.md) and a [real local identity-provider flow](IDENTITY.md) have been tested. Public HTTP deployment, broader client/issuer coverage, sustained operations and general destination integration remain later work. The selected cooperating recovery profile is described in [RECOVERY.md](RECOVERY.md).

## Reproduce the checks

```sh
npm test
```

The tests start real child processes and inspect their recorded calls. They cover refusal, identity injection, schema change, signing-time revocation, retirement, authorized replacement inspection, response loss, actual gateway termination, restart, corrupted/missing storage, unsupported wire data and duplicate prevention. HTTP tests also cover token verification, user/agent separation, revocation during signing and after an effect, restart and HTTP input boundaries. The source archive includes the tests; the installable package includes all four runnable demos. Cooperating-service tests add signed status recovery, separately admitted cancellation, late observations, lost replies, proof revocation and reserved-budget checks.

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

For safe startup, crash recovery, private snapshots and capacity diagnostics, read [OPERATIONS.md](OPERATIONS.md).

## Keep login revocations across restarts

The optional [local access policy](ACCESS-POLICY.md) stores operator-selected bindings and permanent local denials. A refreshed login cannot undo a binding revocation. It is separate from provider login and from Core permissions.

## Registry setup

The intended Registry identity is `io.github.zerohourzulu/continuity-gateway`, separate from the evidence server. A listing describes how to start this local program; it is not a hosted service. Before connecting, the operator must create a private case and provide its absolute configuration path with `--config`. Discovery does not grant permissions or create a case. See the [setup guide](REGISTRY.md).
