# Descriptive reference contract — Core0.2.2 verification surface

Status: descriptive evaluation contract, not a new protocol edition or stable SDK promise. The current versioned engine contracts and actual evidence boundaries define the tested reference behavior. This document describes the surface covered by the selected tests; it is not a complete independent implementation specification. [Propose material changes through an RFC](RFC.md).

The central distinction is that a duty can survive replacement while permission remains separately established. The existing tutorial produces a retained handover history. A fresh inspector can ask why a request was refused and what survives; that answer does not execute the action or establish present-world truth.

| Contract | Meaning / limit | Source and executable evidence |
| --- | --- | --- |
| History replay | Accepted canonical events reconstruct a scoped history/head; malformed or inconsistent events are not accepted. Accepted supplied data is not global freshness or real-world truth. | `packages/core-0.2/src/core/portable-replay.ts`; `tests/replay.test.mjs`, retained replay vectors. |
| Canonical data | Protocol values distinguish representations and have bounded canonical forms. Raw `canonicalEncode` may inspect executable JS objects; portable API input capture is a separate boundary. Never treat raw helper use as hostile-object containment. | `src/core/canonical.ts` under the Core package; `tests/canonical.test.mjs`, original common-engine capture tests. |
| Permission and delegation | A usable permission path has recognized roots, valid constraints, current scope/time and required intersections. A successor does not automatically receive a predecessor's action grants. | `src/core/portable-authority-engine.ts`; authority, succession and seeded invariant tests. |
| Revocation | Revoked permission paths cannot supply power. Revoking a prohibition can restore an existing permission, so unconditional allow-set monotonicity is false. Permission-only monotonicity tests explicitly exclude prohibitions and hold evaluation time fixed. | `prohibitionIsActive`, `rootProhibitionApplies`, `applyAuthorityRevoked`; `tests/revocation-context.test.mjs` and qualified invariants. |
| Anchored prohibition | A ROOT prohibition depends on its declared permission anchor and applicable path. Removing the anchor does not create a replacement grant. The tested single-path case changes DENY/PROHIBITED to DENY/REVOKED. This is a scoped example, not a theorem over every possible graph. | The same authority/replay functions and anchored cases in `revocation-context.test.mjs`. |
| Quantities | Exact BigInt quantities, omitted versus zero, per-action/aggregate/count constraints and delegation bounds retain separate meanings. JSON tags must preserve value and shape. | `tests/quantitative.test.mjs`; quantitative vectors and actual adapter-wire tests in `conformance/test_runner.py`. |
| Queries | WHY, RESPONSIBLE and SURVIVES are evidence-scoped explanations. Duty, assignment, execution and permission differ; attribution is not legal liability or truth. | `tests/queries.test.mjs`, `tests/succession.test.mjs`; public query implementation. |
| Adapter editions and acknowledgments | Approved versioned profiles bind admission, exact acknowledgment/receipt and uncertainty. A configured profile cannot override signed history. Mock acknowledgments in tests do not prove actual document/endpoint effects. | Original `packages/core-0.2/test/*.test.mjs` and curated fixture closure. |
| Conformance runner | Completed semantic disagreement differs from broken execution; only declared projections are compared. Finite generated vectors are not the entire semantics. | [Adapter contract](../conformance/ADAPTER.md), runner regression and negative controls. |

## Before-result expectation exercise

The following expectations were stated in Root's development method/test source before running the new constructed cases, using accepted rules rather than copying observed output:

1. With an otherwise valid permission and an applicable root prohibition, read is denied; revoking that prohibition permits the still-existing permission.
2. With a sole delegated path and a prohibition anchored on that path, revoking the permission anchor does not authorize the actor. Its own path remains revoked.
3. Under a2500 per-action ceiling and sufficient remaining capacity, zero and2500 are within the ceiling,2501 is not, and omitting a required amount differs from supplying zero.

This is a bounded contract-derived exercise by the implementing Root, not a blind independent review or second implementation. Ambiguities uncovered during later integration belong in the gap register, not silent changes to vector expectations.

## Unselected surfaces

The bounded reader/CLI/MCP is included; see [its contract](READER.md). The contributed plain-record helper and cryptographic experiments are outside the supported default suite/runtime. No new Core primitive, custody system, chain holder, sandbox or production compatibility promise follows from this verification work. Original histories, engine source and accepted tutorial behavior remain the baseline.
