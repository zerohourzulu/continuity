# Message explanations for the continuation and investigation preview

| Package | Version |
| --- | --- |
| Core | 0.3.0-preview.11 |
| Remote and native LangChain | 0.3.0-preview.6 |
| MCP gateway | 0.3.0-preview.11 |
| Evidence MCP | 0.3.0-preview.12 |

Use Node22.18+ on22.x or Node24.x. Source preview.12 adds the accepted saved-output explanation tool to the installable packages. API results, machine codes, MCP responses, authorization and retry policy are unchanged. All four packages use one exact Core; use this tuple together. The experimental ZK annex remains separate, without a new installable prover or ZK API.

```sh
npm install --save-exact @ramex-labs/continuity@0.3.0-preview.11 @ramex-labs/continuity-remote@0.3.0-preview.6 @ramex-labs/continuity-mcp-gateway@0.3.0-preview.11 @ramex-labs/continuity-mcp@0.3.0-preview.12
continuity-explain --help
```

Read [the message guide](MESSAGE-PACKAGES.md), [investigation walkthrough](INVESTIGATION-WALKTHROUGH.md) and [supported profiles](SUPPORTED-PROFILES.md). The optional explanation command does not authenticate supplied output, inspect live state, check a proof, grant permission or authorize retry. Keep original outputs and exit codes.

Packages use the preview tag; latest is preserved. Exact archives and compiled packages are in sdk/message-release. Older SDK directories preserve historical releases. Build manifests record preparation, not registry publication; actual publication is recorded by the release receipt.

For local installation run `node tools/release/install.mjs /absolute/path/to/an/empty/directory`. It checks exact archives, installed files and one shared Core. Maintainers run `npm ci --prefix tools/sdk-build --ignore-scripts --no-audit --no-fund`, `npm run release:check` and `npm run release:verify`. The builder updates only sdk/message-release; historical package archives are untouched. docs/HISTORY-INTEGRATION.md remains the historical package-document snapshot used by the build.
