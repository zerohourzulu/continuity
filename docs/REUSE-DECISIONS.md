# Selected reuse and deferred contribution

This release adapts tests, fixtures and reader ideas from a Claude-assisted contribution at commit `abfaacd6777ab9dfce80962a42e4b0ec3acab26a`. The table explains what was reused, changed or left out, and why. Passing the contributor's tests alone was not sufficient: integration checks also exercised failure paths and the actual command-line processes.

| Source group | Disposition and reason |
| --- | --- |
| Contributed authority, replay, queries and succession tests | Reused; local fixture-based checks over the unchanged engine. |
| Canonical tests | Adapted commentary to distinguish raw helpers from portable capture; retained their checks. Four plain-record wrapper tests deferred together with the unused object helper, rather than importing that helper merely to make a test pass. |
| Quantitative tests | Reused assertions; removed the unsupported claim that no prior quantitative regression evidence existed. |
| Helpers and fixtures | Reused; corrected wire-marker documentation. Replaced two unused host-specific inputDirectory metadata values. Event histories, signatures and vector expectations unchanged. |
| Seeded generator and invariant suite | Adapted: fixed-time comparisons, explicit permission-only preconditions, bounded seed selection, precise cache keys and corrected unsupported explanatory claims. Maintainers added separate prohibition/anchor cases. |
| Conformance vectors and manifest | Original bytes preserved. Finite generated regression evidence; historical manifest prose is not an adopted specification. |
| Python runner and Node adapter | Adapted substantially: exact typed/presence comparison, bounded nonblocking subprocess communication, distinct mismatch/error reports, closed envelopes, canonical BigInt tag validation and explicit limits. |
| Original private common-engine, policy-edition and document-policy tests | Curated all33 tests and19 required fixture files into public-relative locations; no original assertion changes. Active package resolution anchor and successful scratch cleanup adapted. Two unused case paths sanitized; signed records unchanged. |
| Contributed CI and vectors-test ideas | Replaced redundant/unpinned/false-pass workflow steps with one public command and actual-process negative controls. Preserve useful semantic-mismatch pattern with correct import binding. No runtime fixture regeneration or unsupported Node22 claim. |
| Additional integration tests | Actual-process harness regressions, contract-derived prohibition cases, one test command and descriptive contract/testing guides. These require integrated validation like reused code. |
| Lens, history-source, CLI and MCP | The reader adapts the contributed query mapping and vocabulary; replaces reopen-per-question with one capture, arbitrary MCP files with configured names, and unbounded/lenient processing with strict byte limits and bounded workers. Research commands and pre-flight-gate claims are excluded. The integration adds actual interface/race/disclosure tests using contributed fixtures and original expected decisions. |
| plain-record / isStable | Not adopted. Reflected executable objects and repeated-read stability are not this interface's trust boundary. Strict JSON bytes, finite decoding and existing Core capture avoid another general object guard. The four deferred helper tests remain excluded because their module is not shipped. |
| Captured store decoder and strict JSON | Decoder adapted from the existing PortableFileEventStore codec, with captured-byte parity/hash-integrity checks. The already shipped duplicate-key parser is extended with byte/depth/node/finite-number bounds. No Core or store writer change. |
| Commitment, challenge, equivocation, registry, statement and shielded modules/tests | Retained as research outside this release. Optional work begins with the precise proof purpose, then selective disclosure if useful; known defects/incomplete verification remain explicit. |
| Draft specification, findings, outreach and broader roadmaps | Not adopted wholesale. A descriptive contract and accurate evidence limits replace unsupported maturity/completeness claims. No Core 0.3 behavior is included. |

The Core engine and original signed histories were not rewritten as part of this reuse. See [validation](../VALIDATION.md) for the tested environments and [release notes](../RELEASE-NOTES.md) for the public release history. Source reuse and passing tests do not amount to independent security certification.
