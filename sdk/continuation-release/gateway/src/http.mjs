import {openConfiguredEventStore,ConfiguredDirectoryEventStore} from '@ramex-labs/continuity/adapter';
import {createServer} from 'node:http';
import {realpathSync} from 'node:fs';
import {createMcpHandler,getOAuthProtectedResourceMetadataUrl} from '@modelcontextprotocol/server';
import {createGateway} from './gateway.mjs';
import {createCooperativeGateway} from './cooperative.mjs';
import {acquireHostLease} from './operations.mjs';
import {createTaskManager,routeTaskRequest} from './tasks.mjs';
import {gatewayServer} from './server.mjs';
import {createAccessVerifier,issuerUrl} from './access.mjs';
import {parseStrictJson} from './strict-json.mjs';
import {check,id,hash,privateDirectory} from './data.mjs';

const MAX_BODY=32768;
const json=(status,value,headers={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store',...headers}});
function challenge(metadata,code='invalid_token'){
 return json(code==='insufficient_scope'?403:401,{error:code},{'www-authenticate':`Bearer resource_metadata="${metadata}", scope="mcp:access", error="${code}"`});
}
async function body(req){
 const chunks=[];let size=0;
 const timer=setTimeout(()=>req.destroy(),3000);timer.unref();
 try{for await(const chunk of req){size+=chunk.length;check(size<=MAX_BODY,'REQUEST_LIMIT');chunks.push(chunk);}return Buffer.concat(chunks);}
 finally{clearTimeout(timer);}
}
async function send(res,response,checkResponse=()=>{}){
 // Only terminal JSON is selected in this profile; never buffer an unbounded stream.
 const reader=response.body?.getReader(),chunks=[];let size=0;
 if(reader)try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;check(size<=262144,'RESPONSE_LIMIT');chunks.push(value);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}
 const denied=checkResponse();if(denied)return send(res,denied);
 if(res.destroyed)return;
 res.writeHead(response.status,{...Object.fromEntries(response.headers),'cache-control':'no-store','x-content-type-options':'nosniff'});
 res.end(Buffer.concat(chunks));
}

/** Local evaluation HTTP resource server. Always binds 127.0.0.1; never trusts forwarded headers. */
export async function serveGatewayHttp(options){
 const {port=0,now=Date.now}=options;
 check(Number.isInteger(port)&&port>=0&&port<=65535);
 const issuer=issuerUrl(options.issuer,options.allowTestIssuer);
 check(Array.isArray(options.bindings)&&options.bindings.length>0&&options.bindings.length<=16);
 const bindings=new Map(),histories=new Set(),directories=new Set(),domains=new Set(),gateways=[],leases=[];
 let active=0,ready=false,closing=false,verifier,resourceUrl,metadataUrl;
 const responseChecks=new WeakMap();
 const server=createServer({maxHeaderSize:16384,requestTimeout:10000,headersTimeout:10000,keepAliveTimeout:1000},(req,res)=>{
  if(!ready||closing||active>=8){res.writeHead(503,{'connection':'close'});res.end();return;}
  active++;
  void handle(req).then(response=>send(res,response,responseChecks.get(response))).catch(()=>{
   if(!res.headersSent&&!res.destroyed){res.writeHead(400,{'connection':'close','cache-control':'no-store'});res.end('{"error":"invalid_request"}');}
   else res.destroy();
  }).finally(()=>{active--;});
 });
 server.maxConnections=32;
 server.on('clientError',(_error,socket)=>socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
 // A separate SDK handler per binding prevents tool catalog/state crossing between callers.
 const handlers=new Map(),taskManagers=new Map();
 async function handle(req){
  const expected=new URL(resourceUrl),seen=new Set();
  for(let i=0;i<req.rawHeaders.length;i+=2){const key=req.rawHeaders[i].toLowerCase();if(seen.has(key)&&['authorization','host','origin','content-type','content-length'].includes(key))return json(400,{error:'invalid_request'});seen.add(key);}
  if(req.headers.host!==expected.host)return json(403,{error:'invalid_host'});
  if(req.headers.origin!==undefined&&req.headers.origin!==expected.origin)return json(403,{error:'invalid_origin'});
  if(req.headers['transfer-encoding']&&req.headers['content-length'])return json(400,{error:'invalid_request'});
  if(req.url===new URL(metadataUrl).pathname&&req.method==='GET')return json(200,{resource:resourceUrl,authorization_servers:[issuer],scopes_supported:['mcp:access'],bearer_methods_supported:['header'],resource_name:'Continuity local gateway'});
  if(req.url!=='/mcp')return json(404,{error:'not_found'}); // No query-string credentials, aliases or redirects.
  let access;
  try{
   const authorization=req.headers.authorization;
   check(typeof authorization==='string'&&/^Bearer [A-Za-z0-9_.-]+$/i.test(authorization),'ACCESS_NOT_CURRENT');
   access=await verifier.verify(authorization.slice(7));
  }catch(error){return challenge(metadataUrl,error.code==='INSUFFICIENT_SCOPE'?'insufficient_scope':'invalid_token');}
  if(req.method!=='POST')return json(405,{error:'method_not_allowed'},{allow:'POST'});
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']??''))return json(415,{error:'content_type'});
  if(req.headers['content-encoding']!==undefined)return json(415,{error:'content_encoding'});
  if(Number(req.headers['content-length']??0)>MAX_BODY)return json(413,{error:'request_limit'});
  const bytes=await body(req),parsed=parseStrictJson(bytes,{maxBytes:MAX_BODY,maxDepth:32,maxNodes:4096});
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return json(400,{error:'invalid_request'});
  // No durable continuation/session credential is inferred from client-supplied metadata.
  const headers=new Headers();
  for(const name of ['accept','content-type','mcp-protocol-version','mcp-method','mcp-name'])if(typeof req.headers[name]==='string')headers.set(name,req.headers[name]);
  const request=new Request(resourceUrl,{method:'POST',headers,body:bytes});
  try{
   access.assertCurrent();
   const taskManager=taskManagers.get(access.binding.id);
   const taskResponse=taskManager?await routeTaskRequest(taskManager,parsed,req.headers,access.assertCurrent):null;
   const response=taskResponse?json(200,taskResponse):await handlers.get(access.binding.id).fetch(request,{parsedBody:parsed,authInfo:{token:'',clientId:access.binding.clientId,scopes:['mcp:access'],extra:{assertCurrent:access.assertCurrent}}});
   try{access.assertCurrent();}catch{await response.body?.cancel();return challenge(metadataUrl);}
   responseChecks.set(response,()=>{try{access.assertCurrent();}catch{return challenge(metadataUrl);}});
   return response;
  }catch{return challenge(metadataUrl);}
 }
 try{
  for(const input of options.bindings){
   id(input.id);id(input.subject);id(input.clientId);check(!bindings.has(input.id));
   const config=input.gateway,selectedStore=openConfiguredEventStore(config.local),history=selectedStore instanceof ConfiguredDirectoryEventStore?selectedStore.directoryStore.path:realpathSync(config.local.historyFile),directory=privateDirectory(config.storage),domain=hash(config.local.domain);
   check(!histories.has(history)&&!directories.has(directory)&&!domains.has(domain),'DUPLICATE_BINDING_CONTEXT');
   histories.add(history);directories.add(directory);domains.add(domain);
   check(input.kind===undefined||input.kind==='cooperative');
   const lease=acquireHostLease(directory);leases.push(lease);
   const gateway=await (input.kind==='cooperative'?createCooperativeGateway: createGateway)(config);gateways.push(gateway);
   const binding=Object.freeze({id:input.id,subject:input.subject,clientId:input.clientId});bindings.set(binding.id,binding);
   check(input.tasks===undefined||input.tasks===true);check(!input.tasks||input.kind==='cooperative');
   if(input.tasks)taskManagers.set(binding.id,createTaskManager({gateway,config,binding,now,assertOwned:()=>lease.assertOwned()}));
   handlers.set(binding.id,createMcpHandler(ctx=>{
    const accessGuard=ctx.authInfo?.extra?.assertCurrent;check(typeof accessGuard==='function','ACCESS_NOT_CURRENT');
    const assertCurrent=()=>{lease.assertOwned();accessGuard();};
    const recoveryMethods=Object.fromEntries(['recover','cancel','observe'].filter(name=>typeof gateway[name]==='function').map(name=>[name,job=>gateway[name](job,{assertCurrent})]));
    return gatewayServer({...recoveryMethods,tools:()=>{assertCurrent();return gateway.tools();},
     run:(name,args)=>gateway.run(name,args,{assertCurrent}),
     status:name=>{assertCurrent();return gateway.status(name);},why:name=>{assertCurrent();return gateway.why(name);}},{tasks:input.tasks===true});
   },{legacy:'reject',responseMode:'json',maxSubscriptions:0,onerror:()=>{}}));
  }
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
  resourceUrl=`http://127.0.0.1:${server.address().port}/mcp`;
  metadataUrl=getOAuthProtectedResourceMetadataUrl(new URL(resourceUrl));
  verifier=await createAccessVerifier({issuer,keys:options.keys,resource:resourceUrl,bindings,isActive:options.isActive,now});ready=true;
  return Object.freeze({resourceUrl,metadataUrl,async close(){
   closing=true;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
   await Promise.allSettled([...taskManagers.values()].map(t=>t.close()));
   await Promise.allSettled([...handlers.values()].map(h=>h.close()));
   await Promise.allSettled(gateways.map(g=>g.close()));
   for(const lease of leases)lease.release();
  }});
 }catch(error){server.closeAllConnections();server.close();await Promise.allSettled([...taskManagers.values()].map(t=>t.close()));
   await Promise.allSettled([...handlers.values()].map(h=>h.close()));await Promise.allSettled(gateways.map(g=>g.close()));
   for(const lease of leases)lease.release();throw error;}
}
