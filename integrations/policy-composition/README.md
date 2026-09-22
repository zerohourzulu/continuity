# Use Cedar or OpenFGA with Continuity

Your application may already use Cedar or OpenFGA to decide who can access a document. Keep that policy. This example requires **both** that policy and Continuity to allow a collection. Continuity still handles the agent's current session, role, operation history and retirement. Neither system grants the other's missing permission.

These are optional integrations. The normal local example needs neither service.

## Try Cedar first

From the repository root, install the pinned example dependencies. Install scripts stay disabled:

```sh
npm ci --prefix integrations/protected-evidence-mcp --ignore-scripts
npm ci --prefix integrations/policy-composition --ignore-scripts
node integrations/protected-evidence-mcp/setup.mjs /tmp/my-policy-case
node integrations/policy-composition/cedar-gateway.mjs \
  /tmp/my-policy-case/gateway.json \
  integrations/policy-composition/collect.cedar \
  /tmp/my-policy-case/policy-audit.jsonl
```

The last command starts a stdio MCP server; it waits for an MCP client, rather than printing a prompt. Configure your client to launch that command with those three application-owned paths. The only tool is `continuity_collect_evidence`; its arguments are `operationId` and `resource`. For this fresh synthetic case, use `incident:42`. Keep the same operation ID when retrying. Use a new setup directory if you repeat setup.

For an automatic demonstration, with no model account:

```sh
node --test integrations/policy-composition/tests/wire-policy.test.mjs
```

That starts real MCP clients and fresh servers, checks both permit and denial, and removes its temporary synthetic cases. The rest of the policy tests use the source API and need the normal repository dependencies (`node tools/setup.mjs`).

[Cedar 4.13.0](https://github.com/cedar-policy/cedar) runs locally in WebAssembly. Its identity includes the exact policy text's SHA-256 and engine version. The adapter maps the Core actor, action and resource directly into Cedar entities. Session, role, tenure, operation and terms come from the trusted broker; the agent supplies no policy context. Any syntax or evaluation error prevents a new effect, including Cedar's [allow-with-skipped-error case](https://docs.cedarpolicy.com/auth/authorization.html).

## Try OpenFGA

The supplied `model.json` grants a `collector` relationship between an agent and a resource. `openfga.mjs` is the trusted application's adapter. It uses the same `additionalPolicy` interface as Cedar. Agent/resource IDs are encoded with base64url before mapping to OpenFGA, so colons in `incident:42` cannot change the tuple syntax. Use the exported `fgaObject(type, id)` when writing relationships.

Use the official **OpenFGA 1.21.0** binary for your platform from [its release](https://github.com/openfga/openfga/releases/tag/v1.21.0). Verify the downloaded archive against the published `checksums.txt`, extract it, then run:

```sh
OPENFGA_BINARY=/absolute/path/to/openfga \
  node integrations/policy-composition/run-openfga-tests.mjs
```

The runner starts its own loopback-only, in-memory service with the playground and metrics disabled. It creates and deletes fresh test stores, then stops only that process. Do not point these tests at a production service. They test actual relationship removal, model pinning, unavailable service, Core revocation and retirement during a real response. They do not substitute a mock server.

The adapter pins the endpoint, store and immutable model ID and checks the returned store/model headers. It requests `HIGHER_CONSISTENCY`, uses no contextual tuples, disables retries and redirects, and bounds response size/time. No result means no new effect. This example has no production credential provisioning or service management; an authenticated production deployment needs its own reviewed configuration.

**A pinned model does not pin relationships.** A relationship may change after the check and before the effect. Higher consistency does not make OpenFGA and Continuity one atomic transaction. This is a pre-dispatch policy check, with an explicit gap between systems. Use it only where that contract is sufficient. [OpenFGA model guidance](https://openfga.dev/docs/getting-started/immutable-models).

## What is kept, and what is refused

The broker binds the additional policy identity into the stable operation declaration. Changing that identity cannot reinterpret an old operation ID. Once an operation has been admitted, a retry only reconciles that original attempt; it never dispatches it again, even if a policy service is now unavailable.

Before admission, the broker records the exact policy request, request hash, selected policy identity, bounded diagnostic strings and decision in a private application journal. The supplied journal fsyncs its file and parent directory and stops at 1 MiB. Use one trusted writer and a private parent directory. An unavailable/full journal prevents new effects; arrange archival and a reviewed restart rather than deleting evidence during operation. It is an application audit file, not an extra canonical Core event or a cryptographic attestation from the external policy engine.

Evaluation has a five-second deadline and OpenFGA requests have a four-second transport timeout. The broker rechecks the Core history and clock after policy evaluation and audit recording, so an old answer cannot revive an expired or retired session. A timeout cannot preempt blocking code inside a trusted callback; untrusted evaluators require process isolation.

MCP replies disclose only the policy refusal, not journal paths, policy text, keys or engine diagnostics. Unfinished obligations remain Core records; they are not translated into Cedar rules or OpenFGA relationships.
