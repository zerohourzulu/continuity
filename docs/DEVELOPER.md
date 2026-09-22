# Developer entry

For a new integration, start with the [Core 0.3 quickstart](CORE-0.3-QUICKSTART.md). It creates fresh identities and permissions through a small API. Try the [installable MCP tool](MCP-PACKAGE.md) when you want an enforcing integration, then the [LangChain recipe](../integrations/langchain-evidence/README.md) or optional [Cedar/OpenFGA examples](../integrations/policy-composition/README.md). [Compatibility and migration](CORE-0.3-MIGRATION.md) explains the current bounds.

## Earlier evaluation interfaces

Start with the [standalone JavaScript package and protected-operation example](SDK-QUICKSTART.md). It runs outside this repository using the local SDK tarball, with generated types and no runtime dependencies. Core remains0.2.2; this is an evaluation interface.

The reusable engine is [packages/core-0.2/src/core/index.ts](../packages/core-0.2/src/core/index.ts), version 0.2.2. The evaluation wrapper has its own version; it does not change Core's protocol version or fork the engine. `SOURCE-PROVENANCE.json` binds copied implementation files to the exact source files included in the release.

After running `first-look`, execute this small read-only integration example:

```sh
node examples/read-investigation.mjs first-look
```

This example uses the bounded reader to ask whether B may review and collect another packet. It prints decision, code, head and evaluation time; it never executes the requested action. Each call captures independently. Use `handover_report` for a composite at one snapshot. The [lower-level original example](../examples/check-authority.mjs) also remains available for studying direct engine parameters.

## One small development exercise

1. Run the complete local verification command in [Testing](TESTING.md): `node tools/test.mjs`. It requires Python3.9+ as well as the supported Node runtime and `node tools/setup.mjs`. Prerequisites are checked before tests begin. An import failure, timeout or semantic mismatch is reported as failure rather than counted as a successful denial.
2. Run the tutorial's `first-look` and `no-review-power` cases. The only selected policy difference is `--successor-review deny`; case names create separate histories. Do not edit signed event JSON or its saved hashes to force another decision.
3. Run `node examples/read-investigation.mjs first-look` and `node examples/read-investigation.mjs no-review-power`. Expect ALLOW/DENY then DENY/DENY. This is the changed input's observable effect; it does not create a new engine primitive.
4. Follow the [real stdio MCP example](../integrations/retained-evidence-mcp/README.md). Its default configured `demo` points to the committed synthetic fixture. It does not automatically select your new tutorial case.

For a generated case, use the helper instead of assembling paths by hand:

```sh
node tools/case.mjs status first-look
node tools/case.mjs check first-look review
node tools/case.mjs check first-look collect --json
node tools/case.mjs mcp-config first-look --disclosure summary
```

Use your actual case name. `summary` permits only verify/status/check; `evidence` explicitly allows WHY/RESPONSIBLE/SURVIVES and the composite report. Configuration and host command/argument fields are written beneath runs/CASE with exclusive creation. Repeating identical generation is safe; changed files are never overwritten. Local absolute paths identify this installation and must not be committed publicly. Every client of that server shares the selected disclosure; no signing/write/execution tools are added. Restart to reload configuration. The host fields are illustrative, not a claim of testing every MCP client.

The existing default example-config still exposes only the synthetic committed fixture. Generated configuration selects the named case instead. More detail is in [the MCP reader](../integrations/retained-evidence-mcp/README.md) and [bounded interface](READER.md).

## Where the work happens

| Concern | Source |
|---|---|
| Beginner orchestration | [tutorial/cli.mjs](../tutorial/cli.mjs) |
| Existing application, collection and handover | [application.mjs](../integrations/core-0.2-reference/src/application.mjs) |
| Durable intent admission and invocation | [durable-admission.ts](../packages/core-0.2/src/sdk/durable-admission.ts) |
| Local history | [portable-file-event-store.ts](../packages/core-0.2/src/indexer/portable-file-event-store.ts) |
| Fixed local packet executor | [packet-executor.mjs](../integrations/core-0.2-reference/src/packet-executor.mjs) |
| Typed executor acknowledgments | [portable-adapter-engine.ts](../packages/core-0.2/src/core/portable-adapter-engine.ts) |

The tutorial's trusted single-process operator appends prevalidated revocations to its own synthetic case. It is not a concurrent policy administration endpoint. The source caller contains additional retained capabilities; this walkthrough verifies only the documented commands.

## Put it behind a protected operation

An integration supplies a trusted current event store, independently configured policy/root recognition, runtime/session/role binding, a signer and an approved executor. The coordinator durably admits the intent, checks current control before use and records a typed acknowledgment. An application must route the consequential operation through that boundary and remove alternate credentials or filesystem/network routes. Do not call a tool merely because a model says an earlier query allowed it.

Identity, runtime, role tenure, authority and duty remain separate. On recovery, retain current revocations, consumed limits and unresolved outcomes. Unknown external outcomes require reconciliation; replay does not authorize automatic resend. These are design constraints, not capabilities added by this tutorial.

## Dependencies and builds

Supported Node releases execute the retained TypeScript through its native type stripping; there is no transpiler build or install-time hook for the main tutorial. pnpm's lockfile pins the dependency closure and registry integrity. `viem` is used for fixture signing; Core verification remains the deterministic implementation. Third-party license originals are included under `licenses/`. Run `node tools/verify-package.mjs` to check untouched distribution bytes. For intentional edits use `node tools/test.mjs`; an edited source tree should not pretend to match the original release index. It is an integrity check, not a full product test suite or a signature of publisher identity.

[Optional native build](LINUX-LAB.md) · [Security boundaries](../SECURITY.md)
