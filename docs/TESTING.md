# Run and understand the checks

Prerequisites: Node24, pnpm11.19.0 and Python3.9+ on macOS or Linux. These are local checks: no wallet, model account, chain funding or live service is required. Installing the pinned dependencies may require package-registry access; execution afterward is local.

```sh
pnpm install --frozen-lockfile --ignore-scripts
node tools/test.mjs
```

The command runs selected engine tests, seeded properties, original adapter-edition tests, actual CLI/MCP reader checks and Python-to-Node adapter checks. A failure stops the command with a nonzero status. It does not regenerate expected fixtures or install anything. Each subprocess has a finite timeout; the conformance runner additionally bounds its pipes and individual requests. See [the runner guide](../conformance/README.md) for MATCH/MISMATCH/EXECUTION_ERROR and diagnosis, and [the reader contract](READER.md) for source/disclosure/quantity limits and a targeted command.

The contributions and test scope are mapped in [reuse decisions](REUSE-DECISIONS.md); expectations and limitations appear in [the descriptive contract](REFERENCE-CONTRACT.md). Seeded properties default to30 reproducible seeds. A selected finite sweep may set `CONTINUITY_PROPERTY_SEEDS` to an integer30..300; CI runs the default once and does not rerun the suite merely to count tests. `revocation-context.test.mjs` adds six deterministic prohibition scenarios and their six anchor cases.

Original tests use public synthetic signing fixtures and local temporary stores. They do not hold operational credentials. Data-only document/endpoint acknowledgments exercise protocol plumbing, not real release of a document or operation of an endpoint. Successful reader scratch copies are removed; other generated original-test evidence is retained under the operating system temporary directory and its location is printed. Test assertions preserve the accepted no-effect/unknown distinctions.

For a narrow diagnosis:

```sh
node --test tests/revocation-context.test.mjs
python3 -B conformance/run.py --json -- node conformance/adapters/node.mjs
```

Retain the failing command, source version, seed/vector ID and report before editing. An import failure is not a denied action and a timeout is not semantic nonconformance. Check prerequisites/dependencies and relative imports first. Do not change expected security outcomes just to make a test green.

The CI definition exercises Node24 on macOS/Linux, with locked dependencies and scripts disabled. Local results do not establish that hosted CI has run. This is the v0.2.2-evaluation.2 maintenance evaluation; [release notes](../RELEASE-NOTES.md) identify local acceptance environments, and GitHub Actions records actual hosted results. The retained vector corpus originated from the reference engine, so a different runner language does not make it independent implementation evidence.
