import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import * as original from '../packages/core-0.2/src/core/index.ts';
import * as built from '../sdk/core/dist/core/index.js';
const root=fileURLToPath(new URL('../tests/fixtures/original-core/cases/',import.meta.url));
let cases=0;
for(const name of readdirSync(root)){
 if(!name.startsWith('core02-'))continue;
 const events=JSON.parse(readFileSync(join(root,name,'export/history.json')));
 const call={operationVersion:original.PORTABLE_REPLAY_VERSION,events};
 const a=original.replayPortable(call),b=built.replayPortable(call);assert.equal(a.status,'ACCEPTED');assert.deepEqual(a,b);
 const ask={operationVersion:original.PORTABLE_QUERY_VERSION,observedEvents:events,targetAgentId:`a:${name}`,evaluationTime:a.head.canonicalTime,disclosure:original.portablePublicQueryDisclosure('SURVIVES')};
 assert.deepEqual(original.survivesPortable(ask),built.survivesPortable(ask));
 const input=JSON.parse(readFileSync(join(root,name,'admission.json'))).input;
 assert.deepEqual(original.proposePortableIntentAdmission(input),built.proposePortableIntentAdmission(input));
 cases++;
}
assert(cases>=2);console.log(`PASS: source/emitted replay, survival and signed admission parity for ${cases} original profiles.`);

const source=readFileSync(new URL('../integrations/core-0.2-reference/src/packet-executor.mjs',import.meta.url),'utf8');
const consumer=readFileSync(new URL('../examples/sdk-consumer/packet-executor.mjs',import.meta.url),'utf8');
assert.equal(consumer,source.replace(/from '\.\.\/\.\.\/\.\.\/packages\/core-0\.2\/src\/core\/[^']+\.ts'/g,"from '@continuity/core-0.2'"));
console.log('Existing packet executor preserved exactly except public-package import paths.');
