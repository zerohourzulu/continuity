import {mkdirSync,writeFileSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {createLocalDomain,createLocalAttemptOwner} from '@ramex-labs/continuity/local';
export function setup(directory){
 mkdirSync(directory,{mode:0o700});directory=realpathSync(directory);mkdirSync(join(directory,'records'),{mode:0o700});
 writeFileSync(join(directory,'incident.txt'),'Synthetic incident: investigate document access.\n',{mode:0o600});
 const key=generatePrivateKey(),account=privateKeyToAccount(key),now=Date.now();
 const local={historyFile:join(directory,'history.jsonl'),domain:createLocalDomain(),owner:'operator',controller:'host',session:'worker:1',now:Date.now,
  signHash:hash=>account.signMessage({message:{raw:hash}})};
 const owner=createLocalAttemptOwner(local);owner.createAgent({id:'worker'});owner.createRole({id:'analyst'});
 owner.appoint({agent:'worker',role:'analyst',tenure:'shift:1',number:1});
 owner.admitRuntime({agent:'worker',session:local.session,epoch:1,key:'key:worker',address:account.address,expiresAt:now+3600000});
 owner.grant({id:'read',to:'worker',actions:['read-document'],resources:['document:incident'],expiresAt:now+3600000});
 owner.grant({id:'write',to:'worker',actions:['create-ticket'],resources:['queue:incident'],expiresAt:now+3600000});
 owner.grant({id:'inspect',to:'worker',actions:['inspect-operation'],resources:['document:incident','queue:incident'],expiresAt:now+3600000});
 const upstreams=['documents','tickets'].map(id=>({id,command:process.execPath,args:[fileURLToPath(new URL('./upstream.mjs',import.meta.url)),directory,id]}));
 const operations=[{name:'read_incident',upstream:'documents',tool:'read_document',businessKey:'incident:42:read',action:'read-document',resource:'document:incident',role:'analyst',tenure:'shift:1',approval:{name:'read_document',inputSchema:{type:'object',properties:{document:{type:'string',enum:['incident']}},required:['document'],additionalProperties:false}}},
 {name:'create_incident_ticket',upstream:'tickets',tool:'create_ticket',businessKey:'incident:42:ticket',action:'create-ticket',resource:'queue:incident',role:'analyst',tenure:'shift:1',approval:{name:'create_ticket',inputSchema:{type:'object',properties:{title:{type:'string',minLength:1,maxLength:120}},required:['title'],additionalProperties:false}}}];
 const config={historyFile:local.historyFile,domain:local.domain,owner:local.owner,controller:local.controller,session:local.session,keyFile:join(directory,'worker.key'),storage:join(directory,'records'),upstreams,operations};
 writeFileSync(config.keyFile,key+'\n',{mode:0o600});
 const configFile=join(directory,'gateway.json');writeFileSync(configFile,JSON.stringify(config,null,2)+'\n',{mode:0o600});
 return {local,owner,config,configFile};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 if(process.argv.length!==3)throw Error('Usage: node examples/setup.mjs /absolute/new/case');
 const {configFile}=setup(resolve(process.argv[2]));console.log('Private case created. MCP configuration: '+configFile);
}
