# One Core, different connections

Continuity's Core decides what someone may do and what work remains. An integration connects those decisions to a tool or service. A new connection should not create another set of rules.

| Package | Responsibility | Preview version |
| --- | --- | --- |
| `@ramex-labs/continuity` | Shared authority, history, lifecycle and evidence rules | `0.3.0-preview.8` |
| `@ramex-labs/continuity-remote` | Cooperating service transport, recovery and optional native LangChain tools | `0.3.0-preview.3` |
| `@ramex-labs/continuity-mcp` | Bounded local evidence tool over MCP | `0.3.0-preview.9` |
| `@ramex-labs/continuity-mcp-gateway` | Gateway for approved tools, with operator-owned identities and jobs | `0.3.0-preview.8` |

These packages form one coordinated developer preview. All three integration packages depend on exactly this Core version. Install matching versions to use one shared Core installation. Older public releases remain unchanged; mixing incompatible preview versions may cause npm to install additional copies and is not this supported combination.

## Try the packages

For a source build, build Core first, then the remote and evidence integrations below. Gateway setup and its build instructions are in [the gateway guide](../packages/mcp-gateway/README.md). Building packages locally does not replace the published archives.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm --prefix tools/sdk-build ci --ignore-scripts --no-audit --no-fund
npm run api:build
npm run remote:build
npm run mcp:build
npm run shared:verify
npm run remote:verify
npm run mcp:verify
```

From npm, choose `@ramex-labs/continuity-remote@0.3.0-preview.5`, `@ramex-labs/continuity-mcp@0.3.0-preview.11` or `@ramex-labs/continuity-mcp-gateway@0.3.0-preview.10`; each pulls in the exact shared Core dependency. Gateway installation also needs private operator configuration; see [the gateway walkthrough](MCP-GATEWAY.md). When testing the local release archives offline, install the Core archive alongside the integration archive in the same npm command. The verification helpers do this automatically. You do not need an npm account or a model subscription. Use Node22.18+ (22.x) or24.x for remote/gateway work on macOS or Linux. Core also supports Node26; that does not extend the remote/gateway compatibility claim. Windows support is not claimed.

## Choose new history behavior deliberately

Core's ordinary `createLocalOwner` keeps its previous policy. `createLocalAttemptOwner` starts E5 for attempt reports and investigative duties; `createLocalReviewOwner` starts E6 for signed evidence review. Reopening a history keeps its recorded policy. Installing a new package never upgrades a stored history.

The remote package's `/local`, `/runtime` and `/attempts` entries are forwarding conveniences, not alternative engines. Every exported function is the identical Core function. The unpublished bundled experiment used a different `createLocalOwner` default; its new native example now explicitly calls `createLocalAttemptOwner`. No published API or stored history is changed by removing that experimental alias.

## Limits stay visible

The remote example uses a cooperating loopback service with synthetic effects. Its checkpoint acknowledgment is the remote revocation boundary. It cannot stop an arbitrary outside API, detect restoration of an older valid destination snapshot, or turn evidence-review completion into duty discharge. The MCP package retains its separate bounded local evidence-tool contract. Sharing Core does not make either integration's guarantees apply to the other transport automatically.

## Reproducing older releases

The frozen 0.2 SDK remains available as a compatibility fixture. Rebuild it from its original release source, not the newer Core source in this preview. `sdk:build` refuses a source mismatch rather than overwrite an old version with new behavior. Use `api:build` for current Core. CI checks original-profile compatibility and the old installed SDK separately from the current shared-package and remote checks.
