// Explicit local read-only workbench for the completed original case, never a relocated replay.
import { readFileSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { openApprovalApplication } from './application.mjs';
import { startWorkbench } from './server.mjs';
if(process.argv.length!==3) throw new Error('WORKBENCH_ARGUMENTS');
const root=resolve(process.argv[2]),run=JSON.parse(readFileSync(join(root,'RUN.json'),'utf8')),final=JSON.parse(readFileSync(join(root,'VIEW-FINAL.json'),'utf8'));
const application=openApprovalApplication({policyPath:join(root,run.policyRelative),caseDirectory:join(root,run.caseRelative)});
const server=await startWorkbench({application,challengeId:final.challenge.challengeId,readOnly:true});
process.stdout.write(server.url+'\n');
let closing=false;for(const signal of ['SIGINT','SIGTERM']) process.on(signal,async()=>{if(closing)return;closing=true;await server.close();process.exit(0);});
