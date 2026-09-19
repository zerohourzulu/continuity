# Setup and troubleshooting

## Install once

Install Node.js 24.x from [the official Node site](https://nodejs.org/en/download). Use the official installer appropriate to your OS; no project-supplied Node executable is bundled. Node's standard distribution includes npm. Install the pinned package manager with `npm install --global pnpm@11.19.0` if it is absent. A user-managed Node installation avoids needing administrative privileges for package-manager installation.

Check `node --version` (v24.x) and `pnpm --version` (11.19.0), then use the README's frozen-lockfile install. Network access to the npm registry is required for the first dependency download. Do not remove the lockfile or enable install scripts to fix a download failure. Once dependencies exist, the tutorial needs no network.

Use a real local directory, not a symlinked checkout. On macOS, `pwd -P` shows the resolved directory; extract under your home rather than `/tmp` if a tool creates aliases. Windows is not verified by this candidate; use a Linux VM/WSL environment only with its own validated filesystem behavior.

## Understand failures

| Message | What to do |
|---|---|
| Cannot find package `viem` | Run the documented frozen install in the package root. |
| Node version/TypeScript parsing error | Select Node 24.x and confirm the shell resolves it. |
| Case already exists | Use a new `--case` name. Existing and partial evidence is retained. |
| DIRECTORY_MUST_NOT_BE_ALIASED | Use a physical local directory, without symlinked parents. |
| Invalid mode/option/name | Read `node tutorial/cli.mjs --help`; options must be explicit and unique. |
| Evidence changed / history rejected | Preserve the directory and compare the changed files. Do not replace the saved hashes to claim a pass. |
| Missing package file | Re-extract the supplied candidate or obtain its complete Git tree; old private component archives are not required. |
| Port already occupied | Choose another port for the optional guide server. |
| Native Linux error | Check the native contract, filesystem, UID, permissions and headers. Do not disable enforcement. |

A tutorial error exits nonzero. It does not automatically repair, retry or delete a partially created case. After diagnosing the cause, choose a new case name. No running daemon is left behind by the CLI.

To start a review of an issue, retain the command, Node/platform version, non-sensitive error text and synthetic case evidence. This package configures no telemetry or automatic issue upload. Do not include operational credentials or real confidential documents.
