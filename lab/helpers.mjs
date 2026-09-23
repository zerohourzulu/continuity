import {mkdtempSync,mkdirSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {createLocalAttemptOwner as createLocalOwner,createLocalDomain} from '../packages/core-0.3/src/local-owner.ts';
import {createService} from './service.mjs';
import {createBroker,LAB_TOOLS} from './broker.mjs';
export async function setup(t, mode='normal') {
  const dir=realpathSync(mkdtempSync(join(tmpdir(),'continuity-remote-lab-')));
  const storage=join(dir,'attempts'), serviceDir=join(dir,'provider');
  mkdirSync(storage,{mode:0o700}); mkdirSync(serviceDir,{mode:0o700});
  const service=await createService({directory:serviceDir}); service.setMode(mode);
  t.after(async()=>{await service.close();rmSync(dir,{recursive:true,force:true});});
  const key=generatePrivateKey(),account=privateKeyToAccount(key);
  const config={historyFile:join(dir,'history.jsonl'),domain:createLocalDomain(),owner:'operations',controller:'operator',now:()=>100};
  const owner=createLocalOwner(config);
  owner.createAgent({id:'bea'});owner.createRole({id:'operator'});
  owner.appoint({agent:'bea',role:'operator',tenure:'shift:1',number:1});
  owner.admitRuntime({agent:'bea',session:'session:1',epoch:1,key:'key:1',address:account.address,expiresAt:10000});
  owner.grant({id:'tools',to:'bea',actions:Object.values(LAB_TOOLS).map(x=>x.action),resources:[...new Set(Object.values(LAB_TOOLS).map(x=>x.resource))],expiresAt:9999});
  const options={...config,session:'session:1',signHash:hash=>account.signMessage({message:{raw:hash}}),epoch:1,
    role:'operator',tenure:'shift:1',storage,target:service.url,serviceIdentity:'synthetic-provider/1',
    account:'synthetic-tenant',enforcement:'DISPATCH_ONLY',timeoutMs:1000};
  const request={operationId:'job:1',tool:'ticket.create',arguments:{title:'Investigate synthetic incident'}};
  const childConfig=join(dir,'child.json');
  writeFileSync(childConfig,JSON.stringify({...options,signHash:undefined,now:undefined,key,request}),{mode:0o600});
  return {dir,service,owner,options,request,childConfig,broker:createBroker(options)};
}
export const disposition = answer => answer.result.invocation?.status ?? answer.result.result?.status ?? answer.result.status;
