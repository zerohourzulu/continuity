> Historical D02 guide. For this source tree, use the [D03 build and disposition guide](DUTY-DISPOSITION.md). The frozen D02 SDK remains unchanged.

# Add investigation rules to an existing case

This private development build adds one step: explicitly choose the investigation rules for an unfinished duty that already exists. The case keeps its original history, permissions, revocations and spent allowance. Activation does not finish the investigation or grant its worker new powers.

This is the D02 implementation. Recording a finding, completing a duty and contesting a finding come next. Those event types are refused by this build. The existing public npm packages do not include this change.

## Build and try it

Use Node 22.18+ on the 22.x line or Node 24.x, with npm on your PATH. Install the pinned source and compiler dependencies, then build and test:

```sh
node tools/setup.mjs
npm ci --prefix tools/sdk-build --ignore-scripts --no-audit --no-fund
node tools/build-duty-activation.mjs
node tools/build-duty-activation.mjs --check
node --experimental-strip-types --test tests/core-0.3/duty-*.test.mjs
```

The new JavaScript package and declarations are in `sdk/duty-activation`, with private version `0.3.0-d02.1`. The builder leaves all earlier SDK directories unchanged. The inherited release builder prepares the preceding continuation release; use the commands above for D02.

To check the actual installed package with the same local dependencies, run `node tools/duty-build/verify-installed.mjs /tmp/continuity-duty-install-check`. This packs and installs privately, offline, without lifecycle scripts; it does not publish. Supply a Node22 executable as the final argument to repeat the installed checks on that runtime. The tool retains temporary case files and logs for inspection.

The tests create their own temporary cases and remove them afterward. They cover actual signatures, permission refusal, a changed history while signing, exact retries, process death, concurrent writers, capacity and earlier-reader compatibility. The capacity tests deliberately approach the existing store limit and take longer than the small examples.

For the host API and a short activation example, see the [package guide](../packages/core-0.3/package-docs/0.3.0-d02.1.md). It exposes `openLocalDutyPolicy` at `@ramex-labs/continuity/duties`. `describe` returns the exact permission to grant; `activate` records the signed selection; `inspect` returns the current view at the observed history head.

## What the host must supply

Use an existing E5 or E6 investigation duty in an explicitly migrated [directory history](MIGRATE-A-CASE.md). Configure its domain, host owner, current runtime session, clock and signing callback. The worker must currently occupy the duty's Role. Its exact activation permission must come from that Role's Principal, with an expiry and without delegation or quantity limits. A broad permission or an unrelated Principal cannot substitute for it.

The source digest identifies the incident material. The host remains responsible for comparing it with the intended file. Activation does not fetch that material, prove its contents, authenticate an institution or verify an outside outcome.

## What changes, and what stays historical

Activation records the fixed `continuity-attempt-disposition/1` rules for one duty and reserves six future records within the existing limits. The current view explicitly says OPEN, outstanding and NOT_PROVEN. Original creation records remain historical; current readers name the selected policy and observed head.

An exact retry returns the original activation and the current view without signing again. Changing the selection under the same operation ID is a conflict. A second activation for the same duty is refused.

New source readers and the new private Core package can replay this history. Older complete-history readers refuse the extension; earlier identified prefixes remain verifiable. The loopback destination check verifies that transferring the new history preserves previously applied results and fences pending work. It does not resend an outside action. Coordinated installed gateway/evidence releases and the full protected-resource walkthrough belong to the later integration step.

The trusted-host, local filesystem, finite-capacity and rollback limits still apply. This is a private implementation step, not a stable or production release.
