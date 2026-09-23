# MCP gateway local developer preview

This edition adds `@ramex-labs/continuity-mcp-gateway@0.3.0-preview.6`: put several approved MCP tools behind current Continuity permissions, retain a business job across retries and replacement, and inspect the original attempt without sending it again.

Try the [gateway walkthrough](docs/MCP-GATEWAY.md). The complete source includes all tests and four runnable demos. The npm package includes the demos, declarations, operating guides and a disabled, credential-free Keycloak realm template.

Selected stdio/loopback HTTP, polling Tasks, crash recovery, capacity diagnostics and durable operator denials are included. A local Keycloak browser-login experiment covered renewal, code/refresh replay refusals, key rotation and revocation across restart. Its fixed audience is a known compatibility limit, not full modern MCP OAuth conformance. The Inspector/mcpc checks used configured credentials, not interactive OAuth.

This is not a public HTTP service or hostile-agent sandbox. Ordinary tools cannot promise destination-side cancellation or exactly-once effects. Private storage/clock remain trusted; finite histories, no automatic migration or backup rollback protection. See the guides for exact boundaries.

Core preview.7, remote preview.2, evidence MCP preview.8 and the existing evidence Registry listing are unchanged. The source README now correctly distinguishes `createLocalOwner` from `createLocalAttemptOwner`; this does not rewrite the previously published remote npm archive. A stale website download description is also corrected.

Source edition: `v0.3.0-preview.7.6`. Gateway package: `0.3.0-preview.6`, `preview` dist-tag. Consult the exact release and npm version for distribution availability. A separate gateway Registry listing and internet-facing deployment are deferred.
