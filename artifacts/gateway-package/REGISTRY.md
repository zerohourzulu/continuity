# Connect through an MCP directory

This is a local program. Your MCP client starts it on your machine; the directory does not host it or hold your keys. The proposed entry is `io.github.zerohourzulu/continuity-gateway`. The separate `continuity-evidence` entry continues to provide its single evidence tool.

Use Node22.18+ on the22 line or Node24. Install the exact package and create a synthetic case to learn the setup:

```sh
npm install --save-exact @ramex-labs/continuity-mcp-gateway@0.3.0-preview.8
node node_modules/@ramex-labs/continuity-mcp-gateway/examples/setup.mjs /absolute/path/to/new-case
```

The setup creates disposable local keys and synthetic tools. It is an example, not a production enrollment service. Keep the resulting directory private and outside the agent's direct access. The setup refuses to overwrite an existing directory.

In a client that supports this Registry entry, supply the absolute path to `new-case/gateway.json` when asked for `gateway_config`. The equivalent launch is:

```sh
npx --yes @ramex-labs/continuity-mcp-gateway@0.3.0-preview.8 --config /absolute/path/to/new-case/gateway.json
```

Clients should pass arguments as an array without a shell; a path containing spaces is one argument. The gateway refuses missing or unsuitable configuration. It never auto-creates authority just because a client discovered it. Keep Node and npx available to the client process; GUI applications may have a different PATH from your terminal.

Only configure trusted upstream executables and explicitly approved jobs. This is not a sandbox. Ordinary tools may complete after a permission change; retrying the original job retrieves its attempt instead of sending another request. [Full setup and limits](README.md), [operating guide](OPERATIONS.md), [tested clients](COMPATIBILITY.md).

The listing uses stdio. It advertises no remote URL or public HTTP service. Directory/client support varies; a schema-valid listing does not prove compatibility with every desktop application.
