// Fresh private source-observation outputs only. The existing preparation reader
// and its output allowlist remain unchanged. Trusted user/kernel, no same-UID sandbox.
import { constants, lstatSync, openSync, fstatSync, writeFileSync, fsyncSync, closeSync, mkdirSync, chmodSync, fchmodSync } from 'node:fs';
import { isAbsolute, resolve, dirname, join, parse } from 'node:path';

const check=(ok,code)=>{if(!ok)throw new Error(code);};
const limits=Object.freeze({'incident.json':16384,'document.bin':65536,'source-policy.json':8192,'attestation.json':32768,'verification.json':16384,'summary.txt':8192,'manifest.json':8192});
const snapshotFields=['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'];
const sameSnapshot=(a,b)=>snapshotFields.every(key=>a[key]===b[key]);

function actualUid(){
  const uid=process.getuid?.();
  check(Number.isSafeInteger(uid)&&uid>0&&process.geteuid?.()===uid,'SOURCE_IDENTITY_REQUIRED');
  return BigInt(uid);
}
function canonicalPath(path,kind){
  check(typeof path==='string'&&path.isWellFormed()&&!path.includes('\0')&&isAbsolute(path)&&resolve(path)===path&&Buffer.byteLength(path)<4096,`INVALID_SOURCE_${kind}_PATH`);
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
    check(s.isDirectory()&&!s.isSymbolicLink()&&(s.uid===0n||s.uid===uid)&&(s.mode&0o022n)===0n,`UNSAFE_SOURCE_${kind}_PARENT`);
  }
}

export function createSourceOutput(absolutePath){
  const uid=actualUid();canonicalPath(absolutePath,'OUTPUT');
  protectedParents(absolutePath,uid,'OUTPUT');
  mkdirSync(absolutePath,{mode:0o700});
  const created=lstatSync(absolutePath,{bigint:true});
  check(created.isDirectory()&&!created.isSymbolicLink()&&created.uid===uid&&(created.mode&0o077n)===0n,'UNSAFE_SOURCE_OUTPUT_DIRECTORY');
  chmodSync(absolutePath,0o700);
  const original=lstatSync(absolutePath,{bigint:true});
  check(original.isDirectory()&&!original.isSymbolicLink()&&original.dev===created.dev&&original.ino===created.ino&&
    original.uid===uid&&(original.mode&0o7777n)===0o700n,'UNSAFE_SOURCE_OUTPUT_DIRECTORY');
  function directoryMatches(s){
    return s.isDirectory()&&!s.isSymbolicLink()&&s.dev===original.dev&&s.ino===original.ino&&s.uid===uid&&(s.mode&0o7777n)===0o700n;
  }
  function fixedDirectory(){
    check(actualUid()===uid,'SOURCE_IDENTITY_REQUIRED');
    protectedParents(absolutePath,uid,'OUTPUT');
    check(directoryMatches(lstatSync(absolutePath,{bigint:true})),'SOURCE_OUTPUT_DIRECTORY_CHANGED');
  }
  function syncDirectory(){
    fixedDirectory();
    const fd=openSync(absolutePath,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
    try{
      check(directoryMatches(fstatSync(fd,{bigint:true})),'SOURCE_OUTPUT_DIRECTORY_CHANGED');
      fsyncSync(fd);
    }finally{closeSync(fd);}
    fixedDirectory();
  }
  syncDirectory();
  return Object.freeze({directory:absolutePath,write(name,data){
    check(Object.hasOwn(limits,name),'SOURCE_INVALID_OUTPUT_NAME');
    check(Buffer.isBuffer(data)&&data.length<=limits[name],'SOURCE_OUTPUT_LIMIT');
    fixedDirectory();
    const path=join(absolutePath,name),fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    try{
      const createdFile=fstatSync(fd,{bigint:true});
      check(createdFile.isFile()&&createdFile.nlink===1n&&createdFile.uid===uid&&(createdFile.mode&0o077n)===0n,'UNSAFE_SOURCE_OUTPUT_FILE');
      fchmodSync(fd,0o600);
      writeFileSync(fd,data);fsyncSync(fd);
      const written=fstatSync(fd,{bigint:true});
      check(written.isFile()&&written.dev===createdFile.dev&&written.ino===createdFile.ino&&written.nlink===1n&&written.uid===uid&&
        (written.mode&0o7777n)===0o600n&&written.size===BigInt(data.length)&&sameSnapshot(written,lstatSync(path,{bigint:true})),'UNSAFE_SOURCE_OUTPUT_FILE');
    }finally{closeSync(fd);}
    syncDirectory();
  }});
}
