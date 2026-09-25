# Private D03 installed consumer

After the existing D03 SDK builder has completed, run with a local Node 24 binary:

```sh
node tools/disposition-build/verify-installed.mjs /absolute/log-directory /absolute/node22/bin/node
```

The optional final argument adds Node 22 runtime checks. The runner uses the npm
executable selected by the existing release helper from PATH with the running
Node first, existing TypeScript 5.9.3 / Node types under
`tools/sdk-build/node_modules`, and existing `viem/accounts` solely to sign with a
known-public synthetic test credential. It downloads nothing and publishes
nothing. Packing/installing use an isolated temporary cache, offline mode,
ignored scripts, and separate empty npm user/global configurations. Commands have
a 120-second timeout, and extra positional arguments are refused.

`installed-consumer.mjs` is copied into a clean temporary npm consumer. All
Continuity behavior imports installed public export paths. It creates an E5
unknown attempt and duty, explicitly migrates to segmented storage, grants the
exact activation permission, activates, records a two-signature completion and a contest, inspects, and retries. A second process
reopens and retries after grant expiry without signing or appending.

`installed-consumer.mts` checks public host/history/store/duty types with strict
TypeScript and library checking enabled, including six expected rejections.
The runner compares all packed files to installed bytes and verifies that
inherited SDK files have not changed. Commands, runtime versions, archive
identity, file counts and individual checks are recorded in `installed-*.log`.
Temporary installs and synthetic histories remain in the resolved system temporary directory for
inspection. These bounded checks are integration evidence, not final acceptance.
