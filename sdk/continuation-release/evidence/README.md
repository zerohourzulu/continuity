# Continuity evidence MCP tool

Let an MCP client collect a fixed synthetic evidence packet only when its configured worker currently has permission. Retrying the same operation inspects its record instead of silently collecting it twice.

After installing the exact package and dependencies:

```sh
continuity-evidence-setup ./my-case
continuity-evidence-demo ./my-case/gateway.json
```

The setup creates private local fixture keys and data. Keep that case directory private. `continuity-mcp --config /absolute/path/to/gateway.json` is the stdio launch used by Registry clients. No model API key or chain is required. This example is different from the separately isolated fixed-bundle read service supplied by continuity-remote.

HISTORY.md explains explicit migration and the optional `historyProfile`/`historyBinding` configuration. Existing `historyFile` cases retain managed 96. The new profile keeps a complete history with finite 1,024-event / 6 MiB limits; migrating does not refresh permission or resolve uncertainty. The signer/configuration and resource selection remain application-owned.

The shared Core performs deterministic authorization. This is a local evidence demonstration, not general hostile-agent containment, production key custody or proof that a real incident was resolved.

Version 0.3.0-preview.10. Release candidate prepared locally; publication status is recorded separately.
