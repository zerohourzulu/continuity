# Core 0.3 — managed finite capacity

[Release and downloads](https://github.com/zerohourzulu/continuity/releases/tag/v0.3.0-preview.8.1) · [Quickstart](docs/CORE-0.3-QUICKSTART.md) · [Capacity guide](docs/LOCAL-CAPACITY.md) · [Tests](docs/CORE-0.3-TESTING.md).

Use Core `@ramex-labs/continuity@0.3.0-preview.8`, remote `@ramex-labs/continuity-remote@0.3.0-preview.3`, evidence MCP `@ramex-labs/continuity-mcp@0.3.0-preview.9` and optional gateway `@ramex-labs/continuity-mcp-gateway@0.3.0-preview.8`. All wrappers use that exact shared Core and contain no engine copies.

New jobs reserve room for their first supported lifecycle records. Eight shared control slots support bounded revocation/replacement work. The managed profile has 96 bounded events; physical free space is not permission to admit another job. Existing incompatible histories remain readable but cannot silently continue managed execution. There is no pruning, automatic migration or administrator-rollback protection.

The gateway and evidence server use separate Registry identities. Registry discovery grants no permission and runs no service; private operator configuration is required. Check the exact listed version before installation. Public HTTP and broad desktop/OAuth compatibility remain outside this release.

Earlier source/npm releases, including the frozen Core0.2.2 evaluation, remain available. This is a finite local developer preview, not a claim of production availability or unlimited history.
