# Core 0.3 preview.5

Build a new case without editing raw events. The preview adds a small owner/observation API, fresh signed runtime sessions, explicit review duties and recoverable handover. A replacement receives only separately granted powers; unfinished duties remain visible.

The project now supplies a protected local MCP tool for bounded evidence collection, an independently installable tool package, an actual LangChain agent example requiring no paid model, and a disposable Linux example with separate agent/broker identities. Optional Cedar and OpenFGA adapters require agreement with Core and refuse policy/audit failures.

[Start here](docs/CORE-0.3-QUICKSTART.md). [Compatibility, limits and migration](docs/CORE-0.3-MIGRATION.md). [Public tests](docs/CORE-0.3-TESTING.md). Core0.2.2 implementation and its evaluation releases are preserved; the new interface does not silently change canonical event semantics.

Known boundaries: this is a preview API; the tool handles one synchronous local copy, not arbitrary remote-tool fencing. OpenFGA checks are not atomic with local effects. Host administration remains trusted. npm and Registry publication await account setup; use the supplied tarballs.

---

## Earlier releases

# Editorial evaluation.6

An illustrated README companion explains the unfinished-job/permission distinction through a story. Public guides now start with the reader’s task, and website copies are generated from their maintained sources. Existing runtime, SDK, dependencies and test fixtures are unchanged. The main README changes only its release labels. This release does not include the separately developed browser playground.

# Developer-package evaluation.5

- One compiled ESM SDK from unchanged Core0.2.2 with strict generated declarations, explicit exports, source/output provenance and no runtime dependencies.
- Offline packed installation and real synthetic packet example in a separate application; no install hooks or npm publication.
- Case-name status/permission shortcuts and explicit summary/evidence MCP configuration for the selected generated case.
- Reproducible build, source/emitted parity, external JS/TS consumption and actual generated-config wire checks.

Public developer-package evaluation; hosted verification results are recorded separately in GitHub Actions. See [developer guide](docs/SDK-QUICKSTART.md) for exact limits, including admission versus pre-use control checks.

## Earlier release notes (historical)

# Onboarding evaluation 4 — 21 September 2026

Core remains **0.2.2**. This edition broadens the tutorial runtime range and simplifies first contact:

- Node22.18+ within22.x, 24.x and26.x; pinned dependencies and one shared engine remain unchanged.
- `node examples/recorded.mjs` inspects bundled recorded evidence with Node alone.
- `node tools/setup.mjs` installs locked dependencies through a pinned local package manager, without global pnpm or lifecycle scripts.
- `node tutorial/start.mjs` creates a fresh case, verifies it and prints exact follow-up commands. `--deny-review` and `--packet` preserve the same explicit permission/effect boundaries.
- Local doctor/preflight, actionable errors, early Python checks and a clearly labeled Node-only test subset.
- Shared quickstart command blocks, clearer historical source labeling, and concise immutable-package diagnostics. CI checks the declared Node minimum plus24/26 on macOS/Linux.

[Quickstart](docs/QUICKSTART.md) · [Tests](docs/TESTING.md) · [Acceptance scope](VALIDATION.md). Local candidate verification is recorded separately from hosted CI, which only runs after publication or an explicit workflow dispatch. The older native Linux lab retains its Node24/header requirements. Native Windows, a stable installable SDK and production assurance are not added.

Core source, conformance vectors, fixture signing material, dependency versions/lockfile, licensing and recorded enforcement evidence are preserved. Wrapper preflight, local CLI diagnostics, onboarding helpers/tests, CI and documentation change. No protocol authority, admission or recovery rule is relaxed. Earlier release assets remain available.

---

## Historical release notes below

# Public evaluation 3 — 21 September 2026

Core stays **0.2.2**. This is a public presentation and contribution-process update. Current documentation uses a [lightweight public RFC process](docs/RFC.md) for substantive upstream proposals; ordinary fixes can go directly to a pull request, and forks choose their own direction under the applicable licenses. An unlinked historical tutorial archive is omitted from the current source tree. Earlier Git history and release assets remain preserved.

No runtime, test, fixture, dependency, workflow, license, visual asset or security-boundary behavior changed from evaluation.2. The same local Mac/Linux acceptance applies to those unchanged bytes; GitHub Actions shows the hosted results for this edition. [Run the tutorial](README.md#run-the-tutorial) · [Verify the package](docs/TESTING.md) · [Security boundaries](SECURITY.md).

---

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

No Core semantic, dependency or license change was made in evaluation.2. Experimental registry, membership/witness and shielded modules remain outside this supported release. Optional research does not imply implemented zero knowledge, private computation or complete authority proofs.

## Distribution

The complete maintenance archive includes source, tests, guides, fixtures and the static site; installed dependencies and generated cases are excluded. Verify its separate SHA-256 asset before extraction, then verify PACKAGE-FILES.json with the command above. The original evaluation.1 assets remain unchanged. The new primary website download supplies this complete edition.
