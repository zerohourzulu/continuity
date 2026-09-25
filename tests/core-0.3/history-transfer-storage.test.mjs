import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fixture,capture,padded} from './fixtures/history-fixture.mjs';
import {createHistoryTransfer,openCheckpointStorage,TRANSFER_STORAGE_LIMITS as limits} from '../../packages/core-0.3/src/history-store/transfer.ts';
import {captureHistoryAncillary} from '../../packages/core-0.2/src/history/index.ts';
import {sha} from '../../packages/core-0.3/src/history-store/files.ts';
import {json,encodeEvent} from '../../packages/core-0.3/src/history-store/codec.ts';
import {decodeHistory} from '../../lib/history-source.mjs';
const area=t=>{const root=fs.mkdtempSync(join(tmpdir(),'continuity-h04-transfer-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;};
const stage=(store,t,reference=null)=>{store.begin(t.manifest,t.transferId,reference);t.chunks.forEach((b,i)=>store.chunk(t.transferId,i,b));return store.ready(t.transferId);};
test('authenticated host abort clears only staging, retains committed files and permits a new explicit transfer',async t=>{
 const f=await fixture(t),root=area(t),s=openCheckpointStorage(root),a=createHistoryTransfer(f.handle),b=createHistoryTransfer(capture(padded(f.events,f.events.length+1)));
 stage(s,a);const before=s.inspect();s.abort(a.transferId);assert.equal(s.inspect().active,null);assert.equal(s.inspect().chunks,before.chunks);assert.equal(s.load(a.transferId).head.hash,f.handle.head.hash);
 stage(s,b,a.transferId);assert.equal(s.ready(b.transferId).eventCount,f.events.length+1);assert.equal(s.load(a.transferId).eventCount,f.events.length);
 assert.throws(()=>s.abort(a.transferId),/TRANSFER_CONFLICT/);
});
test('full manifest allowance refuses new staging while existing checkpoint remains independently readable',async t=>{
 const f=await fixture(t),root=area(t),s=openCheckpointStorage(root),a=createHistoryTransfer(f.handle),b=createHistoryTransfer(capture(padded(f.events,f.events.length+1)));stage(s,a);
 for(let i=1;i<limits.manifests;i++)fs.writeFileSync(join(root,'history-checkpoints',i.toString(16).padStart(64,'0')+'.manifest'),'{}',{mode:0o600});
 assert.throws(()=>s.begin(b.manifest,b.transferId,a.transferId),/TRANSFER_STORAGE_LIMIT/);assert.equal(s.inspect().manifests,limits.manifests);assert.equal(s.load(a.transferId).head.hash,f.handle.head.hash);
});
test('all abandoned bytes and chunks are counted, including sparse files; no fallback around missing or changed required data',async t=>{
 const f=await fixture(t),root=area(t),s=openCheckpointStorage(root),a=createHistoryTransfer(f.handle);stage(s,a);
 const chunk=join(root,'history-checkpoints',a.manifest.segments[0].digest+'.chunk'),bytes=fs.readFileSync(chunk);fs.chmodSync(chunk,0o600);fs.writeFileSync(chunk,'wrong');assert.throws(()=>s.load(a.transferId),/TRANSFER_CHUNK_INVALID/);fs.writeFileSync(chunk,bytes);fs.unlinkSync(chunk);assert.throws(()=>s.load(a.transferId));fs.writeFileSync(chunk,bytes,{mode:0o600});
 for(let i=1;i<=32;i++){const fd=fs.openSync(join(root,'history-checkpoints',i.toString(16).padStart(64,'0')+'.chunk'),'wx',0o600);fs.ftruncateSync(fd,2*1024*1024);fs.closeSync(fd);}
 assert.throws(()=>openCheckpointStorage(root),/TRANSFER_STORAGE_LIMIT/);
});
test('valid chunk digests cannot authenticate invalid event semantics or a substituted history head',async t=>{
 const f=await fixture(t),root=area(t),s=openCheckpointStorage(root),original=createHistoryTransfer(f.handle);
 const broken=[...f.events];broken[1]={...broken[1],type:'INVENTED_EVENT'};
 const bytes=Buffer.concat(broken.map(encodeEvent)),manifest={...original.manifest,encodedBytes:bytes.length,segments:[{digest:sha(bytes),start:0,count:broken.length,bytes:bytes.length}]},id=sha(json(captureHistoryAncillary(manifest)));
 s.begin(manifest,id,null);s.chunk(id,0,bytes.toString('base64').match(/.{1,4096}/g));assert.throws(()=>s.ready(id));assert.equal(s.inspect().active,id);
});
test('legacy read-only source reader explicitly refuses new bindings instead of treating them as history',()=>{
 assert.throws(()=>decodeHistory(Buffer.from(JSON.stringify({version:'continuity-history-binding/1',profile:'continuity-segmented-local/1'})+'\n')),e=>e.code==='UNSUPPORTED_HISTORY_PROFILE');
});
