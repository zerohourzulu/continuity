# Room for recovery before new work

Core preview.8 adds a managed finite-capacity profile. Each declared job reserves space for its first supported lifecycle records, and eight shared control slots remain for actions such as revocation and replacement. New work stops before it can spend those reservations. The same checks apply under the history-writer lock across the supplied Core, remote and MCP execution paths.

The profile holds at most 96 bounded events. Existing incompatible histories remain readable but cannot silently opt into managed writes. There is no pruning, automatic migration, rollback protection against the host administrator or unlimited-history claim. Read [the capacity guide](docs/LOCAL-CAPACITY.md) before upgrading a case.

Exact packages: Core `@ramex-labs/continuity@0.3.0-preview.8`, remote `@ramex-labs/continuity-remote@0.3.0-preview.3`, evidence `@ramex-labs/continuity-mcp@0.3.0-preview.9`, gateway `@ramex-labs/continuity-mcp-gateway@0.3.0-preview.8`. Each wrapper uses that exact shared Core. Source edition: `v0.3.0-preview.8`.

Cancellation still needs its own permission and job budget. Inspection and repeat calls never create a fresh business attempt. Raw Core0.2 writers, older binaries and manual history changes are outside the managed guarantee.
