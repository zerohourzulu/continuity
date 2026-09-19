'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const native = require('./index.cjs');
async function main() {
  const base = process.argv[2];
  assert(base && path.isAbsolute(base), 'supply prepared absolute scratch directory');
  assert.notEqual(process.geteuid(), 0, 'run as non-root broker');
  const s = fs.statSync(base);
  assert.equal(s.uid, process.geteuid());
  assert.equal(s.mode & 0o7777, 0o700);
  assert.deepEqual(fs.readdirSync(base), [], 'scratch must be empty');
  const uid = process.geteuid(), gid = process.getegid();
  // Materialize exact fixture modes independently of the launcher's restrictive umask.
  for (const [name,mode] of [['data',0o700],['data/stage',0o700],['data/inbox',0o750],['data/vault',0o700]]) {
    fs.mkdirSync(path.join(base,name), {mode}); fs.chmodSync(path.join(base,name),mode);
  }
  const root = path.join(base,'data'), stageName='a'.repeat(64), destinationName='b'.repeat(64);
  const source = path.join(root,'vault/document.txt');
  fs.writeFileSync(source,'harmless native scratch document\n',{mode:0o400,flag:'wx'});
  assert.equal(native.readFile(root,'vault/document.txt',4*1024*1024).data.toString(),'harmless native scratch document\n');
  fs.symlinkSync('document.txt',path.join(root,'vault/link'));
  assert.throws(()=>native.readFile(root,'vault/link',65536));
  fs.linkSync(source,path.join(root,'vault/hardlink'));
  assert.throws(()=>native.readFile(root,'vault/document.txt',65536));
  fs.unlinkSync(path.join(root,'vault/hardlink'));
  const prepare = name => {
    const p=path.join(root,'stage',name); fs.mkdirSync(p,{mode:0o750}); fs.chmodSync(p,0o750);
    fs.writeFileSync(path.join(p,'document.bin'),'harmless native scratch document\n',{mode:0o440,flag:'wx'});
    fs.writeFileSync(path.join(p,'publication.json'),'{"scratch":true}\n',{mode:0o440,flag:'wx'});
    for(const child of ['document.bin','publication.json']) fs.chmodSync(path.join(p,child),0o440);
  };
  prepare(stageName);
  assert.deepEqual(native.publishDirectory({rootDirectory:root,stageName,destinationName,brokerUid:uid,recipientGid:gid}),{published:true,durable:true});
  assert.deepEqual(native.inspectDirectory(root,`inbox/${destinationName}`).children,['document.bin','publication.json']);
  prepare('c'.repeat(64));
  assert.throws(()=>native.publishDirectory({rootDirectory:root,stageName:'c'.repeat(64),destinationName,brokerUid:uid,recipientGid:gid}),e=>e.code==='EEXIST'&&e.publicationUncertain===true);
  assert.equal(fs.readFileSync(path.join(root,'inbox',destinationName,'document.bin'),'utf8'),'harmless native scratch document\n');
  console.log('PASS protected reads, link refusal, exact publication and no overwrite');
  const lockPath=path.join(base,'broker.lock');
  const lock=native.acquireLock(lockPath);
  assert.throws(()=>native.acquireLock(lockPath),e=>e.code==='EAGAIN');
  const inode=fs.statSync(lockPath).ino;
  native.releaseLock(lock);
  const second=native.acquireLock(lockPath); native.releaseLock(second);
  assert.equal(fs.statSync(lockPath).ino,inode);
  console.log('PASS process-held lock contention and inode preservation');
  const socket=path.join(base,'request.sock');
  const listener=native.listen(socket,{timeoutMs:100});
  try {
    const client=native.connectClient(socket);
    native.clientSend(client,'{"scratch":true}');
    const [request]=native.poll(listener);
    assert(request); assert.equal(request.uid,uid); assert.equal(request.gid,gid); assert.equal(request.pid,process.pid);
    assert.equal(request.data.toString(),'{"scratch":true}');
    native.reply(request.connection,'{"ok":true}');
    assert.equal(native.clientReceive(client).toString(),'{"ok":true}');
    native.poll(listener);
    const raw = mode => execFileSync('python3',['-c',String.raw`
import os,socket,array,sys
s=socket.socket(socket.AF_UNIX,socket.SOCK_SEQPACKET)
s.connect(sys.argv[1])
mode=sys.argv[2]
if mode=='rights':
 f=os.open(sys.argv[3],os.O_RDONLY)
 s.sendmsg([b'{"scratch":true}'],[(socket.SOL_SOCKET,socket.SCM_RIGHTS,array.array('i',[f]))])
 os.close(f)
elif mode=='extra':
 s.send(b'{"scratch":true}')
 s.send(b'{"extra":true}')
elif mode=='extraempty':
 s.send(b'{"scratch":true}')
 s.send(b'')
elif mode=='truncated': s.send(b'x'*16385)
elif mode=='utf8': s.send(b'\xff')
s.close()
`,socket,mode,source],{stdio:['ignore','pipe','pipe']});
    raw('utf8'); assert.deepEqual(native.poll(listener),[]); native.poll(listener);
    const before=fs.readdirSync('/proc/self/fd').length;
    for(const mode of ['rights','extra','extraempty','truncated','utf8']) {raw(mode);assert.deepEqual(native.poll(listener),[]);native.poll(listener);}
    assert.equal(fs.readdirSync('/proc/self/fd').length,before,'received SCM_RIGHTS descriptor leaked');
    const idle=native.connectClient(socket); assert.deepEqual(native.poll(listener),[]);
    await new Promise(resolve=>setTimeout(resolve,125)); assert.deepEqual(native.poll(listener),[]);
    assert.throws(()=>native.clientSend(idle,'{}'));
    native.closeConnection(idle);
    console.log('PASS per-message credentials, ancillary fd closure, extra/truncated/UTF8 rejection and timeout');
  } finally {native.closeListener(listener);}
  console.log('PASS native scratch checks; artifacts retained at '+base);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
