# MCP SDK security update — 12 October 2026

The current source and prepared MCP packages pin `@modelcontextprotocol/client`, `server` and transitive `core` to **2.2.0**. The upstream [GHSA-6qxp-vccf-f47h advisory](https://github.com/advisories/GHSA-6qxp-vccf-f47h) rates the OAuth client credential-disclosure issue High (CVSS 7.5). Client 2.0.0–2.1.0 is affected; 2.2.0 is patched. Servers and stdio clients are excluded from the affected paths.

Continuity's evidence and LangChain clients use stdio. The gateway's HTTP test clients use configured authorization headers, and upstream clients use stdio. No SDK `authProvider`, `withOAuth`, direct token exchange or bundled machine-to-machine OAuth provider is configured in these active integration sources. This inspected source scope does not establish the safety of external clients or future integrations.

The regression calls the real SDK `fetchToken` with synthetic credentials bound to one issuer. A substituted issuer must throw `AuthorizationServerMismatchError` before any fetch; a matching-issuer control must complete one mocked token exchange. No real credentials or remote authorization service is used.

If you add SDK OAuth clients later, follow the advisory: bind persisted credentials to their `issuer`, retain that field when saving tokens/client information, set `expectedIssuer` for bundled machine-to-machine providers, and migrate or clear older credentials without an issuer. Merely upgrading cannot supply those application choices.

## Source and package status

This source update prepares gateway **0.3.0-preview.12** and evidence **0.3.0-preview.13** in `sdk/security-release`. Core **0.3.0-preview.11** and remote **0.3.0-preview.6** are inherited byte-for-byte. `tools/release` builds/checks the current tuple and its locked install. Earlier `sdk/message-release`, other SDK archives, captured evidence and experimental ZK materials retain their original identities. `tools/message-release` preserves the preceding builder source for provenance; earlier build inputs belong to their original source edition.

This GitHub source update does **not** publish new npm versions or MCP Registry entries. Existing npm installs and Registry descriptors still select the previously published MCP packages. Use the source install or `node tools/release/install.mjs /absolute/empty/directory` for the prepared patched tuple. Current package scripts install locked dependencies with lifecycle scripts disabled.

Tests cover the actual modern/legacy stdio exchange, protected evidence and LangChain paths, authenticated HTTP, gateway policy/recovery/Tasks controls, and installed package behavior. Earlier third-party host checks retain their original version scope. No new proof, capture, Q run, Core authorization rule or production-readiness claim is added.

## Recorded local checks

On macOS Node 24.19.0: all 103 gateway tests and 13 protected-evidence/LangChain tests passed, including the two issuer controls. The exact installed tuple, strict declarations, continuing history/recovery/evidence checks and deterministic package reproduction passed. The active source/consumer locks select MCP 2.2.0; all unrelated dependency versions are retained. All 27 historical SDK archives present in the baseline public checkout and inherited Core/remote package files are unchanged. GitHub's Mac/Linux Node 22.18/24 checks provide their own post-push platform results.
