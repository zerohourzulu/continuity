# Try the protected MCP tool in a fresh application

This package supplies one local tool: collect a small, explicitly selected set of files into an evidence packet. Each new call checks the configured agent's current permission. A retired session cannot start another collection. Repeating an operation ID checks the original attempt instead of copying the files again.

It is a stdio MCP server, not a public network service or a general tool proxy. Your application chooses the agent, source files, destination and credentials before launching it. Those choices are not tool arguments.

## Install and try it

Use Node22.18+,24.x or26.x on macOS/Linux. Install the exact preview from npm:

```sh
mkdir my-continuity-demo
cd my-continuity-demo
npm init -y
npm install --ignore-scripts @ramex-labs/continuity-mcp@0.3.0-preview.6
npx --no-install continuity-evidence-setup ./case
npx --no-install continuity-evidence-demo ./case/gateway.json
```

Expected: a recorded packet on the first call and reconciliation on the repeated call. The example creates synthetic input and fresh disposable keys in `case/`. Keep that directory private. Setup refuses to overwrite an existing case; choose a new directory to start over.

To connect another MCP client, configure it to launch the installed `continuity-evidence` executable with `--config` and the absolute path of `case/gateway.json`. The executable is in your application's `node_modules/.bin/`. This server supports MCP2026-07-28 and legacy negotiation through the official2.0 SDK. The only tool, `continuity_collect_evidence`, takes `operationId` and the configured `resource` (`incident:42` in the demo). Use one stable application-owned ID for retries.

## Before using real files

The demo runs the client and server under your own user account. A client with the same filesystem permissions can bypass the tool and read files directly. For a real boundary, run the broker and agent under separate identities and protect the source, signing key, history, executable and output directories. See the [tested Linux example](https://github.com/zerohourzulu/continuity/tree/main/integrations/protected-evidence-mcp/linux).

The supported operation is a synchronous bounded local copy: at most8 files,64KiB each and256KiB total. This guarantee does not extend automatically to arbitrary remote tools. A packet proves which selected bytes were copied, not whether their contents are true. UNKNOWN means investigate or reconcile; it does not mean dispatch another attempt with a new ID.

Cedar/OpenFGA integration examples are separately installed from the source repository. They are not required dependencies of this package. The publisher scope is `@ramex-labs`. An official MCP Registry listing is separate from npm package availability.
