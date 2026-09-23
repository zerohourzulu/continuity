# Gateway contract, M01–M02

The public integration surface is `createGateway(options)`, `gateway.tools()`, `run(alias, arguments)`, `status(alias)`, `why(alias)` and `close()`. Constructor options are privileged host configuration; the MCP client cannot call that constructor or alter its settings. CLI reads a private configuration/key file. State uses the same published Core function identities and E5 policy; history migration and new Core semantics are outside scope.

Order: strict caller JSON → registered job/schema → current preflight permission → selected upstream definition check → Core signed declaration/admission → durable private attempt → one SDK invocation → bounded report persisted → report-digest acknowledgment consumed only under current Core rules. SDK calls carry the approved `toolDefinition`, disabling the automatic HeaderMismatch retry branch. No gateway path automatically transmits twice.

The remote business effect and the local admission are not atomic. A crash after admission but before transmission can strand a zero-effect job as unknown. A lost reply after a real effect is also unknown. These states must not be collapsed. Recovery never clears a job, changes its identity, or sends the original action again. Terminal inspection remains separate from proof of business outcome.

A business key uniquely selects an operation within an authority domain. Tool alias changes do not reset it. Different actor/arguments/contracts conflict with the existing signed declaration. Distinct business keys are deliberately distinct operations; the operator remains responsible for defining business uniqueness. There is no inference that similar English requests are the same business action.

Inspection requires current configured runtime, role/tenure and inspect-operation permission on the job resource. No agent-selected identity, URL or filesystem path enters those checks. A current replacement can inspect the summary under its own grant without gaining the original action. Full provider responses are returned only along the original authorized invocation/reconciliation path; a late reply on an already admitted request can arrive after retirement. No retroactive revocation of delivered bytes is claimed.

The schema approval pins upstream name, input/output schemas, annotations and execution metadata. Descriptions are never promoted to permission and are replaced by operator-oriented gateway descriptions. A malicious server can lie about its schema or effects; endpoint code/OS remain trusted integration boundaries. M01 does not claim arbitrary-code containment, full resource mediation, globally once-only business effects, arbitrary content forwarding, HTTP auth, destination cancellation, unlimited history or backup rollback detection.

Completed public packages remain unchanged. Future increments use new versioned source editions and separately authorized publication.

## Authenticated local HTTP

See [HTTP.md](HTTP.md) for the exact token and identity profile. One pinned issuer and its public ES256 keys validate every HTTP request. Signed issuer/sub/client_id/continuity_binding selects one immutable operator-configured case; no client-selected context. Synchronous host access checks run after awaits and immediately before adapter dispatch. They do not replace Core admission, recipient fences or durable host revocation policy. Incoming tokens are not passed to the MCP SDK server context, upstream processes or durable records. OAuth caller identity is a host-authentication fact; it is not independently recorded as a new canonical Core principal.

## Cooperating-service profile

The ordinary-server contract above is unchanged. The separate [recovery contract](RECOVERY.md) adds fixed-job status lookup, a separately admitted cancellation with no automatic retransmission, and explicitly authorized late observations. It validates the original admitted proof before continuation, preserving that proof’s reservations. Shared published Core and remote packages own their semantics; this gateway adds no engine fork. The ordinary CLI does not expose these cooperating-only verbs.

## Durable polling Tasks

An explicitly enabled cooperating HTTP binding supports the [selected Tasks contract](TASKS.md): one durable handle per fixed business job, stage polling, current permission on every request and no effect replay on reconnect or host restart. Cancellation requests remain distinct from confirmed cancellation. Old experimental task methods and subscriptions are not supplied.

## Local operating profile

Supplied hosts own a private process lease; embedded hosts must apply the exported lease wrapper. Explicit dead-owner recovery never changes Core state. Private offline snapshots verify recorded bytes, not currentness, and have no automatic restore. [Operating limits](OPERATIONS.md) and [tested interoperability](COMPATIBILITY.md) define this evaluation profile. Legacy upstream negotiation is explicit; client arguments remain closed while upstream approval stays pinned to its original definition.
