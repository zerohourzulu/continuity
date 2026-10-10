import { humanOperatorCommandError } from './human-command-error.mjs';
// Passive local playback of explicitly labeled retained document observations.
// No native module, broker, signing, guest, or effect path is loaded by this entry.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRegular } from '../../security-action-reference/src/safe-io.mjs';
import { parseStrictJson } from '../../retained-evidence-mcp/src/strict-json.mjs';
import { startWorkbench } from './server.mjs';
const DATA_ONLY='DATA_ONLY_APPLICATION_REHEARSAL_NO_NATIVE_SOCKET_OR_DOCUMENT_EFFECT';
const LINUX='RETAINED_LINUX_DOCUMENT_DESK_REHEARSAL';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const slug=value=>typeof value==='string'&&/^[a-z][a-z0-9-]{0,31}$/.exec(value)?.[0]===value;
const digest=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
function provenance(value){
  const keys=['schemaVersion','sourcePackage','sourceArchiveSha256','evidenceArchiveSha256','recordedAt','sources'];
  if(!object(value)||Object.keys(value).length!==keys.length||!keys.every(k=>Object.hasOwn(value,k))||value.schemaVersion!=='continuity-document-recording-provenance/1'
    ||typeof value.sourcePackage!=='string'||!/^[a-z0-9][a-z0-9.-]{0,127}$/.test(value.sourcePackage)||!digest(value.sourceArchiveSha256)||!digest(value.evidenceArchiveSha256)
    ||typeof value.recordedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value.recordedAt)||!Number.isFinite(Date.parse(value.recordedAt))
    ||!Array.isArray(value.sources)||value.sources.length<1||value.sources.length>8)throw new Error('INVALID_DOCUMENT_RECORDING_PROVENANCE');
  const paths=new Set();
  for(const source of value.sources){
    if(!object(source)||Object.keys(source).length!==3||typeof source.path!=='string'||source.path.length>512||!source.path.split('/').every(p=>/^[a-zA-Z0-9_.-]+$/.test(p)&&p!=='.'&&p!=='..')
      ||!Number.isSafeInteger(source.bytes)||source.bytes<1||source.bytes>1024*1024||!digest(source.sha256)||paths.has(source.path))throw new Error('INVALID_DOCUMENT_RECORDING_PROVENANCE');
    paths.add(source.path);
  }
  return value;
}
export function readDocumentRecording(path){
  const value=parseStrictJson(readRegular(path,1024*1024));
  if(value?.schemaVersion!=='continuity-document-desk-recording/1'||![DATA_ONLY,LINUX].includes(value.scope)||!slug(value.caseId)||value.desk?.caseId!==value.caseId||value.desk?.current?.caseId!==value.caseId||value.desk?.schemaVersion!=='continuity-document-desk/1'||!Array.isArray(value.desk.reviews)||value.desk.reviews.length>8||!object(value.views))throw new Error('INVALID_DOCUMENT_RECORDING');
  const scope=value.scope,source=scope===LINUX?provenance(value.provenance):null;
  const ids=value.desk.reviews.map(row=>row?.reviewId);
  if(ids.some(id=>!slug(id))||new Set(ids).size!==ids.length||Object.keys(value.views).length!==ids.length||ids.some(id=>!Object.hasOwn(value.views,id)))throw new Error('INVALID_DOCUMENT_RECORDING_REVIEWS');
  for(const id of ids){const view=value.views[id];
    if(view?.reviewId!==id||view.schemaVersion!=='continuity-document-view/1'||view.current?.caseId!==value.caseId)throw new Error('INVALID_DOCUMENT_RECORDING_VIEW');
  }
  const deny=()=>{throw new Error('READ_ONLY_RECORDING');};
  const observed=current=>({...current,power:{a:{status:'NOT_EVALUATED',scope:'RETAINED_RECORDING'},b:{status:'NOT_EVALUATED',scope:'RETAINED_RECORDING'}}});
  const selected=id=>{const view=Object.hasOwn(value.views,id)?value.views[id]:null;
    if(!view||view.reviewId!==id||view.schemaVersion!=='continuity-document-view/1'||view.current?.caseId!==value.caseId)throw new Error('RECORDED_REVIEW_UNAVAILABLE');
    return {...view,contextStatus:'NOT_EVALUATED',recordedContextStatus:view.contextStatus,current:observed(view.current),scope:{...view.scope,source:scope,currentAuthority:'NOT_EVALUATED',currentReviewContext:'NOT_EVALUATED',currentLocalPublication:'NOT_EVALUATED',recordedContextStatus:view.contextStatus,originalOS:'NOT_PROVED_BY_RECORDING',...(source?{provenance:source,provenanceVerification:'NOT_PERFORMED_BY_PLAYBACK'}:{})},available:{importDecision:false,exportAgentRequest:false,recover:false}};};
  const observationScope=scope===DATA_ONLY?'Data-only application rehearsal; no native socket, real document effect or current authority is demonstrated.':`Retained Linux rehearsal, recorded ${source.recordedAt}. This page displays historical observations; it does not contact the lab or recheck current authority, review context or publication. Source provenance is retained, not authenticated by playback.`;
  return {caseId:value.caseId,scope,application:Object.freeze({
    async desk(){return {...value.desk,accessMode:'READ_ONLY',observationScope,current:observed(value.desk.current),reviews:value.desk.reviews.map(row=>({...row,recordedContextStatus:row.contextStatus,contextStatus:'NOT_EVALUATED'})),available:{createReview:false}};},
    async view(id){return selected(id);},
    async downloadChallenge(id){const text=selected(id).selection?.challengeUtf8;if(typeof text!=='string')throw new Error('RECORDED_CHALLENGE_UNAVAILABLE');return text;},
    async downloadDisplay(id){const text=selected(id).selection?.displayUtf8;if(typeof text!=='string')throw new Error('RECORDED_DISPLAY_UNAVAILABLE');return text;},
    createReview:deny,importDecision:deny,exportAgentRequest:deny,recover:deny
  })};
}
export async function main(args){
  if(args.length!==1)throw new Error('USAGE_SERVE_DOCUMENT_RECORDING_JSON');
  const {caseId,scope,application}=readDocumentRecording(resolve(args[0]));
  const server=await startWorkbench({application,document:true,readOnly:true});
  let closing=false;const stop=async()=>{if(closing)return;closing=true;await server.close();};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  process.stdout.write(JSON.stringify({status:'READ_ONLY_DOCUMENT_RECORDING',url:server.url,caseId,scope})+'\n');return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(()=>{process.stderr.write(humanOperatorCommandError({code:'DOCUMENT_RECORDING_START_FAILED'})+'\n');process.exitCode=1;});
