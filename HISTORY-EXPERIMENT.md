# H02 — a verified history that can continue beyond the old facade

Private development increment based on public source `9d68811d7e654cea65f2b3b5023c131d1420858b`. Completed public releases, SDK directories and tarballs included in this source remain historical snapshots; they do not include this experiment. The new private package is `sdk/history-experiment`, version `0.3.0-h02.1`, with `private: true`. Do not publish this source tree or run the old release builder expecting the old SDK to match changed source. H06 will select coordinated release versions after integration.

## What works here

Capture a complete canonical history once into an immutable process-local handle. Authorization, admission proposals, signed administrative preparation, receipts and historical queries reuse the existing engine. The original array interfaces and managed96 runtime retain their limits. The new interface permits at most1,024 events and6 MiB of canonical event bytes; it is still finite. Existing graph and output limits still apply.

This is the foundation for the next storage increment, not a running continuation service. `appendContinuationEvent` performs prospective full replay in memory. It writes nothing, reserves nothing and confers no permission to invoke an adapter. A verified handle is evidence of this captured history, not proof of its currentness. Copied or serialized handle descriptors do not work; reconstruct from the complete history and independently known head. Handles are retained only while referenced; a WeakMap holds their replay state.

## Reproduce locally

Use Node22.18+ or24. Dependencies are development tools only; no new runtime dependency is introduced. From this source directory:

```sh
npm ci --ignore-scripts
npm ci --prefix tools/sdk-build --ignore-scripts
node --experimental-strip-types --test tests/core-0.3/history.test.mjs
node --experimental-strip-types --test tests/core-0.3/runtime.test.mjs tests/core-0.3/lifecycle.test.mjs
node tools/build-history-experiment.mjs --check
node tools/check-history-installed.mjs
node --experimental-strip-types tests/core-0.3/fixtures/history-measure.mjs
node --experimental-strip-types tests/core-0.3/fixtures/history-measure.mjs --wide
```

The installed check packs and installs into a temporary directory, compares every installed byte, imports the named history export, performs a signed review, checks TypeScript declarations, and removes its temporary consumer. It uses offline npm and a temporary npm cache. Build regeneration is `node tools/build-history-experiment.mjs`; it replaces only the private generated directory, never `sdk/core-0.3` or existing archives.

The fixture's repeated11 signing key is a public synthetic test credential, never a deployment credential. No command contacts a service, publishes, accesses a real case or performs an external business operation. The wide measurement intentionally checks safe output exhaustion; it does not assert that the entire graph can be explained within the old output budget.

## Boundaries to carry into H03

- Original domain, complete canonical history and every original position/hash remain. No suffix reconstruction or persisted state brand.
- New history capture:1,024 events,6 MiB summed canonical event bytes,524,288 counted nodes. Per event:8 KiB,512 nodes,depth16,32 cumulative nested-array members. Ancillary input:64 KiB/8,192 nodes. A node is a container, scalar or record key; repeated occurrences count separately.
- Two full6 MiB histories plus ancillary/envelope space remain below the shared16 MiB operation capture limit. This bounds encoded canonical input, not total process memory or worst-case latency. No wire/storage encoded-byte promise is made before H03/H04 enforce their formats.
- A history that captures successfully may still exceed a query/proof/output budget. Preserve INDETERMINATE/OUTPUT_LIMIT_EXCEEDED. More events cannot silently turn an unknown answer into DENY or ALLOW.
- Signed administration checks prospective event size before its signer. Receipt creation signs an artifact only; capacity for its later record must be reserved by the future coordinator.
- After asynchronous signing, a future live coordinator must recheck actual head, current time, session and authority under its writer protocol. Pure historical preparation is deliberately reusable and cannot replace that check.
- H03 must implement writer locking, full-history reservation, durable segments, exact conditional head/instance/generation and explicit migration. H04 must make remote/MCP/readers select or clearly refuse the profile. H05 supplies the protected resource workflow. H06 reviews and prepares a release.

## Known finding

Denial evidence includes authority-relevant event references for each unsuccessful authority path. A wide graph therefore reaches the existing4,096 evidence-occurrence budget even with fewer than1,024 events. This increment keeps the explicit safe refusal and an old/new parity regression. It does not change engine semantics or promise unlimited graph width.
