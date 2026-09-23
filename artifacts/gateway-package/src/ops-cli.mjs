#!/usr/bin/env node
import {inspectCase,snapshotCase,verifySnapshot,recoverDeadHost} from './operations.mjs';
try{
 const [command,...args]=process.argv.slice(2),options={};
 if(args.length%2)throw Error();
 for(let i=0;i<args.length;i+=2){const key={'--history':'historyFile','--storage':'storage','--directory':'directory'}[args[i]];if(!key||options[key])throw Error();options[key]=args[i+1];}
 const allowed={inspect:['historyFile','storage'],snapshot:['historyFile','storage','directory'],verify:['directory'],'recover-dead-host':['storage']}[command];
 if(!allowed||Object.keys(options).length!==allowed.length||allowed.some(k=>!options[k]))throw Error();
 const result=command==='inspect'?inspectCase(options):command==='snapshot'?snapshotCase(options):command==='verify'?verifySnapshot(options.directory):recoverDeadHost(options.storage);
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}catch(error){process.stderr.write(JSON.stringify({status:'REFUSED',reason:/^[A-Z_]{3,60}$/.test(error.code??'')?error.code:'OPERATION_UNAVAILABLE'})+'\n');process.exitCode=2;}
