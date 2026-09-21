# Maintenance evaluation 2 — 21 September 2026

Core stays **0.2.2**; the evaluation package is **0.2.2-evaluation.2**.

## What is useful now

- Run one documented verification command, with exact conformance comparisons and actual-process negative controls that distinguish semantic disagreement from broken execution.
- Inspect one captured history through a local CLI or stdio MCP reader. Configured sources, disclosure choices, exact quantities and bounded processing keep its scope explicit.
- Follow connected newcomer, operator and developer paths: generate a handover, inspect unfinished duty and separately granted power, change one policy, and call the reader.
- Two reviewed transport defects are repaired: trickled input no longer renews the unfinished-frame deadline; blocked output terminates the process after timeout.

## Try it

Use Node 24.x, pnpm 11.19.0 and Python 3.9+ on macOS or Linux:

```sh
pnpm install --frozen-lockfile --ignore-scripts
node tools/verify-package.mjs
node tools/test.mjs
node tutorial/cli.mjs run --case first-look
node tutorial/cli.mjs inspect first-look
node examples/read-investigation.mjs first-look
```

Expected tutorial ending: **PASS — duty remains OPEN; B has no collection power.** Choose a fresh case name when rerunning. [Paths and setup](README.md#choose-your-path) · [Reader](docs/READER.md) · [Testing](docs/TESTING.md).

## Evidence and limits

The accepted runtime candidate was exercised on macOS ARM64 and Linux ARM64 using Node 24.19.0. Each platform passed **183 Node tests, 15 Python harness tests and 16 documented walkthrough invocations**, including real stdio requests and real timeout deadlines. Python was 3.9.6 on Mac and 3.12.3 on Linux. The release changes packaging/documentation only relative to that accepted runtime; source, fixtures, tests, dependency versions and workflows retain their identities. Hosted CI is separately visible in [GitHub Actions](https://github.com/zerohourzulu/continuity/actions).

These are bounded local/model-reviewed results, not external certification, a complete independent specification, actual novice-comprehension evidence or production assurance. Reader ALLOW is an observation about supplied history, not a permission to execute later. Coarse source disclosure assumes trusted administration; it is not field-level secrecy. The default tutorial has public test credentials and simulated effects. [Security scope](SECURITY.md).

No Core semantic, constitutional, dependency or license change is made. Experimental registry, membership/witness and shielded modules remain outside this supported release. Optional research does not imply implemented zero knowledge, private computation or complete authority proofs.

## Distribution

The complete maintenance archive includes source, tests, guides, fixtures and the static site; installed dependencies and generated cases are excluded. Verify its separate SHA-256 asset before extraction, then verify PACKAGE-FILES.json with the command above. The original evaluation.1 assets remain unchanged. The new primary website download supplies this complete edition.
