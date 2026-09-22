// Local convenience over the existing bounded observation interface.
import { readFileSync, writeFileSync, existsSync, realpathSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runObservation } from '../lib/reader-runner.mjs';
const root=realpathSync(fileURLToPath(new URL('../',import.meta.url)));
const usage='Use: node tools/case.mjs status CASE [--json] | check CASE review|collect [--json] | mcp-config CASE --disclosure summary|evidence';
try {
  const [command,name,...rest]=process.argv.slice(2);
  if(!['status','check','mcp-config'].includes(command)||!name||!/^[a-z][a-z0-9-]{0,31}$/.test(name))throw Error(usage);
  const caseDir=join(root,'integrations/core-0.2-reference/cases',name),history=join(caseDir,'history.jsonl');
  if(realpathSync(caseDir)!==caseDir||lstatSync(history).isSymbolicLink())throw Error('Case must use its original non-symlink directory and history');
  const source={path:history,source:'local-file',disclosure:'summary'};
  if(command==='mcp-config') {
    if(rest.length!==2||rest[0]!=='--disclosure'||!['summary','evidence'].includes(rest[1]))throw Error(usage);
    runObservation(source,'status'); // Refuse invalid/unreadable history before creating configuration.
    const disclosure=rest[1], output=join(root,'runs',name);
    if(realpathSync(output)!==output)throw Error('Run directory must not be aliased');
    const configPath=join(output,`mcp-reader-${disclosure}.json`),clientPath=join(output,`mcp-client-${disclosure}.json`);
    const operations=disclosure==='summary'?['verify','status','check']:['verify','status','check','why','responsible','survives','handover_report'];
    const config={version:'continuity-reader-config/1',root:caseDir,sources:{[name]:{file:'history.jsonl',disclosure,operations}}};
    const client={command:process.execPath,args:[join(root,'integrations/retained-evidence-mcp/src/server.mjs'),'--config',configPath]};
    const pairs=[[configPath,JSON.stringify(config,null,2)+'\n'],[clientPath,JSON.stringify(client,null,2)+'\n']];
    for(const [path,bytes] of pairs)if(existsSync(path)&&(lstatSync(path).isSymbolicLink()||readFileSync(path,'utf8')!==bytes))throw Error('Existing config differs; nothing overwritten: '+path);
    for(const [path,bytes] of pairs)if(!existsSync(path))writeFileSync(path,bytes,{flag:'wx',mode:0o600});
    console.log(JSON.stringify({case:name,disclosure,operations,readerConfig:configPath,hostFields:clientPath,note:'Local paths only. All clients of this process share this disclosure. Restart after configuration changes; no write or execution tools.'},null,2));
  } else {
    let operation=command,args={};
    if(command==='check'){
      const choice=rest.shift();if(!['review','collect'].includes(choice))throw Error(usage);
      args={actor:`b:${name}`,action:choice==='review'?'record-review-progress':'collect-evidence-packet',resource:`${choice==='review'?'obligation':'resource'}:${name}`};
    }
    if(rest.length>1||(rest.length===1&&rest[0]!=='--json'))throw Error(usage);
    const value=runObservation(source,operation,args);
    if(rest[0]==='--json')console.log(JSON.stringify(value,null,2));
    else {
      console.log(`Case ${name}: ${value.decision??value.replayStatus}${value.code?' / '+value.code:''}`);
      if(value.request)console.log(`${value.request.actor}: ${value.request.action} on ${value.request.resource}`);
      console.log(`History position ${value.head.position}; time ${value.evaluationTime}; hash ${value.head.hash}`);
      console.log(value.scopeNote);
    }
  }
} catch(error){console.error(`${error.code??error.message}\n${usage}\nUse the exact case name printed by node tutorial/start.mjs. Existing evidence is retained.`);process.exitCode=2;}
