# Developer entry

The reusable engine is [packages/core-0.2/src/core/index.ts](../packages/core-0.2/src/core/index.ts), version 0.2.2. The evaluation wrapper has its own version; it does not change Core's protocol version or fork the engine. `SOURCE-PROVENANCE.json` binds copied implementation files to their accepted source bytes.

After running `first-look`, execute this small read-only integration example:

```sh
node examples/check-authority.mjs first-look
```

It loads the retained events and configuration, replays Core, then asks whether B may review the duty and collect another packet. Read the source: it is a usable example of the required domain, policy, current head, action and resource inputs. Run it against `no-review-power` to see both decisions denied. Its decision is for the local observed history, not a transferable capability or permission to execute later.

## Where the work happens

| Concern | Source |
|---|---|
| Beginner orchestration | [tutorial/cli.mjs](../tutorial/cli.mjs) |
| Existing application, collection and handover | [application.mjs](../integrations/core-0.2-reference/src/application.mjs) |
| Durable intent admission and invocation | [durable-admission.ts](../packages/core-0.2/src/sdk/durable-admission.ts) |
| Local history | [portable-file-event-store.ts](../packages/core-0.2/src/indexer/portable-file-event-store.ts) |
| Fixed local packet executor | [packet-executor.mjs](../integrations/core-0.2-reference/src/packet-executor.mjs) |
| Typed executor acknowledgments | [portable-adapter-engine.ts](../packages/core-0.2/src/core/portable-adapter-engine.ts) |

The tutorial's trusted single-process operator appends prevalidated revocations to its own synthetic case. It is not a concurrent policy administration endpoint. The source caller contains additional retained capabilities; this candidate's walkthrough verifies only the documented commands.

## Put it behind a protected operation

An integration supplies a trusted current event store, independently configured policy/root recognition, runtime/session/role binding, a signer and an approved executor. The coordinator durably admits the intent, checks current control before use and records a typed acknowledgment. An application must route the consequential operation through that boundary and remove alternate credentials or filesystem/network routes. Do not call a tool merely because a model says an earlier query allowed it.

Identity, runtime, role tenure, authority and duty remain separate. On recovery, retain current revocations, consumed limits and unresolved outcomes. Unknown external outcomes require reconciliation; replay does not authorize automatic resend. These are design constraints, not capabilities added by this tutorial.

## Dependencies and builds

Node 24 executes the retained TypeScript through its native type stripping; there is no transpiler build or install-time hook for the main tutorial. pnpm's lockfile pins the dependency closure and registry integrity. `viem` is used for fixture signing; Core verification remains the accepted deterministic implementation. Third-party license originals are included under `licenses/`. Run `node tools/verify-package.mjs` to check distribution bytes. It is an integrity check, not a full product test suite or a signature of publisher identity.

[Optional native build](LINUX-LAB.md) · [Security boundaries](../SECURITY.md)
