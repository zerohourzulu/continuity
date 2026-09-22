# Operator path

Start with the [local tutorial](TUTORIAL.md). Its two policy variants answer a practical question: does replacing an investigator accidentally give its successor more power? Both retain an OPEN duty; the selected review permission changes independently.

## Inspect your own run

Use the case name printed by `node tutorial/start.mjs`. In the commands below, replace `CASE` with that name:

```sh
node tools/case.mjs status CASE
node tools/case.mjs check CASE review
node tools/case.mjs check CASE collect
```

For the default run, expect review **ALLOW**, collection **DENY**, and an **OPEN** duty. With `--deny-review`, both permission checks say **DENY**, while the duty stays OPEN. These commands read the saved history; they do not perform either action.

Each answer identifies the history and time it used. By default that is the last recorded event's time, not the current wall clock. Do not treat an earlier ALLOW as permission to act later. A missing or unestablished answer is not permission either.

Add `--json` for structured output. To see both permission decisions together:

```sh
node examples/read-investigation.mjs CASE
```

## When you need more detail

The [reader reference](READER.md) describes `why`, `responsible`, `survives` and `handover_report`. They explain a decision, show recorded attribution, list continuing duties, and summarize a handover. Attribution is a statement about the supplied records, not a legal judgment.

`handover_report` captures one history snapshot for its whole report. Separate commands read separately and can see different histories if another process writes between calls. Successful tutorial runs leave no background writer.

For a read-only MCP connection to your case, see the [developer guide](DEVELOPER.md). Start with summary disclosure; selecting detailed evidence gives every client of that server access to those details.

## Recorded Linux walkthrough

The included visual guide opens an already recorded native Linux episode. It is evidence inspection, not a live dashboard or command executor. From the package root:

```sh
python3 -m http.server 53926 --bind 127.0.0.1 --directory guide
```

Open `http://127.0.0.1:53926/` in your browser. Stop the server with Ctrl-C. It serves only the selected guide/evidence directory and binds only to your own machine. If the port is occupied, choose another local port. Python is optional; it is not required for the CLI tutorial.

The initial native profile follows incident signing, receiver trust, recording, agent-release revocation, reporting-key replacement, preparation and recovery. The other profile shows earlier, separate component demonstrations. They are different histories, not stages in the new tutorial. Select a stage and open its complete evidence downloads. `evidence-sources.json` records the 55 original run files and their provenance.

Native reporter and receiver identities differ. Receiver policy administration/preparation/setup shared the broker UID. The original native reporting keys were declared public fixtures. No actual document release occurred in that recorded episode. A second incident was prepared but never installed. The old acknowledgment remained UNKNOWN after recovery. The guide spells out these boundaries at each stage.

## Before considering operational deployment

Use this release to try the workflow and build a local integration. A real deployment needs its own protected executor, private signing/custody arrangements, trusted administration, current history source, recovery procedure and resource boundaries. Never substitute the public tutorial scalars for operational credentials. No hosted service, monitoring agent or production installation is supplied here.

The optional [Linux lab](LINUX-LAB.md) exercises native file/socket mechanics with harmless data. It is not a complete deployment of the recorded multi-principal service.

