import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {mkdirSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {createToolRegistry,createCooperativeDestination} from '@ramex-labs/continuity-remote';
import {setup} from './setup.mjs';
import {operationIdentity} from '../src/gateway.mjs';

/** Disposable synthetic cooperating destination. All effects stay in its private local state. */
export async function cooperativeSetup(directory,{tools}={}){
 const f=setup(directory);directory=realpathSync(directory);
 const coordinator=generateKeyPairSync('ed25519'),provider=generateKeyPairSync('ed25519');
 const registry={serviceId:'synthetic:'+randomUUID(),account:'example',tools:tools??[{id:'ticket.create',action:'create-ticket',resource:'queue:incident',fields:{title:'text'}}]};
 const actualRegistry=createToolRegistry(registry),destinationDirectory=join(directory,'destination');mkdirSync(destinationDirectory,{mode:0o700});
 const destination=await createCooperativeDestination({directory:destinationDirectory,domain:f.local.domain,serviceId:registry.serviceId,
  coordinatorPublicKey:coordinator.publicKey,servicePrivateKey:provider.privateKey,now:f.local.now,validateOperation:actualRegistry.validateOperation});
 const operations=[{name:'create_incident_ticket',tool:registry.tools[0].id,businessKey:'incident:42:cooperating-ticket',role:'analyst',tenure:'shift:1'}];
 const operationId=operationIdentity(f.local.domain,operations[0].businessKey);
 const config={local:f.local,storage:f.config.storage,registry,operations,destination:{url:destination.url,serviceId:registry.serviceId,
  coordinatorPrivateKey:coordinator.privateKey,servicePublicKey:provider.publicKey,timeoutMs:10000}};
 return {...f,config,destination,operationId};
}
