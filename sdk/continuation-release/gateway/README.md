# Continuity MCP gateway

Expose a fixed set of jobs to an MCP client while the application controls identity, permissions, resources and signing keys. A transport request ID is not permission. The gateway checks the current case before consequential work and preserves operation identity for recovery.

Start with `continuity-mcp-gateway --config /absolute/private/gateway.json`. The config and credentials belong to the host, never to tool arguments. See HTTP.md for authenticated loopback HTTP, RECOVERY.md for cooperating services, TASKS.md for durable polling, and OPERATIONS.md for inspection and recovery commands.

HISTORY.md explains the opt-in continued-history profile. It preserves the same case up to 1,024 events / 6 MiB; old `historyFile` configurations remain managed 96. The cooperating gateway supports E5 observations and open investigation duties; it does not expose E6 review or duty fulfillment. A full/unknown service does not authorize a resend. Only an acknowledged later destination checkpoint fences an older pending preparation.

Node 22.18+ in the 22 line or Node 24. This is a local preview with fixed jobs and configured cooperating services, not a generic proxy that can safely authorize arbitrary tools or a public HTTP deployment. Use the exact Core and remote versions declared by this package.

Version 0.3.0-preview.9. Release candidate prepared locally; publication status is recorded separately.
