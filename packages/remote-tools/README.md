# Continuity: let the work survive the worker

A worker can disappear while its request is still running. Its replacement needs to learn what happened without accidentally doing the job twice—or inheriting powers it was never given.

This package gives your application a cooperating tool service, an executor and a way to investigate unfinished work. The included service records synthetic local effects. It is a runnable evaluation, not a ready-made connector to a payment, ticketing or production security system.

## Try it in a separate folder

Install this experimental preview from npm or the matching release archives. Use Node 22.18 or Node 24 and npm; no pnpm or TypeScript runtime setup is needed.

```sh
mkdir continuity-example
cd continuity-example
npm init -y
npm install --ignore-scripts @ramex-labs/continuity-remote@0.3.0-preview.2
npm install --ignore-scripts viem@2.55.19
cp node_modules/@ramex-labs/continuity-remote/examples/walkthrough.mjs .
node walkthrough.mjs
```

The walkthrough creates fresh disposable keys and a temporary case. It loses the reply after creating one synthetic ticket, revokes permission, and hands the investigation to a separately authorized replacement. The replacement retrieves the original report without sending the action again. Its final lines show `REVIEW_CLOSED`, duty record `OPEN`, and outside outcome `NOT_PROVEN`. Those distinctions are intentional: E6 closes the evidence review, not the attempt duty itself. Full duty discharge is not implemented in this preview; reviewing a report also does not prove that an outside job is finished.

No model subscription, API key, VM or chain is required. The example starts a service on `127.0.0.1`, then closes it and removes its temporary files. The base package depends on shared Core; viem is the walkthrough's signing helper.

## Use it from your application

The main export provides:

| Method | Purpose |
| --- | --- |
| `createToolRegistry` | Define allowed tools and their exact arguments, permissions and resources. |
| `createCooperativeDestination` | Run the supplied local service with durable synthetic effects and signed results. |
| `createCooperativeClient` | Connect using the application's key and a pinned service key. |
| `createCooperativeExecutor` | Admit a bounded operation and ask the service to apply it. |
| `createCooperativeRecovery` | Look up or cancel an original attempt without sending it again. |
| `inspectDestinationLock`, `recoverDestinationLock` | Inspect and explicitly recover a dead local writer's exact lock. |

Owner setup lives under `/local`; signed runtime helpers under `/runtime`; report, duty and review methods under `/attempts`. JavaScript and TypeScript declarations are included. The package depends on exactly `@ramex-labs/continuity@0.3.0-preview.7`. It contains no engine copy. Core owns the shared rules; the remote package owns transport, service storage and tool integration. Its `/local`, `/runtime` and `/attempts` entries forward to Core. Every forwarded constructor is the identical Core function with the same default. Use `createLocalAttemptOwner` explicitly for attempt records.

The application fixes identities, keys, role, tool contracts and business keys. Agents supply only permitted arguments. Keep owner/client handles and provider credentials outside the agent's environment. This library alone does not sandbox an agent or block other network routes.

Budget enforcement requires an explicit `projection.amount` and `projection.unit` in the tool contract. An amount-typed argument without that projection is committed data only; it does not become a spending limit. Projected amounts use bigint values and a named unit. One registry accepts one amount unit. Grants spanning other registries must use compatible units; there is no currency conversion. Counterparties are signed identifiers, not independently verified people. A compensating tool needs separate permission and a retained applied source; it adds an action instead of erasing the original. Applications still define business uniqueness and whether more than one compensation is appropriate.

## LangChain tools

Install the optional integration dependencies:

```sh
npm install --ignore-scripts @langchain/core@1.2.12 zod@4.6.5
```

After the application has created its registry and executor:

```js
import {createContinuityTool} from '@ramex-labs/continuity-remote/langchain';

const tool = createContinuityTool({
  registry, executor,
  tool: 'ticket.create',
  operationId: 'investigation:42:create-ticket',
  businessKey: 'case:42:ticket',
});
const answer = await tool.invoke({title: 'Investigate a suspicious document'});
```

This is an ordinary LangChain `DynamicStructuredTool`. To expose several operations together, use `createContinuityTools({registry, executor, operations})`; it refuses duplicate framework names. A trusted optional `name` distinguishes multiple bound operations using the same tool. Do not let a model invent a new operation ID to escape a refusal. LangChain's correlation ID is separate from the business operation.

Amount fields use exact decimal text at the JSON tool boundary and become bigint values after validation. No fractions, signs, exponents or rounding are accepted. The output's `lastReportedServiceState` is the latest received report, not a live guarantee about the destination. An uncertain result is a reason to investigate, not to resend.

The integration is tested through actual `.invoke()` calls without a paid model. This does not establish compatibility with every model provider's tool schema or a hostile agent deployment.

## Recovery and limits

The destination acknowledges each new authority checkpoint. Only then does that update fence queued work remotely. Local revocation alone cannot undo an effect or instantly notify another machine. Any checkpoint change invalidates work prepared at an older head; this version deliberately provides no automatic refresh or redelivery.

`lookup(originalRequest)` is read-only. For an authenticated APPLIED report, its `observationAcknowledgment` can be passed to a separately authorized recorder’s `observe` method, even after the original worker retires. This records the report without restoring execution power. `cancel(originalRequest)` can retain a cancellation before application; `TOO_LATE` means the effect was already applied. `UNKNOWN` is not proof of no effect elsewhere. Results and business bindings are retained in bounded storage; exhaustion refuses new work instead of pruning them.

After a process crash, exact dead-PID lock recovery is available. Missing/corrupt state remains blocked. An older valid destination snapshot restored after shutdown cannot be detected by its unchanged identity marker. A separate monotonic anchor is needed before claiming protection against destination backup rollback. The clock and host filesystem are trusted.

Signed results identify which configured service made a claim. They do not establish outside truth. Only the synthetic local effect shares the service's atomic storage transaction. External APIs need their own idempotency, fencing and outcome contract. Non-loopback transport, production TLS/credential custody, hostile-process isolation and fresh remote Cedar/OpenFGA composition are outside this package's supported profile.

`createLocalOwner` preserves the original profile; `createLocalAttemptOwner` selects E5; `createLocalReviewOwner` explicitly starts a fresh E6 history. Existing histories are not upgraded in place. E6 evidence reviews bind the complete current observation set and assignee. New evidence or reassignment requires a fresh review, while the business duty remains OPEN.

## License

Apache 2.0; see [LICENSE](LICENSE), [NOTICE](NOTICE) and [third-party notices](THIRD-PARTY-NOTICES.md).

## One Core, explicit history choices

In shared Core, `createLocalOwner` preserves the existing default policy. `createLocalAttemptOwner` explicitly starts an E5 history with attempt reports and duties; `createLocalReviewOwner` explicitly starts E6 with evidence review. Reopening a history preserves its recorded policy. No integration selects a new policy for an existing history. Use Core directly for authority and lifecycle; use this package for cooperating remote execution. The LangChain entry uses that same executor.
