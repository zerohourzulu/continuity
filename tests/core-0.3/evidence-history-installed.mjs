// Run from a fresh consumer containing the exact coordinated npm archives.
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {createDemo} from './node_modules/@ramex-labs/continuity-mcp/setup.mjs';
import {PortableFileEventStore,stateOf} from '@ramex-labs/continuity/adapter';
import {prepareMigration,stageMigration,activateMigration,openHistoryBinding} from '@ramex-labs/continuity/history-store';
const root=realpathSync(mkdtempSync(join(tmpdir(),'ct-evidence-installed-')));let client;
try {
 const demo=createDemo(join(root,'case')),file=demo.config.historyFile;
 const events=new PortableFileEventStore(file).readAll(),time=events.at(-1).timestamp;
 new PortableFileEventStore(file).appendAll(Array.from({length:300-events.length},(_,i)=>({id:'fixture:'+i,type:'PRINCIPAL_CREATED',timestamp:time,data:{principalId:'fixture:'+i}})));
 const expectedHead=stateOf(new PortableFileEventStore(file).readAll()).head;
 const plan=join(root,'plan.json'),binding=join(root,'binding.json');
 prepareMigration({sourceFile:file,targetDirectory:join(root,'continued'),planFile:plan,expectedHead,configurationFiles:[binding],artifactFiles:[],quiesced:true});
 stageMigration(plan,{quiesced:true});activateMigration(plan,{quiesced:true});
 const {historyFile,...config}=demo.config;
 writeFileSync(demo.configFile,JSON.stringify({...config,historyProfile:'continuity-segmented-local/1',historyBinding:binding}),{mode:0o600});
 client=new Client({name:'continuation-installed-check',version:'1.0.0'},{versionNegotiation:{mode:{pin:'2026-07-28'}}});
 await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./node_modules/@ramex-labs/continuity-mcp/server.mjs',import.meta.url)),'--config',demo.configFile],stderr:'pipe'}));
 assert.ok((await client.listTools()).tools.some(x=>x.name==='continuity_collect_evidence'));
 const run=()=>client.callTool({name:'continuity_collect_evidence',arguments:{operationId:'installed:continued',resource:'incident:42'}});
 const first=await run();assert.ok(!first.isError,JSON.stringify(first));
 const content=first.structuredContent;assert.equal(content?.status,'RECORDED',JSON.stringify(first));
 const count=openHistoryBinding(binding).snapshot().history.eventCount;
 const retry=await run();assert.ok(!retry.isError,JSON.stringify(retry));assert.equal(retry.structuredContent?.status,'RECONCILIATION_ONLY');
 assert.equal(openHistoryBinding(binding).snapshot().history.eventCount,count);assert.ok(count>300);
 console.log(JSON.stringify({status:'PASS',node:process.version,evidenceMcpContinued:true,initialEvents:300,finalEvents:count,retryAppended:false}));
} finally {await client?.close();rmSync(root,{recursive:true,force:true});}
