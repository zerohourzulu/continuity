> **Prepared continuation release:** To evaluate the new local archives in this source, follow [supported profiles](SUPPORTED-PROFILES.md) and [the exact installed checks](CONTINUATION.md#reproduce-the-evaluation). The public download/install commands below intentionally describe the preceding published release; they do not install this candidate.

# Put approved MCP tools behind Continuity

This version uses the [managed finite-capacity profile](LOCAL-CAPACITY.md).


Start here if you want to connect tools your application already uses. The gateway checks the worker's current permission before forwarding a fixed business job. If the connection drops, repeating the job inspects the original attempt instead of automatically sending it again.

## Try it in a few minutes

Use Node 22.18+ on the 22 line, or Node 24, and npm. From the complete source download:

```sh
cd packages/mcp-gateway
npm ci --ignore-scripts
npm run demo
```

Expect one local ticket, the original reply on repetition, and a refused retired worker. The demo uses synthetic data, temporary keys and two ordinary local MCP servers. No model subscription, account, API key, chain or paid service is needed. Installation downloads locked dependencies.

Try `npm run demo:http` for separate caller bindings, `npm run demo:recovery` for a cooperating service, and `npm run demo:tasks` for long-running work. To inspect or change the tests, run `npm test` in the same folder.

The gateway package is `@ramex-labs/continuity-mcp-gateway@0.3.0-preview.10`. Install the release tarball or use the exact npm version:

```sh
npm install --save-exact @ramex-labs/continuity-mcp-gateway@0.3.0-preview.10
node node_modules/@ramex-labs/continuity-mcp-gateway/examples/demo.mjs
```

For a real client, first [create a private case and configure the gateway](../packages/mcp-gateway/README.md#connect-your-mcp-client). The executable requires `--config`; invoking it without configuration intentionally refuses startup. Do not paste keys into client tool arguments.

Need settings for a desktop client? Use the [local client-configuration helper](MCP-CLIENT-SETUP.md). It prints the correct JSON shape and full paths without editing your settings.

## Which MCP package do I want?

| Need | Package | Scope |
| --- | --- | --- |
| A small evidence-collection example | [continuity-mcp](MCP-PACKAGE.md) | One configured evidence tool; existing Registry entry `continuity-evidence`. |
| Several approved tools and durable jobs | [continuity-mcp-gateway](../packages/mcp-gateway/README.md) | Operator-defined jobs, stdio or authenticated loopback HTTP, original-attempt inspection and selected cooperating recovery. |

Both use the same published Core. Installing the gateway does not replace the evidence server or its Registry listing. The gateway has its own Registry identity, `io.github.zerohourzulu/continuity-gateway`. See the [client setup guide](../packages/mcp-gateway/REGISTRY.md); operators must create a private case before connecting. Check the Registry for listing availability.

## Know the boundary

Ordinary upstream tools may finish after permission changes. The gateway cannot undo an already sent request, make an arbitrary provider transactional, or prove business success from a returned reply. Stronger status, cancellation and fencing require a cooperating service. The host, clock, upstream executables and private storage remain trusted. Separate agents from keys and direct bypass routes; this package is not an agent sandbox.

This release is for local development: fixed jobs, the managed96-event history profile with lifecycle and control reservations, no automatic history migration or safe rollback of backups. Internet-facing HTTP is deferred. Resources, prompts, sampling, elicitation and arbitrary protocol extensions are not offered.

Read the [tested client/server combinations](../packages/mcp-gateway/COMPATIBILITY.md), [HTTP contract](../packages/mcp-gateway/HTTP.md), [operating guide](../packages/mcp-gateway/OPERATIONS.md), [real login experiment and its limits](../packages/mcp-gateway/IDENTITY.md), and [persistent operator revocations](../packages/mcp-gateway/ACCESS-POLICY.md). The real Keycloak experiment is a selected fixed-audience profile, not complete modern MCP OAuth interoperability. Inspector and mcpc were tested with configured credentials, not interactive login.
