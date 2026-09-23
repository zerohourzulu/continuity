#!/usr/bin/env node
// Print a reviewed launch fragment. Never load gateway code or read case contents.
import {accessSync,constants,lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,join,resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
const help='Usage: node tools/mcp-client-config.mjs --client vscode|claude|portable --gateway-dir PATH --config PATH\nPrints JSON only; does not edit settings, inspect keys or start tools. Use Node 22.18+ (22.x) or 24.x on macOS/Linux.';
function fail(code,message){throw Object.assign(new Error(message),{code});}
export function clientConfig(args){
 const allowed=new Set(['--client','--gateway-dir','--config']),opts={};
 if(args.length!==6)fail('USAGE',help);
 for(let i=0;i<args.length;i+=2){const k=args[i],v=args[i+1];if(!allowed.has(k)||Object.hasOwn(opts,k)||!v||v.startsWith('--')||/[\u0000-\u001f\u007f]/u.test(v))fail('USAGE',help);opts[k]=v;}
 if(!['vscode','claude','portable'].includes(opts['--client']))fail('USAGE',help);
 const [major,minor]=process.versions.node.split('.').map(Number);
 if(!['darwin','linux'].includes(process.platform)||(major!==24&&!(major===22&&minor>=18)))fail('UNSUPPORTED_RUNTIME','Run this helper with Node 22.18+ on the 22.x line or Node 24 on macOS/Linux.');
 let gateway,config,cli;
 try{
  gateway=realpathSync(resolve(opts['--gateway-dir']));
  const metaPath=join(gateway,'package.json'),s=lstatSync(metaPath);
  if(!s.isFile()||s.size>65536)throw Error();
  const p=JSON.parse(readFileSync(metaPath,'utf8'));
  if(p.name!=='@ramex-labs/continuity-mcp-gateway'||p.version!=='0.3.0-preview.7'||p.bin?.['continuity-mcp-gateway']!=='./src/cli.mjs')throw Error();
  cli=join(gateway,'src/cli.mjs');if(!lstatSync(cli).isFile())throw Error();accessSync(cli,constants.R_OK);
 }catch{fail('GATEWAY_UNAVAILABLE','Choose a trusted installation of @ramex-labs/continuity-mcp-gateway@0.3.0-preview.7.');}
 try{
  const input=resolve(opts['--config']),s=lstatSync(input);
  if(!s.isFile()||s.nlink!==1||(s.mode&0o077)!==0||s.size>131072)throw Error();
  config=realpathSync(input);const parent=lstatSync(dirname(config));
  if(!parent.isDirectory()||(parent.mode&0o077)!==0)throw Error();accessSync(config,constants.R_OK);
 }catch{fail('CONFIG_UNAVAILABLE','Choose an existing private gateway.json in a private case directory. This helper never changes permissions or creates a case.');}
 const command=realpathSync(process.execPath);if(!isAbsolute(command))fail('NODE_UNAVAILABLE','Use an installed Node executable.');
 const entry={command,args:[cli,'--config',config]};
 if(opts['--client']==='vscode')return {servers:{'continuity-gateway':{type:'stdio',...entry}}};
 return {mcpServers:{'continuity-gateway':entry}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.argv.length===3&&process.argv[2]==='--help'){console.log(help);}else{
  try{process.stdout.write(JSON.stringify(clientConfig(process.argv.slice(2)),null,2)+'\n');}
  catch(e){process.stderr.write(`${e.code??'SETUP_UNAVAILABLE'}: ${e.message}\n`);process.exitCode=2;}
 }
}
