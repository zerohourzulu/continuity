# Give an agent permission, then take it away

Start here if you want to build with Continuity. This example runs in a new application, creates its own history and makes no network calls after installation. You need Node22.18+ (22.x),24.x or26.x on macOS or Linux. No model account, chain account, Python or global pnpm is needed.

Download and extract the complete [Core 0.3 preview](https://github.com/zerohourzulu/continuity/releases/tag/v0.3.0-preview.5.1). Verify its published SHA-256. From the extracted directory:

```sh
package_dir="$PWD"
example_dir="$(mktemp -d)"
cp examples/core-0.3/permissions.mjs "$example_dir/"
cd "$example_dir"
npm init -y
npm install --offline --ignore-scripts --no-audit --no-fund \
  "$package_dir/sdk/continuity-core-0.3.0-preview.5.tgz"
node permissions.mjs
```

You should see:

```text
A job title alone: DENY
With permission: ALLOW
After withdrawal: DENY
After reopening: DENY
```

The history path is printed so you can inspect it. The example creates a role, grants bounded permission, withdraws it and reopens the saved history. Reopening does not restore the withdrawn permission. Nothing reads or publishes a document: these are permission questions.

## Make it do one real thing

Try the [protected MCP evidence package](MCP-PACKAGE.md). Its fresh demo copies synthetic files only after checking the agent's current authority. It produces one packet; repeating the same operation ID reconciles that attempt. The instructions explain why a same-user demo is not yet a security boundary against your own process.

## Hand over work

The source package includes `examples/core-0.3/handover.mjs`. It signs an effect-free operation, records a receipt and review duty, retires the first runtime, and separately assigns the surviving duty to a successor. From a new application directory:

```sh
cp "$package_dir/examples/core-0.3/handover.mjs" .
cp "$package_dir/examples/core-0.3/signing/package.json" .
cp "$package_dir/examples/core-0.3/signing/package-lock.json" .
npm ci --ignore-scripts
npm install --offline --ignore-scripts --no-audit --no-fund \
  "$package_dir/sdk/continuity-core-0.3.0-preview.5.tgz"
node handover.mjs
```

Expect `Old live process: RUNTIME_NOT_CURRENT`, `Replacement can read? DENY`, `Duty: OPEN`, and `Repeated operation: RECONCILIATION_ONLY`. The old process is still alive, but its old authority cannot start new work. The replacement inherits a duty without automatically gaining permission to read.

## Pick your next step

- [API reference](CORE-0.3-API.md): short methods and their exact limits.
- [LangChain example](../integrations/langchain-evidence/README.md): actual agent loop, scripted model, no paid calls.
- [Cedar/OpenFGA](../integrations/policy-composition/README.md): add your existing access policy.
- [Public tests](CORE-0.3-TESTING.md): reproduce the behavior independently.
- [Compatibility and migration](CORE-0.3-MIGRATION.md): what is supported and what remains your application's responsibility.

The package name `@continuity/core` is provisional and local to these tarballs. Use the supplied archive while npm publisher ownership is being set up. If a command fails, keep the exact error and your Node version; the repository's Issues page welcomes synthetic reproductions without keys or private incident data.
