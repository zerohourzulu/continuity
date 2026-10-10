// Source proposal: private to this synthetic example, not a new Core API.
import {canonicalEncode, stateOf} from '@ramex-labs/continuity/adapter';
import {constants, openSync, closeSync, fstatSync, readSync, realpathSync} from 'node:fs';
import {isAbsolute, normalize} from 'node:path';

export const SCHEMA='continuity.synthetic-retained-receipt-example/1';
export const EDITION='@ramex-labs/continuity@0.3.0-preview.10';
export const LIMITS=Object.freeze({bytes:2*1024*1024,nodes:50000,depth:32,events:96,stringBytes:4096});
export class CompanionError extends Error {constructor(code){super(code);this.code=code;}}
export function need(condition,code){if(!condition)throw new CompanionError(code);}
export function closed(v,keys,code='ENVELOPE_SCHEMA'){
 need(v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)),code);
}
const MAX=(1n<<256n)-1n;
function revive(value,depth,counter){
 need(++counter.nodes<=LIMITS.nodes&&depth<=LIMITS.depth,'ENVELOPE_STRUCTURE_BOUND');
 if(value===null||typeof value==='boolean')return value;
 if(typeof value==='number'){need(Number.isSafeInteger(value)&&!Object.is(value,-0),'ENVELOPE_NUMBER');return value;}
 if(typeof value==='string'){
  need(Buffer.byteLength(value,'utf8')<=LIMITS.stringBytes&&!/[\uD800-\uDFFF]/u.test(value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g,'')),'ENVELOPE_STRING');return value;
 }
 if(Array.isArray(value))return value.map(v=>revive(v,depth+1,counter));
 need(value!==null&&typeof value==='object','ENVELOPE_VALUE');
 const keys=Object.keys(value);
 if(Object.hasOwn(value,'$continuity.bigint')){
  closed(value,['$continuity.bigint'],'BIGINT_MARKER_SHAPE');const decimal=value['$continuity.bigint'];
  need(typeof decimal==='string'&&/^(0|[1-9][0-9]{0,77})$/.test(decimal),'BIGINT_DECIMAL');
  const n=BigInt(decimal);need(n<=MAX,'BIGINT_BOUND');return n;
 }
 need(!keys.some(k=>k.startsWith('$continuity.')||k==='$bigint'),'FOREIGN_OR_RESERVED_MARKER');
 const result=Object.create(null);
 for(const key of keys){
  need(key.length<=256&&!['__proto__','prototype','constructor'].includes(key),'ENVELOPE_KEY');
  result[key]=revive(value[key],depth+1,counter);
 }
 return result;
}
function head(v){closed(v,['hash','position','canonicalTime'],'HEAD_SCHEMA');need(typeof v.hash==='string'&&/^0x[0-9a-f]{64}$/.test(v.hash)&&Number.isSafeInteger(v.position)&&v.position>=0&&Number.isSafeInteger(v.canonicalTime)&&v.canonicalTime>=0,'HEAD_VALUE');}
export function validateEnvelope(v){
 closed(v,['schema','edition','encoding','domain','issuedAt','verifierTime','issuanceHead','issuanceEvents','observedHead','observedEvents','artifact','subjects','producerObserved']);
 need(v.schema===SCHEMA&&v.edition===EDITION&&v.encoding==='continuity-canonical/0.2','ENVELOPE_EDITION');
 need(Number.isSafeInteger(v.issuedAt)&&v.issuedAt>=0&&Number.isSafeInteger(v.verifierTime)&&v.verifierTime>=v.issuedAt,'ENVELOPE_TIME');
 for(const k of ['issuanceEvents','observedEvents'])need(Array.isArray(v[k])&&v[k].length>0&&v[k].length<=LIMITS.events,'EVENT_BOUND');
 head(v.issuanceHead);head(v.observedHead);
 closed(v.subjects,['predecessor','successor','duty','action','resource','operation']);
 const expected={predecessor:'bea',successor:'alex',duty:'review:42',action:'read',resource:'incident:42',operation:'collect:42'};
 need(canonicalEncode(v.subjects)===canonicalEncode(expected),'SYNTHETIC_SUBJECTS');
 closed(v.producerObserved,['simulation','receiptRecording','staleLiveProcess','successorRead','duty','repeatedOperation']);
 const reports={simulation:'SUBMITTED',receiptRecording:'ADMITTED',staleLiveProcess:'RUNTIME_NOT_CURRENT',successorRead:'DENY',duty:'OPEN',repeatedOperation:'RECONCILIATION_ONLY'};
 need(canonicalEncode(v.producerObserved)===canonicalEncode(reports),'PRODUCER_OBSERVATION_SHAPE');
 // The reports remain producer-provided; shape checks never authenticate them.
 closed(v.artifact,['availability','value'],'ARTIFACT_AVAILABILITY_SHAPE');
 if(v.artifact.availability==='AVAILABLE')closed(v.artifact.value,['payload','contentHash','signature'],'ARTIFACT_SHAPE');
 else need(v.artifact.availability==='UNAVAILABLE'&&v.artifact.value===null,'ARTIFACT_AVAILABILITY_VALUE');
 return v;
}
export function encodeEnvelope(v){
 validateEnvelope(v);const bytes=Buffer.from(canonicalEncode(v),'utf8');
 need(bytes.length<=LIMITS.bytes,'ENVELOPE_BYTE_BOUND');return bytes;
}
export function decodeEnvelope(raw){
 need(Buffer.isBuffer(raw)&&raw.length>0&&raw.length<=LIMITS.bytes,'ENVELOPE_BYTE_BOUND');
 let parsed;try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{throw new CompanionError('ENVELOPE_JSON');}
 const value=revive(parsed,0,{nodes:0});
 // Duplicate keys, altered numeric spellings, ordering, whitespace, escaped
 // key/value variants and trailing data cannot equal the exact canonical bytes.
 need(Buffer.from(canonicalEncode(value),'utf8').equals(raw),'NONCANONICAL_ENVELOPE');
 return validateEnvelope(value);
}
export function same(a,b){return canonicalEncode(a)===canonicalEncode(b);}
export function replayHead(events){return stateOf(events).head;}
export function readEnvelope(path){
 need(typeof path==='string'&&isAbsolute(path)&&normalize(path)===path,'INPUT_ABSOLUTE_PATH');
 let fd;
 try{
  need(realpathSync(path)===path,'INPUT_REAL_PATH');
  fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const before=fstatSync(fd);need(before.isFile()&&before.nlink===1&&(before.mode&0o022)===0&&before.size>0&&before.size<=LIMITS.bytes,'INPUT_FILE_BOUND');
  const buffer=Buffer.alloc(before.size+1);let used=0;
  while(used<buffer.length){const n=readSync(fd,buffer,used,buffer.length-used,null);if(n===0)break;used+=n;}
  const after=fstatSync(fd);
  need(used===before.size&&['dev','ino','size','mtimeMs','ctimeMs','mode','nlink'].every(k=>before[k]===after[k]),'INPUT_CHANGED');
  return decodeEnvelope(buffer.subarray(0,used));
 }catch(error){
  if(error instanceof CompanionError)throw error;
  if(['ENOENT','EACCES','EPERM'].includes(error.code))throw new CompanionError('EVIDENCE_UNAVAILABLE');
  throw new CompanionError('EVIDENCE_READ_FAILED');
 }finally{if(fd!==undefined)closeSync(fd);}
}
