> **Prepared continuation release:** To evaluate the new local archives in this source, follow [supported profiles](SUPPORTED-PROFILES.md) and [the exact installed checks](CONTINUATION.md#reproduce-the-evaluation). The public download/install commands below intentionally describe the preceding published release; they do not install this candidate.

# Give an agent permission, then take it away

Start here if you want to build with Continuity. This example runs in a new application, creates its own history and makes no network calls after installation. You need Node22.18+ (22.x),24.x or26.x on macOS or Linux. No model account, chain account, Python or global pnpm is needed.

Download the **complete source archive** and its checksum from [Core 0.3 preview.8.2](https://github.com/zerohourzulu/continuity/releases/tag/v0.3.0-preview.8.2):

- [continuity-v0.3.0-preview.8.2.tar.gz](https://github.com/zerohourzulu/continuity/releases/download/v0.3.0-preview.8.2/continuity-v0.3.0-preview.8.2.tar.gz)
- [SHA-256 checksum](https://github.com/zerohourzulu/continuity/releases/download/v0.3.0-preview.8.2/continuity-v0.3.0-preview.8.2.tar.gz.sha256)

Choose this named asset, rather than GitHub's automatically generated “Source code” download. In the directory containing both downloaded files:

```sh
shasum -a 256 -c continuity-v0.3.0-preview.8.2.tar.gz.sha256
tar -xzf continuity-v0.3.0-preview.8.2.tar.gz
cd continuity
```

Continue only if the checksum says `OK`. The source release is preview.8.2; its included Core npm package is preview.8. Those are different version numbers for different artifacts. From the extracted directory:

```sh
package_dir="$PWD"
example_dir="$(mktemp -d)"
cp examples/core-0.3/permissions.mjs "$example_dir/"
cd "$example_dir"
npm init -y
npm install --offline --ignore-scripts --no-audit --no-fund \
  "$package_dir/sdk/ramex-labs-continuity-0.3.0-preview.8.tgz"
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

The source package includes `examples/core-0.3/handover.mjs`. It signs an effect-free operation, records a receipt and review duty, retires the first runtime, and separately assigns the surviving duty to a successor. In the same terminal, keep `package_dir` from the first example and create another application directory:

```sh
handover_dir="$(mktemp -d)"
cd "$handover_dir"
cp "$package_dir/examples/core-0.3/handover.mjs" .
cp "$package_dir/examples/core-0.3/signing/package.json" .
cp "$package_dir/examples/core-0.3/signing/package-lock.json" .
npm ci --ignore-scripts
npm install --offline --ignore-scripts --no-audit --no-fund \
  "$package_dir/sdk/ramex-labs-continuity-0.3.0-preview.8.tgz"
node handover.mjs
```

Expect `Old live process: RUNTIME_NOT_CURRENT`, `Replacement can read? DENY`, `Duty: OPEN`, and `Repeated operation: RECONCILIATION_ONLY`. The old process is still alive, but its old authority cannot start new work. The replacement inherits a duty without automatically gaining permission to read.

## Pick your next step

- [API reference](CORE-0.3-API.md): short methods and their exact limits.
- [LangChain example](../integrations/langchain-evidence/README.md): actual agent loop, scripted model, no paid calls.
- [Cedar/OpenFGA](../integrations/policy-composition/README.md): add your existing access policy.
- [Public tests](CORE-0.3-TESTING.md): reproduce the behavior independently.
- [Compatibility and migration](CORE-0.3-MIGRATION.md): what is supported and what remains your application's responsibility.

The npm package is `@ramex-labs/continuity`. Install the exact preview with `npm install --ignore-scripts @ramex-labs/continuity@0.3.0-preview.10`, or use the supplied archive. If a command fails, keep the exact error and your Node version; the repository's Issues page welcomes synthetic reproductions without keys or private incident data.
