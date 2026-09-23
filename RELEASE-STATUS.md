# Current edition — Core 0.3 preview.7

One shared Core now supplies the rules used by both the MCP evidence tool and the cooperating remote-tools integration. The remote package includes native LangChain tools, typed budgets, separate compensation and recovery without automatic redelivery. Explicit history constructors enable attempt records and evidence review; the ordinary Core constructor keeps its existing default. Existing histories are not upgraded automatically.

[Release and downloads](https://github.com/zerohourzulu/continuity/releases/tag/v0.3.0-preview.7.4) · [Quickstart](docs/CORE-0.3-QUICKSTART.md) · [Shared packages](docs/SHARED-CORE.md) · [Remote tutorial](packages/remote-tools/README.md) · [Tests](docs/CORE-0.3-TESTING.md).

Use Core `@ramex-labs/continuity@0.3.0-preview.7`, remote `@ramex-labs/continuity-remote@0.3.0-preview.1` and MCP `@ramex-labs/continuity-mcp@0.3.0-preview.8`. The integrations depend on that exact Core version and contain no engine copies. The evidence server remains `io.github.zerohourzulu/continuity-evidence` in the official MCP Registry.

The remote example uses a cooperating loopback service and synthetic effects. Local revocation becomes a destination fence when the destination acknowledges its newer checkpoint. Restoring an older valid destination snapshot is not detected, evidence review does not discharge a duty, and arbitrary outside APIs do not inherit these guarantees. This remains a developer preview, not a production assurance claim.

The coordinated packages are checked on macOS/Linux ARM64 with Node22.18 and Node24. Earlier public releases, frozen0.2 SDK, Apache2.0 licensing, notices and contribution process remain available. The website's recorded case and interactive playground retain their separate scopes.

Source edition preview.7.1 corrects the pnpm lockfile for the existing example dependencies. npm package versions and bytes remain unchanged. The initial source edition failed clean setup in hosted CI; its evidence and download remain available.

Source edition preview.7.2 also updates the protected MCP source integration to the shared Core archive, correcting a stale preview.6 file reference found by clean CI. Published npm bytes are unchanged.

Source edition preview.7.3 gives semantic test fixtures the existing bounded transport maxima (5/10seconds) so slower CI replay does not accidentally turn success-path tests into timeout tests. Explicit timeout cases, runtime defaults and npm bytes are unchanged. Signed-history replay latency on constrained hosts remains an integration consideration.

Source edition preview.7.4 makes multi-tool integration tests accept an uncertain first reply only when one status-only reconciliation returns the expected report. They still assert exactly one effect and, in the legacy broker, exactly one dispatch per operation. This tests the documented recovery contract rather than assuming every transport reply succeeds. Node22 hosted first-reply uncertainty was observed; its exact transport cause is not established. Runtime/npm bytes are unchanged.
