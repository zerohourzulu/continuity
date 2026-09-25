// A deliberately narrow demo process protocol. No shell, path-selected tool or eval.
import {createPrivateKey,createPublicKey} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createProtectedEvidenceDestination} from '../../packages/remote-tools/destination.mjs';
import {readProtectedEvidence} from '../../packages/remote-tools/protected-evidence.mjs';
import {retryFromConfiguration} from './recovery-host.mjs';
import {recoverCoordinator} from './recovery-host.mjs';
let service;
let coordinator;
process.on('disconnect',()=>process.exit());
process.on('message',async message=>{
  const {id,command}=message;
  try{
    let result;
    if(command==='service-start'){
      service=await createProtectedEvidenceDestination({...message.options,now:()=>100,
        coordinatorPublicKey:createPublicKey(message.options.coordinatorPublicKey),
        servicePrivateKey:createPrivateKey(message.options.servicePrivateKey)});
      result={url:service.url,serviceId:service.registry.serviceId,contractId:service.registry.contractId};
    }else if(command==='coordinator-recover'){
      coordinator=await recoverCoordinator(message.configFile);result=coordinator.result;
    }else if(command==='coordinator-duty-retry')result=await retryFromConfiguration(message.configFile,message.retryFile);
    else if(command==='coordinator-restore')result=await coordinator.restore(message.request);
    else if(command==='inspect')result=service.inspect();
    else if(command==='close'){await service?.close();result={closed:true};}
    else if(command==='review'){
      const config=JSON.parse(readFileSync(message.configFile,'utf8'));
      result=await readProtectedEvidence(config);
    }else if(command==='probe'){
      const files=message.paths.map(path=>{try{readFileSync(path);return {readable:true};}catch(error){return {readable:false,code:error.code};}});
      let socket;try{socket=(await readProtectedEvidence({socketPath:message.socketPath,token:'0'.repeat(64)})).status;}catch(error){socket=error.code;}
      const raw=await fetch(message.url+'/cooperative',{method:'POST',body:'{}'});
      result={files,socket,unsignedWrite:raw.status};
    }else if(command==='work'){
      // A worker can propose a fixed operation; only the host maps its IPC
      // connection to a runtime session. It cannot select another actor/key.
      process.send({id,proposal:message.request});return;
    }else if(command==='ping')result={pid:process.pid,uid:process.getuid()};
    else throw Error('UNKNOWN_COMMAND');
    process.send({id,result});
  }catch(error){process.send({id,error:error.message});}
});
