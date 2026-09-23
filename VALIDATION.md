# Browser playground integration — 23 September 2026

Source preview.8.2 adds the previously developed static playground to the current release. The Core 0.3 runtime, all four npm archives and the original Node SDK are unchanged.

- 54 focused checks pass on macOS ARM64 Node22.18 and Node24.21: 34 existing conformance vectors and 20 scenario/boundary cases.
- Chrome153 passes the actual worker's 34 vectors and 16 scenario cases, story/workshop controls, role and permission choices, comparison, 12-agent import/export, stale-answer cancellation, replay, mobile overflow, reduced motion and invalid input checks.
- The downloaded maximum case and full result reproduce exactly through `node tools/playground.mjs`, using the original Node SDK. The test observed no external browser requests or page errors.
- The browser build matches its recorded engine provenance. It adapts two host imports for a JSON-only worker boundary; it is not a general browser SDK or hostile-agent sandbox.

[Run the independent checks](website/playground/README.md). The selected browser check is headless Chrome on macOS, not a native Safari or physical-phone result. Prior Firefox/WebKit evidence belongs to the original playground evaluation, not a newly repeated platform campaign. Hosted results for this source edition appear in [GitHub Actions](https://github.com/zerohourzulu/continuity/actions) after publication.

The dated validation records below describe earlier increments and remain historical where superseded.

# Core 0.3 preview validation

The new API, protected tool and optional policy adapters have69 focused checks, passed locally on Node22.18 and24.21. They use the actual MCP client/server, actual LangChain agent loop with a scripted model, Cedar WASM4.13.0 and OpenFGA1.21.0. Independent application installs exercise the compiled API and MCP tarballs. The public test commands are in [Core0.3 testing](docs/CORE-0.3-TESTING.md).

A separate ARM64 Linux lab demonstrated distinct broker/agent user identities, denied direct source/history/key/code access, and refusal of an old still-running agent after retirement. Its first47API/MCP/framework checks passed on Node24.19. Host administration remains trusted. No broad sandbox, distributed atomicity or production assurance is inferred.

Earlier Core0.2.2 verification below remains historical and applies to its unchanged implementation. Hosted checks for the current commit are reported by [GitHub Actions](https://github.com/zerohourzulu/continuity/actions), not inferred from those older results.

---

> **0.3 preview note:** the prior release results below describe the unchanged 0.2.2 baseline, not validation of the new facade. See [the new interface and checks](docs/CORE-0.3-API.md). This preview is local and has not been deployed or published to a registry.

# What has been tested

The published **v0.2.2-evaluation.5** release passed **194 Node tests and 15 Python checks in each of six hosted jobs**: macOS and Ubuntu, each with Node 22.18, 24 and 26. The jobs also checked the SDK rebuild, source/compiled behavior and a separate JavaScript/TypeScript consumer. [Verification run](https://github.com/zerohourzulu/continuity/actions/runs/35681575289) · [Pages deployment](https://github.com/zerohourzulu/continuity/actions/runs/35681575319).

The tutorial demonstrates replacement, refusal of an obsolete request, continuing unfinished work and separately checked permissions. The SDK example exercises a protected operation and refusal paths. These checks use synthetic data and public test keys on trusted hosts. They do not establish hostile-host containment, production credentials, current public-chain state, real incident truth or measured beginner comprehension.

## Editorial evaluation.6

The illustrated guide and editorial changes are based on evaluation.5. Executable source, dependencies, signed fixtures and the SDK archive are unchanged. The hosted results above apply to that runtime baseline; they establish the unchanged runtime baseline. Local editorial checks passed file integrity, guide links and exact tutorial-command agreement. Publication checks for this edition appear in the repository’s Actions history; no independent newcomer study is claimed.

[Run the checks yourself](docs/TESTING.md) · [Security boundaries](SECURITY.md).

## Earlier local preparation records

The records below preserve the environments and limitations observed before publication. Statements about unpublished preparation describe their date, not the current release.

### Developer package — pre-publication local checks

The packed SDK passed offline external installation and exact archive/output membership checks on macOS Node24.21 and Linux Node24.19. All six ESM exports load with TypeScript stripping disabled; an independent TypeScript5.9.3 consumer passes strict checking without skipLibCheck. Generated output is byte-reproducible from unchanged Core0.2.2 source. Source/emitted replay, signed admission and survival query results agree for both original adapter profiles.

A separate application copies actual synthetic packet bytes only after durable admission. It rejects control loss before invocation, revoked-head preparation, forged capability and modified signed request. Selected-input change remains UNKNOWN without resubmission. These checks use trusted local files, public fixture signatures and fixed time; they do not prove production isolation or public-chain freshness. Three new actual CLI/MCP tests cover case shortcuts, summary disclosure enforcement, explicit evidence selection, non-overwrite and symlink rejection. At the time of this local preparation record, hosted CI and publication had not occurred; the published results are summarized above.

The earlier evaluation.4 evidence below is historical, not a claim that it already tested this candidate. Final local regression passed194Node+15Python checks on macOS Node24.21/Python3.9.6. Targeted SDK/case/MCP checks also passed on macOS Node22.18 and Linux Node24.19/26.9. The four targeted lanes each cover external JS/TS consumption and all six application scenarios; they are not four new full product-suite runs. A final packaging-only correction supplies the NOTICE-referenced licensing files; installed bytes and deterministic rebuild were verified again on Mac24.21. Executable JS is unchanged from the cross-platform tests.

## Historical evaluation.4 validation

# Validation scope — onboarding evaluation 4

Local acceptance on21September2026 used public-only clean extracted copies. Every environment below passed **191 Node tests and15 Python checks**, plus the Node-only recorded example before installation, synchronized quickstart check, fresh starter, denied packet-note case and package integrity before/after execution.

| Platform | Node runtime | Result |
|---|---|---|
| macOS26.5.2 ARM64 / Python3.9.6 |22.18.0 (declared minimum)| PASS |
| macOS26.5.2 ARM64 / Python3.9.6 |24.21.0| PASS |
| Linux ARM64 / Python3.12.3 |22.18.0 (declared minimum)| PASS |
| Linux ARM64 / Python3.12.3 |24.21.0| PASS |
| Linux ARM64 / Python3.12.3 |26.9.0| PASS |

New eight-test coverage checks dependency-free recorded reading, supported runtime boundaries, missing-dependency preflight, human versus JSON errors, setup argument/npm failures, immutable-package diagnostics, immediate missing-Python failure, repeat-safe cases, collision handling and printed inspection commands. A separate Mac24 run with Python absent passed the explicitly labeled Node-only subset. Clean setup succeeded without globally installed pnpm; effective pnpm engineStrict/ignoreScripts settings were true. Dependencies and Core source were compared with the preceding release.

The candidate site's Try panel was visually inspected in a local browser and its Copy commands button reported success. Accepted styles/assets, Understand-first navigation and recorded evidence are preserved. These are Root's local engineering checks, not a novice-participant study. Local package/link/privacy scans are bounded checks, not proof of absence of every possible disclosure.

CI is configured for minimum22.18,24 and26 on macOS/Linux; this local record does not claim hosted CI ran. Mac26 compatibility has prior audit evidence but was not a final-candidate local platform lane; hosted results, when run, appear in [GitHub Actions](https://github.com/zerohourzulu/continuity/actions). Native Windows/WSL and hostile-host containment are not established. The optional native Linux lab keeps its separate Node24/header/kernel contract.

[Release notes](RELEASE-NOTES.md) · [Testing](docs/TESTING.md) · [Reader](docs/READER.md). Core0.2.2, original fixtures and locked dependency versions are unchanged. The earlier maintenance acceptance had183Node+15Python checks and16walkthrough invocations per Mac/Linux platform; the new eight Node checks account for191. The dated records below describe the **19September public baseline**, not the new onboarding acceptance.

## Public baseline validation

Recorded 19 September 2026. Tests exercise this tutorial and its selected source closure, not all historical Core development campaigns.

| Environment | Exercise | Result |
|---|---|---|
| macOS ARM64, Node 24.19.0, pnpm 11.19.0 | Fresh Git clone; frozen install with scripts disabled | PASS |
| Same checkout | Simulation with B review allowed and revoked | PASS, correct ALLOW/DENY; duty OPEN |
| Same checkout | Local packet with B note allowed and refused | PASS, one signed note or explicit refusal; duty OPEN |
| Same checkout | Separate-process inspection and developer example for all four cases | PASS |
| Same checkout | Invalid option, existing case name, altered exported history | Refused as expected |
| Linux ARM64, Node 24.19.0, pnpm 11.19.0 | Separate clean Git clone and frozen install | PASS |
| Linux clone | Default simulation and denied-note local packet, fresh inspection and developer example | PASS |
| Both checkouts | Git remains clean after generated evidence/dependency installation | PASS |
| Curated guide | 55 original evidence files match recorded sizes/hashes; stage download references resolve | PASS |

The first macOS walkthrough caught a bug in the newly written developer example's decoding of the file-store format. It was corrected to use the existing canonical store reader, then checked across all four cases and the separate Linux clone. Earlier successful checks and the original failure were retained. Core and reference application source bytes were unchanged.

File hashes and local documentation targets are checked at packaging. The immutable archive is extracted and verified on the development VM. The final package contains no installed dependency tree, generated tutorial case, historical private archive or bundled runtime. Dependency license originals and lockfile are included.

Not newly exercised: the optional native compilation/mechanics lab, a full multi-principal deployment, Windows, an x86 host, operational credentials, external agents, public chain execution, hostile-host behavior or public publication. Native guide observations are earlier retained evidence, clearly separate from these tutorial runs. No novice usability study or external assurance review was performed.
