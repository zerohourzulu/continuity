# Continuity Core 0.2 — agents change; responsibility remains

**Public evaluation edition 2 · local reference software · not yet published**

An agent investigating a suspicious document may disappear, be replaced, or lose permission. What may its replacement do? What happens to the unfinished investigation? Can the old agent still act?

Continuity records authority, actions and unfinished duties in a replayable history. This tutorial lets you **run those decisions**, inspect the evidence, and change one permission to see a different result. It uses the same Core 0.2.2 engine as the retained security reference. No AI subscription, wallet, blockchain node or cloud service is needed.

## Choose your starting point

| You want to… | Start here |
|---|---|
| Understand the idea without installing anything | [Five-minute explanation](../source/docs/START-HERE.md) |
| Run it and see the result | The commands below, then [the walkthrough](../source/docs/TUTORIAL.md) |
| Inspect recorded Linux enforcement evidence | [Operator guide](../source/docs/OPERATOR.md) |
| Integrate a deterministic authority check | [Developer guide](../source/docs/DEVELOPER.md) and [working example](../source/examples/check-authority.mjs) |
| Try native Linux boundary mechanics | [Optional disposable Linux lab](../source/docs/LINUX-LAB.md) |
| Assess suitability or limitations | [Security and scope](../source/SECURITY.md), [release notes](../source/CHANGELOG.md) |

## Run the tutorial

Use **macOS or Linux, Node.js 24.x and pnpm 11.19.0**. Check `node --version` and `pnpm --version`. Standard Node installations include npm; if needed, install the selected package manager with `npm install --global pnpm@11.19.0`. See [setup and troubleshooting](../source/docs/TROUBLESHOOTING.md).

Until publication, extract the supplied source archive or clone the supplied private staging checkout. Once this exact candidate is published, its intended repository is `https://github.com/zerohourzulu/continuity`. That public repository is not asserted to contain this candidate yet.

From the directory containing this README:

```sh
pnpm install --frozen-lockfile --ignore-scripts
node tools/verify-package.mjs
node tutorial/cli.mjs run --case first-look
node tutorial/cli.mjs inspect first-look
```

The first command downloads locked open-source dependencies. After installation, the tutorial runs locally without network access. No installation scripts run. No bundled Node binary or old development archive is required.

Expected ending:

```text
PASS — duty remains OPEN; B has no collection power.
Evidence: runs/first-look/result.json
Replay: node tutorial/cli.mjs inspect first-look
```

`inspect` starts a fresh process, checks retained evidence hashes and replays the history. It reports `VERIFIED first-look`, an `OPEN` duty assigned to B, and the old request `DENIED` with its executor never invoked.

Now change one policy:

```sh
node tutorial/cli.mjs run --case no-review-power --successor-review deny
node tutorial/cli.mjs inspect no-review-power
```

B still inherits the OPEN duty, but its review decision changes from **ALLOW to DENY**. This is the central distinction: responsibility can survive without power being silently expanded.

To also create a real local packet of the two synthetic logs and record a signed review note:

```sh
node tutorial/cli.mjs run --case local-packet --mode packet
```

Only local test files are written. No document is sent to another person or system. See [expected stages and files](../source/docs/TUTORIAL.md). Existing case names are refused; choose a new name to repeat.

## What this is useful for

For an operator, this makes a replacement's powers and unfinished work explicit. For a developer, it supplies a deterministic decision/history layer to integrate with a protected executor. The tutorial is a small incident-review story; it does not detect attacks or run an autonomous defender.

The included Linux guide shows previously recorded enforcement observations. The easy tutorial itself assumes a trusted host and public test signing keys. It is **not a sandbox, production credential system, hosted product, or proof of a secure operating system**. A service must prevent alternate routes around its checks. [Exact boundaries](../source/SECURITY.md).

All tutorial sources, selected evidence and documentation travel in this Git tree. Generated cases and installed dependencies are ignored. `PACKAGE-FILES.json` identifies the immutable distribution; `SOURCE-PROVENANCE.json` identifies reused source and evidence. The 48 private historical archives are intentionally not needed.

[Candidate status and publication decision](../source/RELEASE-STATUS.md) · [Apache 2.0 license](../source/LICENSE) · [Third-party notices](../source/THIRD-PARTY-NOTICES.md)
