# Current source: MCP security update

Source preview.13 updates active MCP client/server/core pins to 2.2.0 for GHSA-6qxp-vccf-f47h. See [scope and installation](https://github.com/zerohourzulu/continuity/blob/main/docs/MCP-SDK-SECURITY-UPDATE.md).

Gateway preview.12 and evidence preview.13 are prepared in `sdk/security-release` and have not been published to npm or the MCP Registry. Core preview.11 and remote preview.6 archives are unchanged. The earlier published package tuple and Registry descriptors remain available as historical immutable versions.

# Message package preview — 10 October 2026

Source preview.12.1 coordinates Core preview.11, remote preview.6, gateway preview.11 and evidence preview.12. All four integrations use one exact Core. Earlier package versions, archives and stable/latest tags stay available.

The accepted plain-language saved-record renderer is now installable as `continuity-explain` and `@ramex-labs/continuity/messages`. It explains fixed, explicitly selected contexts, rejects malformed or ambiguous input, and excludes private payload fields. The optional command does not authenticate a record, inspect live state, check a proof, grant authority or make retry safe. Original outputs and exit codes must be retained.

All174 existing runtime and declaration files in the four packages are byte-identical to the prior tuple. New files provide explanations; exact dependencies, package metadata and documentation are updated. API results, machine codes, MCP wire responses, authorization and retry policy are unchanged. Historical explanation formats do not install a historical proof kit or add a ZK API.

[Installation and exact versions](https://github.com/zerohourzulu/continuity/blob/main/docs/CURRENT-RELEASE.md) · [Message guide](https://github.com/zerohourzulu/continuity/blob/main/docs/MESSAGE-PACKAGES.md) · [Investigation walkthrough](https://github.com/zerohourzulu/continuity/blob/main/docs/INVESTIGATION-WALKTHROUGH.md).

Fresh installed checks cover strict public types, the npm symlink command, private-field exclusion, input refusal, one shared Core, authenticated MCP and native LangChain, restart/recovery and continued evidence. Package builds reproduce exactly. The failed first packaging check is retained: a derived install lock created circular build provenance. It was excluded from input provenance, while the release file index still pins it. No policy/runtime implementation changed in that repair.

The experimental ZK annex and its already-completed source/results retain their existing scope. No capture, Q check, guest/native/proof build or proof run is repeated by this package release. This remains a finite trusted-local preview, not a whole Core/API/privacy or production certification.
