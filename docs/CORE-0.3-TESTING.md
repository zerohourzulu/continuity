# Reproduce the Core 0.3 behavior

The tests use synthetic data, fresh disposable keys and real local libraries. No private project files, paid model, chain account or cloud service is needed.

From the repository root:

```sh
node tools/setup.mjs
npm ci --prefix tools/sdk-build --ignore-scripts
npm ci --prefix integrations/protected-evidence-mcp --ignore-scripts
npm ci --prefix integrations/langchain-evidence --ignore-scripts
npm ci --prefix integrations/policy-composition --ignore-scripts
npm ci --prefix examples/core-0.3/signing --ignore-scripts
node tools/test.mjs
node tools/build-core-0.3.mjs --check
node tools/verify-core-0.3.mjs
node tools/verify-mcp-package.mjs
node --test integrations/protected-evidence-mcp/tests/*.test.mjs \
  integrations/langchain-evidence/tests/*.test.mjs \
  integrations/policy-composition/tests/cedar.test.mjs \
  integrations/policy-composition/tests/wire-policy.test.mjs
```

The first setup step uses pinned pnpm through npm; it needs no global pnpm installation. The full original conformance suite needs Python3.9+. The API consumer uses already downloaded dependencies. The MCP consumer may fetch npm metadata or missing dependency archives; its shrinkwrap pins the tested dependency graph and install scripts remain disabled. Do not confuse a setup failure with a successful denial test.

The separate [OpenFGA runner](../integrations/policy-composition/README.md) starts a real disposable loopback server. It requires a verified OpenFGA1.21.0 binary and refuses to substitute a mock. The [Linux isolation test](../integrations/protected-evidence-mcp/linux/README.md) requires explicit root authorization on a disposable development machine; ordinary tests need no root access.

The 0.3 tests check grants/revocation, current sessions, signed lifecycle and causal duty evidence, repeat operation IDs, changed inputs, expired/retired sessions, uncertain outcomes, actual MCP transport, actual framework retries, Cedar evaluation errors, policy/audit failures and actual OpenFGA relationship changes. The original0.2.2 tests and conformance vectors remain intact.

Local results and supported versions are described in [Validation](../VALIDATION.md). Hosted jobs are visible in [GitHub Actions](https://github.com/zerohourzulu/continuity/actions). A green run proves the tested cases under that environment; it does not certify a production deployment or protect an unmediated resource.
