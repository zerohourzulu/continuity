// Selected local inputs and fresh private preparation output only. Target profile
// paths are data handled elsewhere. Trusted current user/kernel; no same-UID defense.
import { constants, lstatSync, openSync, fstatSync, readSync, writeFileSync, fsyncSync, closeSync, mkdirSync, chmodSync, fchmodSync } from 'node:fs';
import { isAbsolute, resolve, dirname, join, parse } from 'node:path';

const check=(ok,code)=>{if(!ok)throw new Error(code);};
const names=new Set(['document.bin','incident.json','source-policy.json','source-policy-selection.json','attestation.json','resource-policy.bin','profile.json','catalog.json','broker.json','operator.json','desk-transport.json','controller-transport.json','installation-layout.json','selection.json','summary.txt','MANIFEST.json','failure.json']);
const sourceLimits=Object.freeze({'source-policy.json':8192,'attestation.json':32768});
const snapshotFields=['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'];
const sameSnapshot=(a,b)=>snapshotFields.every(key=>a[key]===b[key]);

function actualUid(){
  const uid=process.getuid?.();
  check(Number.isSafeInteger(uid)&&uid>0&&process.geteuid?.()===uid,'PREPARATION_IDENTITY_REQUIRED');
  return BigInt(uid);
}
function canonicalPath(path,kind){
  check(typeof path==='string'&&path.isWellFormed()&&!path.includes('\0')&&isAbsolute(path)&&resolve(path)===path&&Buffer.byteLength(path)<4096,`INVALID_PREPARATION_${kind}_PATH`);
}
function protectedParents(path,uid,kind){
  const ancestors=[];
  for(let current=dirname(path);;current=dirname(current)){
    ancestors.push(current);
    if(current===parse(current).root)break;
  }
  // Build the chain lexically, then reject each ancestor before inspecting a
  // descendant: even lstat on a deeper path would follow an earlier symlink.
  for(const current of ancestors.reverse()){
    const s=lstatSync(current,{bigint:true});
    check(s.isDirectory()&&!s.isSymbolicLink()&&(s.uid===0n||s.uid===uid)&&(s.mode&0o022n)===0n,`UNSAFE_PREPARATION_${kind}_PARENT`);
  }
}

export function readPreparationInput(absolutePath,maxBytes){
  const uid=actualUid();canonicalPath(absolutePath,'INPUT');
  check(Number.isSafeInteger(maxBytes)&&maxBytes>0&&maxBytes<=65536,'INVALID_PREPARATION_INPUT_MAX_BYTES');
  protectedParents(absolutePath,uid,'INPUT');
  const before=lstatSync(absolutePath,{bigint:true});
  check(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n&&(before.uid===0n||before.uid===uid)&&
    (before.mode&0o022n)===0n&&before.size>0n&&before.size<=BigInt(maxBytes),'UNSAFE_PREPARATION_INPUT_FILE');
  // NONBLOCK prevents a regular-file-to-FIFO race from blocking in open. The
  // descriptor must match the original regular file before any bounded read.
  const fd=openSync(absolutePath,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
    const opened=fstatSync(fd,{bigint:true});
    check(opened.isFile()&&sameSnapshot(before,opened),'PREPARATION_INPUT_CHANGED');
    const buffer=Buffer.alloc(Number(before.size)+1);let at=0;
    while(at<buffer.length){
      const count=readSync(fd,buffer,at,buffer.length-at,at);
      if(count===0)break;
      at+=count;
    }
    check(at===Number(before.size)&&sameSnapshot(before,fstatSync(fd,{bigint:true}))&&
      sameSnapshot(before,lstatSync(absolutePath,{bigint:true})),'PREPARATION_INPUT_CHANGED');
    protectedParents(absolutePath,uid,'INPUT');
    check(actualUid()===uid,'PREPARATION_IDENTITY_REQUIRED');
    return Buffer.from(buffer.subarray(0,at));
  }finally{closeSync(fd);}
}

export function createPreparationOutput(absolutePath){
  const uid=actualUid();canonicalPath(absolutePath,'OUTPUT');
  protectedParents(absolutePath,uid,'OUTPUT');
  mkdirSync(absolutePath,{mode:0o700});
  const created=lstatSync(absolutePath,{bigint:true});
  check(created.isDirectory()&&!created.isSymbolicLink()&&created.uid===uid&&(created.mode&0o077n)===0n,'UNSAFE_PREPARATION_OUTPUT_DIRECTORY');
  chmodSync(absolutePath,0o700);
  const original=lstatSync(absolutePath,{bigint:true});
  check(original.isDirectory()&&!original.isSymbolicLink()&&original.dev===created.dev&&original.ino===created.ino&&
    original.uid===uid&&(original.mode&0o7777n)===0o700n,'UNSAFE_PREPARATION_OUTPUT_DIRECTORY');
  function directoryMatches(s){
    return s.isDirectory()&&!s.isSymbolicLink()&&s.dev===original.dev&&s.ino===original.ino&&s.uid===uid&&(s.mode&0o7777n)===0o700n;
  }
  function fixedDirectory(){
    check(actualUid()===uid,'PREPARATION_IDENTITY_REQUIRED');
    protectedParents(absolutePath,uid,'OUTPUT');
    check(directoryMatches(lstatSync(absolutePath,{bigint:true})),'PREPARATION_OUTPUT_DIRECTORY_CHANGED');
  }
  function syncDirectory(){
    fixedDirectory();
    const fd=openSync(absolutePath,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
    try{
      check(directoryMatches(fstatSync(fd,{bigint:true})),'PREPARATION_OUTPUT_DIRECTORY_CHANGED');
      fsyncSync(fd);
    }finally{closeSync(fd);}
    fixedDirectory();
  }
  syncDirectory();
  return Object.freeze({directory:absolutePath,write(name,data){
    check(names.has(name),'INVALID_PREPARATION_OUTPUT_NAME');
    check(Buffer.isBuffer(data)&&data.length<=65536,'PREPARATION_OUTPUT_LIMIT');
    if(Object.hasOwn(sourceLimits,name))check(data.length>=1&&data.length<=sourceLimits[name],'PREPARATION_SOURCE_OUTPUT_LIMIT');
    fixedDirectory();
    const path=join(absolutePath,name),fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    try{
      const createdFile=fstatSync(fd,{bigint:true});
      check(createdFile.isFile()&&createdFile.nlink===1n&&createdFile.uid===uid&&(createdFile.mode&0o077n)===0n,'UNSAFE_PREPARATION_OUTPUT_FILE');
      fchmodSync(fd,0o600);
      writeFileSync(fd,data);fsyncSync(fd);
      const written=fstatSync(fd,{bigint:true});
      check(written.isFile()&&written.dev===createdFile.dev&&written.ino===createdFile.ino&&written.nlink===1n&&written.uid===uid&&
        (written.mode&0o7777n)===0o600n&&written.size===BigInt(data.length)&&sameSnapshot(written,lstatSync(path,{bigint:true})),'UNSAFE_PREPARATION_OUTPUT_FILE');
    }finally{closeSync(fd);}
    syncDirectory();
  }});
}
