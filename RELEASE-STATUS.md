# Current edition — Core 0.3 developer preview

[Release and downloads](https://github.com/zerohourzulu/continuity/releases/tag/v0.3.0-preview.7.8) · [Quickstart](docs/CORE-0.3-QUICKSTART.md) · [Shared packages](docs/SHARED-CORE.md) · [Remote tutorial](packages/remote-tools/README.md) · [Tests](docs/CORE-0.3-TESTING.md).

Use Core `@ramex-labs/continuity@0.3.0-preview.7`, remote `@ramex-labs/continuity-remote@0.3.0-preview.2` and MCP `@ramex-labs/continuity-mcp@0.3.0-preview.8`. Both integrations depend on exactly that Core and contain no engine copies. The evidence server is `io.github.zerohourzulu/continuity-evidence` in the official MCP Registry.

Existing histories retain their rules. New histories can explicitly select attempt tracking or outcome review; the original local-owner default is unchanged. The remote connector provides native LangChain tools and runnable cooperating-service examples. Its local HTTP client opens a fresh connection for each signed request; a failed request is never automatically resent.

Independent installed examples, shared dependency checks, strict public types and actual MCP/npx checks pass on Mac/Linux ARM64 Node22/24. The public Actions workflow verifies Mac/Linux Node22/24/26; remote-specific tests run on Node22/24. See the run for the exact source commit before relying on its status. These checks are not production certification or an adoption claim.

This remains a cooperating loopback evaluation profile with a trusted host and clock. It does not contain hostile agents, make arbitrary providers transactional, detect restored valid destination backups, or establish an external outcome by itself. A closed review may leave a duty open and the external outcome unproven. Full-history replay latency and transport failures must be included in an integration's deadline and recovery design.

Source preview.7.5 corrects installation references and local HTTP connection handling found by clean hosted checks. Earlier source editions and their failure records remain available. Core/MCP npm bytes are unchanged; remote preview.2 replaces preview.1 for the coordinated combination. Original Core0.2.2 releases remain preserved.

## New optional gateway

Source preview.7.8 adds a client-configuration helper for the [local MCP gateway](docs/MCP-GATEWAY.md), npm preview.7. The original three packages and evidence listing stay unchanged. Consult the exact release and npm version for distribution availability. Public HTTP remains deferred. Gateway discovery uses its separate continuity-gateway identity; private operator configuration is required.
