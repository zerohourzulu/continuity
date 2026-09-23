import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,readFileSync,writeFileSync,symlinkSync,chmodSync,mkdirSync} from 'node:fs';
import {tmpdir,hostname} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {setup} from '../examples/setup.mjs';
import {testIssuer} from '../examples/test-issuer.mjs';
import {serveGatewayHttp} from '../src/http.mjs';
import {acquireHostLease,recoverDeadHost,inspectCase,snapshotCase,verifySnapshot} from '../src/operations.mjs';
const fixture=t=>{const root=realpathSync(mkdtempSync(join(tmpdir(),'continuity-ops-'))),f=setup(join(root,'case'));t.after(()=>rmSync(root,{recursive:true,force:true}));return {...f,root,location:{historyFile:f.local.historyFile,storage:f.config.storage}};};

test('one live host owns a case, release is idempotent and cannot be force-reclaimed',t=>{
 const f=fixture(t),lease=acquireHostLease(f.config.storage);assert.throws(()=>acquireHostLease(f.config.storage),/HOST_ALREADY_OWNED/);
 assert.throws(()=>recoverDeadHost(f.config.storage),/HOST_STILL_RUNNING/);lease.assertOwned();lease.release();lease.release();
 const next=acquireHostLease(f.config.storage);next.release();
});

test('explicit dead same-host recovery changes no history or authority',t=>{
 const f=fixture(t),child=spawnSync(process.execPath,['-e','process.stdout.write(String(process.pid))']),pid=Number(child.stdout.toString());
 const before=readFileSync(f.local.historyFile);writeFileSync(join(f.config.storage,'gateway-host.lock.json'),JSON.stringify({version:'continuity-gateway-host/1',host:hostname(),pid,nonce:'fixture'}),{mode:0o600});
 assert.equal(recoverDeadHost(f.config.storage).historyChanged,false);assert.deepEqual(readFileSync(f.local.historyFile),before);
 acquireHostLease(f.config.storage).release();
});

test('different host, bad metadata and symlink leases are never reclaimed',t=>{
 const f=fixture(t),path=join(f.config.storage,'gateway-host.lock.json'),record={version:'continuity-gateway-host/1',host:'another-host',pid:99999999,nonce:'fixture'};
 writeFileSync(path,JSON.stringify(record),{mode:0o600});assert.throws(()=>recoverDeadHost(f.config.storage),/HOST_RECOVERY_UNVERIFIED/);rmSync(path);
 writeFileSync(path,'{}',{mode:0o600});assert.throws(()=>recoverDeadHost(f.config.storage));rmSync(path);
 symlinkSync(f.local.historyFile,path);assert.throws(()=>recoverDeadHost(f.config.storage));
});

test('a replaced lease is detected and never removed by the former owner',t=>{
 const f=fixture(t),lease=acquireHostLease(f.config.storage),path=join(f.config.storage,'gateway-host.lock.json');
 const record=JSON.parse(readFileSync(path));record.nonce='replacement';writeFileSync(path,JSON.stringify(record));
 assert.throws(()=>lease.assertOwned(),/HOST_NOT_OWNED/);assert.throws(()=>lease.release(),/HOST_NOT_OWNED/);
});

test('inspection reports counts and explicit capacities without private content or paths',t=>{
 const f=fixture(t);writeFileSync(join(f.config.storage,'private.json'),'secret:should-not-appear',{mode:0o600});
 const result=inspectCase(f.location),text=JSON.stringify(result);assert.ok(result.eventCount>0);assert.equal(result.limits.coreEvents,256);assert.equal(result.limits.observationEvents,128);
 assert.equal(text.includes('secret'),false);assert.equal(text.includes(f.root),false);assert.equal(text.includes('worker'),false);
});

test('private offline snapshot verifies without signing keys or live restore authority',t=>{
 const f=fixture(t),directory=join(f.root,'snapshot');writeFileSync(join(f.config.storage,'note.json'),'{}',{mode:0o600});
 assert.equal(snapshotCase({...f.location,directory}).status,'PRIVATE_SNAPSHOT_CREATED');
 const verified=verifySnapshot(directory);assert.equal(verified.currentnessEstablished,false);assert.equal(verified.restoreAuthorized,false);
 const manifest=JSON.parse(readFileSync(join(directory,'snapshot.json')));assert.equal(manifest.files.some(row=>row.path.includes('key')),false);
 assert.equal(inspectCase(f.location).leasePresent,false);assert.throws(()=>snapshotCase({...f.location,directory}),/SNAPSHOT_TARGET_INVALID/);
});

test('snapshot refuses active gateway, public directory and symlink records',t=>{
 const f=fixture(t),directory=join(f.root,'snapshot'),lease=acquireHostLease(f.config.storage);
 assert.throws(()=>snapshotCase({...f.location,directory}),/HOST_ALREADY_OWNED/);lease.release();
 symlinkSync(f.config.keyFile,join(f.config.storage,'link.json'));assert.throws(()=>snapshotCase({...f.location,directory}));
 assert.equal(inspectLease(f.config.storage),false);
 function inspectLease(storage){try{readFileSync(join(storage,'gateway-host.lock.json'));return true;}catch{return false;}}
});

test('snapshot checksum alteration and unlisted additions are refused',t=>{
 const f=fixture(t),directory=join(f.root,'snapshot');snapshotCase({...f.location,directory});
 writeFileSync(join(directory,'records','injected.json'),'{}',{mode:0o600});assert.throws(()=>verifySnapshot(directory),/SNAPSHOT_INVALID/);rmSync(join(directory,'records','injected.json'));
 writeFileSync(join(directory,'history.jsonl'),'changed',{mode:0o600});assert.throws(()=>verifySnapshot(directory),/SNAPSHOT_MISMATCH/);
});

test('unsafe record permissions and oversized files are refused in diagnostics',t=>{
 const f=fixture(t),path=join(f.config.storage,'bad.json');writeFileSync(path,'{}',{mode:0o644});assert.throws(()=>inspectCase(f.location),/PRIVATE_FILE_INVALID/);
 chmodSync(path,0o600);writeFileSync(path,Buffer.alloc(131073));assert.throws(()=>inspectCase(f.location),/PRIVATE_FILE_INVALID/);
});

test('two authenticated HTTP hosts cannot own the same case',async t=>{
 const f=fixture(t),issuer=await testIssuer(),settings={issuer:issuer.issuer,keys:issuer.keys,allowTestIssuer:true,isActive:()=>true,
  bindings:[{id:'agent-a',subject:'alice',clientId:'example-client',gateway:{local:f.local,storage:f.config.storage,upstreams:f.config.upstreams,operations:f.config.operations}}]};
 const host=await serveGatewayHttp(settings);
 try{await assert.rejects(serveGatewayHttp(settings),/HOST_ALREADY_OWNED/);}finally{await host.close();await issuer.close();}
 assert.equal(inspectCase(f.location).leasePresent,false);
});
