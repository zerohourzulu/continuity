# Validation scope

The current maintenance runtime passed 183 Node tests, 15 Python harness tests and 16 walkthrough invocations on each of macOS ARM64 and Linux ARM64. See [release evidence and limits](https://github.com/zerohourzulu/continuity/blob/main/RELEASE-NOTES.md#evidence-and-limits), [Testing](https://github.com/zerohourzulu/continuity/blob/main/docs/TESTING.md) and [Reader](https://github.com/zerohourzulu/continuity/blob/main/docs/READER.md). Actual hosted results appear in GitHub Actions. The dated results below remain the **19 September public baseline**; they are preserved history, not the evidence for the new reader.

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
