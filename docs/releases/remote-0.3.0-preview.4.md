# Continuity remote tools

Check a worker's permission before a cooperating tool service acts. Preserve the operation identity when a reply goes missing, and look up the result without sending the action again.

Use `createToolRegistry`, `createCooperativeExecutor` and `createCooperativeRecovery` with application-owned identities, keys and fixed tool definitions. Native LangChain tools are available at `/langchain`; the optional framework peers are pinned in package metadata. The service must cooperate with the checkpoint and deduplication protocol. This cannot make arbitrary remote services safe.

This version adds a fixed local evidence service: `createProtectedEvidenceDestination` and `readProtectedEvidence`. An operator selects an immutable bundle, reviewer credential hash and private Unix socket. Only `evidence.restrict` and `evidence.restore` are offered; workers cannot choose paths or executable callbacks. Access state and its APPLIED report share the existing durable transaction. Fresh reads fail closed when storage is unavailable. First initialization requires `initialize:true` and an empty destination directory; normal reopen requires existing state. A read authorized before closure can finish afterward, and already delivered copies cannot be recalled.

See HISTORY.md for explicit case/destination migration and acknowledged checkpoint fencing. The complete source includes a runnable 274-event example and separate Linux-account instructions in `examples/protected-evidence/README.md`. Core and application dependencies are exact; install the coordinated versions together. No model, chain, cloud account or real incident data is needed for the example. This trusted local POSIX profile is not a general sandbox or hostile-host defense.

Version 0.3.0-preview.4. Release candidate prepared locally; publication status is recorded separately.
