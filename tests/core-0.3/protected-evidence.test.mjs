import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomBytes,generateKeyPairSync} from 'node:crypto';
import http from 'node:http';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {createLocalAttemptOwner,createLocalDomain} from '../../packages/core-0.3/src/local-owner.ts';
import {createProtectedEvidenceDestination,createCooperativeDestination} from '../../packages/remote-tools/destination.mjs';
import {protectedEvidenceProfile,readProtectedEvidence} from '../../packages/remote-tools/protected-evidence.mjs';
import {createCooperativeClient} from '../../packages/remote-tools/client.mjs';
import {createCooperativeExecutor} from '../../packages/remote-tools/executor.mjs';
import {lossyRelay} from '../../packages/mcp-gateway/examples/lossy-relay.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function setup(t){
 const dir=fs.realpathSync(fs.mkdtempSync(join(tmpdir(),'ct-pe-'))),bundle=join(dir,'bundle'),directory=join(dir,'state');
 for(const d of [bundle,directory])fs.mkdirSync(d,{mode:0o700});
 const bytes=Buffer.from('Synthetic evidence, not a credential.\n'),file=join(bundle,'report.txt');fs.writeFileSync(file,bytes,{mode:0o400});
 const token=randomBytes(32).toString('hex'),evidence={bundleDirectory:bundle,files:[{name:'report.txt',bytes:bytes.length,sha256:sha(bytes)}],resource:'evidence:test',reviewerTokenHash:sha(token),socketPath:join(dir,'read.sock')};
 const registry=protectedEvidenceProfile(evidence).registry,coordinator=generateKeyPairSync('ed25519'),provider=generateKeyPairSync('ed25519'),account=privateKeyToAccount(generatePrivateKey());
 const local={historyFile:join(dir,'history.jsonl'),domain:createLocalDomain(),owner:'owner',controller:'controller',now:()=>100,session:'session',signHash:h=>account.signMessage({message:{raw:h}})};
 const owner=createLocalAttemptOwner(local);owner.createAgent({id:'agent'});owner.createRole({id:'role'});owner.appoint({agent:'agent',role:'role',tenure:'tenure',number:1});
 owner.admitRuntime({agent:'agent',session:'session',epoch:1,key:'key',address:account.address,expiresAt:10000});
 owner.grant({id:'restrict',to:'agent',actions:['restrict-evidence'],resources:[evidence.resource],expiresAt:10000});
 owner.grant({id:'restore',to:'agent',actions:['restore-evidence'],resources:[evidence.resource],expiresAt:10000});
 const options={initialize:true,directory,domain:local.domain,evidence,coordinatorPublicKey:coordinator.publicKey,servicePrivateKey:provider.privateKey,now:()=>100};
 let destination=await createProtectedEvidenceDestination(options),relay=await lossyRelay(destination.url);options.initialize=false;
 const client=()=>createCooperativeClient({url:relay.url,serviceId:registry.serviceId,coordinatorPrivateKey:coordinator.privateKey,servicePublicKey:provider.publicKey,timeoutMs:10000});
 let n=0;
 t.after(async()=>{await relay.close();await destination.close();fs.rmSync(dir,{recursive:true,force:true});});
 return {dir,file,directory,evidence,registry,owner,options,token,get destination(){return destination},get relay(){return relay},
   read:(value=token)=>readProtectedEvidence({socketPath:evidence.socketPath,token:value}),
   run:(tool,extra={})=>{const id='job:'+ ++n;return createCooperativeExecutor({local,client:client(),registry,role:'role',tenure:'tenure'}).run({operationId:id,businessKey:id,tool,arguments:{reason:'Investigation',...extra}});},
   async restart(){await relay.close();await destination.close();destination=await createProtectedEvidenceDestination(options);relay=await lossyRelay(destination.url);},client};
}
test('actual read, durable restriction with lost reply, restart and separately authorized restoration',async t=>{
 const s=await setup(t);assert.equal((await s.read()).status,200);assert.equal((await s.read('0'.repeat(64))).status,401);
 s.relay.behavior.dropAfter='commit';const result=await s.run('evidence.restrict');assert.equal(result.execution.invocation.status,'OUTCOME_UNKNOWN');
 assert.equal((await s.read()).status,403);const before=s.destination.inspect();assert.equal(before.effects.length,1);assert.equal(before.attempts[0].report.state,'APPLIED');
 await s.restart();assert.deepEqual(s.destination.inspect(),before);assert.equal((await s.read()).status,403);
 assert.equal((await s.client().status(before.attempts[0].key)).result.state,'APPLIED');assert.equal(s.destination.inspect().effects.length,1);
 assert.equal((await s.run('evidence.restore')).serviceReport.result.state,'APPLIED');assert.equal((await s.read()).status,200);assert.equal(s.destination.inspect().effects.length,2);
});
test('fixed contract rejects agent paths/levels and ordinary factory cannot reopen the protected identity',async t=>{
 const s=await setup(t);await assert.rejects(s.run('evidence.restrict',{path:'/etc/passwd'}));await assert.rejects(s.run('document.access',{level:'reviewer'}));
 assert.equal(s.destination.inspect().effects.length,0);
 await assert.rejects(createCooperativeDestination({...s.options,serviceId:s.registry.serviceId,validateOperation:s.registry.validateOperation}),/PROTECTED_PROFILE_REQUIRED/);
 const changed={...s.evidence,resource:'evidence:other'};
 assert.notEqual(protectedEvidenceProfile(changed).registry.serviceId,s.registry.serviceId);
 const wrongToken={...s.evidence,reviewerTokenHash:'0'.repeat(64)};
 assert.notEqual(protectedEvidenceProfile(wrongToken).registry.serviceId,s.registry.serviceId);
 await assert.rejects(createProtectedEvidenceDestination({...s.options,evidence:changed}));
});
test('reads after closure deny, and an earlier authorized read may finish afterward',async t=>{
 const s=await setup(t);let response;
 const early=new Promise((resolve,reject)=>{const req=http.get({agent:false,socketPath:s.evidence.socketPath,path:'/evidence',headers:{authorization:'Bearer '+s.token}},r=>{response=r;r.pause();resolve();});req.on('error',reject);});
 await early;assert.equal(response.statusCode,200);
 await s.run('evidence.restrict');assert.equal((await s.read()).status,403);
 const delivered=new Promise((resolve,reject)=>{const chunks=[];response.on('data',c=>chunks.push(c));response.on('end',()=>resolve(JSON.parse(Buffer.concat(chunks))));response.on('error',reject);response.resume();});
 assert.ok((await delivered).files[0].base64); // Completion after closure is allowed for this earlier authorization.
 await s.run('evidence.restore');
 const readBefore=await s.read();assert.equal(readBefore.status,200);
 const [during,result]=await Promise.all([s.read(),s.run('evidence.restrict')]);
 assert.ok([200,403].includes(during.status));assert.equal(result.serviceReport.result.state,'APPLIED');
 for(let i=0;i<3;i++)assert.equal((await s.read()).status,403);
 assert.ok(readBefore.body.files[0].base64); // Delivered copies are not retractable.
});
test('changed, absent or symlinked bundle cannot fall back to cached bytes',async t=>{
 const s=await setup(t);assert.equal((await s.read()).status,200);
 fs.chmodSync(s.file,0o600);fs.writeFileSync(s.file,'Changed');fs.chmodSync(s.file,0o400);assert.equal((await s.read()).status,503);
 fs.unlinkSync(s.file);assert.equal((await s.read()).status,503);
 fs.symlinkSync('/etc/passwd',s.file);assert.equal((await s.read()).status,503);
 await assert.rejects(createProtectedEvidenceDestination(s.options));
});
test('corrupt destination denies fresh reads rather than trusting a cached open state',async t=>{
 const s=await setup(t);assert.equal((await s.read()).status,200);
 fs.writeFileSync(join(s.directory,'snapshot.bin'),'damaged');assert.equal((await s.read()).status,503);assert.equal((await s.read()).status,503);
});
test('closure with an uncertain directory sync poisons this service and refuses every fresh read',async t=>{
 const s=await setup(t);let arm=false,renamed=false;
 const rename=fs.renameSync,fsync=fs.fsyncSync;
 // Arm only after the actual prepare reply, so the failure occurs while
 // committing access closure, after atomic replacement and before durability ack.
 s.relay.behavior.after=operation=>{if(operation==='prepare')arm=true;};
 fs.renameSync=(from,to)=>{const result=rename(from,to);if(arm&&to===join(s.directory,'snapshot.bin'))renamed=true;return result;};
 fs.fsyncSync=fd=>{if(renamed){renamed=false;throw Error('H05_INJECTED_DIRECTORY_SYNC_FAILURE');}return fsync(fd);};syncBuiltinESMExports();
 try{const result=await s.run('evidence.restrict');assert.equal(result.execution.invocation.status,'OUTCOME_UNKNOWN');}
 finally{fs.renameSync=rename;fs.fsyncSync=fsync;syncBuiltinESMExports();}
 assert.equal((await s.read()).status,503);assert.equal((await s.read()).status,503);
});
test('socket, path and file configuration are bounded and fail closed',async t=>{
 const s=await setup(t);
 for(const evidence of [{...s.evidence,files:[{...s.evidence.files[0],name:'../report.txt'}]},
   {...s.evidence,files:Array(17).fill(s.evidence.files[0])},{...s.evidence,files:[{...s.evidence.files[0],bytes:65537}]},
   {...s.evidence,reviewerTokenHash:'bad'},{...s.evidence,extra:true}])assert.throws(()=>protectedEvidenceProfile(evidence));
 await assert.rejects(createProtectedEvidenceDestination({...s.options,initialize:true,directory:fs.mkdtempSync(join(s.dir,'second-'))}),/READER_SOCKET_EXISTS/);
});


test('missing storage cannot reopen access without an explicit fresh initialization decision',async t=>{
 const s=await setup(t);await s.run('evidence.restrict');await s.relay.close();await s.destination.close();
 fs.unlinkSync(join(s.directory,'snapshot.bin'));fs.unlinkSync(join(s.directory,'identity.bin'));
 await assert.rejects(createProtectedEvidenceDestination(s.options));
 await assert.rejects(createProtectedEvidenceDestination({...s.options,initialize:'yes'}),/INVALID_INITIALIZATION_MODE/);
});
