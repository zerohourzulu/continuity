// Immutable observation viewer. No Core, application, signer or executor import.
import { readFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { startWorkbench } from './server.mjs';
import { inspectDeskRecording } from './inspect-desk-retained.mjs';
const directory=resolve(process.argv[2]);inspectDeskRecording(directory);
const read=name=>readFileSync(join(directory,name),'utf8');
const d=JSON.parse(read('FINAL.json')),ids=new Set(d.reviews.map(r=>r.challengeId));
const selected=(id,prefix)=>{if(!ids.has(id)) throw new Error('UNKNOWN_RECORDED_REVIEW');return read(prefix+'-'+id+'.json');};
const forbidden=()=>{throw new Error('RECORDING_IS_READ_ONLY');};
const application={desk:async()=>({...d,scope:{...d.scope,readingMode:'RETAINED_OBSERVATION',currentAuthority:'NOT_EVALUATED'}}),
  view:async id=>{const v=JSON.parse(selected(id,'VIEW'));return {...v,scope:{...v.scope,readingMode:'RETAINED_OBSERVATION',currentAuthority:'NOT_EVALUATED'}};},
  downloadChallenge:id=>selected(id,'CHALLENGE'),downloadDisplay:id=>selected(id,'DISPLAY'),
  importDecision:forbidden,admit:forbidden,invoke:forbidden,reconcile:forbidden};
const server=await startWorkbench({application,desk:true,readOnly:true});console.log(server.url);
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,async()=>{await server.close();process.exit(0);});
