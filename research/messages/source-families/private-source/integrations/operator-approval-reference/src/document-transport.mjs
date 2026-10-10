// Trusted Linux launch configuration; no HTTP field can choose a path or principal.
import { lstatSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseStrictJson } from '../../retained-evidence-mcp/src/strict-json.mjs';
import { assertProtectedDocumentTransportPath as pathValue, assertProtectedDocumentOperatorSocket, readProtectedDocumentTransportConfig as readConfig } from './protected-document-transport.mjs';
const check=(ok,code)=>{if(!ok)throw new Error(code);};
const uid=value=>Number.isSafeInteger(value)&&value>0&&value<4294967295;
export function validateDocumentTransportConfig(value){
  const keys=['schemaVersion','caseId','operatorSocket','deskUid','brokerUid'];
  check(value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k))&&value.schemaVersion==='continuity-document-desk-transport/2','INVALID_DOCUMENT_TRANSPORT_CONFIG');
  check(typeof value.caseId==='string'&&/^[a-z][a-z0-9-]{0,31}$/.exec(value.caseId)?.[0]===value.caseId,'INVALID_DOCUMENT_CASE_ID');
  pathValue(value.operatorSocket);check(Buffer.byteLength(value.operatorSocket)<108,'DOCUMENT_SOCKET_PATH_LIMIT');
  check(uid(value.deskUid)&&uid(value.brokerUid)&&value.deskUid!==value.brokerUid,'INVALID_DOCUMENT_TRANSPORT_UIDS');
  return Object.freeze({...value});
}
// Injection is a deterministic metadata-test seam. Live construction never supplies it.
export function assertDocumentEndpoint(config,{stat=lstatSync,platform=process.platform,realUid=process.getuid?.(),effectiveUid=process.geteuid?.()}={}){
  check(platform==='linux','DOCUMENT_DESK_REQUIRES_LINUX');
  check(realUid===config.deskUid&&effectiveUid===config.deskUid,'DOCUMENT_DESK_UID_REQUIRED');
  assertProtectedDocumentOperatorSocket(config,stat);
}
export function createNativeDocumentTransport(configPath){
  check(process.platform==='linux','DOCUMENT_DESK_REQUIRES_LINUX');
  pathValue(configPath);const original=readConfig(configPath),config=validateDocumentTransportConfig(parseStrictJson(original));
  assertDocumentEndpoint(config);
  const native=createRequire(import.meta.url)('../../document-release-native/index.cjs');native.hardenProcess();
  return Object.freeze({caseId:config.caseId,sendCommand(frame){
    check(Buffer.isBuffer(frame)&&frame.length>0&&frame.length<=16384,'DOCUMENT_COMMAND_FRAME_LIMIT');
    check(readConfig(configPath).equals(original),'DOCUMENT_TRANSPORT_CONFIG_CHANGED');
    assertDocumentEndpoint(config);
    // Native waits are synchronous and individually bounded; HTTP timers cannot
    // interrupt them. No retry occurs after any timeout or unconfirmed response.
    const reply=native.sendRequest(config.operatorSocket,frame,2000);
    check(Buffer.isBuffer(reply)&&reply.length>0&&reply.length<=16384,'DOCUMENT_REPLY_FRAME_LIMIT');return reply;
  }});
}
