# From download to a useful result

Use macOS or Linux with **Node 22.18+ (22.x), 24.x or 26.x**. Prefer the latest patch of your chosen release. Check `node --version`; standard [Node installations](https://nodejs.org/en/download) include npm. You do not need a wallet, model account, global pnpm, Python or a background service for the examples below.

## 1. Get the complete package

With Git installed, no GitHub account needed:

<!-- quickstart:clone -->
```sh
git clone https://github.com/zerohourzulu/continuity.git
cd continuity
```
<!-- /quickstart -->

Or download the complete source archive and checksum from [Releases](https://github.com/zerohourzulu/continuity/releases). For the evaluation.5 archive, open a terminal in its download folder:

```sh
# macOS; on Linux use: sha256sum -c continuity-v0.2.2-evaluation.5.tar.gz.sha256
shasum -a 256 -c continuity-v0.2.2-evaluation.5.tar.gz.sha256
tar -xzf continuity-v0.2.2-evaluation.5.tar.gz
cd continuity-v0.2.2-evaluation.5
```

Verify the untouched package with `node tools/verify-package.mjs`. This checks file membership and hashes; it is not a publisher signature or a test of your edits. A checksum fetched beside an archive has the trust of that delivery channel. Do not use the retained `website/source/` subset as the current package.

## 2. Inspect a recorded case — Node only

<!-- quickstart:recorded -->
```sh
node examples/recorded.mjs
```
<!-- /quickstart -->

Expect **ALLOW** for B reviewing the investigation and **DENY** for B collecting another packet. The same successor has an unfinished duty without inheriting every power. This replays the bundled synthetic history; it neither generates a new case nor executes the requested action. No dependencies are installed and no files are written.

## 3. Generate and inspect your own case

<!-- quickstart:run -->
```sh
node tools/setup.mjs
node tutorial/start.mjs
```
<!-- /quickstart -->

Setup uses npm to run the pinned package manager locally, installs locked dependencies with lifecycle scripts disabled, and leaves your global pnpm alone. This step needs registry access. It does not start the tutorial or a service. Subsequent tutorial runs are local.

Expect **PASS — duty remains OPEN; B has no collection power**, followed by **VERIFIED** and a new case name. Copy the printed inspection or reader command to return later. Each `start` invocation creates a fresh case; existing results are preserved.

Change one permission in another fresh case:

<!-- quickstart:compare -->
```sh
node tutorial/start.mjs --deny-review
```
<!-- /quickstart -->

B still receives the unfinished duty; its review permission now becomes DENY. This is an intentional result, not an installation failure. For real copies of bundled synthetic files and a signed local note, add `--packet`; it does not export real documents or isolate hostile processes.

## If something fails

Run `node tools/doctor.mjs` for tutorial prerequisites, or `node tools/doctor.mjs --for reader` for the recorded example. The doctor checks local tools only; it never installs anything. [Troubleshooting](TROUBLESHOOTING.md) explains network problems, missing tools and retained partial runs.

Manual equivalent of setup, if you prefer seeing the package-manager command:

```sh
npm exec --yes --ignore-scripts --package=pnpm@11.19.0 -- pnpm install --frozen-lockfile --ignore-scripts
```

## Where next?

- [Tutorial details and expected checkpoints](TUTORIAL.md), including reproducible explicitly named cases.
- [Operator commands](OPERATOR.md) and [developer guide](DEVELOPER.md).
- [Test your changes](TESTING.md). Only the complete test suite additionally requires Python 3.9+.
- [Security boundaries](../SECURITY.md). A historical ALLOW is not fresh execution permission.
