// Shared protected-file/socket checks only. Principal selection stays in each fixed factory.
import { lstatSync, openSync, fstatSync, readFileSync, closeSync, constants } from 'node:fs';
import { resolve, dirname, parse, isAbsolute } from 'node:path';
const check=(ok,code)=>{if(!ok)throw new Error(code);};
export function assertProtectedDocumentTransportPath(value){
  check(typeof value==='string'&&value.isWellFormed()&&!value.includes('\0')&&isAbsolute(value)&&resolve(value)===value&&Buffer.byteLength(value)<4096,'INVALID_DOCUMENT_TRANSPORT_PATH');
}
export function assertProtectedDocumentTransportParents(path,owners,stat=lstatSync){
  let current=dirname(path);
  for(;;){const s=stat(current);check(s.isDirectory()&&!s.isSymbolicLink()&&owners.has(s.uid)&&(s.mode&0o022)===0,'UNSAFE_DOCUMENT_TRANSPORT_PARENT');if(current===parse(current).root)break;current=dirname(current);}
}
export function assertProtectedDocumentOperatorSocket(config,stat=lstatSync){
  assertProtectedDocumentTransportParents(config.operatorSocket,new Set([0,config.brokerUid]),stat);
  const s=stat(config.operatorSocket);
  check(s.isSocket()&&!s.isSymbolicLink()&&s.uid===config.brokerUid&&s.nlink===1&&(s.mode&0o7777)===0o666,'UNSAFE_DOCUMENT_OPERATOR_SOCKET');
}
// The optional filesystem functions are a trusted metadata-test seam, never wire/config data.
export function readProtectedDocumentTransportConfig(path,{stat=lstatSync,open=openSync,fstat=fstatSync,read=readFileSync,close=closeSync}={}){
  assertProtectedDocumentTransportPath(path);assertProtectedDocumentTransportParents(path,new Set([0]),stat);
  const before=stat(path);check(before.isFile()&&!before.isSymbolicLink()&&before.uid===0&&before.nlink===1&&(before.mode&0o022)===0&&before.size>0&&before.size<=4096,'UNSAFE_DOCUMENT_TRANSPORT_CONFIG');
  const fd=open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{const opened=fstat(fd);check(['dev','ino','uid','gid','mode','nlink','size','mtimeMs','ctimeMs'].every(k=>opened[k]===before[k]),'DOCUMENT_TRANSPORT_CONFIG_CHANGED');
    const raw=read(fd);check(raw.length===before.size,'DOCUMENT_TRANSPORT_CONFIG_CHANGED');return raw;
  }finally{close(fd);}
}
