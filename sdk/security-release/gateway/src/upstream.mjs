import {readFileSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {Client} from '@modelcontextprotocol/client';
import {ProtectedStdioTransport} from './stdio.mjs';
import {check,data,exact,id,same,fail} from './data.mjs';
export function captureUpstream(input){
 const value=exact(data(input),['id','command','args'],['cwd','protocol']);id(value.id);
 check(typeof value.command==='string'&&isAbsolute(value.command));
 check(Array.isArray(value.args)&&value.args.length<=32&&value.args.every(a=>typeof a==='string'&&a.length<=2048));
 check(value.protocol===undefined||value.protocol==='2026-07-28'||value.protocol==='legacy');
 if(value.cwd!==undefined)check(typeof value.cwd==='string'&&isAbsolute(value.cwd));
 return value;
}
export function approval(tool){
 check(tool&&typeof tool==='object');
 return data({name:id(tool.name),inputSchema:tool.inputSchema,
  ...(tool.outputSchema===undefined?{}:{outputSchema:tool.outputSchema}),
  ...(tool.annotations===undefined?{}:{annotations:tool.annotations}),
  ...(tool.execution===undefined?{}:{execution:tool.execution})});
}
export async function connectUpstream(config,timeout){
 const transport=new ProtectedStdioTransport(config);
 const client=new Client({name:'continuity-gateway-upstream',version:JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version},
  {versionNegotiation:{mode:config.protocol==='legacy'?'legacy':{pin:'2026-07-28'}},capabilities:{}});
 // Do not forward upstream stderr: a tool may print private payloads/credentials.

 try{await client.connect(transport,{timeout});}catch(error){await transport.close();throw error;}
 return {client,close:()=>client.close(),
  async verify(expected){
   // Pin one bounded page. Automatic pagination could allow unbounded discovery.
   const listed=await client.listTools({cursor:''},{timeout,cacheMode:'refresh'});
   check(!listed.nextCursor&&listed.tools.length<=64,'CATALOG_LIMIT');
   const names=new Set();for(const t of listed.tools){check(!names.has(t.name),'CATALOG_CONFLICT');names.add(t.name);}
   const tool=listed.tools.find(t=>t.name===expected.name);
   check(tool&&same(approval(tool),expected),'TOOL_CHANGED');
  },
  async call(expected,args){
   // Supplying the approved definition disables SDK HeaderMismatch redelivery.
   const raw=await client.callTool({name:expected.name,arguments:args},{timeout,toolDefinition:expected});
   check(!raw.resultType||raw.resultType==='result','UNSUPPORTED_RESULT');
   check(!raw.inputRequests&&!raw.task,'UNSUPPORTED_RESULT');
   check(Array.isArray(raw.content)&&raw.content.length<=16,'UNSUPPORTED_RESULT');
   // M01 deliberately forwards only bounded text/JSON. No links/binary/resources.
   const content=raw.content.map(c=>{check(c.type==='text'&&typeof c.text==='string','UNSUPPORTED_RESULT');return {type:'text',text:c.text};});
   const result=data({isError:raw.isError===true,content,...(raw.structuredContent===undefined?{}:{structuredContent:raw.structuredContent})});
   check(Buffer.byteLength(JSON.stringify(result))<=16384,'RESPONSE_LIMIT');return result;
  }};
}
