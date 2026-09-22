# A protected evidence tool over MCP

This server lets a client ask for one useful action: copy the operator-selected files into a recorded evidence packet. Continuity checks the agent's current permission and runtime before that copy. Retire the runtime while its server is still running, and the next new operation is refused.

The server uses the official TypeScript MCP server/client **2.0.0**. Tests exercise the **2026-07-28** protocol with a pinned client and the SDK's legacy negotiation. It is local stdio only. It is not an arbitrary remote-server proxy, an HTTP service or a sandbox by itself.

## Try it without a model account

From the distribution root, use Node22.18 or later supported Node24/26:

```sh
npm ci --prefix integrations/protected-evidence-mcp --ignore-scripts --no-audit --no-fund
node integrations/protected-evidence-mcp/setup.mjs /absolute/path/to/a-new-demo-directory
node integrations/protected-evidence-mcp/client.mjs /absolute/path/to/a-new-demo-directory/gateway.json
```

The setup creates one synthetic text file, fresh local credentials and a one-hour permission. Use an existing parent and a new target directory. The target contains a private signing key for this disposable example; keep it private and do not commit it. The example uses actual file copying, never production documents, a paid model or a chain.

The client lists `continuity_collect_evidence`, then prints **RECORDED**, **SUBMITTED**, and `packetVerified: true`. Running the same client command again prints **RECONCILIATION_ONLY**. The packet stays under the private demo directory's `packets` subdirectory. A packet acknowledgment establishes the selected copy, not the truth of its contents or completion of an investigation.

## Connect a host

Use the absolute path to your Node executable and the server:

```json
{
  "mcpServers": {
    "continuity-evidence": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/server.mjs", "--config", "/absolute/path/to/gateway.json"]
    }
  }
}
```

Adapt the outer configuration shape to your host. The documented client above is tested; this example is not a claim that every host supports the same MCP revision. No tokens, passwords or chain credentials belong in client settings.

The tool takes only `operationId` and the configured public `resource` alias. Its actor, session, signing key, role, tenure, source paths, selected hashes and output paths come from the operator's private launch configuration. A client cannot select another agent or tool server. Tool descriptions, protocol metadata, request IDs and connection IDs are not authority. The stable operation ID belongs to the application workflow: keep it across retries; do not invent a new one after an uncertain result.

## What protects the files

The engine records admission before invoking the fixed local packet adapter. Up to eight selected files, each at most64KiB and at most256KiB total, are copied synchronously while the cooperating history writer lock is held. The adapter checks paths, links, file identities, sizes and hashes, and retains an attempt record, packet manifest and typed acknowledgment. Source changes do not silently change the requested work.

History, configuration, keys, executable code and source/output folders must be outside the agent's writable control. Running this server and arbitrary agent code as the same unrestricted OS user is a trusted-host demonstration, not complete mediation. [The Linux deployment example](linux/README.md) establishes and tests separate identities for this resource boundary. Host administrators remain trusted.

Denial creates no attempt directory or packet. Original JSON is bounded and checked before SDK parsing:16KiB/frame, depth12,2048values, at most1024messages per server process, and a five-second incomplete-frame deadline. There is at most one active tool operation; overlapping calls receive BUSY. Restart with the same private configuration and original operation IDs when the bounded process or history limits require investigation. Restarting does not increase the history limit or grant fresh execution authority.

## Uncertain results and retirement

A durable admission is never automatically invoked again, even if the server exited before returning a result. Repeated calls reconcile the original attempt. If the copy completed but the runtime retired before Core recorded its acknowledgment, the packet can verify while the canonical result remains **OUTCOME_UNKNOWN**. Preserve both records. There is no new invocation, reversal of the copy, automatic receipt after retirement or claim that the uncertainty is resolved.

The guarantee covers this bounded synchronous local adapter. A remote tool that acts after dispatch would need its own recipient-side fencing; a transport success is not a business acknowledgment. Ordinary grant revocation is not a universal cancellation mechanism for previously admitted work.

Responses contain status and typed acknowledgment, without host paths, keys, source contents or the full private history. Full inspection remains a privileged application operation.

## Run the checks

```sh
node --test tests/core-0.3/evidence.test.mjs
node --test integrations/protected-evidence-mcp/tests/wire.test.mjs
```

The second command starts real server processes and calls them with the official SDK. It covers collection/reconciliation, the still-live retired server, malformed JSON, resource/path/identity substitution, revocation and an incorrect signing key. Dependency installation uses the checked-in lockfile and disables lifecycle scripts.

The strict wire-JSON guard is reused from the existing retained-evidence reader. The packet executor is reused from the reference integration, with import paths adapted for the compiled package. The original implementations and their validation history remain unchanged.

Sources: [official stdio serving](https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio), [official client](https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-client.html), [MCP security guidance](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices).

[Run an actual LangChain agent without a model account](../langchain-evidence/README.md).
