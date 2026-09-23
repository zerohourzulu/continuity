import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request as httpRequest} from 'node:http';
import {CompactSign,generateKeyPair} from 'jose';
import {Client,StreamableHTTPClientTransport,discoverOAuthProtectedResourceMetadata,discoverAuthorizationServerMetadata} from '@modelcontextprotocol/client';
import {serveGatewayHttp} from '../src/http.mjs';
import {setup} from '../examples/setup.mjs';
import {testIssuer} from '../examples/test-issuer.mjs';

async function fixture(t,customize=()=>{}){
 const root=mkdtempSync(join(tmpdir(),'continuity-http-test-')),issuer=await testIssuer(),clients=[],revoked=new Set();
 let active=true,clock=Date.now,service;
 const cases=['a','b','c'].map(name=>({...setup(join(root,name)),directory:join(root,name)}));
 const bindings=cases.map((f,i)=>({id:'agent-'+['a','b','c'][i],subject:i===2?'bob':'alice',clientId:'example-client',gateway:{...f.config,local:f.local}}));
 const config={issuer:issuer.issuer,keys:issuer.keys,allowTestIssuer:true,bindings,isActive:i=>active&&!revoked.has(i.tokenId),now:()=>clock()};
 t.after(async()=>{await Promise.allSettled(clients.map(c=>c.close()));await service?.close();await issuer.close();rmSync(root,{recursive:true,force:true});});
 customize({config,cases,disable:()=>{active=false;},setClock:f=>{clock=f;}});
 service=await serveGatewayHttp(config);
 const f={root,issuer,cases,bindings,service,config,revoked,disable:()=>{active=false;},enable:()=>{active=true;},setClock:f=>{clock=f;},
  token:(claims={},header={})=>issuer.issue(service.resourceUrl,claims,header),
  count:i=>{const p=join(cases[i].directory,'tickets.calls.jsonl');return existsSync(p)?readFileSync(p,'utf8').trim().split('\n').length:0;},
  control:(i,control)=>writeFileSync(join(cases[i].directory,'tickets.control.json'),JSON.stringify(control)),
  async restart(){const port=Number(new URL(service.resourceUrl).port);await service.close();service=await serveGatewayHttp({...config,port});f.service=service;},
  async client(token,extra={}){
   const c=new Client({name:'untrusted-client-info',version:'1'},{versionNegotiation:{mode:{pin:'2026-07-28'}}});clients.push(c);
   await c.connect(new StreamableHTTPClientTransport(new URL(service.resourceUrl),{requestInit:{headers:{Authorization:'Bearer '+token,...extra}}}));
   return c;
  },
  async raw(token,{path='/mcp',headers={},method='POST',body='{}'}={}){return fetch(new URL(path,service.resourceUrl),{method,headers:{'content-type':'application/json',accept:'application/json, text/event-stream',...(token?{authorization:'Bearer '+token}:{}),...headers},...(method==='POST'?{body}:{})});},
  async call(client,name='create_incident_ticket',args={title:'Local synthetic ticket'}){
   const tools=await client.listTools({cursor:''},{cacheMode:'refresh'}),definition=tools.tools.find(t=>t.name===name);
   return (await client.callTool({name,arguments:args},{toolDefinition:definition})).structuredContent;
  }};
 return f;
}
async function waitFor(predicate){for(let i=0;i<300;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}throw Error('Condition deadline');}

test('official discovery and HTTP client run real tools; repeat does not retransmit',async t=>{
 const f=await fixture(t),unauthorized=await f.raw();assert.equal(unauthorized.status,401);
 assert.ok(unauthorized.headers.get('www-authenticate').includes(f.service.metadataUrl));
 const metadata=await discoverOAuthProtectedResourceMetadata(f.service.resourceUrl);assert.equal(metadata.resource,f.service.resourceUrl);
 const as=await discoverAuthorizationServerMetadata(metadata.authorization_servers[0]);assert.equal(as.issuer,f.issuer.issuer);
 const c=await f.client(await f.token());assert.equal((await f.call(c)).status,'RESPONSE_RETAINED');
 assert.equal((await f.call(c)).status,'RECONCILIATION_ONLY');assert.equal(f.count(0),1);
 assert.equal((await f.call(c,'continuity_status',{job:'create_incident_ticket'})).status,'RESPONSE_RETAINED');
});

test('same user with two agents and another user have separate jobs, catalogs and records',async t=>{
 const f=await fixture(t,({config})=>{config.bindings[1].gateway.operations=config.bindings[1].gateway.operations.slice(0,1);});
 const a=await f.client(await f.token()),b=await f.client(await f.token({continuity_binding:'agent-b'})),c=await f.client(await f.token({sub:'bob',continuity_binding:'agent-c'}));
 await f.call(a);assert.equal((await f.call(c,'continuity_status',{job:'create_incident_ticket'})).status,'NOT_STARTED');
 assert.equal((await b.listTools({cursor:''})).tools.some(x=>x.name==='create_incident_ticket'),false);
 await f.call(c);assert.equal(f.count(0),1);assert.equal(f.count(1),0);assert.equal(f.count(2),1);
});

test('wrong issuer, audience, caller, client and binding cannot authenticate',async t=>{
 const f=await fixture(t);
 for(const claims of [{iss:'https://other.invalid/'},{aud:'https://other.invalid/mcp'},{aud:[f.service.resourceUrl,'https://other.invalid']},{sub:'bob'},{client_id:'other-client'},{continuity_binding:'unknown'},{sub:'alice',continuity_binding:'agent-c'}]){
  const r=await f.raw(await f.token(claims));assert.equal(r.status,401);assert.equal((await r.json()).error,'invalid_token');
 }
 assert.equal(f.count(0),0);
});

test('expiry, future issuance, not-before, lifetime and required claim checks fail closed',async t=>{
 const f=await fixture(t),at=Math.floor(Date.now()/1000);
 // Issuer and verifier must use the same instant: signing across a wall-clock
 // second must not turn a 301-second rejection fixture into a valid 300 seconds.
 f.setClock(()=>at*1000);
 const token=(claims={})=>f.token({iat:at,exp:at+300,...claims});
 for(const claims of [{exp:at},{iat:at+60},{nbf:at+60},{exp:at+301},{exp:at+0.5},{jti:''},{continuity_binding:null},{exp:null}])assert.equal((await f.raw(await token(claims))).status,401,JSON.stringify(claims));
 const r=await f.raw(await token({scope:'profile'}));assert.equal(r.status,403);assert.equal((await r.json()).error,'insufficient_scope');
 // The old fixture could accidentally issue this valid boundary token.
 f.setClock(()=>(at+1)*1000);
 await f.client(await token({iat:at+1,exp:at+301}));
});

test('token signature, type, unknown key, embedded key URLs and duplicate claims are refused',async t=>{
 const f=await fixture(t);
 for(const header of [{typ:'JWT'},{kid:'other'},{jku:'http://127.0.0.1:9/keys'},{x5u:'https://invalid.example/cert'}])assert.equal((await f.raw(await f.token({},header))).status,401);
 const valid=await f.token(),parts=valid.split('.');parts[1]=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(parts[1],'base64url')),sub:'bob'})).toString('base64url');
 assert.equal((await f.raw(parts.join('.'))).status,401);
 const body=Buffer.from('{"iss":"'+f.issuer.issuer+'","sub":"alice","sub":"bob"}');
 const duplicate=await new CompactSign(body).setProtectedHeader({alg:'ES256',typ:'at+jwt',kid:'local-example'}).sign(f.issuer.privateKey);
 assert.equal((await f.raw(duplicate)).status,401);
 const other=await generateKeyPair('ES256');
 const forged=await new CompactSign(Buffer.from(valid.split('.')[1],'base64url')).setProtectedHeader({alg:'ES256',typ:'at+jwt',kid:'local-example'}).sign(other.privateKey);
 assert.equal((await f.raw(forged)).status,401);
});

test('caller-controlled headers and tool arguments cannot select another agent',async t=>{
 const f=await fixture(t),a=await f.client(await f.token(),{'x-continuity-agent':'agent-c','mcp-session-id':'agent-c'});
 const denied=await f.call(a,'create_incident_ticket',{title:'Injection',actor:'bob',session:'agent-c'});
 // SDK validation can reject before our structured result is produced.
 assert.ok(denied===undefined||denied.status==='REFUSED');assert.equal(f.count(0),0);assert.equal(f.count(2),0);
 assert.equal((await f.call(a)).status,'RESPONSE_RETAINED');assert.equal(f.count(0),1);assert.equal(f.count(2),0);
});

test('revoked token and failed or asynchronous revocation store reject every new request',async t=>{
 const f=await fixture(t),token=await f.token({jti:'revoked-token'}),c=await f.client(token);
 f.revoked.add('revoked-token');await assert.rejects(f.call(c));assert.equal(f.count(0),0);
 const broken=await fixture(t,({config})=>{config.isActive=()=>{throw Error('private store path');};});
 const r=await broken.raw(await broken.token());assert.equal(r.status,401);assert.equal((await r.text()).includes('private store'),false);
 const asynchronous=await fixture(t,({config})=>{config.isActive=async()=>true;});assert.equal((await asynchronous.raw(await asynchronous.token())).status,401);
 const rejected=await fixture(t,({config})=>{config.isActive=async()=>{throw Error('policy unavailable');};});assert.equal((await rejected.raw(await rejected.token())).status,401);
});

test('revocation during signing stops dispatch after a successful HTTP login',async t=>{
 const f=await fixture(t,({config,disable})=>{const local=config.bindings[0].gateway.local;config.bindings[0].gateway.local={...local,async signHash(h){disable();return local.signHash(h);}};});
 const c=await f.client(await f.token());await assert.rejects(f.call(c));assert.equal(f.count(0),0);
});

test('expiry during signing and trusted-clock rollback cannot dispatch',async t=>{
 const f=await fixture(t,({config,setClock})=>{const local=config.bindings[0].gateway.local;config.bindings[0].gateway.local={...local,async signHash(h){setClock(()=>Date.now()+400000);return local.signHash(h);}};});
 const c=await f.client(await f.token());await assert.rejects(f.call(c));assert.equal(f.count(0),0);
 const rollback=await fixture(t),token=await rollback.token();await rollback.client(token);rollback.setClock(()=>Date.now()-60000);
 assert.equal((await rollback.raw(token)).status,401);
});

test('revocation after effect withholds response but a newly valid login recovers without redispatch',async t=>{
 const f=await fixture(t);f.control(0,{delay:300});const c=await f.client(await f.token());
 const pending=f.call(c);await waitFor(()=>f.count(0)===1);f.disable();await assert.rejects(pending);
 f.enable();const next=await f.client(await f.token());assert.equal((await f.call(next)).status,'RECONCILIATION_ONLY');assert.equal(f.count(0),1);
});

test('Core retirement still fences the agent despite a valid HTTP credential',async t=>{
 const f=await fixture(t),c=await f.client(await f.token());f.cases[0].owner.advanceEpoch({agent:'worker',from:1,to:2});
 assert.equal((await f.call(c)).reason,'RUNTIME_NOT_CURRENT');assert.equal(f.count(0),0);
});

test('Host/Origin, query credentials, methods, content type and request limits are enforced',async t=>{
 const f=await fixture(t),token=await f.token();
 for(const headers of [{origin:'https://evil.invalid'},{origin:'null'}])assert.equal((await f.raw(token,{headers})).status,403,JSON.stringify(headers));
 const badHost=await new Promise((resolve,reject)=>{const req=httpRequest(f.service.resourceUrl,{method:'POST',headers:{host:'evil.invalid',authorization:'Bearer '+token,'content-type':'application/json'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end('{}');});
 assert.equal(badHost,403);
 assert.equal((await f.raw(token,{path:'/mcp?access_token='+token})).status,404);
 assert.equal((await f.raw(token,{method:'GET'})).status,405);
 assert.equal((await f.raw(token,{headers:{'content-type':'text/plain'}})).status,415);
 assert.equal((await f.raw(token,{headers:{'content-encoding':'gzip'}})).status,415);
 assert.equal((await f.raw(token,{body:'x'.repeat(32769)})).status,413);
 for(const body of ['{"method":"tools/list","method":"tools/call"}','['.repeat(40)+'0'+']'.repeat(40),'[]'])assert.equal((await f.raw(token,{body})).status,400);
 assert.equal(f.count(0),0);
});

test('duplicate Authorization headers are refused at the real Node HTTP boundary',async t=>{
 const f=await fixture(t),token=await f.token(),url=new URL(f.service.resourceUrl);
 const status=await new Promise((resolve,reject)=>{const req=httpRequest(url,{method:'POST',headers:['Host',url.host,'Authorization','Bearer '+token,'Authorization','Bearer '+token,'Content-Type','application/json']},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end('{}');});
 assert.equal(status,400);
});

test('incoming bearer token is absent from durable gateway and upstream records',async t=>{
 const f=await fixture(t),token=await f.token(),c=await f.client(token);
 const previous=process.env.GATEWAY_ACCESS_TOKEN;process.env.GATEWAY_ACCESS_TOKEN=token;
 t.after(()=>{if(previous===undefined)delete process.env.GATEWAY_ACCESS_TOKEN;else process.env.GATEWAY_ACCESS_TOKEN=previous;});
 f.control(0,{checkAuthEnvironment:true});await f.call(c);
 assert.equal(JSON.parse(readFileSync(join(f.cases[0].directory,'tickets.calls.jsonl'),'utf8')).authenticationEnvironmentPresent,false);
 const dir=f.cases[0].directory;
 const paths=[join(dir,'history.jsonl'),join(dir,'tickets.calls.jsonl'),...readdirSync(join(dir,'records')).map(n=>join(dir,'records',n))];
 for(const path of paths)assert.equal(readFileSync(path,'utf8').includes(token),false);
 assert.equal(JSON.parse(readFileSync(join(dir,'tickets.calls.jsonl'),'utf8')).arguments.title,'Local synthetic ticket');
});

test('lost upstream reply over HTTP remains uncertain across new authenticated connections',async t=>{
 const f=await fixture(t);f.control(0,{crash:true});const c=await f.client(await f.token());
 assert.equal((await f.call(c)).status,'OUTCOME_UNKNOWN');const next=await f.client(await f.token());
 assert.equal((await f.call(next)).status,'OUTCOME_UNKNOWN');assert.equal(f.count(0),1);
});

test('configuration rejects ambiguous shared contexts, private keys and insecure issuer URLs',async t=>{
 const f=await fixture(t),config={...f.config};
 await assert.rejects(serveGatewayHttp({...config,bindings:[f.bindings[0],{...f.bindings[0],id:'alias'}]}));
 for(const issuer of ['http://example.com/','https://user:password@example.com/','file:///tmp/issuer','https://example.com/?x=1'])await assert.rejects(serveGatewayHttp({...config,issuer}));
 await assert.rejects(serveGatewayHttp({...config,keys:[{...f.issuer.keys[0],d:'private'}]}));
 await assert.rejects(serveGatewayHttp({...config,keys:[f.issuer.keys[0],f.issuer.keys[0]]}));
});

test('HTTP restart preserves original work and consults the same host revocation policy',async t=>{
 const f=await fixture(t),token=await f.token({jti:'before-restart'}),c=await f.client(token);await f.call(c);
 f.revoked.add('before-restart');await f.restart();assert.equal((await f.raw(token)).status,401);
 const next=await f.client(await f.token());assert.equal((await f.call(next)).status,'RECONCILIATION_ONLY');assert.equal(f.count(0),1);
});

test('one busy agent does not block another binding or permit overlapping effects for itself',async t=>{
 const f=await fixture(t);f.control(0,{delay:500});
 const a=await f.client(await f.token()),b=await f.client(await f.token({continuity_binding:'agent-b'}));
 const pending=f.call(a);await waitFor(()=>f.count(0)===1);
 assert.equal((await f.call(a)).status,'BUSY');assert.equal((await f.call(b)).status,'RESPONSE_RETAINED');
 await pending;assert.equal(f.count(0),1);assert.equal(f.count(1),1);
});

test('header/body method mismatch cannot execute a tool, and no client session grants access',async t=>{
 const f=await fixture(t),token=await f.token(),requests=[];
 const client=new Client({name:'forged-agent-c',version:'1'},{versionNegotiation:{mode:{pin:'2026-07-28'}}});
 t.after(()=>client.close());
 await client.connect(new StreamableHTTPClientTransport(new URL(f.service.resourceUrl),{requestInit:{headers:{authorization:'Bearer '+token}},
  fetch:async(url,init)=>{requests.push({url,init});return fetch(url,init);}}));
 await client.listTools({cursor:''});const sent=requests.at(-1),headers=new Headers(sent.init.headers);headers.set('mcp-method','tools/call');
 const mismatch=await fetch(sent.url,{...sent.init,headers});const result=await mismatch.json();assert.ok(result.error);assert.equal(f.count(0),0);
 assert.equal((await f.raw(undefined,{headers:{'mcp-session-id':'agent-a','x-continuity-agent':'agent-a'}})).status,401);
});
