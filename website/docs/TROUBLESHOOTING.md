# Setup and recovery

Start at the [quickstart](https://github.com/zerohourzulu/continuity/blob/main/docs/QUICKSTART.md). Use Node22.18+ within22.x, Node24.x or Node26.x on macOS/Linux; prefer the latest patch of your chosen release. `node --version` shows the runtime your terminal uses. A standard [Node distribution](https://nodejs.org/en/download) includes npm. No global pnpm installation is required.

## Check before installing

```sh
node tools/doctor.mjs --for reader
node tools/doctor.mjs --for setup
node tools/doctor.mjs --for tutorial
node tools/doctor.mjs --for test
```

Choose the check for your path: reader needs only Node; setup also needs npm; tutorial needs installed dependencies; the complete test suite additionally needs Python3.9+. These commands never install or alter files. If `node` itself is missing, install it and open a new terminal before running the doctor.

## Common problems

| Symptom | What to do |
|---|---|
| `node` or `npm` not found | Install a supported standard Node distribution; reopen the terminal and check PATH. No administrator-level pnpm install is needed. |
| Unsupported Node version | Select a supported release. Node20/older22, odd-numbered and unknown future majors are not claimed compatible by this edition. |
| Missing `viem/accounts` or tutorial dependencies | From the complete package, run `node tools/setup.mjs`. The recorded reader does not need these dependencies. |
| Registry/proxy/download error | Check your network and organization-approved npm registry/proxy configuration. Setup uses npm/pnpm's normal configuration and caches. Retry setup; keep the lockfile and disabled install scripts. Do not bypass TLS or put registry credentials in public files. |
| Setup timeout | Slow/protected networks may need the explicit manual command in the quickstart. No tutorial has started. Retain the error; do not delete the lockfile. |
| Python missing during full verification | Install Python3.9+ as `python3`. `node tools/test.mjs --node-only` runs an explicitly incomplete subset. The full command checks Python before beginning any suite. |
| Case already exists | Run the printed inspect command or use `node tutorial/start.mjs` to create a fresh case. No evidence is overwritten. |
| No completed result for a case | Check its printed name. A partial run may remain; keep it for diagnosis and choose a fresh case after correcting the cause. |
| `FILE_REQUIRED` / `SOURCE_UNAVAILABLE` | Use the explicit history path from your run and check read permission. For a ready-made example: `node examples/recorded.mjs`. |
| Package verification reports changed/extra files | For an untouched download, re-extract and check its published checksum. For intentional edits, run product tests instead; do not rewrite the original index to hide changes. |
| Permission/path error | Use a writable local directory. Spaces and a normal checkout alias work in the tested tutorial; protected-resource/native paths have their own stricter rules. Try the physical path from `pwd -P` when diagnosing aliases. |
| DENY with reader exit3 | A completed authorization decision, not necessarily setup failure. Compare with the expected result in the guide. Exit2 is a usage/read/setup error; exit4 is an unestablished or indeterminate result. |

Windows is not validated. WSL/container support should be evaluated on its own filesystem and process behavior; do not assume the Linux native lab works through every mount. The optional native Linux lab retains its separate Node24/header/kernel requirements.

## What is retained?

Tutorial output is in `runs/CASE` and `integrations/core-0.2-reference/cases/CASE`. There is no background service. To clean up, manually delete only those two matching case directories after saving evidence you need. No helper automatically deletes or repairs partial runs, rewrites history, resends actions or restores authority.

No network is required for the recorded reader or an installed tutorial. Offline first installation is not supplied as a bundled-dependency product; use approved npm/pnpm caches or an installation prepared for your environment. A browser-only recorded walkthrough is available at [the public site](https://continuity.ramex.com/).

For an issue, retain the source version, command, Node/platform version and non-sensitive error text. Synthetic evidence can help reproduce it. No telemetry or automatic report upload is configured; never attach operational keys, real confidential records or registry credentials.
