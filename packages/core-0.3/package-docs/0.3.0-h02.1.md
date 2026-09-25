# Continuity history experiment — H02

Private development package, version `0.3.0-h02.1`. This is not an npm release or a durable runtime. Existing published packages keep their original limits.

The `@ramex-labs/continuity/history` export captures and verifies a complete event history and provides pure authorization, signed administrative preparation, admission proposals, receipt creation/verification and historical WHY/RESPONSIBLE/SURVIVES queries. It reuses the existing semantic engine. No function here appends to storage or invokes a service.

```js
import {captureContinuationHistory, CONTINUATION_HISTORY_VERSION,
  authorizeContinuation} from '@ramex-labs/continuity/history';
const history = captureContinuationHistory({
  operationVersion: CONTINUATION_HISTORY_VERSION,
  events: completeEvents,
  expectedHead: previouslyKnownHead,
});
const result = authorizeContinuation(history, requestContext);
```

Obtain the complete events and independently expected head from the application you trust. Hash agreement alone is not proof that a supplied history is current. Handles are process-local: exporting, copying or serializing their descriptors does not preserve their verification provenance. Reopen by validating the complete history. Handle results describe only the captured history, never current permission to act. Old handles can remain valid historical observations after a later revocation.

The finite profile permits up to 1,024 events and 6 MiB of summed canonical event bytes, with 8 KiB / 512 nodes / depth16 / 32 nested array members per event. Ancillary request input is at most64 KiB /8,192 nodes. Existing graph, proof, artifact and output limits remain; dense graphs can return INDETERMINATE/OUTPUT_LIMIT_EXCEEDED. These are safe refusals, not a negative authority decision and never permission. This profile does not promise every representable history supports every operation.

`appendContinuationEvent` means prospective full replay in memory, not durable append. Signed administration checks the proposed record fits before asking the signer. Receipt creation signs an artifact; it does not reserve or promise room to record it. The future store coordinator must reserve lifecycle room, check the current head and time again after asynchronous signing, and commit under its writer lock. Legacy managed96 writers are unchanged and cannot use this handle to bypass their limits.

Node22.18+ and Node24 are the locally checked runtimes. No Linux, browser or production-readiness claim is made by this increment. Run the source tests and measurements described in `HISTORY-EXPERIMENT.md` in the accompanying development source. No extra runtime dependency is bundled.
