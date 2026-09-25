import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,realpathSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,createHash,randomBytes} from 'node:crypto';
import {createLocalDomain} from '@ramex-labs/continuity/local';
import {createProtectedEvidenceDestination,readProtectedEvidence} from '@ramex-labs/continuity-remote';
const dir=realpathSync(mkdtempSync(join(tmpdir(),'ct-pkg-'))),bundle=join(dir,'bundle'),directory=join(dir,'state');
for(const path of [bundle,directory])mkdirSync(path,{mode:0o700});
const bytes=Buffer.from('Synthetic installed-package example'),sha=x=>createHash('sha256').update(x).digest('hex'),token=randomBytes(32).toString('hex');
writeFileSync(join(bundle,'report.txt'),bytes,{mode:0o400});
const coordinator=generateKeyPairSync('ed25519'),service=generateKeyPairSync('ed25519');
const evidence={bundleDirectory:bundle,files:[{name:'report.txt',bytes:bytes.length,sha256:sha(bytes)}],resource:'evidence:package',reviewerTokenHash:sha(token),socketPath:join(dir,'read.sock')};
const config={initialize:true,directory,domain:createLocalDomain(),evidence,coordinatorPublicKey:coordinator.publicKey,servicePrivateKey:service.privateKey,now:()=>100,historyProfile:'continuity-segmented-local/1'};
let host=await createProtectedEvidenceDestination(config);
try{
 assert.equal((await readProtectedEvidence({socketPath:host.readerSocket,token})).status,200);
 assert.equal((await readProtectedEvidence({socketPath:host.readerSocket,token:'0'.repeat(64)})).status,401);
 assert.deepEqual(host.registry.tools.map(t=>t.id),['evidence.restrict','evidence.restore']);
 const before=host.inspect();await host.close();host=await createProtectedEvidenceDestination({...config,initialize:false});assert.deepEqual(host.inspect(),before);
 console.log(JSON.stringify({installed:true,reopen:true,privateRemote:JSON.parse(readFileSync(new URL('./node_modules/@ramex-labs/continuity-remote/package.json',import.meta.url))).version,core:JSON.parse(readFileSync(new URL('./node_modules/@ramex-labs/continuity/package.json',import.meta.url))).version,runtime:process.version}));
}finally{await host.close();rmSync(dir,{recursive:true,force:true});}
