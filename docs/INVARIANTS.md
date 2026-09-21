# Finite property checks and their limits

The default deterministic corpus uses seeds1..30. Replay acceptance is checked before property assertions; failures still require diagnosis of the generator, expectation and engine. Counts assert that delegation, allow/deny, intersections, revocation and handover actually occur. These are finite tests, not proofs or evidence that most possible defects are covered.

- Delegated grants must attenuate their parents; deliberate widening is rejected.
- Within the generated permission-only corpus, removing required intersections cannot reduce the allowed set. Some independent gated grants make the intersection load-bearing.
- Revoking permissions cannot enlarge the tested allow-set **when no prohibitions participate and evaluation time is held fixed**. This is not the unrestricted slogan “revocation is monotone.” The corpus uses time1000 within its grants' fixed validity window.
- Succession does not manufacture an unrelated action grant. Existing fixture checks retain the continuing duty and separate permission story.

Six additional deterministic histories test applicable ROOT prohibitions: introducing a prohibition denies an otherwise allowed request; revoking it restores the existing permission. Six anchored variants verify that revoking the sole permission anchor leaves that actor denied. These tests distinguish prohibition activity from authority granted to the actor. They do not prove every interaction among roots, intersections, prohibitions and time.

The initial contribution's unconditional revocation claim and proof-adjacent performance/coverage language were narrowed; no Core semantics were changed to satisfy them. See [reference contract](REFERENCE-CONTRACT.md) and [test instructions](TESTING.md).
