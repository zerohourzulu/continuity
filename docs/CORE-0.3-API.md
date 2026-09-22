# Core 0.3 preview: start with your own permissions

This preview adds a small application API and a protected local MCP tool around the unchanged 0.2.2 engine and history format. Install the supplied tarball; no npm publication or stable API compatibility promise is claimed. [Start with the three-minute example](CORE-0.3-QUICKSTART.md).

The package separates observation, owner administration, signed duty operations and effect-free simulation. `@continuity/core` reads a captured history. `@continuity/core/local` gives a trusted local application an owner handle for creating and changing a policy history. The package name is provisional until publisher namespace ownership is established.

## A small example

Install the supplied preview tarball into a separate directory, then run the example:

```sh
package_dir="$PWD"
example_dir="$(mktemp -d)"
cp "$package_dir/examples/core-0.3/permissions.mjs" "$example_dir/"
cd "$example_dir"
npm install --offline --ignore-scripts --no-audit --no-fund "$package_dir/sdk/continuity-core-0.3.0-preview.5.tgz"
node permissions.mjs
```

Expected decisions: **DENY → ALLOW → DENY → DENY**. The example creates its own local history. It does not use example keys, access a document or contact a chain. Its history directory is printed for inspection.

```js
continuity.createAgent({ id: 'bea' });
continuity.grant({
  id: 'incident-access', to: 'bea',
  actions: ['read'], resources: ['incident:42'],
  expiresAt: Date.now() + 60_000,
});
const answer = continuity.authorize({
  actor: 'bea', action: 'read', resource: 'incident:42',
});
continuity.revoke('incident-access');
```

An ALLOW here answers a permission question. It is not a token to execute the action. The returned `executionCapability` is always `false`; the exact engine evidence and history head accompany the decision.

## Available now

| Method | What it does |
| --- | --- |
| createLocalDomain() | Creates a fresh local namespace without chain configuration or a network call. Keep it in your application configuration for reopening. |
| createLocalOwner(config) | Creates a new private local history; refuses an existing file. The parent directory must already exist. |
| openLocalOwner(config) | Reopens that explicitly selected domain/owner/profile; preserves history and revocations. |
| createAgent({id}) | Registers an agent under the configured owner/controller, without starting a process or creating a signing key. |
| createRole({id, exclusive?}) | Creates a role, exclusive by default. |
| appoint({agent, role, tenure, number}) | Records an appointment; gives no automatic permissions. |
| grant({id, to, actions, resources, expiresAt, notBefore?}) | Makes a direct, non-quantitative, non-delegable owner grant. Expiry is required. |
| revoke(id) | Withdraws that grant. Other valid grants can still permit the action. |
| authorize(action) | Evaluates the selected file at the configured clock time and returns the complete decision evidence. |
| why(action), responsible(action), survives(agent) | Return the original scoped Core query results, including uncertainty and assumptions. |
| observe({at?}) | Captures one immutable observation. Default time is its recorded head time, not the wall clock. |
| exportHistory() | Gives the privileged application a frozen copy of the complete selected history. |

`observeHistory(events, {at?})`, from the root entry point, creates the same observation without a file or an owner handle. Its method names are `authorize`, `why`, `responsible` and `survives`.

An old observation remains old after a grant is revoked. Its head and evaluation time stay attached to it. Call the owner handle again for a fresh read of the selected file. Neither reading a file nor using a new timestamp establishes that it is the latest history in the world.

Action arguments are `actor`, `action`, `resource`, and optionally `amount` (a nonnegative bigint), `counterparty`, and `termsCommitment`. Omitted amount and `0n` remain distinct. Unknown properties, explicit undefined, getters, proxies, cycles and executable object shapes are rejected. This is a Node data-object interface, not a browser SDK. It retains the engine's finite bounds, with additional facade bounds: identifiers128characters, request16KiB/depth16/2048values, histories256events/2MiB/depth64/100000values. Stricter engine limits can reject a request within these maxima.

## The owner handle is privileged

The caller supplies a history path, domain, owner, controller and trusted clock function. This is application configuration, not a request to accept from an agent. Anyone with this handle can administer the configured owner's local policy. Keep it, the history and the host outside the agent's control. Creating an owner name declares a local root; it does not authenticate an institution. Domains retain the 0.2 event format and local-only finality.

This preview offers no authenticated administrative network endpoint, hostile-host containment or distributed latest-head service. Runtime credentials authenticate the configured local session. They do not isolate an agent or prove who owns a host.

Writes validate the complete prospective history and then append only at the expected head under the existing cooperative writer lock. Rejected input does not append. A `HISTORY_CONFLICT` requires a fresh read. `WRITE_UNCONFIRMED` with `mayHaveCommitted:true` means an I/O failure may have left bytes behind: inspect the original file; do not retry blindly or create a replacement history. Interrupted creation can leave a partial file. Automatic lock recovery and torn-write repair are not supplied. The named operation, duty, assignment and handover methods below recognize their own exact completed steps; ordinary setup/grant/revoke calls are not automatically retried.

## Try a signed handover

The next example makes fresh keys in memory, performs an effect-free operation, records a signed receipt, creates a duty, replaces the agent and assigns the unfinished work. No raw events or public test keys are needed.

From the unpacked distribution:

```sh
package_dir="$PWD"
example_dir="$(mktemp -d)"
cp "$package_dir/examples/core-0.3/handover.mjs" "$example_dir/"
cp "$package_dir/examples/core-0.3/signing/"package*.json "$example_dir/"
cd "$example_dir"
npm ci --ignore-scripts --no-audit --no-fund
npm install --offline --ignore-scripts --no-audit --no-fund "$package_dir/sdk/continuity-core-0.3.0-preview.5.tgz"
node handover.mjs
```

The first install downloads the pinned example signing library. The SDK has no third-party runtime dependency. The example prints: simulation **SUBMITTED**, signed receipt **ADMITTED**, old process **RUNTIME_NOT_CURRENT**, replacement read permission **DENY**, duty **OPEN**, repeated operation **RECONCILIATION_ONLY**. Keys are discarded when the example exits; it is not a key-custody design.

`@continuity/core/runtime` exports `openLocalRuntime({...config, session, signHash})`. `signHash` is your application's trusted callback: sign the 32-byte hash with EIP-191 personal-sign and return a 65-byte hexadecimal signature. Store real credentials outside the history. The example uses viem; the SDK accepts any compatible signer. `@continuity/core/simulation` exports `openLocalSimulation` and `commitTerms`. Simulation records no real external action.

| Method | Meaning |
| --- | --- |
| owner.admitRuntime({session, agent, epoch, key, address, expiresAt}) | Registers an application-supplied public credential. It starts no process. |
| owner.advanceEpoch({agent, from, to}) | Advances control by one epoch. Old sessions lose consequential authority; the next session needs a fresh credential. |
| owner.declareSuccession({id, from, to, role}) | Defines one explicit replacement relationship. |
| owner.appoint({...appointment, succession}) | Associates the first appointment with that rule. |
| simulation.run({id, action, resource, role, tenure, termsCommitment}) | Signs, durably admits and invokes the fixed effect-free simulator, or returns a denial/conflict/reconciliation result. |
| simulation.recordReceipt(operation) | Signs and records a receipt for the original simulated acknowledgment. A repeated call returns the existing commitment, not a reconstructed signed artifact. Keep the returned artifact if you need it. |
| runtime.obligate({id, operation, description, deadline, succession, reviewAuthority}) | Creates an OPEN review duty from the actual recorded operation, acknowledgment and receipt. It requires a separate OBLIGATE grant. |
| owner.succeed({id, rule, fromAgent, fromTenure, toAgent, toTenure, role, number}) | Records retirement and role transfer. A partial handover resumes from its exact recorded steps. It grants no power and does not automatically reassign duty performance. |
| successor.assign({id, obligation}) | Signs the performance assignment after role transfer. Requires a separate ASSIGN_PERFORMANCE grant. The duty remains OPEN. |

The first duty helper supports the review pattern: the configured owner is the beneficiary; the operation's approved adapter is the attester; `reviewAuthority` identifies an existing grant for `record-collection-disposition` on the duty. Its declared status transition is OPEN to OUTCOME_UNKNOWN. This does not promise a general contract editor, discharge method, pre-transaction duty or proof that the review was performed. The unchanged engine validates these relationships.

## Restart and conflict behavior

Choose an operation ID once and keep its exact arguments. Reusing it with another resource, role, commitment or session raises `OPERATION_CONFLICT`. A declaration without admission may be signed again after inspecting current policy. After durable admission, repeated `run` only reconciles the original attempt: it never recreates a lost invocation capability. An uncertain outcome stays uncertain; do not invent a new operation ID to retry the same intended effect.

A wrong signature cannot admit an operation. The wrapper checks history, current session and policy again after asynchronous signing; changed history raises `HISTORY_CONFLICT`, and expiry or revocation prevents a new effect. These checks are not general post-admission cancellation. Underlying pre-use checks fence the original session/epoch/role tenure, and revocation cannot undo an earlier effect.

`obligate` and `assign` use signed engine transitions and recognize exact completed commands on repetition. Administrative signing has a stricter limit of fewer than128 prior events; observation allows256. Handover consists of two visible durable events, not an atomic multi-event transaction. If writing fails after retirement, that retirement remains in force. Inspect the original file and rerun the same handover command to finish its missing transfer. Do not restore a pre-retirement snapshot.

Keep host configuration, owner handles, history paths, clocks and signer callbacks outside agent control. Passing a runtime handle through an untrusted same-process plugin is not containment. The protected evidence MCP integration supplies a separate bounded request surface; OS isolation still needs its deployment layer.

## Collect a protected evidence packet

`@continuity/core/evidence` exports `selectEvidence` for trusted setup and `openLocalEvidenceTool` for a fixed local file-copy operation. Configuration fixes the actor/session, role/tenure, resource alias, source directory, stored file selection and protected output directory. `collect({operationId, resource})` accepts no caller paths or alternative adapter. `recordReceipt` is an operator application method; inspection stays privileged. Filesystem effects use the same admission and restart rules as the simulator, with a real typed packet acknowledgment and external business outcome NOT_PROVEN.

The public MCP walkthrough is in `integrations/protected-evidence-mcp/README.md` in the full distribution. It uses the official MCP2.0 SDK with a pinned2026-07-28 client and legacy negotiation tests. The server is stdio-only and uses one launch-bound identity. This supported local operation is not a general remote MCP proxy or a sandbox.

## Verification

Run `node --test tests/core-0.3/*.test.mjs` for the interface checks. `node tools/build-core-0.3.mjs --check` verifies the generated JavaScript, TypeScript declarations and source provenance with the pinned compiler. `node tools/verify-core-0.3.mjs` installs the tarball in a separate directory, checks its files and public exports, type-checks an independent TypeScript consumer and runs both documented examples. Before the offline signed consumer check, install the pinned signing tools once with `npm ci --prefix examples/core-0.3/signing --ignore-scripts --no-audit --no-fund`; use the same npm cache for verification. No model account or paid request is required.

## Add an existing policy system

The protected tool and simulator accept an optional application-owned `additionalPolicy`. Both Core and that policy must allow a new effect. Its identity is pinned to the operation; its result must bind the exact request hash. Failed evaluation or failed durable audit recording prevents admission. The [Cedar and OpenFGA examples](../integrations/policy-composition/README.md) include real-engine tests and explain the cross-service consistency limits. The `/policy` export supplies the TypeScript request/result contract; it gives no agent administration powers.
