# Continuity duty activation — private D02 build

This package adds an explicitly authorized investigation policy to an existing case. It preserves the case, its earlier permissions and revocations, and its spent allowance. It does not yet record investigation completion; disposition and contest are the next implementation step.

Use `@ramex-labs/continuity/duties` from this exact local package. Public npm releases do not contain this private version. The host controls the directory-history configuration, clock and signing callback. Agent requests cannot choose a policy module or signing key.

```js
import { openLocalDutyPolicy } from '@ramex-labs/continuity/duties';
const duties = openLocalDutyPolicy(runtimeOptions);
const selection = duties.describe({
  duty: 'investigation',
  incidentSourceDigest: { algorithm: 'sha256', value: sourceDigest },
  attesterRole: 'investigator',
});
owner.grant({
  id: 'activate-investigation', to: 'worker',
  actions: [selection.activationAction],
  resources: [selection.activationResource], expiresAt: expiration,
});
const result = await duties.activate({
  id: 'investigation-policy', descriptor: selection.descriptor,
  activationAuthority: 'activate-investigation',
});
console.log(result.view);
```

`runtimeOptions` uses the existing explicitly migrated segmented-history binding, exact domain/owner/controller, runtime session, trusted `now` callback and `signHash`. The owner grant is trusted host administration, not an authenticated institutional enrollment service. The runtime must currently occupy the duty's Role. Use a finite exact nondelegable uncapped grant under that Role's Principal. Duty assignment alone grants no permission.

An exact activation retry returns the original event and current view without signing again. Changing its descriptor or selected grant under the same ID conflicts. One activation per duty is permitted. Activation reserves six future records inside existing storage limits and leaves the investigation OPEN/outstanding; outside outcome is NOT_PROVEN.

The original creation record is historical. Current readers identify the D1 policy and observed head. Older readers reject the extended history; earlier identified prefixes retain their historical meaning. First migrate a managed96 case using the existing explicit storage procedure. No raw-file D1 writer, automatic policy replacement, capacity reset, external-effect retry or publication is supplied.
