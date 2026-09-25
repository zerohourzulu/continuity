// Optional Linux lab check. Requires a preinstalled root-owned, read-only fixture.
// Never run against real documents or a production machine.
import {mkdtempSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {setup} from './setup.mjs';
import {createGateway} from '../src/gateway.mjs';
import {approval} from '../src/upstream.mjs';
const fixtureRoot=process.argv[2];if(process.platform!=='linux'||!fixtureRoot)throw Error('Use only the prepared disposable Linux fixture.');
const root=realpathSync(mkdtempSync(join(tmpdir(),'continuity-isolation-'))),f=setup(join(root,'case'));
const server=join(fixtureRoot,'node_modules/@modelcontextprotocol/server-filesystem/dist/index.js'),allowed=join(fixtureRoot,'allowed');
const command='/usr/bin/sudo',args=['-n','-u','nobody',process.execPath,server,allowed];
let client,gateway;
try{
 for(const path of [f.config.keyFile,f.local.historyFile]){
  const read=spawnSync(command,['-n','-u','nobody','/usr/bin/cat',path],{encoding:'utf8'});
  assert.notEqual(read.status,0,'unprivileged upstream must not read the runtime key/history');assert.equal(read.stdout,'');
 }
 client=new Client({name:'isolated-read-fixture',version:'1'},{versionNegotiation:{mode:'legacy'}});
 await client.connect(new StdioClientTransport({command,args,stderr:'pipe'}));
 const tool=(await client.listTools()).tools.find(t=>t.name==='read_text_file');assert.ok(tool);
 const bypass=await client.callTool({name:'read_text_file',arguments:{path:f.config.keyFile}});assert.equal(bypass.isError,true);
 await client.close();client=null;
 const operation={...f.config.operations[0],upstream:'filesystem',tool:'read_text_file',approval:approval(tool)};
 gateway=await createGateway({local:f.local,storage:f.config.storage,upstreams:[{id:'filesystem',command,args,protocol:'legacy'}],operations:[operation]});
 const result=await gateway.run('read_incident',{path:join(allowed,'incident.txt')});assert.equal(result.status,'RESPONSE_RETAINED');
 assert.ok(result.upstreamResult.content.some(c=>c.text.includes('Only synthetic isolated incident text.')));
 const repeated=await gateway.run('read_incident',{path:join(allowed,'incident.txt')});assert.equal(repeated.status,'RECONCILIATION_ONLY');
 console.log('PASS: real filesystem upstream runs as nobody; host key/history reads denied.');
 console.log('PASS: approved synthetic read and reconciliation through shared Core.');
 console.log('Boundary: separate-user read fixture; no claim of a complete hostile-agent sandbox.');
}finally{await client?.close();await gateway?.close();rmSync(root,{recursive:true,force:true});}
