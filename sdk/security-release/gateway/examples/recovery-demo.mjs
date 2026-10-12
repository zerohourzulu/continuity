import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {serveGatewayHttp} from '../src/http.mjs';
import {cooperativeSetup} from './cooperative-setup.mjs';
import {testIssuer} from './test-issuer.mjs';
import {lossyRelay} from './lossy-relay.mjs';
const root=mkdtempSync(join(tmpdir(),'continuity-recovery-demo-')),issuer=await testIssuer();
let f,relay,http,client;
try{
 f=await cooperativeSetup(join(root,'case'));relay=await lossyRelay(f.destination.url);f.config.destination.url=relay.url;
 relay.behavior.dropAfter='commit';
 f.owner.grant({id:'cancel',to:'worker',actions:['cancel-operation','OBSERVE_OUTCOME'],resources:[f.operationId],expiresAt:Date.now()+60000});
 http=await serveGatewayHttp({issuer:issuer.issuer,keys:issuer.keys,allowTestIssuer:true,isActive:()=>true,
  bindings:[{kind:'cooperative',id:'agent-a',subject:'alice',clientId:'example-client',gateway:f.config}]});
 const token=await issuer.issue(http.resourceUrl);client=new Client({name:'recovery-demo',version:'1'},{versionNegotiation:{mode:{pin:'2026-07-28'}}});
 await client.connect(new StreamableHTTPClientTransport(new URL(http.resourceUrl),{requestInit:{headers:{authorization:'Bearer '+token}}}));
 const {tools}=await client.listTools({cursor:''});
 const call=async(name,args)=>(await client.callTool({name,arguments:args},{toolDefinition:tools.find(t=>t.name===name)})).structuredContent;
 const first=await call('create_incident_ticket',{title:'Investigate synthetic incident'});assert.equal(first.status,'OUTCOME_UNKNOWN');
 console.log('Reply lost after the destination acted:',first.status);
 const job={job:'create_incident_ticket'},recovered=await call('continuity_recover',job);assert.equal(recovered.serviceState,'APPLIED',JSON.stringify({first,recovered,counts:relay.counts,effects:f.destination.inspect().effects.length}));
 console.log('Authenticated lookup:',recovered.serviceState,'— original action was not sent again.');
 const cancelled=await call('continuity_cancel',job);assert.equal(cancelled.serviceState,'TOO_LATE');
 console.log('Cancellation:',cancelled.serviceState,'— a completed effect is not undone.');
 const observed=await call('continuity_observe',job);assert.equal(observed.status,'OBSERVATION_RECORDED');
 console.log('Late result:',observed.status,'— no new execution power or duty discharge.');
 assert.equal(f.destination.inspect().effects.length,1);assert.equal(relay.counts.commit,1);assert.equal(relay.counts.cancel,1);
 console.log('One synthetic effect; no repeated dispatch.');
}finally{await client?.close();await http?.close();await relay?.close();await f?.destination.close();await issuer.close();rmSync(root,{recursive:true,force:true});}
