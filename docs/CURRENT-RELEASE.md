# Continuation and investigation preview

This developer preview follows an existing case through replacement, restart and investigation. Use the exact versions below together.

| Package | Version |
| --- | --- |
| Core | 0.3.0-preview.10 |
| Remote and native LangChain | 0.3.0-preview.5 |
| MCP gateway | 0.3.0-preview.10 |
| Evidence MCP | 0.3.0-preview.11 |

Use Node22.18+ on22.x or Node24.x. The source version is 0.3.0-preview.10. All four archives are in `sdk/investigation-release`; earlier SDK directories preserve historical releases.

Install from npm in a new application:

```sh
npm install --save-exact @ramex-labs/continuity@0.3.0-preview.10 @ramex-labs/continuity-remote@0.3.0-preview.5 @ramex-labs/continuity-mcp-gateway@0.3.0-preview.10 @ramex-labs/continuity-mcp@0.3.0-preview.11
```

The packages use the `preview` tag. The `latest` tag may refer to an earlier release; explicit versions make the choice clear. Build manifests retain their preparation-stage label to preserve reproducible archive bytes; this page describes the published distribution.

Start with [the investigation walkthrough](INVESTIGATION-WALKTHROUGH.md), [supported profiles](SUPPORTED-PROFILES.md) or [migration](MIGRATE-A-CASE.md). `node tools/release/install.mjs /absolute/path/to/an/empty/directory` installs the exact local archives without requiring a compiler. It checks archive hashes, installed files and one shared Core.

Maintainers install the pinned compiler with `npm ci --prefix tools/sdk-build --ignore-scripts --no-audit --no-fund`. `npm run release:check` reproduces the current archives without changing them; `npm run release:verify` checks a fresh installed application and strict types. `npm run release:build` deliberately rebuilds only the current output directory. Historical SDK bytes remain untouched.

An investigation can finish under its stated policy, require renewed review after later evidence, or remain visibly challenged. This is a finite, trusted-local integration profile, not a general sandbox or a promise of factual correctness.
