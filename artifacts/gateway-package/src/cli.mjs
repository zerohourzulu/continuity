#!/usr/bin/env node
import {readFileSync,openSync,closeSync,constants,fstatSync} from 'node:fs';
import {privateKeyToAccount} from 'viem/accounts';
import {acquireHostLease} from './operations.mjs';
import {createGateway} from './gateway.mjs';
import {serveGateway} from './server.mjs';
import {readPrivate,exact,check} from './data.mjs';
let gateway,lease;
try{
 check(process.argv.length===4&&process.argv[2]==='--config');
 const config=exact(readPrivate(process.argv[3]),['historyFile','domain','owner','controller','session','keyFile','storage','upstreams','operations'],['timeoutMs']);
 const fd=openSync(config.keyFile,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);let key;
 try{const s=fstatSync(fd);check(s.isFile()&&s.nlink===1&&(s.mode&0o077)===0&&s.size<=128);key=readFileSync(fd,'utf8').trim();}finally{closeSync(fd);}
 check(/^0x[0-9a-fA-F]{64}$/.test(key));const account=privateKeyToAccount(key);
 const local={historyFile:config.historyFile,domain:config.domain,owner:config.owner,controller:config.controller,session:config.session,
  now:Date.now,signHash:hash=>account.signMessage({message:{raw:hash}})};
 lease=acquireHostLease(config.storage);
 gateway=await createGateway({local,storage:config.storage,upstreams:config.upstreams,operations:config.operations,timeoutMs:config.timeoutMs});
 const originalClose=gateway.close;const inner=gateway;
 gateway={...inner,run:(name,args)=>{lease.assertOwned();return inner.run(name,args,{assertCurrent:()=>lease.assertOwned()});},async close(){await originalClose();lease.release();}};
 serveGateway(gateway);
 process.stdin.once('end',()=>{gateway.close().finally(()=>process.exit(0));});
 process.once('SIGTERM',()=>{gateway.close().finally(()=>process.exit(0));});
}catch{process.stderr.write('GATEWAY_CONFIGURATION_UNAVAILABLE\n');await gateway?.close();lease?.release();process.exitCode=2;}
