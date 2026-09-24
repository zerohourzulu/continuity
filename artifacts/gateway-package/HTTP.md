# A login belongs to one agent

A person may run several agents. Signing in as that person must not let one agent borrow another agent's jobs, permissions or saved results.

This preview adds an authenticated HTTP entrance to the local gateway. The operator assigns each login binding to one agent context. The caller cannot change that assignment in a tool argument, header, client name or MCP session identifier. Core still decides whether the selected agent may act now.

## Try it

Use Node 22.18 or Node 24. From this source package:

```sh
npm ci --ignore-scripts
npm run demo:http
npm test
```

The demo starts a temporary service on `127.0.0.1`, discovers its authorization metadata, creates a synthetic ticket, repeats the request and then revokes access. You should see `RESPONSE_RETAINED`, followed by `RECONCILIATION_ONLY`, followed by a refusal. The ticket is created once. Temporary files and processes are removed when the example finishes.

The example issuer makes short-lived test tokens in memory. It **does not implement an OAuth login, consent screen, token exchange or refresh flow**. Its metadata endpoints exist to test resource discovery with the official MCP SDK. Do not use it as an identity provider.

## Connect an application

Import `serveGatewayHttp` from `@ramex-labs/continuity-mcp-gateway/http`. Supply:

- A trusted issuer URL and its pinned public ES256 keys.
- A binding ID, expected user subject and OAuth client ID for each agent context.
- The same privileged gateway configuration used by the stdio example: local Core history, signing callback, approved jobs and approved upstream commands.
- A synchronous `isActive(identity)` callback that consults the application's current token and binding revocations. Only the boolean `true` permits access; exceptions, promises and other values refuse it.

```js
const service = await serveGatewayHttp({
  port: 8787,
  issuer: 'https://identity.example.com/',
  keys: [issuerPublicJwk],
  bindings: [{
    id: 'incident-analyst',
    subject: 'user-42',
    clientId: 'approved-desktop-client',
    gateway: analystGatewayOptions,
  }],
  isActive: identity => localAccessPolicy.isActive(identity),
});

console.log(service.resourceUrl);
// http://127.0.0.1:8787/mcp
// await service.close() when finished.
```

The sample variable names stand for application-owned objects, not library exports. `examples/http-demo.mjs` is the complete runnable example. The factory always listens on IPv4 loopback. There is no public-host setting or reverse-proxy mode in this edition.

## Token contract

This is a selected JWT access-token profile, not support for every issuer's token format. A production identity provider would need configuration and separate interoperability testing.

| Field | Required value |
| --- | --- |
| Protected header | `alg: ES256`, `typ: at+jwt`, a configured `kid`; no embedded key or key URL |
| `iss` | Exact configured issuer |
| `aud` | Exact `service.resourceUrl` string; multi-audience tokens are refused |
| `sub`, `client_id` | Exact user and client assigned to the selected binding |
| `continuity_binding` | Operator-approved binding ID, signed by the issuer |
| `scope` | Contains `mcp:access` |
| `iat`, `exp` | Integer seconds; issued already, unexpired, lifetime at most 300 seconds |
| `jti` | Nonempty token identifier for the host's revocation policy |
| `nbf`, if supplied | Integer seconds, not in the future |

The issuer must derive `continuity_binding` from its own approved assignment. It must not copy an unchecked value requested by the client. Two agents using the same user and OAuth client need distinct issuer-approved bindings. The binding is not inferred from an MCP client name or session.

Tokens belong in the `Authorization: Bearer …` header on every request. Protected resource metadata is available at `/.well-known/oauth-protected-resource/mcp`; a 401 challenge identifies that URL. Missing scope yields 403. The pinned public keys are loaded locally. Token-supplied URLs never trigger discovery, redirects or key downloads.

Choose a stable port if tokens must remain usable after service restart. Changing the resource URL changes the audience. Preserve revocations in the host's policy store across host restarts; the optional [local access policy](ACCESS-POLICY.md) supplies a deny-only file store. It does not supply an administrative network endpoint or provider logout integration. The trusted clock must not move backward while the server runs.

## What happens when access changes?

The service checks the signature and caller binding for each HTTP request. It checks expiry and current host revocations again after request ingestion, during tool preparation and signing, before the adapter dispatches, and before returning a response. Core separately checks current runtime, role and permission.

If access disappears before dispatch, the upstream is not called. If it disappears after dispatch, the service withholds the result from that login. That does **not** undo the external action. The stored attempt and any received response remain available through a newly valid, properly authorized login; repetition refers to the original business job.

The gateway cannot make revocation atomic with a remote service's eventual effect. An already submitted action may finish. The [cooperating profile](RECOVERY.md) adds signed status lookup, separately authorized cancellation and late observation. It still cannot undo an effect or make local revocation atomic with remote execution.

## Isolation and limits

Each HTTP binding in this edition uses a distinct Core domain, history file and private response directory. Duplicate contexts are refused. This deliberately avoids an implicit shared-case tenancy model. Cross-agent case collaboration needs a separately specified design.

Incoming HTTP credentials never become upstream environment variables, tool arguments or stored gateway records. Ordinary upstreams remain approved local stdio processes launched without a shell, with the existing limited environment. A binding explicitly configured with `kind: 'cooperative'` instead uses the pinned signed-service contract described in [RECOVERY.md](RECOVERY.md); its coordinator credentials belong to the host, not the incoming HTTP login. There is no HTTP upstream proxy, dynamic URL selection, credential forwarding or automatic upstream authorization flow in this edition.

Only MCP 2026-07-28 HTTP requests are selected. Responses are terminal JSON within Streamable HTTP; no progress stream, subscriptions, resources, prompts, legacy HTTP sessions or browser CORS support is advertised. A cooperating binding with `tasks: true` supports the [selected polling Tasks extension](TASKS.md). The existing stdio compatibility remains available separately.

The local service validates Host and Origin, refuses query-string tokens, compressed or oversized requests, duplicate JSON keys, deeply nested data and ambiguous authorization headers. Limits include 16 configured bindings, eight active HTTP requests, 32 connections, 32 KiB request bodies and the inherited one active tool call per binding. Core's 256-event history limit remains. These are evaluation bounds, not demonstrated production capacity.

The operator, issuer, clock, policy store and configured upstream executable code remain trusted. Separate operating-system identities and bypass prevention are still needed for hostile agents. Loopback access is not itself authentication, and a stolen valid bearer token can impersonate its assigned caller until expiry or revocation.

## Standards used

- [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization): resource metadata, resource-specific tokens and per-request authorization.
- [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http): official SDK request handling, Host/Origin protection and terminal JSON responses.
- [MCP security guidance](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices): separate credentials and protection against token passthrough.

The [real local Keycloak login test](IDENTITY.md) complements the synthetic resource-server tests. It does not establish a production OAuth deployment or arbitrary desktop/issuer compatibility.
