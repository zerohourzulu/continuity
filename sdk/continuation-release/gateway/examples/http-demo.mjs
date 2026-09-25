import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client,StreamableHTTPClientTransport,discoverOAuthProtectedResourceMetadata,discoverAuthorizationServerMetadata} from '@modelcontextprotocol/client';
import {serveGatewayHttp} from '../src/http.mjs';
import {setup} from './setup.mjs';
import {testIssuer} from './test-issuer.mjs';

const root=mkdtempSync(join(tmpdir(),'continuity-http-demo-')),issuer=await testIssuer();
let service,client,active=true;
try{
 const f=setup(join(root,'case'));
 service=await serveGatewayHttp({issuer:issuer.issuer,keys:issuer.keys,allowTestIssuer:true,isActive:()=>active,
  bindings:[{id:'agent-a',subject:'alice',clientId:'example-client',gateway:{...f.config,local:f.local}}]});
 const metadata=await discoverOAuthProtectedResourceMetadata(new URL(service.resourceUrl));
 const authorization=await discoverAuthorizationServerMetadata(metadata.authorization_servers[0]);
 console.log('Discovered the gateway resource and its test issuer:',authorization.issuer===issuer.issuer);
 const token=await issuer.issue(service.resourceUrl);
 client=new Client({name:'continuity-http-demo',version:'1'},{versionNegotiation:{mode:{pin:'2026-07-28'}}});
 await client.connect(new StreamableHTTPClientTransport(new URL(service.resourceUrl),{requestInit:{headers:{Authorization:'Bearer '+token}}}));
 const tools=await client.listTools({cursor:''});console.log('Approved jobs:',tools.tools.map(t=>t.name).join(', '));
 const definition=tools.tools.find(t=>t.name==='create_incident_ticket');
 const call=()=>client.callTool({name:definition.name,arguments:{title:'Review synthetic incident'}},{toolDefinition:definition});
 console.log('First call:',(await call()).structuredContent.status);
 console.log('Repeat:',(await call()).structuredContent.status);
 active=false;
 try{await call();throw Error('Revoked access unexpectedly worked');}catch(error){if(error.message==='Revoked access unexpectedly worked')throw error;console.log('Revoked login: refused. Original work remains recorded.');}
}finally{await client?.close();await service?.close();await issuer.close();rmSync(root,{recursive:true,force:true});}
