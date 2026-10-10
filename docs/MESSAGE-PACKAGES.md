# Read saved output in plain language

The installable preview now provides `continuity-explain` and `@ramex-labs/continuity/messages`. Read [the current release guide](CURRENT-RELEASE.md) for the exact four-package set. The command is optional and read-only: existing API results, machine codes, JSON-RPC messages and retry policy stay unchanged. It has no live operator-state access or verifier backend.

Run `npx --no-install continuity-explain --help` after installing Core. For a gateway startup code use `npx --no-install continuity-explain --surface gateway --code GATEWAY_CONFIGURATION_UNAVAILABLE`. For a saved standard JSON-RPC parse or parameter error use `npx --no-install continuity-explain --surface mcp < saved-error.json`. Keep the original record and exit code; the explanation neither authenticates the record nor makes a restart safe.

The accepted saved-record renderer is shipped with its bounded strict JSON parser and fixed catalogue. The npm entry point resolves symlinks correctly and advertises installed command syntax. These are packaging adaptations; policy and proof behavior are unchanged. Other explicit historical formats remain explanation-only; their availability does not install a historical proof kit or add a ZK API.
