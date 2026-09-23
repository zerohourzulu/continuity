# Connect your local MCP client

The gateway needs three things: Node, its installed program, and a private case chosen by the operator. This helper prints the client configuration using full paths, so a desktop app does not have to find Node on its PATH. It does not start a server or edit your settings.

## Try a synthetic case first

Use Node 22.18+ on the 22.x line or Node 24 on macOS/Linux. From this source checkout:

```sh
npm ci --prefix packages/mcp-gateway --ignore-scripts
node packages/mcp-gateway/examples/setup.mjs "$HOME/continuity-demo-case"
node tools/mcp-client-config.mjs --client vscode --gateway-dir packages/mcp-gateway --config "$HOME/continuity-demo-case/gateway.json"
```

The setup command creates a new private case with disposable keys and two synthetic tools. It refuses to overwrite an existing case. Choose a different directory name if necessary. Do not put the case or keys in your repository or give the agent direct access to them. Running under one unrestricted OS user is a demonstration, not a sandbox.

If you already installed the npm package in an application, use that installation's directory with `--gateway-dir`, for example `./node_modules/@ramex-labs/continuity-mcp-gateway`. This helper supports exactly gateway preview.8. It does not silently select or download a newer release.

## Choose the format your client reads

| Helper option | Output | Where to use it |
| --- | --- | --- |
| `--client vscode` | `servers` object, explicit stdio type | VS Code's MCP configuration editor / `.vscode/mcp.json` format. Prefer a user-local configuration for private paths. |
| `--client claude` | `mcpServers` object | Claude Desktop's MCP configuration. Open it through the app's developer settings. |
| `--client portable` | `mcpServers` object | Clients that explicitly document this portable format; verify your client's requirements. |

Copy the **continuity-gateway entry** into the existing matching object. Do not replace your whole settings file if it contains other servers. Keep each string in the `args` array separate; do not join it into a shell command. Spaces in paths are handled as data. The output contains local paths, so keep it private.

VS Code distinguishes its `servers` format from the portable `mcpServers` format read by the Agent Host. Use the format your chosen settings editor expects. The helper neither enables automatic tool approval nor changes client sandbox/trust settings. Review the command and the client approval prompt before starting it.

The generated command uses the Node executable that ran this helper and the selected installation's CLI. If you move either installation, regenerate the fragment. For remote development, the paths must exist on the machine that actually starts the MCP server; a Mac path is not a Linux-container path.

## What should happen?

After your client starts the server, its tool catalog should include `read_incident`, `create_incident_ticket`, `continuity_status` and `continuity_why` for the synthetic case. Reading the incident and creating its ticket are separate approved jobs. Repeating the same ticket job inspects the original result; it does not create a second ticket. A changed title is not permission to create another business job.

You can see the full behavior without connecting an account or paying for a model:

```sh
npm run demo --prefix packages/mcp-gateway
```

That demo uses its own temporary case. The helper's generated launch command has also been exercised with the SDK client. **This does not certify every desktop version or GUI workflow.** No personal desktop settings or paid model account were used for that check.

## If setup stops

- **UNSUPPORTED_RUNTIME:** run the helper with a supported Node version. Node 26 is supported elsewhere in Core, but not by this gateway profile.
- **GATEWAY_UNAVAILABLE:** select a trusted gateway preview.8 directory containing package.json and src/cli.mjs. Install dependencies before starting it. The helper checks metadata and file presence; it does not authenticate downloaded software.
- **CONFIG_UNAVAILABLE:** choose an existing regular, non-shared case file in a private directory. Links, shared file permissions and hard-linked case files are refused. The helper does not change permissions. Use the supplied setup for a new synthetic case; do not relax protection on real keys to make an example run.
- **GATEWAY_CONFIGURATION_UNAVAILABLE after launch:** the gateway rejected the actual case configuration or its contents. The helper deliberately does not read case contents, keys or histories, and therefore cannot establish that a case is valid or currently authorized. Consult the [operating guide](../packages/mcp-gateway/OPERATIONS.md).
- **Host already active:** stop the old client session normally. Do not delete its ownership record to start another copy. Follow the operating guide for a proven-dead host.

Read the [full gateway boundary](MCP-GATEWAY.md) before configuring real tools. A client configuration grants no authority, and ordinary upstream tools may finish after revocation.

Format sources, checked 23 September 2026: [VS Code configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration), [official MCP desktop quickstart](https://github.com/modelcontextprotocol/docs/blob/main/quickstart/user.mdx). These describe configuration formats, not a claim that these GUI applications were exercised here.
