# ADR-0074 — Recording late reports and unresolved-attempt duties

Status: selected for the private R02 experiment, 22 September 2026. This does not change the published Core package or migrate existing histories.

The remote-tool experiment exposed two missing expressions: an authorized replacement cannot record a late provider report without attempting the original consumption transition; and an unresolved admission cannot carry a duty until consumption and a receipt exist. Weakening consumption or fabricating a receipt would erase useful distinctions.

R02 introduces an explicit E5 genesis selector whose hash includes `continuity-attempt-observation-duty/1` alongside the unchanged E4 adapter descriptors. E1–E4 keep their original hashes, profiles and transition behavior. E5 adds signed `OUTCOME_OBSERVATION_RECORDED`, `ATTEMPT_DUTY_CREATED` and `ATTEMPT_DUTY_ASSIGNED` events. The exact contract is in the R02 package's `lab/R02-CONTRACT.md`.

Every new event requires a current runtime signature, current occupancy of the source intent's durable role, and an ordinary uncapped permission from that role's principal for the named administration action on the source intent ID. Role membership and responsibility alone grant no powers. The signature commits the exact prior head, domain, time and complete transition. Producers recheck the head and current time after asynchronous signing; independent replay recomputes authorization.

Observations bind a remote-report acknowledgment to the original admission. They authenticate the current recorder's claim of retained report bytes, not the provider or the truth of the reported effect. All reports remain visible. Different digests mean different bytes; they do not by themselves establish a semantic contradiction or fraud. New replay maps are separate from execution consumption and terminal outcomes, so neither recordkeeping nor duty assignment unlocks another dispatch, frees capacity or produces a receipt.

An attempt duty is caused by admission, not by a receipt. It preserves the original actor and source admission, a durable role, the original assignee, the present assignee and explicit assignment evidence. One such duty is allowed per intent. Repeated independently authorized handovers are supported. R02 leaves duties OPEN; observing a report does not discharge one or prove business fulfillment.

A separate read-only inspector and E5-only SURVIVES projections expose these facts. Existing WHY/RESPONSIBLE obligation projections retain their receipt-based meaning. The private facade has no adapter, URL or provider lookup callback. Permission to append an observation does not authorize retrieving protected provider information.

Limits: local trusted history and host; no provider-authentication transport, destination fencing, multi-host ordering or rollback protection. Existing remote cancellation and replay counterexamples remain. Local verification and review determine whether this design is suitable for a later release; no publication follows merely from completing the experiment.
