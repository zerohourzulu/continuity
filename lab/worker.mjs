// Test child only. Its private configuration lives in a disposable case directory.
import {readFileSync} from 'node:fs';
import {privateKeyToAccount} from 'viem/accounts';
import {createBroker} from './broker.mjs';
import {DurableAdmissionCoordinator} from '../packages/core-0.2/src/sdk/durable-admission.ts';
const config=JSON.parse(readFileSync(process.argv[2],'utf8'));
const account=privateKeyToAccount(config.key);
if(process.argv[3]==='kill-before-invoke') {
  DurableAdmissionCoordinator.prototype.invoke=function(){process.kill(process.pid,'SIGKILL');};
}
try {
  const answer=await createBroker({...config,now:()=>100,signHash:hash=>account.signMessage({message:{raw:hash}})}).run(config.request);
  process.stdout.write(JSON.stringify({status:answer.result.status, disposition:answer.result.invocation?.status ?? answer.result.result?.status})+'\n');
} catch(error) {process.stdout.write(JSON.stringify({error:error.code ?? 'FAILED'})+'\n');}
