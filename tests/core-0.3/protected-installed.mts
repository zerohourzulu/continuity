import {createProtectedEvidenceDestination,readProtectedEvidence,type ProtectedEvidenceConfiguration} from '@ramex-labs/continuity-remote';
import {createLocalDomain} from '@ramex-labs/continuity/local';
import {generateKeyPairSync} from 'node:crypto';
const keys=generateKeyPairSync('ed25519');
const evidence:ProtectedEvidenceConfiguration={bundleDirectory:'/tmp/bundle',files:[{name:'report.txt',bytes:1,sha256:'a'.repeat(64)}],resource:'evidence:test',reviewerTokenHash:'b'.repeat(64),socketPath:'/tmp/test.sock'};
const host=await createProtectedEvidenceDestination({initialize:true,directory:'/tmp/store',domain:createLocalDomain(),evidence,coordinatorPublicKey:keys.publicKey,servicePrivateKey:keys.privateKey,now:()=>100,historyProfile:'continuity-segmented-local/1'});
const read=await readProtectedEvidence({socketPath:host.readerSocket,token:'a'.repeat(64)});
if('files' in read.body){const value:string=read.body.files[0].base64;void value;}
await host.close();
