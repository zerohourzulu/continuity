import * as core from './engine-api.js';
import {parseCase,runCase} from './model.js';
const fixture=await fetch('./fixture.json').then(r=>{if(!r.ok)throw Error('Recorded example unavailable');return r.json();});
// No object RPC, user scripts, module URLs, network destinations or executable adapters.
self.onmessage=({data})=>{
 try {const c=parseCase(data);const result=runCase(core,c,fixture);self.postMessage(JSON.stringify({ok:true,result},(_,v)=>typeof v==='bigint'?{$bigint:v.toString()}:v));}
 catch(e){self.postMessage(JSON.stringify({ok:false,error:e.message}));}
};
self.postMessage(JSON.stringify({ready:true}));
