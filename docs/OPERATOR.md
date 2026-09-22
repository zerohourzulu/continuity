# Operator path

Start with the [local tutorial](TUTORIAL.md). Its two policy variants answer a practical question: does replacing an investigator accidentally give its successor more power? Both retain an OPEN duty; the selected review permission changes independently.

## Ask the run you just created

Run these from the package directory after the [tutorial](TUTORIAL.md). These commands read the generated `first-look` history, not the separately committed demo fixture:

```sh
node bin/continuity.mjs handover_report --file integrations/core-0.2-reference/cases/first-look/history.jsonl --json
node bin/continuity.mjs why --file integrations/core-0.2-reference/cases/first-look/history.jsonl --actor b:first-look --action record-review-progress --resource obligation:first-look --json
node bin/continuity.mjs responsible --file integrations/core-0.2-reference/cases/first-look/history.jsonl --actor b:first-look --action record-review-progress --resource obligation:first-look --json
node bin/continuity.mjs survives --file integrations/core-0.2-reference/cases/first-look/history.jsonl --agent a:first-look --json
```

| Read this field | Expected meaning |
|---|---|
| `head`, `evaluationTime`, `source` | The supplied history and time this response actually used. Default time is the observed head time, not the current wall clock. |
| WHY `result.answer.authorization.decision` | ALLOW for B's review grant in first-look; this is not an execution capability. |
| RESPONSIBLE `result.answer.attributions` | Typed actor/principal/authority and related evidence where established; no legal judgment. |
| SURVIVES `result.answer.obligations` | The continuing OPEN duty. |
| SURVIVES `result.answer.currentPerformanceAssignments` | B is assigned performance under the named succession rule. |
| Any query's `result.epistemicStatus` | Check that the answer is ESTABLISHED; an unavailable/non-established answer is not permission. |

`handover_report` captures one context for all agents. Separate commands capture separately and can observe different heads if a writer changes the file. The tutorial's successful runs leave no background writer. The [reader contract](READER.md) explains exact scope and error codes.

For a compact two-decision view:

```sh
node examples/read-investigation.mjs first-look
node examples/read-investigation.mjs no-review-power
```

Expect review ALLOW / collection DENY for first-look, then DENY / DENY for no-review-power. Every line identifies its own head/time. Both duties remain OPEN: inspect their tutorial summaries or SURVIVES results. The example does not act on either decision.

## Recorded Linux walkthrough

The included visual guide opens an already recorded native Linux episode. It is evidence inspection, not a live dashboard or command executor. From the package root:

```sh
python3 -m http.server 53926 --bind 127.0.0.1 --directory guide
```

Open `http://127.0.0.1:53926/` in your browser. Stop the server with Ctrl-C. It serves only the selected guide/evidence directory and binds only to your own machine. If the port is occupied, choose another local port. Python is optional; it is not required for the CLI tutorial.

The initial native profile follows incident signing, receiver trust, recording, agent-release revocation, reporting-key replacement, preparation and recovery. The other profile shows earlier, separate component demonstrations. They are different histories, not stages in the new tutorial. Select a stage and open its complete evidence downloads. `evidence-sources.json` records the 55 retained original files and their provenance.

Native reporter and receiver identities differ. Receiver policy administration/preparation/setup shared the broker UID. The original native reporting keys were declared public fixtures. No actual document release occurred in that recorded episode. A second incident was prepared but never installed. The old acknowledgment remained UNKNOWN after recovery. The guide spells out these boundaries at each stage.

## Before considering operational deployment

This candidate supplies an evaluation and developer starting point. A real deployment needs its own protected executor, private signing/custody arrangements, trusted administration, current history source, recovery procedure and resource boundaries. Never substitute the public tutorial scalars for operational credentials. No hosted service, monitoring agent or production installation is supplied here.

The optional [Linux lab](LINUX-LAB.md) exercises native file/socket mechanics with harmless data. It is not a complete deployment of the recorded multi-principal service.

## Shortcuts for a generated case

Use `node tools/case.mjs status CASE` or `node tools/case.mjs check CASE review` with the case name printed by the tutorial. Add `--json` for the original structured result. Each observation prints its own head/time and is not an execution capability. `node tools/case.mjs mcp-config CASE --disclosure summary` generates a read-only configuration for that actual case; evidence disclosure must be selected explicitly. See [Developer entry](DEVELOPER.md).
