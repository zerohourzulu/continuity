# Clients and services tried with this preview

Start with `npm run demo`, `npm run demo:http`, or `npm run demo:tasks`. They use disposable local data. For ordinary tools, a retained reply is not proof that the business operation succeeded. A repeated job retrieves its original attempt instead of sending it again.

## Tested combinations

| Component | Selected path | Demonstrated behavior |
| --- | --- | --- |
| Official TypeScript SDK client 2.0.0 | Modern and legacy stdio; modern authenticated HTTP | Catalog, allow/deny, repeated jobs, caller isolation, expiry/revocation and recovery. |
| MCP Inspector 2.7.0 CLI | Modern authenticated HTTP | Catalog, reading a synthetic file through the approved upstream, and retrieving the original result. Use `--protocol-era modern`. Inspector itself requires Node22.19+; the gateway supports Node22.18 on the22 line and Node24. |
| Apify mcpc 0.6.0 CLI | Modern stdio | Catalog and retrieval of the same business job. Use a dedicated config and `--protocol-version 2026-07-28`. No cloud account or model call is needed. |
| Official filesystem MCP server 2026.8.31 | Explicit legacy stdio upstream | Only its approved `read_text_file` tool is exposed. The test server's allowed directory contains one synthetic file. |
| Included Tasks wire client | Current polling Tasks extension over authenticated HTTP | Durable handle, progress stages, reconnect/restart, cancellation races and lost-result recovery. |

The named CLI checks do not establish their support for this Tasks extension, desktop GUI behavior, a production identity provider or public hosting. They exercise distinct host applications, not another name for the same in-process SDK test.

## Reproduce the optional host check

Install the host applications in a separate empty folder using Node24. The three packages are test dependencies, not gateway runtime dependencies:

```sh
npm install --ignore-scripts --save-exact @modelcontextprotocol/inspector@2.7.0 @apify/mcpc@0.6.0 @modelcontextprotocol/server-filesystem@2026.8.31
```

From the gateway source or installed package:

```sh
node examples/host-compatibility.mjs /absolute/path/to/that/folder
```

The check creates temporary configuration and synthetic credentials, uses a separate mcpc state directory, explicitly names its config entry and closes its session. It does not scan your existing host configurations, use your accounts, or contact a cloud tool. Do not run a downloaded config merely because its filename looks familiar: it may launch code or name a remote endpoint.

## Approve a legacy server explicitly

An approved upstream may set `protocol: 'legacy'`. Otherwise the modern2026-07-28 handshake remains pinned; negotiation does not silently change the selected profile. The [official filesystem server](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) currently uses the older handshake.

The gateway pins the original tool definition, including its input/output schema and annotations. Its client-facing schema additionally closes top-level argument fields with `additionalProperties:false`, so servers that omit that restriction can still be used without letting model arguments add unexpected fields. It never rewrites the expected upstream definition or uses a tool's read-only label as authority. The operator must still constrain the actual paths/accounts/resources the server can reach.

Legacy and modern calls both use the existing no-redelivery path. Unsupported inputs, changed definitions and uncertain outcomes remain refused or explicitly unknown. Requests cannot select the executable, protocol, credentials, role or business identity.

Host documentation: [Inspector CLI](https://github.com/modelcontextprotocol/inspector/blob/main/clients/cli/README.md), [mcpc](https://github.com/apify/mcpc). The exact commands above were exercised with the pinned versions; future versions need their own checks.

The optional `examples/linux-isolation.mjs` checks a prepared Linux lab fixture: the filesystem server runs as `nobody`, its allowed directory contains only a root-owned synthetic document, and the host's disposable key/history are private to the host user. Direct and tool-mediated reads of those files are refused. This is evidence for that separate-user read boundary, not a complete agent sandbox. The script needs the deliberately prepared read-only fixture and passwordless permission to run the selected lab command; it does not create users, install software or change permissions itself. Do not use a production machine or real documents for this check.

## Real browser login

A separate [Keycloak/openid-client/Chrome test](IDENTITY.md) exercises real login, renewal, key changes and persistent binding revocation. It does not extend the Inspector/mcpc results to those applications' interactive OAuth support. The fixed-audience provider limitation remains explicit.
