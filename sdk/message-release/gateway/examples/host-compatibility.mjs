// Optional integration check. Install the three pinned tools in a separate directory.
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync,readFileSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {setup} from './setup.mjs';
import {testIssuer} from './test-issuer.mjs';
import {serveGatewayHttp} from '../src/http.mjs';
import {approval} from '../src/upstream.mjs';
const packages=process.argv[2];if(!packages)throw Error('Pass the absolute isolated host dependency directory.');
const root=realpathSync(mkdtempSync(join(tmpdir(),'continuity-host-check-')));
const gatewayRoot=dirname(dirname(fileURLToPath(import.meta.url)));
const inspector=join(packages,'node_modules/@modelcontextprotocol/inspector/clients/launcher/build/index.js');
const mcpc=join(packages,'node_modules/@apify/mcpc/dist/cli/index.js');
const filesystem=join(packages,'node_modules/@modelcontextprotocol/server-filesystem/dist/index.js');
const env={PATH:process.env.PATH,TMPDIR:process.env.TMPDIR,MCPC_HOME_DIR:join(root,'mcpc')};
async function exec(script,args){return new Promise((resolve,reject)=>{
 const p=spawn(process.execPath,[script,...args],{env,stdio:['ignore','pipe','pipe']}),out=[],err=[];let bytes=0;
 const timer=setTimeout(()=>p.kill('SIGTERM'),20000);
 p.stdout.on('data',b=>{bytes+=b.length;if(bytes>1000000)p.kill('SIGTERM');else out.push(b);});p.stderr.on('data',b=>err.push(b));
 p.on('error',reject);p.on('exit',code=>{clearTimeout(timer);const stdout=Buffer.concat(out).toString(),stderr=Buffer.concat(err).toString();if(code!==0)reject(Error('Host command failed '+code+': '+stderr+' '+stdout));else resolve(stdout);});
 });}
let issuer,http,discovery,connected=false;
try{
 const f=setup(join(root,'case')),allowed=join(root,'allowed');mkdirSync(allowed,{mode:0o700});writeFileSync(join(allowed,'incident.txt'),'Only synthetic incident text.\n',{mode:0o600});
 discovery=new Client({name:'approved-fixture-discovery',version:'1'},{versionNegotiation:{mode:'legacy'}});
 await discovery.connect(new StdioClientTransport({command:process.execPath,args:[filesystem,allowed],stderr:'pipe'}));
 const definition=(await discovery.listTools()).tools.find(t=>t.name==='read_text_file');assert.ok(definition);await discovery.close();discovery=null;
 // Trusted test operator approves only this reviewed read tool and its single-file root.
 const operation={...f.config.operations[0],tool:'read_text_file',upstream:'filesystem',approval:approval(definition)};
 const upstreams=[{id:'filesystem',command:process.execPath,args:[filesystem,allowed],protocol:'legacy'}];
 const config={...f.config,operations:[operation],upstreams};writeFileSync(f.configFile,JSON.stringify(config),{mode:0o600});
 issuer=await testIssuer();http=await serveGatewayHttp({issuer:issuer.issuer,keys:issuer.keys,allowTestIssuer:true,isActive:()=>true,
  bindings:[{id:'agent-a',subject:'alice',clientId:'example-client',gateway:{local:f.local,storage:f.config.storage,operations:[operation],upstreams}}]});
 const token=await issuer.issue(http.resourceUrl),inspectorConfig=join(root,'inspector.json');
 writeFileSync(inspectorConfig,JSON.stringify({mcpServers:{continuity:{url:http.resourceUrl,type:'streamable-http',headers:{Authorization:'Bearer '+token}}}}),{mode:0o600});
 const invoke=['--cli','--config',inspectorConfig,'--server','continuity','--protocol-era','modern'];
 const catalog=await exec(inspector,[...invoke,'--method','tools/list']);assert.ok(catalog.includes('read_incident'));
 const result=await exec(inspector,[...invoke,'--method','tools/call','--tool-name','read_incident','--tool-arg','path='+join(allowed,'incident.txt')]);assert.ok(result.includes('Only synthetic incident text.'));
 const repeated=await exec(inspector,[...invoke,'--method','tools/call','--tool-name','read_incident','--tool-arg','path='+join(allowed,'incident.txt')]);assert.ok(repeated.includes('RECONCILIATION_ONLY'));
 await http.close();http=null;
 const configFile=join(root,'mcpc.json');writeFileSync(configFile,JSON.stringify({mcpServers:{continuity:{command:process.execPath,args:[join(gatewayRoot,'src/cli.mjs'),'--config',f.configFile]}}}),{mode:0o600});
 await exec(mcpc,['connect',configFile+':continuity','@continuity-test','--no-profile','--protocol-version','2026-07-28','--json']);connected=true;
 assert.ok((await exec(mcpc,['@continuity-test','tools-list','--json'])).includes('read_incident'));
 const second=await exec(mcpc,['@continuity-test','tools-call','read_incident',JSON.stringify({path:join(allowed,'incident.txt')}),'--json']);assert.ok(second.includes('RECONCILIATION_ONLY'));
 const closed=await exec(mcpc,['@continuity-test','close']);connected=false;
 console.log('PASS Inspector 2.7.0: authenticated HTTP discovery, approved real-server read, repeat without dispatch.');
 console.log('PASS mcpc 0.6.0: modern stdio host discovery and retrieval of the original job.');
 console.log('PASS official filesystem server 2026.8.31: explicitly selected legacy upstream, one approved read tool.');
 console.log('No model call, cloud account, public endpoint, or real document was used. Tasks support by these hosts is not claimed.');
}finally{
 if(connected)await exec(mcpc,['@continuity-test','close']).catch(()=>{});
 await discovery?.close();await http?.close();await issuer?.close();rmSync(root,{recursive:true,force:true});
}
