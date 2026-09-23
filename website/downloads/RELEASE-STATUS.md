# Current edition — Core 0.3 preview.7

One shared Core now supplies the rules used by both the MCP evidence tool and the cooperating remote-tools integration. The remote package includes native LangChain tools, typed budgets, separate compensation and recovery without automatic redelivery. Explicit history constructors enable attempt records and evidence review; the ordinary Core constructor keeps its existing default. Existing histories are not upgraded automatically.

[Release and downloads](https://github.com/zerohourzulu/continuity/releases/tag/v0.3.0-preview.7.1) · [Quickstart](https://github.com/zerohourzulu/continuity/blob/main/docs/CORE-0.3-QUICKSTART.md) · [Shared packages](https://github.com/zerohourzulu/continuity/blob/main/docs/SHARED-CORE.md) · [Remote tutorial](https://github.com/zerohourzulu/continuity/blob/main/packages/remote-tools/README.md) · [Tests](https://github.com/zerohourzulu/continuity/blob/main/docs/CORE-0.3-TESTING.md).

Use Core `@ramex-labs/continuity@0.3.0-preview.7`, remote `@ramex-labs/continuity-remote@0.3.0-preview.1` and MCP `@ramex-labs/continuity-mcp@0.3.0-preview.8`. The integrations depend on that exact Core version and contain no engine copies. The evidence server remains `io.github.zerohourzulu/continuity-evidence` in the official MCP Registry.

The remote example uses a cooperating loopback service and synthetic effects. Local revocation becomes a destination fence when the destination acknowledges its newer checkpoint. Restoring an older valid destination snapshot is not detected, evidence review does not discharge a duty, and arbitrary outside APIs do not inherit these guarantees. This remains a developer preview, not a production assurance claim.

The coordinated packages are checked on macOS/Linux ARM64 with Node22.18 and Node24. Earlier public releases, frozen0.2 SDK, Apache2.0 licensing, notices and contribution process remain available. The website's recorded case and interactive playground retain their separate scopes.

Source edition preview.7.1 corrects the pnpm lockfile for the existing example dependencies. npm package versions and bytes remain unchanged. The initial source edition failed clean setup in hosted CI; its evidence and download remain available.
