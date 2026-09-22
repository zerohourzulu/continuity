# Use Core from your own application

This local evaluation packages the unchanged Core0.2.2 engine as JavaScript with TypeScript declarations. Unlike the original source-only entry, it can be installed under `node_modules` without TypeScript stripping. No npm publication or stable API promise is made. See [package/API scope](SDK-PACKAGE.md).

## Try a separate application

Start in the complete Continuity package root, with a standard Node22.18+(22.x),24.x or26.x installation. This example needs neither the root dependency setup nor a compiler. It installs only the supplied local tarball, without contacting a registry or running install hooks.

```sh
CONTINUITY_PACKAGE="$PWD"
consumer_dir="$(mktemp -d)"
cp -R "$CONTINUITY_PACKAGE/examples/sdk-consumer/." "$consumer_dir/"
cd "$consumer_dir"
npm install --offline --ignore-scripts --no-audit --no-fund "$CONTINUITY_PACKAGE/sdk/continuity-core-0.2-0.2.2-sdk.1.tgz"
node demo.mjs
cd "$CONTINUITY_PACKAGE"
```

The script prints and retains a fresh evidence directory each time. Its six scenarios are independent synthetic histories:

| Scenario | Expected result |
| --- | --- |
| Allowed signed request | One local packet containing the two selected synthetic logs; typed acknowledgment recorded. |
| Control epoch changes after admission | No adapter call or packet. |
| Permission is revoked before admission | The old prepared head conflicts; no adapter call or packet. |
| Capability copied into another object | No adapter call or packet; identity cannot be forged by copying fields. |
| Signed request's resource is altered | Not admitted; no adapter call or packet. |
| Selected source bytes change | Outcome remains UNKNOWN; reconciliation does not resubmit. |

The permitted case also repeats invocation and reconstructs a coordinator for retained-evidence reconciliation: neither makes a second submission. Packet bytes are compared with selected inputs. Open the printed `result.json`, individual histories, and `allow/output/packet/manifest.json` to inspect the result.

## What to reuse

[demo.mjs](../examples/sdk-consumer/demo.mjs) is the small application composition: load the trusted fixture/configuration, create a local store and a fixed executor, prepare and durably admit, then invoke using the original capability. The executor is the existing checked packet implementation with only imports redirected to the public package. The build check verifies that relationship. Do not use replay/ALLOW alone to call an executor.

This example intentionally uses already signed PUBLIC fixture requests and fixed synthetic time; it does not generate production identities or trustworthy live history. Reusing its keys or restoring the same fixture into another store is not production-safe idempotency. Each scenario is isolated for demonstration. To change the request/policy legitimately, use the existing tutorial/application signing flow with fresh case identities; editing a signed request is the negative test, not a customization recipe.

The current coordinator checks permission at admission and the original Agent/Session/Epoch/Role control tuple again before effect. Revoking a grant after admission alone is not a general cancellation API. Fence the relevant control tuple when demonstrating pre-use loss of control. A broader cancel-in-flight contract would need a separate semantic design, not a packaging workaround.

The trusted host can directly access these files. The example mediates its own packet path; it is not a sandbox and does not prevent bypass by the host administrator, other credentials or arbitrary plugins. Every real integration must identify its protected resource, enforce the relevant entry point and prohibit alternate access. Unknown effects remain unknown.

## Build, check and pack

The complete distribution contains generated output so consumers need not install build tools. Maintainers rebuilding it explicitly install two pinned development dependencies (TypeScript5.9.3, Node types22.18.6) using the separate lockfile:

```sh
npm ci --prefix tools/sdk-build --ignore-scripts --no-audit --no-fund
node tools/build-sdk.mjs --check
node tools/sdk-parity.mjs
node tools/verify-sdk.mjs
```

For an intentional source change, `node tools/build-sdk.mjs --pack` regenerates only `sdk/core` and the local tarball. Run parity and external-consumer verification afterward. `--check` requires byte-identical emitted JS, declarations and provenance; the external check compares every installed tarball member with that output, loads all six exports with type stripping disabled and type-checks an independent TypeScript application with strict checks. Full `node tools/test.mjs` remains required for behavior changes. Build tooling is separate from normal tutorial dependencies.

The compiler's [relative-extension rewriting](https://www.typescriptlang.org/tsconfig/rewriteRelativeImportExtensions.html) and [declaration generation](https://www.typescriptlang.org/tsconfig/declaration.html) produce the consumable build from one source. No handwritten second engine or unchecked declaration facade is introduced.
