import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {createDemo} from '../setup.mjs';
const server=fileURLToPath(new URL('../server.mjs',import.meta.url));
function setup(t){const root=mkdtempSync(join(tmpdir(),'continuity-mcp-wire-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return createDemo(join(root,'case'));}
async function connect(t,config,mode={pin:'2026-07-28'}){
 const client=new Client({name:'continuity-wire-test',version:'1'},{versionNegotiation:{mode}});
 const transport=new StdioClientTransport({command:process.execPath,args:[server,'--config',config],stderr:'pipe'});
 t.after(()=>client.close());await client.connect(transport);return client;
}
const call=(client,id='collection:42',extra={})=>client.callTool({name:'continuity_collect_evidence',arguments:{operationId:id,resource:'incident:42',...extra}});

test('official modern MCP client collects, retries and fences the still-live old server',async t=>{
 const {configFile,config,owner}=setup(t),client=await connect(t,configFile);
 const listing=await client.listTools();assert.deepEqual(listing.tools.map(t=>t.name),['continuity_collect_evidence']);
 const first=await call(client);assert.equal(first.structuredContent.status,'RECORDED');assert.equal(first.structuredContent.packetVerified,true);
 const before=readFileSync(config.historyFile);const repeated=await call(client);assert.equal(repeated.structuredContent.status,'RECONCILIATION_ONLY');assert.deepEqual(readFileSync(config.historyFile),before);
 assert.equal(JSON.stringify(first).includes(config.inputDirectory),false);assert.equal(JSON.stringify(first).includes('runtime.key'),false);
 owner.advanceEpoch({agent:'bea',from:1,to:2});const denied=await call(client,'obsolete:42');assert.equal(denied.isError,true);assert.equal(denied.structuredContent.reason,'RUNTIME_NOT_CURRENT');
 assert.equal((await client.listTools()).tools.length,1);assert.equal(readdirSync(config.outputDirectory).length,1);
});
test('legacy negotiation uses the same protected boundary',async t=>{
 const {configFile}=setup(t),client=await connect(t,configFile,'legacy');assert.equal((await call(client)).structuredContent.status,'RECORDED');
});
test('MCP caller cannot substitute actor, paths, resource or arbitrary tool name',async t=>{
 const {configFile,config}=setup(t),client=await connect(t,configFile),before=readFileSync(config.historyFile);
 for(const extra of [{actor:'operations'},{session:'other'},{inputDirectory:'/etc'},{resource:'other'}]){
  const result=await call(client,'refused',extra);assert.equal(result.isError,true);
 }
 await assert.rejects(client.callTool({name:'grant',arguments:{to:'bea'}}));
 assert.deepEqual(readFileSync(config.historyFile),before);assert.deepEqual(readdirSync(config.outputDirectory),[]);
});
test('current grant revocation denies a new wire call without copying anything',async t=>{
 const {configFile,config,owner}=setup(t),client=await connect(t,configFile);owner.revoke('collect');
 const denied=await call(client);assert.equal(denied.structuredContent.status,'DENIED');assert.deepEqual(readdirSync(config.outputDirectory),[]);
});
test('original JSON duplicate keys and overlarge frames terminate before any effect',async t=>{
 const {configFile,config}=setup(t);
 for(const input of ['{"jsonrpc":"2.0","id":1,"id":2,"method":"tools/list"}\n','x'.repeat(17000)]){
  const child=spawn(process.execPath,[server,'--config',configFile],{stdio:['pipe','pipe','pipe']});let stderr='';child.stderr.on('data',b=>stderr+=b);child.stdin.on('error',()=>{});
  const exit=new Promise((accept,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('wire refusal timeout'))},6000);child.on('exit',code=>{clearTimeout(timer);accept(code)})});
  child.stdin.end(input);assert.equal(await exit,2);assert.match(stderr,/INPUT_REFUSED/);
 }
 assert.deepEqual(readdirSync(config.outputDirectory),[]);
});
test('changed key cannot authenticate as the configured agent',async t=>{
 const {configFile,config}=setup(t);
 const {generatePrivateKey}=await import('viem/accounts');writeFileSync(config.keyFile,generatePrivateKey()+'\n',{mode:0o600});
 const client=await connect(t,configFile),result=await call(client);assert.equal(result.isError,true);assert.equal(result.structuredContent.status,'REFUSED');assert.deepEqual(readdirSync(config.outputDirectory),[]);
});
test('an incomplete frame reaches the actual deadline and leaves no effect',async t=>{
 const {configFile,config}=setup(t);const child=spawn(process.execPath,[server,'--config',configFile],{stdio:['pipe','pipe','pipe']});let stderr='';child.stderr.on('data',b=>stderr+=b);child.stdin.on('error',()=>{});
 const exit=new Promise((accept,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('frame deadline did not fire'))},8000);child.on('exit',code=>{clearTimeout(timer);accept(code)})});
 child.stdin.write('{');assert.equal(await exit,2);assert.match(stderr,/FRAME_TIMEOUT/);assert.deepEqual(readdirSync(config.outputDirectory),[]);
});
