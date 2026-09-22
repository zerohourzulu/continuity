# Independent local application

Copy this directory to a new location, install the supplied `continuity-core-0.2-0.2.2-sdk.1.tgz` with `npm install --offline --ignore-scripts /absolute/path/to/archive.tgz`, then run `node demo.mjs`.

Only the installed public SDK exports are imported. `packet-executor.mjs` is the existing reference executor with import paths redirected. `admission.json`, `case.json` and input/ are public synthetic fixtures, not credentials or live data. Each run preserves fresh temporary evidence and prints its location. Six cases cover actual packet creation, control loss, stale preparation after revocation, forged capability, changed signed request and uncertainty without resend. No network, model, chain transaction or real document is used.

The host is trusted and the clock is synthetic. Grant revocation after admission is not general cancellation; current control tuple fencing is demonstrated. Do not use fixture keys/domains or direct executor calls in a deployment. Full source package docs/SDK-QUICKSTART.md explains the boundary and production responsibilities. The application is Apache-2.0 as supplied in the complete distribution.
