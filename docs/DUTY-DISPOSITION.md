# Finish an investigation without claiming an outside result

This private build records a signed investigation report and an authorized decision to complete it or ask for further attention. A challenge stays visible, and relevant new evidence makes an earlier completion need review. The original outside result remains NOT_PROVEN.

The duty must already exist and have explicitly activated D1 rules in a directory history. See the [API guide and examples](../packages/core-0.3/package-docs/0.3.0-d03.1.md) for permissions, the four review criteria, separate signers, retries and limits.

## Build and try it

Use Node 22.18+ on the 22.x line or Node 24.x, with npm on PATH:

```sh
node tools/setup.mjs
npm ci --prefix tools/sdk-build --ignore-scripts --no-audit --no-fund
node tools/build-duty-disposition.mjs
node tools/build-duty-disposition.mjs --check
node --experimental-strip-types --test tests/core-0.3/duty-disposition*.test.mjs
node tools/disposition-build/verify-installed.mjs /tmp/continuity-disposition-install-check
```

The last command privately packs and installs `sdk/duty-disposition` in a fresh consumer, offline and without lifecycle scripts. It runs JavaScript through public exports, records an actual completion and contest, reopens the case in another process, retries after expiry, and checks strict TypeScript declarations. Supply a Node22 executable as its last argument to also run those installed checks on Node22. No command publishes the package. Test cases use known-public synthetic credentials and temporary local files.

The source suite also exercises invalid and oversized input, independent authority, both signing phases, changed history and clock, selected-path expiry, persistent contests, separate four/two quotas, assignment freshness, old reader refusal and the source MCP evidence reader. Run the wider Node suite with `node tools/test.mjs --node-only`; some existing tests require local socket access. Run `node tools/test.mjs` when Python conformance prerequisites are installed too. These are bounded checks, not production certification.

This is private version `0.3.0-d03.1`. All inherited SDK directories are historical, unchanged builds. Use the D03 builder above, not an inherited release or D02 builder, to reproduce this source. Current installed public packages do not contain this work. Actual protected workflow, coordinated installed readers, Linux verification and release decisions follow separately.
