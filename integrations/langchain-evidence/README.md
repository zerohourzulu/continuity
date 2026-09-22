# Use the protected tool from a LangChain agent

This example uses the actual **LangChain1.5.12** agent loop, **@langchain/core1.2.12**, and the official MCP client2.0.0. Only the model response is scripted. You can see the complete tool path without a model account, payment or tracing service.

From the distribution root:

```sh
npm ci --prefix integrations/protected-evidence-mcp --ignore-scripts --no-audit --no-fund
npm ci --prefix integrations/langchain-evidence --ignore-scripts --no-audit --no-fund
node integrations/protected-evidence-mcp/setup.mjs /absolute/path/to/a-new-demo-directory
LANGCHAIN_TRACING_V2=false LANGSMITH_TRACING=false node integrations/langchain-evidence/example.mjs /absolute/path/to/a-new-demo-directory/gateway.json
```

Expect **RECORDED** and `packetVerified: true`. Repeat the command with the same case to see **RECONCILIATION_ONLY**. Keep the disposable directory private: it contains the example's fresh signing credential. The tool copies only the setup's synthetic file.

`tool.mjs` is the reusable recipe. Your application supplies the MCP client, a resource alias and a stable workflow `operationId`. The model receives only the resource field. It cannot turn its transport/tool-call ID into a new operation or replace the host's operation ID. Use a real model with the same `createAgent` tool when you choose to; your own model credentials and costs are outside this example.

Every tool invocation goes through the protected service. The LangChain wrapper cannot itself grant permission or execute the copy directly. A `wrapToolCall` middleware may call its handler more than once; the test exercises that actual framework path and confirms one canonical acknowledgment and one packet. A refused or unknown result needs interpretation, not a new ID to force another attempt.

The developer owns the application, tool list and MCP connection. This wrapper alone does not contain arbitrary untrusted code running with the service's OS privileges. [The separate-user Linux example](../protected-evidence-mcp/linux/README.md) addresses the demonstrated file boundary.

```sh
LANGCHAIN_TRACING_V2=false LANGSMITH_TRACING=false node --test integrations/langchain-evidence/tests/agent.test.mjs
```

Tests run the real agent loop for permitted work, middleware repetition, retired runtime refusal and attempted operation-ID substitution. A scripted model is not evidence about a real model's reliability or resistance to prompt injection.

[LangChain middleware documentation](https://docs.langchain.com/oss/javascript/langchain/middleware/custom) explains why handlers can be invoked zero, one or multiple times. Continuity's stable operation ID preserves the original attempt across that behavior.
