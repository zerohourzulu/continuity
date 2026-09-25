import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {cooperativeSetup} from './cooperative-setup.mjs';
import {lossyRelay} from './lossy-relay.mjs';
import {testIssuer} from './test-issuer.mjs';
import {taskClient,pollTask} from './task-client.mjs';
import {serveGatewayHttp} from '../src/http.mjs';
const root=mkdtempSync(join(tmpdir(),'continuity-tasks-demo-'));
let f,relay,issuer,http;
try{
 f=await cooperativeSetup(join(root,'case'));relay=await lossyRelay(f.destination.url);issuer=await testIssuer();
 f.config.destination.url=relay.url;
 relay.behavior.after=async op=>{if(op==='prepare')await new Promise(resolve=>setTimeout(resolve,300));};
 relay.behavior.dropAfter='commit';
 const settings={issuer:issuer.issuer,keys:issuer.keys,allowTestIssuer:true,isActive:()=>true,
  bindings:[{kind:'cooperative',tasks:true,id:'agent-a',subject:'alice',clientId:'example-client',gateway:f.config}]};
 http=await serveGatewayHttp(settings);
 const call=taskClient(http.resourceUrl,await issuer.issue(http.resourceUrl));
 const started=await call('tools/call',{name:'create_incident_ticket',arguments:{title:'One ticket across reconnects'}});
 assert.equal(started.resultType,'task');console.log('Durable handle returned:',started.status);
 const progress=await call('tasks/get',{taskId:started.taskId});console.log('Progress:',progress.statusMessage??progress.status);
 // A different client reconnects with a fresh login; it uses the same durable handle.
 const reconnected=taskClient(http.resourceUrl,await issuer.issue(http.resourceUrl));
 const result=await pollTask(reconnected,started.taskId);assert.equal(result.status,'completed');assert.equal(result.result.structuredContent.serviceState,'APPLIED');
 await http.close();http=await serveGatewayHttp(settings);
 const afterRestart=taskClient(http.resourceUrl,await issuer.issue(http.resourceUrl));
 assert.equal((await afterRestart('tasks/get',{taskId:started.taskId})).status,'completed');
 assert.equal(f.destination.inspect().effects.length,1);assert.equal(relay.counts.commit,1);
 console.log('Reconnected, recovered a lost reply, and reopened the same task after gateway restart.');
 console.log('Completed: one synthetic ticket; one commit request; no automatic redelivery.');
}finally{await http?.close();await relay?.close();await f?.destination.close();await issuer?.close();rmSync(root,{recursive:true,force:true});}
