import {mkdirSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {check,data,exact,id,hash,same,privateDirectory,readPrivate,durableCreate} from './data.mjs';
import {issuerUrl} from './access.mjs';

function assignment(raw){
 const v=exact(data(raw),['bindingId','subject','clientId']);
 for(const value of Object.values(v))id(value);
 return v;
}
function definition(raw){
 const v=exact(data(raw),['version','issuer','bindings']);check(v.version===1);
 issuerUrl(v.issuer,true); // HTTP is accepted only for an explicit IPv4 loopback issuer.
 check(Array.isArray(v.bindings)&&v.bindings.length>0&&v.bindings.length<=16);
 v.bindings.forEach(assignment);
 check(new Set(v.bindings.map(b=>b.bindingId)).size===v.bindings.length);
 return v;
}

/** Create a new private, deny-only policy. Never opens or overwrites an existing directory. */
export function initializeAccessPolicy({directory,issuer,bindings}){
 const policy=definition({version:1,issuer,bindings}),path=resolve(directory);
 check(realpathSync(dirname(path))===dirname(path),'STORAGE_UNAVAILABLE');privateDirectory(dirname(path));
 mkdirSync(path,{mode:0o700});durableCreate(join(path,'policy.json'),policy);
 return openAccessPolicy({directory:path});
}

/** Host-owned policy. No grant, un-revoke, automatic restore or issuer network access. */
export function openAccessPolicy({directory}){
 const path=privateDirectory(directory),stat=lstatSync(path);
 const policy=definition(readPrivate(join(path,'policy.json'))),fingerprint=hash(policy);
 const bindings=new Map(policy.bindings.map(b=>[b.bindingId,b]));
 function current(){
  privateDirectory(path);const now=lstatSync(path);
  check(now.dev===stat.dev&&now.ino===stat.ino,'STORAGE_UNAVAILABLE');
  check(hash(definition(readPrivate(join(path,'policy.json'))))===fingerprint,'STORAGE_UNAVAILABLE');
 }
 function identity(raw){
  const v=exact(data(raw),['issuer','subject','clientId','bindingId','tokenId']);
  for(const k of ['subject','clientId','bindingId','tokenId'])id(v[k]);
  check(v.issuer===policy.issuer,'ACCESS_NOT_CURRENT');
  const b=bindings.get(v.bindingId);
  check(b&&b.subject===v.subject&&b.clientId===v.clientId,'ACCESS_NOT_CURRENT');return v;
 }
 function record(kind,value){return {version:1,policy:fingerprint,kind,value};}
 function file(kind,value){return join(path,kind+'-'+hash(value)+'.json');}
 function denied(kind,value){
  let found;try{found=readPrivate(file(kind,value));}catch(error){if(error.code==='ENOENT')return false;throw error;}
  check(same(found,record(kind,value)),'STORAGE_UNAVAILABLE');return true;
 }
 function revoke(kind,value){
  current();if(denied(kind,value))return;
  // Operator calls must be serialized. Refuse capacity exhaustion; never prune denial records.
  check(readdirSync(path).length<1025,'POLICY_CAPACITY_EXHAUSTED');
  try{durableCreate(file(kind,value),record(kind,value));}catch(error){
   if(error.code!=='EEXIST'||!denied(kind,value))throw error;
  }
 }
 return Object.freeze({
  isActive(raw){try{current();const v=identity(raw);const active=!denied('binding',v.bindingId)&&!denied('token',v);current();return active;}catch{return false;}},
  revokeBinding(bindingId){id(bindingId);check(bindings.has(bindingId));revoke('binding',bindingId);},
  revokeToken(raw){revoke('token',identity(raw));},
 });
}
