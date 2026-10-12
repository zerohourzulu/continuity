## Source 0.3.0-preview.13 — 12 October 2026

- Pin current MCP client/server/core to 2.2.0, fixing GHSA-6qxp-vccf-f47h in the SDK OAuth client.
- Refresh source and installed-consumer locks without changing unrelated dependency versions.
- Add a synthetic issuer-substitution refusal test and matching-issuer control; preserve old SDK archives and proof evidence.
- Prepare new MCP archives for source use. npm and Registry publication are separate and unchanged.

# Source preview.12.1 — local command invocation

Use `npx --no-install continuity-explain` after a local npm install. All four prepared/published npm archives and runtime/API behavior are unchanged. The source preview.12 guide and first authentication failure are preserved.

Message package preview — 10 October2026: Core11, remote6, gateway11 and evidence12 add the optional saved-record explanation command. See [the current release guide](docs/CURRENT-RELEASE.md). Existing API/policy/proof behavior stays unchanged; older npm archives remain available.

# Source preview.12 — onboarding diagnostic checks

Update three legacy wording assertions and recognize the two exact tutorial error forms for an existing case and missing completed result. Preserve machine envelopes, refusal decisions, saved case files and unknown-context handling. No saved proof or npm archive changes.

# Source preview.11.1 — provenance correction

The regenerated PACKAGE-FILES.json is authenticated by the archive checksum, avoiding a circular hash in provenance. A release test checks every recorded public-source hash. Source/runtime/proof evidence and npm archives are unchanged from preview.11.

# Source preview.11 — messages and completed ZK experiments

Public command, tutorial and browser diagnostics explain what happened and what the operator can do, while preserving machine codes and authority/retry rules. The full saved-record message catalogue and source-family implementations are included.

Experimental source and a bounded evidence summary cover the eight completed historical r3/r3.1 proof chains, 32 successful producer stages and 8 final native P checks. Full100 completed aggregation and wrapping; its recorded chain took about 9 hours 49 minutes. Five native fingerprint-format controls demonstrate correct-format acceptance and exact swapped-format refusal. A separate public-Core retained-receipt reader example records authentic historical evidence with current=false.

Read [ZK scope/results](research/zk/README.md), [message instructions](messages/README.md) and [receipt example](examples/retained-receipt/README.md). Source preview.11 is a GitHub source edition. npm remains Core preview.10, remote preview.5, gateway preview.10 and evidence MCP preview.11; no npm/Registry release is made. Earlier source versions and assets remain available.

The finite ZK roadmap is closed in its recorded engineering scope. This is not stable 0.3, a turnkey independent proof runner, present execution authority, or complete Core/API/privacy/production assurance. Private input/proof/key/custody bodies are omitted. Historical and new public source-path adaptations are distinguished by provenance; publication creates no new proof/test credit.

# Source preview.10.2 — compatibility test correction

The E6 compatibility test now checks that its review event remains at rank 24, rather than assuming it is the last event after newer policy editions append events. Frozen policy hashes, rank checks and older-profile rejection checks remain. Runtime source and all four published npm packages are unchanged. The previous failed [hosted run](https://github.com/zerohourzulu/continuity/actions/runs/36198876668) is preserved; current results are in Actions.

# Source preview.10.1 — reproducible package documentation

Public guides now have a separate path from the original document snapshot embedded in the npm packages. This fixes the hosted rebuild check after the preview.10 publication wording changed. The four npm versions, archive bytes and runtime behavior are unchanged. The combined Node suite also has a thirty-minute outer budget instead of ten for slower hosted runners, with every test and assertion retained. Earlier source and failed validation evidence remain available.

# Preview.10 — keep the case, finish the investigation

A case can survive replacement and restart without resetting revoked powers or spent allowances. The new investigation walkthrough shows completion under explicit policy, renewed review after later evidence and a persistent challenge, independently of restoration or the outside action's uncertain outcome.

This release brings the continued-history and investigation work to the same public package set: Core preview.10, remote/native LangChain preview.5, gateway preview.10 and evidence MCP preview.11. Standard builds, exact installation, current views and guides now agree. Use [the release guide](docs/CURRENT-RELEASE.md) or [run the walkthrough](docs/INVESTIGATION-WALKTHROUGH.md).

These remain finite trusted-local profiles. Completing an investigation is not proof of outside truth or success. Existing releases remain available.

# Preview 6.1 — MCP package-name launch

MCP package preview.7 adds `continuity-mcp` as a default command alias. This lets npx and Registry clients select the server without guessing among setup/demo commands. Existing commands remain available. The Core SDK remains preview.6; engine code is unchanged. The public package test now runs an actual MCP handshake and retry through the npx package-name launch.

# Preview 6 — npm packages under RAmEx Labs

The Core SDK is `@ramex-labs/continuity`; the protected MCP tool is `@ramex-labs/continuity-mcp`. Both use the preview dist-tag. Imports and examples now use the owned publisher namespace. Core engine semantics and supported operations are unchanged. Earlier tarball-only previews remain available in release history.

# Preview 5.1 — fresh-machine verification

The public consumer check now downloads the signing example’s locked dependencies when its private cache is empty. The dependency-free SDK still installs offline. SDK and MCP package bytes and engine behavior are unchanged from preview 5.

# Core 0.3 preview.5

Fresh-case API, signed lifecycle, protected MCP evidence tool, LangChain recipe, separate-user Linux lab and optional policy composition. See [release notes](RELEASE-NOTES.md). Original0.2.2 history and engine preserved.

# Editorial evaluation.6 — 22 September 2026

Added an illustrated plain-language README companion, revised public guides around reader tasks, corrected stale validation wording and synchronized downloadable website guides. Core0.2.2 and SDK0.2.2-sdk.1 remain unchanged.

# Onboarding evaluation — v0.2.2-evaluation.4

Add Node-only recorded reading, project-local setup, a repeat-safe starter, runtime compatibility beyond Node24, early prerequisites and clearer diagnostics. Align quickstart snippets and CI. Core0.2.2 source and dependency lock remain unchanged. [Release notes](RELEASE-NOTES.md) · [Quickstart](docs/QUICKSTART.md).

---

# Public evaluation — v0.2.2-evaluation.3

The current public distribution uses a lightweight [RFC process](docs/RFC.md) for substantive upstream proposals and omits an unlinked historical tutorial archive. Core 0.2.2, tests, dependencies, license and security boundaries are unchanged. Previous release assets and Git history remain available.

---

# Maintenance evaluation — v0.2.2-evaluation.2

Additions over the original evaluation release:

- One public verification command, exact conformance comparison, real-process negative controls and scoped regression properties.
- Captured-history CLI and local stdio MCP reader with configured sources/disclosure, exact decimal quantities and finite worker/IO bounds.
- Connected newcomer/operator/developer paths, an answer key and a read-only generated-case example.
- Package-index exclusions consistent with generated tutorial data.

Core0.2.2, original history fixtures and dependency versions are unchanged. The reader is observation only; it does not authorize execution or isolate hostile programs. Summary/evidence disclosure assumes trusted local administration and does not provide field-level secrecy. Experimental proof/registry/witness commands remain excluded.

The primary website download now supplies the complete maintenance archive, including tests and reader. Original evaluation.1 assets remain preserved. [Release notes](RELEASE-NOTES.md) distinguish local acceptance from actual hosted CI results.

---

# First public evaluation — 19 September 2026

Apache 2.0 release authorized and published with visual README, GitHub Pages, tutorial download and developer guidance. Runtime remains Core 0.2.2.

## Historical candidate notes

# Public evaluation candidate 1

This candidate makes Continuity Core 0.2 inspectable and runnable from a single source tree. It adds a short security-review tutorial, a successor-permission comparison, fresh-process inspection, a developer example, a locked dependency install and selected recorded Linux evidence.

It reuses Core 0.2.2 and the existing reference caller without altering their source. The wrapper follows the caller's fixed handover sequence, then records explicit revocations. It does not claim revocation was interleaved into that sequence. This packaging edition is `0.2.0-evaluation.1`; it is not a new protocol release or Core 0.3.

Included: simulator and local synthetic packet tutorial; 55 recorded guide originals; native binding source and optional advanced mechanics instructions; dependency license originals; file hashes and source provenance. Excluded: private historical archives, operational custody, development home, VM inventory, production credentials and bundled runtimes.

The candidate is privately staged for review. Publication, final licensing and public release status require the founder's release decision. [Validation](VALIDATION.md) records exactly what was exercised.
