# Give the agent a separate Linux identity

A permission check is useful only if the agent cannot bypass it. This disposable example runs the broker and agent as different Linux users. The agent can connect to the broker's Unix socket, but cannot directly read the source file, history or signing key, or write the source, history or server code.

The broker's private directory is mode0700, and its key/history/configuration files are mode0600. The socket is owned by the broker and allows the agent's group to connect. Its parent directory does not allow the agent to replace it. Both processes run with `no_new_privs`; the agent has no effective capabilities. Operator-owned executable code and dependencies must not be writable by either identity.

## Run the disposable proof

Use a **development Linux machine**, not a production host. You need root to create and remove temporary service users and set file ownership. Install Node and the optional MCP integration first. Place this distribution and its installed dependencies in an administrator-owned, world-readable directory such as a dedicated directory under `/opt`. Do not place it behind a private home-directory permission boundary that prevents the example users from loading the code.

```sh
npm ci --prefix integrations/protected-evidence-mcp --ignore-scripts --no-audit --no-fund
sudo /absolute/path/to/node integrations/protected-evidence-mcp/linux/prove-isolation.mjs --run-disposable-lab
```

The explicit flag matters: the script creates random temporary broker and agent users, a private synthetic case under `/var/tmp`, and two process groups. In `finally`, it stops only those process groups, removes only that temporary case and deletes only those newly created users. It does not change your firewall, SSH, hypervisor or global network configuration. Do not interrupt the operating system during cleanup; inspect the printed failure if cleanup cannot finish.

A passing result lists each direct-access denial, one recorded copy, refusal from the still-live obsolete runtime, and reconciliation of the original operation. It verifies the source bytes stayed unchanged and exactly one canonical consumption was recorded. It uses the official current-protocol MCP client over the local socket.

## What the demonstration establishes

- Separate identities enforce the tested file, history, signing-key and executable-code boundary.
- The permitted request reaches the broker and creates the selected packet.
- The old client and broker stay alive when control advances. A new request is refused; retrying the original operation does not copy again.

This is not a full hostile-code sandbox, network egress policy, resource quota, kernel proof or defense against the host administrator. An agent with extra credentials, inherited resource descriptors or another privileged route would need those routes closed separately. Only the configured local packet tool has the demonstrated actual-effect serialization contract.

`socket-server.mjs` is an explicit local service launcher; `socket-bridge.mjs` runs under the unprivileged agent and carries only MCP bytes. No signing credential is sent across that bridge. There is one active connection per launcher, bound to its configured runtime; use separately configured launchers for separate identities. It is not an HTTP endpoint or a general remote proxy.
