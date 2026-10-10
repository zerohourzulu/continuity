// Fixed operator-channel facade. This module owns no key, case file or agent channel.
import { parseStrictJson } from '../../retained-evidence-mcp/src/strict-json.mjs';
import { parseChallenge, sha } from './contract.mjs';
import { isDeepStrictEqual } from 'node:util';
const VERSION='continuity-document-operator-command/1';
const check=(ok,code)=>{if(!ok)throw new Error(code);};
const slug=value=>{check(typeof value==='string'&&/^[a-z][a-z0-9-]{0,31}$/.exec(value)?.[0]===value,'INVALID_DOCUMENT_ID');return value;};
const text=(value,max)=>{check(typeof value==='string'&&value.isWellFormed()&&Buffer.byteLength(value)>0&&Buffer.byteLength(value)<=max,'INVALID_DOCUMENT_TEXT');return value;};
export function createDocumentDeskApplication({sendCommand,caseId}) {
  check(typeof sendCommand==='function','INVALID_DOCUMENT_TRANSPORT');slug(caseId);
  async function command(operation,args={}) {
    const frame=Buffer.from(JSON.stringify({schemaVersion:VERSION,operation,...args})+'\n');
    check(frame.length<=16384,'DOCUMENT_COMMAND_FRAME_LIMIT');
    const raw=await sendCommand(frame);
    check(Buffer.isBuffer(raw)&&raw.length>0&&raw.length<=16384,'DOCUMENT_REPLY_FRAME_LIMIT');
    const reply=parseStrictJson(raw);
    check(reply!==null&&typeof reply==='object'&&!Array.isArray(reply)&&Object.keys(reply).length===2&&reply.ok===true&&Object.hasOwn(reply,'result'),'DOCUMENT_COMMAND_REFUSED_OR_UNCONFIRMED');
    check(reply.result!==null&&typeof reply.result==='object'&&!Array.isArray(reply.result),'DOCUMENT_REPLY_INVALID');
    return reply.result;
  }
  async function selection(reviewId) {
    slug(reviewId);const r=await command('READ_REVIEW',{reviewId});
    check(r.reviewId===reviewId&&r.status==='REVIEW_RETAINED','DOCUMENT_REVIEW_MISMATCH');
    for(const key of ['descriptorUtf8','requestUtf8','displayUtf8','challengeUtf8'])text(r[key],16384);
    const challenge=parseChallenge(r.challengeUtf8);
    check(challenge.caseId===caseId&&challenge.actionId===reviewId&&challenge.requestUtf8===r.requestUtf8,'DOCUMENT_CHALLENGE_MISMATCH');
    const display=parseStrictJson(Buffer.from(r.displayUtf8)),descriptor=parseStrictJson(Buffer.from(r.descriptorUtf8)),request=parseStrictJson(Buffer.from(r.requestUtf8));
    check(sha(r.displayUtf8)===challenge.reviewDisplaySha256&&display.caseId===caseId&&display.reviewId===reviewId&&isDeepStrictEqual(display.actorBinding,challenge.actorBinding)&&isDeepStrictEqual(display.descriptor,descriptor),'DOCUMENT_DISPLAY_MISMATCH');
    check(request.reviewId===reviewId&&request.descriptorUtf8===r.descriptorUtf8,'DOCUMENT_REQUEST_MISMATCH');
    return r;
  }
  return Object.freeze({
    async desk(){const r=await command('DESK');check(r.schemaVersion==='continuity-document-desk/1'&&r.caseId===caseId,'DOCUMENT_CASE_MISMATCH');return r;},
    async view(reviewId){slug(reviewId);const r=await command('VIEW',{reviewId});const s=await selection(reviewId);
      check(r.schemaVersion==='continuity-document-view/1'&&r.reviewId===reviewId&&r.current?.caseId===caseId&&r.challengeId===parseChallenge(s.challengeUtf8).challengeId,'DOCUMENT_VIEW_MISMATCH');
      check(isDeepStrictEqual(r.descriptor,parseStrictJson(Buffer.from(s.descriptorUtf8)))&&isDeepStrictEqual(r.actorBinding,parseChallenge(s.challengeUtf8).actorBinding)&&r.who===parseChallenge(s.challengeUtf8).who,'DOCUMENT_VIEW_SELECTION_MISMATCH');
      return {...r,selection:{descriptorUtf8:s.descriptorUtf8,requestUtf8:s.requestUtf8,displayUtf8:s.displayUtf8,challengeUtf8:s.challengeUtf8}};},
    async downloadChallenge(id){return (await selection(id)).challengeUtf8;},
    async downloadDisplay(id){return (await selection(id)).displayUtf8;},
    async createReview(reviewId,who,proposalUtf8){slug(reviewId);check(['a','b'].includes(who),'INVALID_DOCUMENT_ACTOR');text(proposalUtf8,2048);const r=await command('CREATE_REVIEW',{reviewId,who,proposalUtf8});check(r.status==='REVIEW_CREATED'&&r.reviewId===reviewId,'DOCUMENT_CREATE_UNCONFIRMED');return {status:r.status,reviewId:r.reviewId};},
    async importDecision(reviewId,approvalId,envelopeUtf8){slug(reviewId);slug(approvalId);text(envelopeUtf8,16384);const r=await command('IMPORT_APPROVAL',{reviewId,approvalId,envelopeUtf8});check(r.status==='DECISION_IMPORTED'&&r.reviewId===reviewId&&r.approvalId===approvalId&&['APPROVE','DENY'].includes(r.decision),'DOCUMENT_IMPORT_UNCONFIRMED');return r;},
    async exportAgentRequest(reviewId,approvalId){slug(reviewId);slug(approvalId);const r=await command('EXPORT_AGENT_REQUEST',{reviewId,approvalId});check(r.status==='AGENT_REQUEST_EXPORTED_NOT_EXECUTED'&&r.reviewId===reviewId&&r.approvalId===approvalId,'DOCUMENT_EXPORT_UNCONFIRMED');text(r.requestUtf8,16384);return r;},
    async recover(reviewId){slug(reviewId);const r=await command('RECOVER',{reviewId});
      if(r.status==='NOT_ADMITTED'){check(r.delivery==='NOT_ADMITTED'&&Object.keys(r).sort().join(',')==='delivery,duty,status','DOCUMENT_RECOVERY_UNCONFIRMED');return r;}
      check(r.reviewId===reviewId&&['LOCAL_PUBLICATION_VERIFIED','OUTCOME_UNKNOWN'].includes(r.status)&&r.delivery===r.status&&r.artifact?.status===r.status&&['RECORDED','CORE_RECORDING_UNAVAILABLE','UNAVAILABLE'].includes(r.coreRecording)&&r.coreExternalEffect==='NOT_PROVEN','DOCUMENT_RECOVERY_UNCONFIRMED');return r;}
  });
}
