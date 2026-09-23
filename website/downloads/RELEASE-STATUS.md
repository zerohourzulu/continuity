# Core 0.3 — developer preview

[Release and downloads](https://github.com/zerohourzulu/continuity/releases/tag/v0.3.0-preview.8.2) · [Quickstart](https://github.com/zerohourzulu/continuity/blob/main/docs/CORE-0.3-QUICKSTART.md) · [Capacity guide](https://github.com/zerohourzulu/continuity/blob/main/docs/LOCAL-CAPACITY.md) · [Tests](https://github.com/zerohourzulu/continuity/blob/main/docs/CORE-0.3-TESTING.md).

The [browser playground](https://continuity.ramex.com/playground/) adds a story and workshop for trying hypothetical permission choices. It runs locally in the browser over the preserved Core 0.2.2 example; it does not execute live gateway jobs. [Scope and independent checks](https://github.com/zerohourzulu/continuity/blob/main/website/playground/README.md).

Use Core `@ramex-labs/continuity@0.3.0-preview.8`, remote `@ramex-labs/continuity-remote@0.3.0-preview.3`, evidence MCP `@ramex-labs/continuity-mcp@0.3.0-preview.9` and optional gateway `@ramex-labs/continuity-mcp-gateway@0.3.0-preview.8`. All wrappers use that exact shared Core and contain no engine copies.

New jobs reserve room for their first supported lifecycle records. Eight shared control slots support bounded revocation/replacement work. The managed profile has 96 bounded events; physical free space is not permission to admit another job. Existing incompatible histories remain readable but cannot silently continue managed execution. There is no pruning, automatic migration or administrator-rollback protection.

The gateway and evidence server use separate Registry identities. Registry discovery grants no permission and runs no service; private operator configuration is required. Check the exact listed version before installation. Public HTTP and broad desktop/OAuth compatibility remain outside this release.

Earlier source/npm releases, including the frozen Core0.2.2 evaluation, remain available. This is a finite local developer preview, not a claim of production availability or unlimited history.
