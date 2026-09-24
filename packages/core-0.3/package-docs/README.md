# Versioned npm documentation

Each version file preserves the README shipped in that exact npm package. It is a historical package input, not the current API guide. Keep it unchanged once published. Current instructions are in [the API reference](../../../docs/CORE-0.3-API.md) and [quickstart](../../../docs/CORE-0.3-QUICKSTART.md).

The Core builder selects this file using the package version. A new package version needs its own reviewed snapshot, with public links; a missing snapshot fails the build. Do not copy the evolving current guide over an already published package README. This keeps source rebuilds and installed-package byte comparisons meaningful while allowing the current guides to be corrected.

Core preview.8 README SHA-256: `e35999f6e0971ed72ded188499a980be8cdbd43c73e7c898ce3aec7264ae4732`. Its original npm archive remains unchanged. The generated `sdk/core-0.3` and `artifacts/gateway-package` trees represent the shipped packages; their documentation can differ from current source guides. Updating current HTTP guidance does not replace the published gateway archive.
