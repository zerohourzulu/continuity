import {readFileSync} from 'node:fs';
import {runProtectedScenario} from './scenario.mjs';
if(process.argv.length>3)throw Error('Use: investigation-scenario.mjs [LINUX_IDENTITIES_JSON]');
const identities=process.argv[2]?JSON.parse(readFileSync(process.argv[2],'utf8')):undefined;
const result=await runProtectedScenario({identities,investigation:true,onStage:stage=>console.log(JSON.stringify(stage))});
console.log(JSON.stringify({result}));
