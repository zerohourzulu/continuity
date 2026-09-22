# Continuity Core JavaScript package (evaluation)

This is the Node ESM build of the same Core 0.2.2 engine. It includes TypeScript declarations and has no runtime npm dependencies or install scripts. Package version `0.2.2-sdk.1` identifies this packaging experiment, not new protocol semantics. It is private and not published to npm. Supported Node lanes:22.18+ in22.x,24.x and26.x; Linux/macOS evaluation only. This is not a stable general-purpose SDK or an isolation service.

Install the supplied `continuity-core-0.2-0.2.2-sdk.1.tgz` into a separate application:

```sh
npm install --ignore-scripts /absolute/path/to/continuity-core-0.2-0.2.2-sdk.1.tgz
```

```js
import { replayPortable, PORTABLE_REPLAY_VERSION } from '@continuity/core-0.2';
const result = replayPortable({ operationVersion: PORTABLE_REPLAY_VERSION, events });
```

Explicit ESM entry points: the package root (replay, authorization, receipts and queries), `/sdk/admission` (DurableAdmissionCoordinator), `/sdk/receipt` (DurableReceiptCoordinator), `/store` (PortableFileEventStore), `/administration` (signed administrative producers), and `/adapters` (adapter types and simulator). Internal paths are not exported. Types are supplied for each entry. TypeScript applications should use NodeNext module resolution and current Node types; the package does not install a compiler for the consumer. CommonJS, browser and cross-process capabilities are not supplied.

A policy ALLOW is an observation, not a permit to perform an effect. A trusted coordinator must durably admit the signed intent, recheck the original control tuple before invoking its fixed adapter, and retain uncertain outcomes without blind resubmission. Preparations and invocation capabilities are process-local identity objects, not JSON tokens. Hostile-host isolation, trustworthy live history/time, key custody, root recognition and blocking alternate resource access are deployment responsibilities. The local file store is a controlled single-process reference, not a distributed consensus service.

Build provenance lists all source/output hashes and the pinned compiler. Original TypeScript remains the source of truth. Do not edit generated JavaScript. Core licensing is Apache-2.0; LICENSE and NOTICE are included. No private project files or signing secrets are required.
