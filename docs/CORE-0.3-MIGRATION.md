# What this preview supports

Core 0.3 provides an application API and integrations around one shared engine. The original Core 0.2.2 evaluation stays preserved; later attempt-reporting and evidence-review behavior uses explicit E5/E6 history profiles. Existing histories retain their recorded meanings. New local histories carry an explicit local-owner profile; do not point that owner handle at an unrelated deployment's history and expect it to adopt control.

| Area | Supported in this preview |
| --- | --- |
| JavaScript / TypeScript | Compiled ESM and declarations; Node22.18+,24.x,26.x on macOS/Linux. No browser SDK or Windows support claim. |
| Core observation | `authorize`, `why`, `responsible`, `survives` over a captured history; observation gives no execution token. |
| Trusted local owner | Fresh domain/agent/role, direct bounded grants, revocation, appointment, runtime admission and explicit succession. No general delegated-policy editor. |
| Signed runtime | Application-provided signer, session/epoch checks, a recorded review-duty pattern and separately authorized performance assignment. No generic contract/discharge builder. |
| Handover | Two visible, resumable retirement/transfer events. Not an atomic batch; no automatic successor powers. |
| Protected effect | Local evidence copy:8files/64KiB each/256KiB total. The gateway and cooperating remote profile have their own documented dispatch, fencing and recovery limits; no arbitrary async-tool guarantee. |
| MCP | The evidence server supports stdio and a demonstrated local Unix socket. The separate [gateway](MCP-GATEWAY.md) adds approved tools, local authenticated HTTP and selected polling Tasks. See its [compatibility table](../packages/mcp-gateway/COMPATIBILITY.md) for exact tested clients/protocols. No public hosted service or broad desktop/OAuth compatibility claim. |
| Framework | Scripted-model LangChain integration and native tools in the [remote package](../packages/remote-tools/README.md). Versions and supported provider behavior are explicit; no paid-provider test claim. |
| Optional policy | Cedar WASM4.13.0; OpenFGA SDK0.9.7 with server1.21.0. Exact identity/request binding; errors fail closed. OpenFGA tuples are not frozen by model pinning. |
| Host protection | Demonstrated separate Linux user identities and protected files on ARM64. Host administrator trusted; no general sandbox/egress/quota guarantee. |

For new applications use [the fresh-case quickstart](CORE-0.3-QUICKSTART.md), rather than modifying signed fixture events. The original [evaluation SDK](SDK-QUICKSTART.md), reader and tutorial remain available for compatibility and inspection; their example keys are public and must never authorize real resources.

Keep one application-owned operation ID across retries. A request already admitted is only reconciled. Changed arguments, session or selected policy identity conflict with that original ID. UNKNOWN is preserved; do not invent a new ID just to force a retry. A receipt commitment does not reconstruct a lost signed artifact.

Owner handles, configuration, signing callbacks and additional-policy evaluators belong to the trusted host. Never expose them as agent tools. A same-user process can bypass filesystem checks; use the [Linux example](../integrations/protected-evidence-mcp/linux/README.md) to understand the demonstrated boundary. Complete mediation of other resources remains an integration requirement.

Managed writes share a96-event budget with reserved lifecycle/control room; physical free space alone does not permit another job. Read-only inspection still accepts previously supported histories up to256 events, but an incompatible history refuses managed writes. See [capacity and recovery limits](LOCAL-CAPACITY.md). There is no automatic migration, pruning or rollover. It is a local integration preview, not an unbounded production database or credential lifecycle service. These constraints are visible errors, not silent eviction. File locks left by a crashed process require inspection; no automatic stale-lock deletion is provided.

The Core engine modules were preserved rather than rewritten as part of the interface launch. Future extraction can follow existing capture/replay/evaluation boundaries with behavioral parity checks. A production roadmap should be informed by actual integration needs, not by treating this preview as a finished general platform.
