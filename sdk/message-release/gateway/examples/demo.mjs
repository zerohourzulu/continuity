import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {setup} from './setup.mjs';
const root=mkdtempSync(join(tmpdir(),'continuity-gateway-demo-'));
let client;
try{
 const dir=join(root,'case'),{configFile,owner}=setup(dir);
 client=new Client({name:'gateway-demo',version:'1'},{versionNegotiation:{mode:{pin:'2026-07-28'}}});
 await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/cli.mjs',import.meta.url)),'--config',configFile],stderr:'pipe'}));
 const call=async(name,args)=>(await client.callTool({name,arguments:args})).structuredContent;
 console.log('Available:',(await client.listTools()).tools.map(t=>t.name).join(', '));
 assert.equal((await call('read_incident',{document:'incident'})).status,'RESPONSE_RETAINED');
 assert.equal((await call('create_incident_ticket',{title:'Investigate incident 42'})).status,'RESPONSE_RETAINED');
 assert.equal((await call('create_incident_ticket',{title:'Investigate incident 42'})).status,'RECONCILIATION_ONLY');
 assert.equal(readFileSync(join(dir,'tickets.calls.jsonl'),'utf8').trim().split('\n').length,1);
 console.log('Read incident; created one ticket; repeating the job inspected the original response.');
 console.log('Status:',(await call('continuity_status',{job:'create_incident_ticket'})).status);
 owner.advanceEpoch({agent:'worker',from:1,to:2});
 assert.equal((await call('create_incident_ticket',{title:'Investigate incident 42'})).reason,'RUNTIME_NOT_CURRENT');
 console.log('Retired worker is still connected but cannot use the job or inspect private results.');
 console.log('Pass: two ordinary upstream MCP servers, shared Core, one durable ticket and no automatic retry.');
}finally{await client?.close();rmSync(root,{recursive:true,force:true});}
