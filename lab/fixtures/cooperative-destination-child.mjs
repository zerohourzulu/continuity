// Test-only fault fixture. No interception is present in package source.
import fs from 'node:fs';
import {join} from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
import {createPrivateKey,createPublicKey} from 'node:crypto';

const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const snapshot=join(config.directory,'snapshot.bin');
const directoryStat=fs.statSync(config.directory);
const originalRename=fs.renameSync,originalFsync=fs.fsyncSync;
let armed=null,renamed=null,clock=config.now;
const emit=value=>fs.writeSync(1,JSON.stringify(value)+'\n');
const stopAt=(phase,temporary)=>{
  emit({type:'FAULT',phase,temporary,snapshot});
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);
  throw Error('Test pause unexpectedly returned');
};
fs.renameSync=(from,to)=>{
  const selected=armed&&to===snapshot&&typeof from==='string'&&from.endsWith('.tmp');
  if(selected&&armed==='before-rename')stopAt(armed,from);
  originalRename(from,to);
  if(selected&&armed==='after-directory-fsync')renamed=from;
};
fs.fsyncSync=fd=>{
  originalFsync(fd);
  if(renamed){
    const stat=fs.fstatSync(fd);
    if(stat.isDirectory()&&stat.dev===directoryStat.dev&&stat.ino===directoryStat.ino)stopAt('after-directory-fsync',renamed);
  }
};
// Update named fs exports before loading the real store/destination.
syncBuiltinESMExports();

try{
  const {createCooperativeDestination}=await import('../../packages/remote-tools/destination.mjs');
  const {createToolRegistry,REFERENCE_TOOLS}=await import('../../packages/remote-tools/validation.mjs');
  const registry=createToolRegistry({serviceId:config.serviceId,account:'synthetic',tools:REFERENCE_TOOLS});
  const destination=await createCooperativeDestination({directory:config.directory,domain:config.domain,
    serviceId:config.serviceId,coordinatorPublicKey:createPublicKey(config.coordinatorPublicKey),
    servicePrivateKey:createPrivateKey(config.servicePrivateKey),now:()=>clock,validateOperation:registry.validateOperation});
  process.on('message',async request=>{
    if(request?.operation==='arm'){
      if(armed||!['before-rename','after-directory-fsync'].includes(request.phase))throw Error('Invalid test arm');
      armed=request.phase;emit({type:'ARMED',phase:armed});
    }else if(request?.operation==='time'){
      if(!Number.isSafeInteger(request.value)||request.value<0)throw Error('Invalid test time');
      clock=request.value;emit({type:'TIME',value:clock});
    }else if(request?.operation==='close'){
      await destination.close();emit({type:'CLOSED'});process.disconnect();
    }else throw Error('Unsupported test command');
  });
  emit({type:'READY',url:destination.url});
}catch(error){emit({type:'ERROR',code:error.code??null,message:error.message});process.exitCode=1;process.disconnect?.();}
