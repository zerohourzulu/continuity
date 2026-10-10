import { resolve } from 'node:path';
import { openComparisonRecording } from './inspect-comparison-retained.mjs';
import { startWorkbench } from './server.mjs';
const application=openComparisonRecording(resolve(process.argv[2]));
const server=await startWorkbench({application,desk:true,readOnly:true});console.log(server.url);
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,async()=>{await server.close();process.exit(0);});
