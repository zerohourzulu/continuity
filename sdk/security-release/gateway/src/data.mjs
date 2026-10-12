import {constants,openSync,closeSync,fstatSync,lstatSync,readFileSync,writeFileSync,fsyncSync,realpathSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {captureData,hashCanonical} from '@ramex-labs/continuity/adapter';
import {parseStrictJson} from './strict-json.mjs';
export const fail=code=>{throw Object.assign(new Error(code),{code});};
export const check=(ok,code='INVALID_INPUT')=>{if(!ok)fail(code);};
export const data=value=>captureData(value,131072,8192,24);
export const hash=value=>hashCanonical(data(value));
export const same=(a,b)=>hash(a)===hash(b);
export const exact=(value,required,optional=[])=>{
 check(value&&typeof value==='object'&&!Array.isArray(value));
 check(required.every(k=>Object.hasOwn(value,k))&&Object.keys(value).every(k=>required.includes(k)||optional.includes(k)));
 return value;
};
export const id=value=>{check(typeof value==='string'&&value.length>0&&value.length<=128&&!/[\u0000-\u001f\u007f]/u.test(value));return value;};
export function privateDirectory(value){const path=resolve(value),s=lstatSync(path);check(s.isDirectory()&&realpathSync(path)===path&&(s.mode&0o077)===0,'STORAGE_UNAVAILABLE');return path;}
export function readPrivate(path,maximum=131072){
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const s=fstatSync(fd);check(s.isFile()&&s.nlink===1&&(s.mode&0o077)===0&&s.size<=maximum,'STORAGE_UNAVAILABLE');
 const bytes=readFileSync(fd),after=fstatSync(fd),named=lstatSync(path);
 check(bytes.length===s.size&&after.size===s.size&&after.mtimeMs===s.mtimeMs&&after.ctimeMs===s.ctimeMs&&named.ino===s.ino&&named.dev===s.dev&&!named.isSymbolicLink(),'STORAGE_UNAVAILABLE');
 return parseStrictJson(bytes,{maxBytes:maximum,maxDepth:24,maxNodes:8192});}finally{closeSync(fd);}
}
export function durableCreate(path,value){
 const bytes=Buffer.from(JSON.stringify(data(value)));check(bytes.length<=131072,'STORAGE_UNAVAILABLE');
 const fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
 const parent=openSync(dirname(path),constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{fsyncSync(parent);}finally{closeSync(parent);}
}
