> Maintenance evaluation paths: [bounded reader/CLI/MCP](READER.md), [runnable verification](TESTING.md), [descriptive contract](REFERENCE-CONTRACT.md), and [conformance adapter](../conformance/ADAPTER.md). No stable general SDK or new Core version is claimed.

# Developer entry

The reusable engine is [packages/core-0.2/src/core/index.ts](../packages/core-0.2/src/core/index.ts), version 0.2.2. The evaluation wrapper has its own version; it does not change Core's protocol version or fork the engine. `SOURCE-PROVENANCE.json` binds copied implementation files to their accepted source bytes.

After running `first-look`, execute this small read-only integration example:

```sh
node examples/read-investigation.mjs first-look
```

This example uses the bounded reader to ask whether B may review and collect another packet. It prints decision, code, head and evaluation time; it never executes the requested action. Each call captures independently. Use `handover_report` for a composite at one snapshot. The [lower-level original example](../examples/check-authority.mjs) also remains available for studying direct engine parameters.

## One small development exercise

1. Run the complete local verification command in [Testing](TESTING.md): `node tools/test.mjs`. It requires Python3.9+ as well as the Node/pnpm setup. An import failure, timeout or semantic mismatch is reported as failure rather than counted as a successful denial.
2. Run the tutorial's `first-look` and `no-review-power` cases. The only selected policy difference is `--successor-review deny`; case names create separate histories. Do not edit accepted event JSON or its saved hashes to force another decision.
3. Run `node examples/read-investigation.mjs first-look` and `node examples/read-investigation.mjs no-review-power`. Expect ALLOW/DENY then DENY/DENY. This is the changed input's observable effect; it does not create a new engine primitive.
4. Follow the [real stdio MCP example](../integrations/retained-evidence-mcp/README.md). Its default configured `demo` points to the committed synthetic fixture. It does not automatically select your new tutorial case.

To expose your generated case, create a local configuration in `runs/reader-config.json`:

```json
{
  "version": "continuity-reader-config/1",
  "root": "../integrations/core-0.2-reference/cases",
  "sources": {
    "investigation": {
      "file": "first-look/history.jsonl",
      "disclosure": "evidence",
      "operations": ["verify", "check", "why", "responsible", "survives", "handover_report"]
    }
  }
}
```

Start the same server with `--config runs/reader-config.json` and change the example request's `source` to `investigation`. Keep the actor/resource identifiers `b:first-look` and `obligation:first-look`. This file is trusted local administration: callers cannot provide paths or change its disclosure. Every client attached to that process receives the same configured access. Restart after configuration changes. Use evidence mode only for records whose supported projections may be disclosed.

`runs/` is generated local data outside the package index. Do not add private histories/configuration to a public checkout. The reader is an experimental documented interface, not a general stable SDK; its supported decimal inputs, outputs and limits are in [READER](READER.md). An executor integration still needs the protections below.

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
