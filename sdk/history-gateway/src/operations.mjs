import {constants,openSync,closeSync,fstatSync,lstatSync,readFileSync,writeFileSync,fsyncSync,existsSync,readdirSync,mkdirSync,unlinkSync} from 'node:fs';
import {hostname} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {PortableFileEventStore,openConfiguredEventStore,ConfiguredDirectoryEventStore,stateOf,capacityOf,LOCAL_CAPACITY_PROFILE,CONTINUATION_PROFILE} from '@ramex-labs/continuity/adapter';
import {check,exact,privateDirectory,readPrivate,durableCreate} from './data.mjs';
const LOCK='gateway-host.lock.json';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function syncDirectory(path){const fd=openSync(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{fsyncSync(fd);}finally{closeSync(fd);}}
function lockRecord(path){const value=exact(readPrivate(path),['version','host','pid','nonce']);check(value.version==='continuity-gateway-host/1'&&typeof value.host==='string'&&Number.isSafeInteger(value.pid)&&value.pid>0&&typeof value.nonce==='string','HOST_LOCK_INVALID');return value;}

/** A process ownership guard; it is not Core authority or a distributed lock. */
export function acquireHostLease(storage){
 const directory=privateDirectory(storage),path=join(directory,LOCK);
 check(!existsSync(path),'HOST_ALREADY_OWNED');
 const value={version:'continuity-gateway-host/1',host:hostname(),pid:process.pid,nonce:randomUUID()};
 try{durableCreate(path,value);}catch(error){if(error.code==='EEXIST')throw Object.assign(new Error('HOST_ALREADY_OWNED'),{code:'HOST_ALREADY_OWNED'});throw error;}
 const identity=lstatSync(path);let closed=false;
 return Object.freeze({
  assertOwned(){check(!closed,'HOST_NOT_OWNED');const named=lstatSync(path);check(named.ino===identity.ino&&named.dev===identity.dev&&lockRecord(path).nonce===value.nonce,'HOST_NOT_OWNED');},
  release(){if(closed)return;this.assertOwned();unlinkSync(path);syncDirectory(directory);closed=true;},
 });
}

/** Explicit operator action: remove only a same-host lease whose PID provably does not exist. */
export function recoverDeadHost(storage){
 const directory=privateDirectory(storage),path=join(directory,LOCK),value=lockRecord(path),identity=lstatSync(path);
 check(value.host===hostname(),'HOST_RECOVERY_UNVERIFIED');
 let absent=false;try{process.kill(value.pid,0);}catch(error){check(error.code==='ESRCH','HOST_RECOVERY_UNVERIFIED');absent=true;}
 check(absent,'HOST_STILL_RUNNING');
 const current=lstatSync(path);check(current.ino===identity.ino&&current.dev===identity.dev&&lockRecord(path).nonce===value.nonce,'HOST_RECOVERY_UNVERIFIED');
 unlinkSync(path);syncDirectory(directory);return {status:'DEAD_HOST_LEASE_REMOVED',historyChanged:false,authorityChanged:false};
}
function fileBytes(path,limit){
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const before=fstatSync(fd);check(before.isFile()&&before.nlink===1&&(before.mode&0o077)===0&&before.size<=limit,'PRIVATE_FILE_INVALID');
  const bytes=readFileSync(fd),after=fstatSync(fd),named=lstatSync(path);
  check(bytes.length===before.size&&after.mtimeMs===before.mtimeMs&&after.ctimeMs===before.ctimeMs&&after.size===before.size&&named.ino===before.ino&&named.dev===before.dev&&!named.isSymbolicLink(),'FILE_CHANGED');return bytes;
 }finally{closeSync(fd);}
}
function recordNames(storage){const names=readdirSync(storage);check(names.length<=4096,'RECORD_CAPACITY');for(const n of names)check(n.length<=200&&!n.includes('/')&&!n.startsWith('.'),'RECORD_NAME_INVALID');return names.filter(n=>n!==LOCK).sort();}

/** Counts only: no identities, arguments, reports, paths or credentials in the returned summary. */
export function inspectCase(location){
 const {historyFile,storage}=location,directory=privateDirectory(storage),store=openConfiguredEventStore(location);
 if(!(store instanceof ConfiguredDirectoryEventStore))fileBytes(historyFile,8388608);
 const state=stateOf(store.readAll()),names=recordNames(directory);
 let recordBytes=0;
 for(const name of names){const s=lstatSync(join(directory,name));check(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&(s.mode&0o077)===0&&s.size<=131072,'PRIVATE_FILE_INVALID');recordBytes+=s.size;}
 const count=state.events.length;
 if(store instanceof ConfiguredDirectoryEventStore){
  const snapshot=store.directoryStore.snapshot(),capacity=snapshot.capacity;
  return {profile:CONTINUATION_PROFILE.version,eventCount:count,limits:{coreEvents:1024,observationEvents:1024,recordEntries:4096},remainingCoreEvents:1024-count,
   lateObservationCapacityAvailable:capacity.compatible&&(capacity.projected.events<1024||capacity.reservedByRecordType.OUTCOME_OBSERVATION_RECORDED>0),capacity,observedHeadHash:state.head.hash,
   recordFiles:names.length,recordBytes,taskRequests:names.filter(n=>n.startsWith('continuity-task:')&&n.endsWith('.request.json')).length,leasePresent:existsSync(join(directory,LOCK)),warnings:capacity.mode==='DRAINING'?['CAPACITY_DRAINING']:[],pointInTimeOnly:true,restoreAuthorization:false};
 }
 const capacity=capacityOf(state.events);
 return {profile:LOCAL_CAPACITY_PROFILE.version,eventCount:count,limits:{coreEvents:LOCAL_CAPACITY_PROFILE.maxEvents,observationEvents:LOCAL_CAPACITY_PROFILE.maxEvents,recordEntries:4096},
  remainingCoreEvents:capacity.remainingPhysicalEvents,lateObservationCapacityAvailable:capacity.compatible&&(capacity.unreservedEvents>0||capacity.reservedByRecordType.OUTCOME_OBSERVATION_RECORDED>0),capacity,observedHeadHash:state.head.hash,
  recordFiles:names.length,recordBytes,taskRequests:names.filter(n=>n.startsWith('continuity-task:')&&n.endsWith('.request.json')).length,
  leasePresent:existsSync(join(directory,LOCK)),warnings:[...(capacity.mode==='INCOMPATIBLE'?['CAPACITY_INCOMPATIBLE']:[]),...(capacity.mode==='DRAINING'?['CAPACITY_DRAINING']:[])],
  pointInTimeOnly:true,restoreAuthorization:false};
}
function writeBytes(path,bytes){const fd=openSync(path,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}}

/** Offline private copy. Caller must stop all history writers, including owner administration. */
export function snapshotCase(location){
 check(location.historyProfile===undefined&&location.historyBinding===undefined,"UNSUPPORTED_HISTORY_PROFILE");
 let {historyFile,storage,directory}=location;
 storage=privateDirectory(storage);const target=resolve(directory);privateDirectory(dirname(target));
 check(target!==storage&&!target.startsWith(storage+'/')&&!existsSync(target),'SNAPSHOT_TARGET_INVALID');
 const lease=acquireHostLease(storage);
 try{
  const before=fileBytes(historyFile,8388608),head=stateOf(new PortableFileEventStore(historyFile).readAll()).head;
  mkdirSync(target,{mode:0o700});mkdirSync(join(target,'records'),{mode:0o700});
  const files=[];const put=(name,bytes)=>{writeBytes(join(target,name),bytes);files.push({path:name,bytes:bytes.length,sha256:digest(bytes)});};
  put('history.jsonl',before);
  for(const name of recordNames(storage)){lease.assertOwned();put('records/'+name,fileBytes(join(storage,name),131072));}
  check(digest(fileBytes(historyFile,8388608))===digest(before),'HISTORY_CHANGED_DURING_SNAPSHOT');
  const manifest={version:'continuity-private-snapshot/1',head,files,restoreAuthorized:false};
  durableCreate(join(target,'snapshot.json'),manifest);syncDirectory(join(target,'records'));syncDirectory(target);
  return {status:'PRIVATE_SNAPSHOT_CREATED',files:files.length,restoreAuthorized:false};
 }finally{lease.release();}
}
export function verifySnapshot(directory){
 directory=privateDirectory(directory);const recordDirectory=privateDirectory(join(directory,'records'));
 const manifest=exact(readPrivate(join(directory,'snapshot.json')),['version','head','files','restoreAuthorized']);
 check(manifest.version==='continuity-private-snapshot/1'&&manifest.restoreAuthorized===false&&Array.isArray(manifest.files)&&manifest.files.length<=4097,'SNAPSHOT_INVALID');
 const seen=new Set();
 for(const row of manifest.files){exact(row,['path','bytes','sha256']);check(row.path==='history.jsonl'||/^records\/[A-Za-z0-9:_.-]+$/.test(row.path),'SNAPSHOT_INVALID');check(!seen.has(row.path),'SNAPSHOT_INVALID');seen.add(row.path);
  const bytes=fileBytes(join(directory,row.path),row.path==='history.jsonl'?8388608:131072);check(bytes.length===row.bytes&&digest(bytes)===row.sha256,'SNAPSHOT_MISMATCH');}
 check(seen.has('history.jsonl')&&readdirSync(directory).sort().join('|')==='history.jsonl|records|snapshot.json','SNAPSHOT_INVALID');
 check(readdirSync(recordDirectory).every(n=>n!==LOCK&&seen.has('records/'+n)),'SNAPSHOT_INVALID');
 const state=stateOf(new PortableFileEventStore(join(directory,'history.jsonl')).readAll());check(state.head.hash===manifest.head.hash,'SNAPSHOT_MISMATCH');
 return {status:'PRIVATE_SNAPSHOT_VERIFIED',files:seen.size,eventCount:state.events.length,currentnessEstablished:false,restoreAuthorized:false};
}
