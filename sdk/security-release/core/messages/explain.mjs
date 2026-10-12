#!/usr/bin/env node
// Explicit read-only human renderer. Saved records are untrusted, unauthenticated
// reports. This module does not invoke commands, retry or inspect operator state.
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseStrictJson } from './strict-json.mjs';
import {describeUnavailable,validateCause} from './typed-description.mjs';
const catalogue = JSON.parse(readFileSync(new URL('./catalogue.json',import.meta.url),'utf8'));
const additional = JSON.parse(readFileSync(new URL('./additional.json',import.meta.url),'utf8'));
const surfaces = new Set(['reviewer','workflow','controller','recipient','service','reader','mcp','p-v9','proposal']);
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const invalid = () => { throw new Error('EXPLANATION_CONTEXT_REFUSED'); };
const heading = 'This explains an untrusted saved record. It does not authenticate the record, verify a proof, grant authority or run an action.';
const codeOnlyGuidance = Object.freeze({
  'gateway': Object.freeze({GATEWAY_CONFIGURATION_UNAVAILABLE: 'The gateway reports that its configuration or startup route could not finish. Its cause is not identified. Keep the original command and selected configuration; ask the operator to inspect the trusted installation and retained host state before considering another start. This message does not establish that nothing started or that a restart is safe.'}),
  'document-client': Object.freeze({DOCUMENT_CLIENT_FAILED_NO_AUTOMATIC_RETRY: 'The document client reports that it could not finish reporting or saving the request result. Its cause is not identified. A request may already have been sent or a reply printed. Keep the original command, reply and local output; ask the operator to reconcile the retained review and output files before considering another request. This message does not establish that no work occurred.'}),
  'document-inspection': Object.freeze({DOCUMENT_EVIDENCE_INSPECTION_FAILED: 'The document evidence inspection reports that it could not finish reading or checking the supplied input. It does not identify which check failed and does not judge the document false. Keep the original input and command; ask the maintainer to inspect the selected input format and retained evidence. This tool does not launch the broker or publish anything.'})
});
export function explainCode(surface,code) {
  if(!Object.hasOwn(codeOnlyGuidance,surface) || typeof code!=='string' || !Object.hasOwn(codeOnlyGuidance[surface],code))invalid();
  return 'This explains an untrusted, unauthenticated supplied code. It does not authenticate an output, verify evidence or run an action.\nThe supplied code reports '+code+'.\n'+codeOnlyGuidance[surface][code]+'\n';
}
export function explainRecord(surface,value) {
  if (!surfaces.has(surface) || !record(value)) invalid();
  if (surface==='proposal') {
    if(!['NO_NOTE_ATTEMPTED','CHECK_RETAINED_STATE_BEFORE_ANY_RETRY'].includes(value.outcome) || typeof value.code!=='string')invalid();
    const applyCodes=new Set(['PROPOSAL_NOT_PREPARED','APPROVAL_MISMATCH','PROPOSAL_ALREADY_ATTEMPTED','PROPOSAL_FRAME_LIMIT']);
    if(applyCodes.has(value.code) && value.outcome!=='CHECK_RETAINED_STATE_BEFORE_ANY_RETRY')invalid();
  }
  if (surface==='p-v9') {
    if (value.status!=='UNVERIFIED' || Object.hasOwn(value,'permitsExecution') && value.permitsExecution!==false) invalid();
    const reason=value.reason;
    const unavailableReasons=new Set(['P_REVIEWER_UNAVAILABLE','P_NATIVE_VERIFIER_UNAVAILABLE','P_NATIVE_SNAPSHOT_CHANGED','P_NATIVE_CLEANUP_UNCERTAIN','P_NATIVE_PLATFORM_UNAVAILABLE','P_NATIVE_RESULT','P_REVIEWER_BINARY','P_REVIEWER_BINARY_CHANGED']);
    let text;
    if (unavailableReasons.has(reason)) {
      if(Object.hasOwn(value,'cause')) {
        const c=validateCause(value.cause);
        if(c.kind==='FALLBACK_EMPTY_REVERT')invalid();
        if(reason==='P_NATIVE_SNAPSHOT_CHANGED' && (c.kind!=='SNAPSHOT_CHANGED' || c.phase==='NOT_STARTED'))invalid();
      }
      text=describeUnavailable(reason,value.cause).message;
    } else if(reason==='P_PROOF_CHECK_FAILED') {
      if(value.componentReason!=='ENROLLED_CHECK_FAILED' || Object.hasOwn(value,'checkDetail') && value.checkDetail!=='FALLBACK_EMPTY_REVERT')invalid();
      text='The proof did not pass the enrolled check. This does not show that it was faked or tampered with.';
      if(value.checkDetail==='FALLBACK_EMPTY_REVERT')text+=' The record identifies the guarded exact empty CALL revert from the enrolled verifier.';
      text+=' Keep the proof and report. Ask the operator to inspect the selected enrollment and verifier result before considering another check.';
    } else if(reason==='P_PROOF_INVALID') {
      if(!['PUBLIC_RESULT_MISMATCH','APP_COMMIT_MISMATCH'].includes(value.componentReason))invalid();
      text=value.componentReason==='APP_COMMIT_MISMATCH'?'The program commitment does not match the expected commitment.':'The proof result does not match the expected result.';
      text+=' Keep the original proof, report and expected values. Ask the operator to reconcile the selected result or program commitment; do not replace trusted values with values from this failed check.';
    } else invalid();
    return heading+'\nThe supplied current-v9 record reports '+reason+'.\n'+text+'\nThis renderer has not checked the proof or process state. Any new check requires the operator’s separate decision.\n';
  }
  let candidates=[];
  if (surface==='mcp') {
    if (!record(value.error) || value.jsonrpc !== '2.0') invalid();
    const {code,message}=value.error;
    if (!(code===-32602 && message==='INVALID_PARAMS' || code===-32700 && message==='PARSE_ERROR')) invalid();
    candidates=[message];
  } else if (surface==='service') {
    if (value.status !== 'REFUSED') invalid();
    candidates=['REFUSED'];
  } else {
    for (const key of ['status','reason','code','outcome']) if (Object.hasOwn(value,key)) {
      if (typeof value[key]!=='string') invalid();
      candidates.push(value[key]);
    }
    if (Object.hasOwn(value,'error')) {
      if (typeof value.error==='string') candidates.push(value.error);
      else if (record(value.error) && typeof value.error.code==='string') candidates.push(value.error.code);
      else invalid();
    }
  }
  const relevant=[...Object.values(catalogue.rows).filter(r=>r.row!==2),...additional.rows].filter(r=>r.surface===surface && candidates.includes(r.code));
  if (relevant.length!==1) invalid();
  const row=relevant[0];
  if (['workflow','controller'].includes(surface) && Object.hasOwn(value,'claim') && value.claim!=='UNPROVED') invalid();
  if (surface==='reviewer' && Object.hasOwn(value,'recovery')) return heading+'\nThe supplied record reports '+row.code+' and recovery data.\nAdministration may have completed despite the error. Keep the original record and any privately retained floor (the saved minimum-state file). Ask the administrator to reconcile the reported operation and retained state before considering another command. Do not enroll, disable or verify again on this message alone. The recovery data and reported state have not been authenticated by this renderer.\n';
  let guidance = [row];
  if (surface==='reviewer' && row.code==='HELP') guidance.push(catalogue.rows['2']);
  let text=heading+'\n';
  for (const r of guidance) text+=r.message+(r.action?' '+r.action:'')+'\n';
  text+='Reported code: '+row.code+'.\n';
  if (surface==='proposal') text+=value.outcome==='NO_NOTE_ATTEMPTED'?'The wrapper reports that it had not reached a note attempt. This is not a claim that no prior preparation or other work occurred.\n':'The wrapper had entered its note-attempt route. Its outcome must be checked in retained case state before considering another submission. This error does not establish that no note was recorded.\n';
  return text;
}
export function explainBytes(surface,bytes) {
  return explainRecord(surface,parseStrictJson(bytes,{maxBytes:65536,maxDepth:16,maxNodes:2048}));
}
export const help=`Explain one saved JSON object as human text.

continuity-explain --surface reviewer|workflow|controller|recipient|service|reader|mcp|p-v9|proposal < saved-output.json
continuity-explain --surface document-client --code DOCUMENT_CLIENT_FAILED_NO_AUTOMATIC_RETRY
continuity-explain --surface gateway --code GATEWAY_CONFIGURATION_UNAVAILABLE
continuity-explain --surface document-inspection --code DOCUMENT_EVIDENCE_INSPECTION_FAILED

Only one UTF-8 JSON object is accepted: at most 65,536 bytes, 16 levels and
2,048 values; duplicate keys and additional JSON values are refused. Unknown
or ambiguous contexts are refused. MCP input is the full JSON-RPC error object.
For the recipient surface, use a recipient publish response or refusal.
For the service surface, use the local operator diagnostic with status REFUSED.
The p-v9 surface is only for the accepted current typed-refusal adapter record;
it is separate from the historical r2.2 kit adapter and preserves typed details.
The proposal surface requires the operator wrapper's code and outcome fields.
Human text is derived from fixed source-bound guidance. Extra payload fields,
private paths, exception messages and transport signatures are never printed.
This tool does not verify authenticity, open the named files, start commands,
retry, change trust, grant authority or inspect private state.
Original commands, stdout JSON, RPC bytes and their exit codes are unchanged.
Keep the original output and original command exit code separately.
`;
if (process.argv[1] && fileURLToPath(import.meta.url)===realpathSync(process.argv[1])) {
  const args=process.argv.slice(2);
  if (args.length===1 && ['--help','-h'].includes(args[0])) process.stdout.write(help);
  else if(args.length===4 && args[0]==='--surface' && args[2]==='--code') {
    try { process.stdout.write(explainCode(args[1],args[3])); }
    catch { process.stderr.write('EXPLANATION_CONTEXT_REFUSED: Supply one enumerated code for the exact supported surface. No explanation was produced.\n');process.exitCode=2; }
  }
  else if (args.length!==2 || args[0]!=='--surface' || !surfaces.has(args[1])) {
    process.stderr.write('EXPLANATION_USAGE: Use continuity-explain --help.\n');process.exitCode=2;
  } else {
    const chunks=[];let count=0,refused=false;
    process.stdin.on('data',chunk=>{
      count+=chunk.length;
      if (count>65536) {refused=true;chunks.length=0;process.stdin.destroy();process.stderr.write('EXPLANATION_INPUT_REFUSED: Input exceeds 65,536 bytes. No explanation was produced.\n');process.exitCode=2;}
      else chunks.push(chunk);
    });
    process.stdin.on('error',()=>{if(!refused){refused=true;process.stderr.write('EXPLANATION_INPUT_REFUSED: The saved record could not be read.\n');process.exitCode=2;}});
    process.stdin.on('end',()=>{
      if(refused)return;
      try {process.stdout.write(explainBytes(args[1],Buffer.concat(chunks)));}
      catch {process.stderr.write('EXPLANATION_CONTEXT_REFUSED: Use one correctly encoded object and a known, unambiguous source context. Keep the original record; ask the maintainer to inspect it without sharing private contents.\n');process.exitCode=2;}
    });
  }
}
