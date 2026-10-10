import { humanOperatorCommandError } from './human-command-error.mjs';
// Explicit Linux-only operator desk. No broker creation, agent launch or signing.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNativeDocumentTransport } from './document-transport.mjs';
import { createDocumentDeskApplication } from './document-application.mjs';
import { startWorkbench } from './server.mjs';
export async function main(args){
  if(args.length!==1)throw new Error('USAGE_SERVE_DOCUMENT_ROOT_OWNED_TRANSPORT_CONFIG');
  const transport=createNativeDocumentTransport(resolve(args[0]));
  const application=createDocumentDeskApplication(transport);
  const server=await startWorkbench({application,document:true});
  let stopping=false;
  const stop=async()=>{if(stopping)return;stopping=true;await server.close();};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  process.stdout.write(JSON.stringify({status:'DOCUMENT_DESK_READY',url:server.url,caseId:transport.caseId,release:'SEPARATE_ENROLLED_AGENT_CLIENT_ONLY',signing:'DETACHED_ONLY'})+'\n');
  return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(()=>{process.stderr.write(humanOperatorCommandError({code:'DOCUMENT_DESK_START_FAILED'})+'\n');process.exitCode=1;});
