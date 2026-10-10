// Pure incident data and fixed-path composition. No Core, filesystem, native or effect access.
import {join} from 'node:path';
import {parseStrictJson} from '../../retained-evidence-mcp/src/strict-json.mjs';

const check=(ok,code)=>{if(!ok)throw new Error(code);};
const match=(re,v)=>typeof v==='string'&&re.exec(v)?.[0]===v;
const closed=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const validCase=v=>match(/^[a-z][a-z0-9-]{0,31}$/,v);
const identity=v=>closed(v,['bytes','sha256'])&&Number.isSafeInteger(v.bytes)&&v.bytes>=1&&v.bytes<=65536&&match(/^[0-9a-f]{64}$/,v.sha256);
const text=(v,max)=>typeof v==='string'&&v.isWellFormed()&&Buffer.byteLength(v)>=1&&Buffer.byteLength(v)<=max;
const noControls=v=>!/[\u0000-\u001f\u007f-\u009f]/u.test(v);

export const INTAKE_MODE='RECORDED_LOCAL_INCIDENT_INTAKE';

export function parseIncident(raw,caseId,documentIdentity){
 check(Buffer.isBuffer(raw)&&raw.length>=1&&raw.length<=16384,'INCIDENT_INPUT_LIMIT');
 const incident=parseStrictJson(raw);
 check(closed(incident,['schemaVersion','caseId','incidentReference','reportedSource','summary','dutyDescription','reviewWindowSeconds','document'])&&incident.schemaVersion==='continuity-incident-intake/1','INVALID_INCIDENT');
 check(validCase(caseId)&&validCase(incident.caseId)&&incident.caseId===caseId,'INCIDENT_CASE_MISMATCH');
 check(text(incident.incidentReference,128)&&noControls(incident.incidentReference),'INVALID_INCIDENT_REFERENCE');
 check(text(incident.reportedSource,256)&&noControls(incident.reportedSource),'INVALID_INCIDENT_REPORTED_SOURCE');
 check(text(incident.summary,2048),'INVALID_INCIDENT_SUMMARY');
 check(text(incident.dutyDescription,1024),'INVALID_INCIDENT_DUTY_DESCRIPTION');
 check(Number.isSafeInteger(incident.reviewWindowSeconds)&&incident.reviewWindowSeconds>=1&&incident.reviewWindowSeconds<=604800,'INVALID_INCIDENT_REVIEW_WINDOW');
 check(identity(incident.document)&&identity(documentIdentity),'INVALID_INCIDENT_DOCUMENT');
 check(incident.document.bytes===documentIdentity.bytes&&incident.document.sha256===documentIdentity.sha256,'INCIDENT_DOCUMENT_MISMATCH');
 Object.freeze(incident.document);
 return Object.freeze(incident);
}

export function intakeInitialization(effectDirectory,caseDirectory){
 return Object.freeze({mode:INTAKE_MODE,inputDirectory:join(effectDirectory,'intake-input'),outputDirectory:join(effectDirectory,'intake','output'),recordPath:join(caseDirectory,'intake.json')});
}
