// Ordinary local MCP server: no Continuity imports, signatures or special protocol.
import {McpServer,fromJsonSchema,ProtocolError} from '@modelcontextprotocol/server';
import {serveStdio,StdioServerTransport} from '@modelcontextprotocol/server/stdio';
import {Transform} from 'node:stream';
import {readFileSync,writeFileSync,appendFileSync,existsSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {join} from 'node:path';
const [directory,kind]=process.argv.slice(2);
const server=new McpServer({name:'local-'+kind,version:'1'},{capabilities:{tools:{}}});
const schema=kind==='documents'?{type:'object',properties:{document:{type:'string',enum:['incident']}},required:['document'],additionalProperties:false}:
 {type:'object',properties:{title:{type:'string',minLength:1,maxLength:120}},required:['title'],additionalProperties:false};
const control=()=>{try{return JSON.parse(readFileSync(join(directory,kind+'.control.json'),'utf8'));}catch{return {};}};
if(control().openSchema)delete schema.additionalProperties;
if(control().changed)schema.properties.extra={type:'string'};
server.registerTool(kind==='documents'?'read_document':'create_ticket',{inputSchema:fromJsonSchema(schema)},async args=>{
 const behavior=control();
 // An ordinary downstream cannot rely on a Continuity-generated transport ID.
 let text;
 if(kind==='documents')text=readFileSync(join(directory,'incident.txt'),'utf8');
 else {
  const log=join(directory,kind+'.calls.jsonl');
  const number=existsSync(log)?readFileSync(log,'utf8').trim().split('\n').length+1:1;
  const ticket=openSync(join(directory,'ticket-'+number+'.json'),'wx',0o600);
  try{writeFileSync(ticket,JSON.stringify({number,title:args.title})+'\n');fsyncSync(ticket);}finally{closeSync(ticket);}
  text='Created local ticket '+number+': '+args.title;
 }
 const row={kind,arguments:args};
 if(behavior.checkAuthEnvironment)row.authenticationEnvironmentPresent=Boolean(process.env.GATEWAY_ACCESS_TOKEN||process.env.AUTHORIZATION);
 const fd=openSync(join(directory,kind+'.calls.jsonl'),'a',0o600);
 try{writeFileSync(fd,JSON.stringify(row)+'\n');fsyncSync(fd);}finally{closeSync(fd);}
 if(behavior.crash)process.exit(7);
 if(behavior.delay)await new Promise(r=>setTimeout(r,behavior.delay));
 if(behavior.headerMismatch||behavior.duplicate||behavior.oversized)return {content:[{type:'text',text:'WIRE_FAULT'}]};
 if(behavior.invalidOutput)return {content:[{type:'image',mimeType:'image/png',data:'AA=='}]};
 if(behavior.error)return {isError:true,content:[{type:'text',text:'The service refused this request.'}]};
 return {content:[{type:'text',text:text}]};
});
// Fault injection is confined to this demo fixture; ordinary tool code above
// has no Continuity awareness. Rewrite a result into actual wire-level failures.
const output=new Transform({transform(chunk,encoding,callback){
 try{const response=JSON.parse(chunk.toString());
  if(response.result?.content?.[0]?.text==='WIRE_FAULT'){
   const b=control();
   if(b.headerMismatch)return callback(null,JSON.stringify({jsonrpc:'2.0',id:response.id,error:{code:-32020,message:'Header mismatch'}})+'\n');
   if(b.duplicate)return callback(null,'{"jsonrpc":"2.0","id":'+JSON.stringify(response.id)+',"result":{},"result":{"content":[]}}\n');
   if(b.oversized)return callback(null,JSON.stringify({jsonrpc:'2.0',id:response.id,result:{content:[{type:'text',text:'x'.repeat(70000)}]}})+'\n');
  }
 }catch{}callback(null,chunk);
}});output.pipe(process.stdout);
serveStdio(()=>server,{legacy:'serve',maxSubscriptions:0,transport:new StdioServerTransport(process.stdin,output)});
