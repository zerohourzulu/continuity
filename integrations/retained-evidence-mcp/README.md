# Retained-evidence MCP reader

This local stdio reader exposes named, operator-permitted histories. Its answers are observations, never execution capabilities. It has no HTTP listener, signer or write tool. Read [the interface and limits](../../docs/READER.md) before exposing a history.

From the package root after locked setup:

```sh
node integrations/retained-evidence-mcp/src/server.mjs --config integrations/retained-evidence-mcp/example-config.json
```

The committed configuration exposes only the synthetic handover fixture as `demo`. `root` is relative to the configuration file; each source `file` is relative to that root. Configuration is read once at startup; restart to change it. `operations` is an explicit allowlist. `disclosure` is either `summary` or `evidence`, with the limits described in the reader contract. Requests cannot select host paths, replace configuration or escalate disclosure. Every client attached to this process receives the same access.

A typical local host configuration uses its executable and argument fields:

```json
{
  "command": "node",
  "args": [
    "/ABSOLUTE/PACKAGE/integrations/retained-evidence-mcp/src/server.mjs",
    "--config",
    "/ABSOLUTE/PACKAGE/integrations/retained-evidence-mcp/example-config.json"
  ]
}
```

Replace `/ABSOLUTE/PACKAGE` with this installation and ensure `node` is Node22.18+(22.x),24.x or26.x (or use its absolute executable path). These fields are illustrative; individual hosts store them differently. No particular host integration is claimed tested here.

## Try actual requests without a host

The reader implements a bounded subset of MCP2025-06-18: [stdio framing](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports), [initialization](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle), ping, tools/list and [tools/call](https://modelcontextprotocol.io/specification/2025-06-18/server/tools). Send one JSON object per line. For example:

```sh
node integrations/retained-evidence-mcp/src/server.mjs --config integrations/retained-evidence-mcp/example-config.json <<'JSONRPC'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"manual-inspection","version":"1"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"continuity_check","arguments":{"source":"demo","actor":"b:first-look","action":"record-review-progress","resource":"obligation:first-look"}}}
JSONRPC
```

Expect an initialize response followed by a tool result whose text content is a JSON observation containing `decision: "ALLOW"`, `head.position:25`, `evaluationTime:25` and the explicit non-capability note. There is no response to the initialized notification. The source is an existing synthetic retained history; this request executes no external action.

`continuity_list_histories` returns names/disclosure/operation choices. The remaining tools are `continuity_verify`, `continuity_status`, `continuity_check`, `continuity_why`, `continuity_responsible`, `continuity_survives` and `continuity_handover_report`. Use tools/list to obtain the actual schemas. `at` and `amount` accept decimal strings, not JSON numbers.

Tool domain failures return `isError:true` with a coded text result. Invalid protocol parameters/methods and malformed frames produce JSON-RPC errors. `DENY` is a successfully observed decision, not a transport error. Incomplete/oversized frames and stalled output terminate the session; run a new process after correcting input. No subscription, streaming progress, resource/prompt endpoints, task execution or multi-client server is supplied. A running worker is bounded by15seconds; cancellation notifications do not interrupt it early. This is not a general MCP SDK.

The reader deliberately omits the contributed experimental commitment/registry/witness commands. Those remain optional research outside the supported interface. Test with `node --test tests/reader-mcp.test.mjs` from the package root; this exercises real stdin/stdout processes.

For a tutorial-created case, `node tools/case.mjs mcp-config CASE --disclosure summary` generates the actual reader configuration and local host command/args under runs/CASE. Summary allowlists only verify/status/check. Choose evidence explicitly for richer queries. Existing altered configurations are refused rather than overwritten; local absolute paths are not public artifacts.
