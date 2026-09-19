# Operator path

Start with the [local tutorial](../source/docs/TUTORIAL.md). Its two policy variants answer a practical question: does replacing an investigator accidentally give its successor more power? Both retain an OPEN duty; the selected review permission changes independently.

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

The optional [Linux lab](../source/docs/LINUX-LAB.md) exercises native file/socket mechanics with harmless data. It is not a complete deployment of the recorded multi-principal service.
