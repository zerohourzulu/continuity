import {McpServer,fromJsonSchema} from '@modelcontextprotocol/server';
import {serveStdio,StdioServerTransport} from '@modelcontextprotocol/server/stdio';
import {guardedInput} from './guard.mjs';
const reply=value=>({isError:['DENIED','REFUSED','BUSY','OUTCOME_UNKNOWN'].includes(value.status)||value.upstreamResult?.isError===true,
 content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value});
export function gatewayServer(gateway,{tasks=false}={}){
 const server=new McpServer({name:'continuity-mcp-gateway',version:'0.3.0-preview.5'},{capabilities:{tools:{},...(tasks?{extensions:{'io.modelcontextprotocol/tasks':{}}}:{})}});
 for(const tool of gateway.tools())server.registerTool(tool.name,{description:tool.description,inputSchema:fromJsonSchema(tool.inputSchema),
  annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:true,idempotentHint:true}},args=>gateway.run(tool.name,args).then(reply));
 const selection=fromJsonSchema({type:'object',properties:{job:{type:'string',enum:gateway.tools().map(t=>t.name)}},required:['job'],additionalProperties:false});
 server.registerTool('continuity_status',{description:'Inspect the original approved job without sending it again. Requires current inspection permission.',inputSchema:selection,
  annotations:{readOnlyHint:true,openWorldHint:false}},({job})=>reply(gateway.status(job)));
 server.registerTool('continuity_why',{description:'Check current permission for a job. This explanation is not permission to execute.',inputSchema:selection,
  annotations:{readOnlyHint:true,openWorldHint:false}},({job})=>reply(gateway.why(job)));
 for(const [method,name,description,readOnly] of [
  ['recover','continuity_recover','Ask the cooperating service about the original attempt; never resend it.',true],
  ['cancel','continuity_cancel','Request cancellation under separate Core permission. A completed effect cannot be undone.',false],
  ['observe','continuity_observe','Record a verified retained applied report under separate observation permission; no tool dispatch.',false],
 ])if(typeof gateway[method]==='function')server.registerTool(name,{description,inputSchema:selection,
  annotations:{readOnlyHint:readOnly,destructiveHint:!readOnly,openWorldHint:true,idempotentHint:true}},async({job})=>reply(await gateway[method](job)));
 return server;
}
export function serveGateway(gateway){
 return serveStdio(()=>gatewayServer(gateway),{legacy:'serve',maxSubscriptions:0,
  transport:new StdioServerTransport(guardedInput(process.stdin),process.stdout,{maxBufferSize:16384}),
  onerror:()=>process.stderr.write('GATEWAY_TRANSPORT_ERROR\n')});
}
