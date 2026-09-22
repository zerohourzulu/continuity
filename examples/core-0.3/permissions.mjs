// Your own case: no raw events, fixture identities, keys or dependencies.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalDomain, createLocalOwner, openLocalOwner } from '@ramex-labs/continuity/local';
const directory = mkdtempSync(join(tmpdir(), 'continuity-permissions-'));
const options = {
  historyFile: join(directory, 'history.jsonl'),
  owner: 'operations', controller: 'local-operator', now: () => Date.now(),
  domain: createLocalDomain(),
};
// This domain is a local namespace. No chain is contacted.
const continuity = createLocalOwner(options);
continuity.createAgent({ id: 'bea' });
continuity.createRole({ id: 'investigator' });
continuity.appoint({ agent: 'bea', role: 'investigator', tenure: 'bea-first-shift', number: 1 });
const question = { actor: 'bea', action: 'read', resource: 'incident:42' };
console.log('A job title alone:', continuity.authorize(question).decision);
continuity.grant({ id: 'incident-access', to: 'bea', actions: ['read'], resources: ['incident:42'], expiresAt: Date.now() + 60_000 });
console.log('With permission:', continuity.authorize(question).decision);
continuity.revoke('incident-access');
console.log('After withdrawal:', continuity.authorize(question).decision);
console.log('After reopening:', openLocalOwner(options).authorize(question).decision);
console.log('History:', options.historyFile);
console.log('These are permission observations. No document was read or released.');
