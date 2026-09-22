// Fresh, effect-free example. Keys live only in this process; no model or chain call.
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createLocalDomain, createLocalOwner } from '@ramex-labs/continuity/local';
import { openLocalRuntime } from '@ramex-labs/continuity/runtime';
import { openLocalSimulation, commitTerms } from '@ramex-labs/continuity/simulation';
const folder = mkdtempSync(join(tmpdir(), 'continuity-handover-example-'));
const config = { historyFile: join(folder, 'history.jsonl'), domain: createLocalDomain(),
  owner: 'operations', controller: 'operator', now: Date.now };
const owner = createLocalOwner(config), deadline = Date.now() + 3600_000;
const credentials = () => {
  const account = privateKeyToAccount(generatePrivateKey());
  return { address: account.address, signHash: hash => account.signMessage({ message: { raw: hash } }) };
};
const bea = credentials(), alex = credentials();
for (const [id, key] of [['bea', bea], ['alex', alex]]) {
  owner.createAgent({ id });
  owner.admitRuntime({ session: `session:${id}`, agent: id, epoch: 1,
    key: `key:${id}`, address: key.address, expiresAt: deadline });
}
owner.createRole({ id: 'reviewer' });
owner.declareSuccession({ id: 'replacement', from: 'bea', to: 'alex', role: 'reviewer' });
owner.appoint({ agent: 'bea', role: 'reviewer', tenure: 'first-shift', number: 1, succession: 'replacement' });
owner.grant({ id: 'collect', to: 'bea', actions: ['read', 'OBLIGATE'], resources: ['incident:42'], expiresAt: deadline });
owner.grant({ id: 'review', to: 'alex', actions: ['record-collection-disposition'], resources: ['review:42'], expiresAt: deadline });
const first = { ...config, session: 'session:bea', signHash: bea.signHash };
const simulation = openLocalSimulation(first);
const operation = { id: 'collect:42', action: 'read', resource: 'incident:42', role: 'reviewer', tenure: 'first-shift',
  termsCommitment: commitTerms({ work: 'Collect synthetic material for review.' }) };
console.log('Simulation:', (await simulation.run(operation)).invocation.status);
console.log('Signed receipt:', (await simulation.recordReceipt(operation)).recording.status);
await openLocalRuntime(first).obligate({ id: 'review:42', operation: operation.id,
  description: 'Review the material and account for unresolved questions.', deadline,
  succession: 'replacement', reviewAuthority: 'review' });
owner.succeed({ id: 'replace:42', rule: 'replacement', fromAgent: 'bea', fromTenure: 'first-shift',
  toAgent: 'alex', toTenure: 'second-shift', role: 'reviewer', number: 2 });
try { await simulation.run({ ...operation, id: 'obsolete:42' }); }
catch (error) { if (error.code !== 'RUNTIME_NOT_CURRENT') throw error; console.log('Old live process:', error.code); }
console.log('Replacement can read?', owner.authorize({ actor: 'alex', action: 'read', resource: 'incident:42' }).decision);
owner.grant({ id: 'assignment', to: 'alex', actions: ['ASSIGN_PERFORMANCE'], resources: ['review:42'], expiresAt: deadline });
await openLocalRuntime({ ...config, session: 'session:alex', signHash: alex.signHash }).assign({ id: 'assign:42', obligation: 'review:42' });
console.log('Duty:', owner.survives('bea').answer.obligations.find(duty => duty.obligationId === 'review:42').status);
console.log('Repeated operation:', (await openLocalSimulation(first).run(operation)).status);
console.log('History:', config.historyFile);
