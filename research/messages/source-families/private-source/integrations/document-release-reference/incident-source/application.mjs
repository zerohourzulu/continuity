// Offline selected snapshots and new private record only. No Core, signer or transport.
import {parseSourceArgs,evaluateSource,sha,encode,REFUSAL_CODES} from './contract.mjs';
import {readPreparationInput} from '../preparation/io.mjs';
import {createSourceOutput} from './io.mjs';

const optionKeys=['incidentPath','documentPath','attestationPath','policyPath','expectedPolicySha256','caseId','outputDirectory'];
const closedOptions=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===optionKeys.length&&optionKeys.every(key=>Object.hasOwn(value,key));
const knownCode=error=>REFUSAL_CODES.includes(error?.message)?error.message:'SOURCE_INVALID_INPUT';
const refused=refusalCode=>({exitCode:1,status:'SOURCE_VERIFICATION_REFUSED',refusalCode,report:null});
const identity=raw=>({bytes:raw.length,sha256:sha(raw)});
function summary(report){
  const success=report.status==='SOURCE_SIGNATURE_VERIFIED';
  return Buffer.from([
    report.status,
    success?'Signature matches the selected source-key policy.':`No source signature established: ${report.refusalCode}.`,
    `Selected policy SHA256: ${report.selection.expectedPolicySha256}`,
    `Credential class: ${success?report.verifiedStatement.credentialClass:'NOT_ESTABLISHED'}`,
    'Policy freshness NOT_ESTABLISHED. Institutional identity and incident truth NOT_VERIFIED.',
    'Signing time NOT_WITNESSED. Core authority and case inclusion NOT_EVALUATED.',
    'This unsigned observation grants no powers; it verifies no existing case or receipt.',
    'A recording failure or interrupted invocation overrides positive partial files.',
    ''
  ].join('\n'),'utf8');
}
export async function runSourceVerification(options,{readInput=readPreparationInput,createOutput=createSourceOutput,clock=Date.now}={}){
  let opts;
  try{
    if(!closedOptions(options))return refused('SOURCE_INVALID_SELECTION');
    opts=parseSourceArgs(['--incident',options.incidentPath,'--document',options.documentPath,
      '--attestation',options.attestationPath,'--policy',options.policyPath,
      '--expected-policy-sha256',options.expectedPolicySha256,'--case',options.caseId,'--out',options.outputDirectory]);
  }catch(error){return refused(knownCode(error));}
  let raw;
  try{
    const selected=[['incident',opts.incidentPath,16384],['document',opts.documentPath,65536],
      ['policy',opts.policyPath,8192],['attestation',opts.attestationPath,32768]];
    raw={};
    for(const [name,path,limit] of selected){
      const bytes=readInput(path,limit);
      if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>limit)return refused('SOURCE_INPUT_IO_REFUSED');
      raw[name]=Buffer.from(bytes);
    }
  }catch{return refused('SOURCE_INPUT_IO_REFUSED');}
  let report;
  try{
    // Capture local evaluation time only after the four stable snapshots exist.
    report=evaluateSource(raw,{caseId:opts.caseId,expectedPolicySha256:opts.expectedPolicySha256},clock());
  }catch(error){return refused(knownCode(error));}
  try{
    const payloads={'incident.json':raw.incident,'document.bin':raw.document,'source-policy.json':raw.policy,
      'attestation.json':raw.attestation,'verification.json':encode(report),'summary.txt':summary(report)};
    const manifest={schemaVersion:'continuity-incident-source-manifest/1',status:report.status,
      files:Object.fromEntries(Object.entries(payloads).map(([name,data])=>[name,identity(data)]))};
    const output=createOutput(opts.outputDirectory);
    for(const [name,data] of Object.entries(payloads))output.write(name,data);
    output.write('manifest.json',encode(manifest));
    return {exitCode:report.status==='SOURCE_SIGNATURE_VERIFIED'?0:1,status:report.status,refusalCode:report.refusalCode,report};
  }catch{
    // Preserve partial files and the computed assessment; the terminal failure dominates it.
    return {exitCode:2,status:'RECORDING_UNCONFIRMED',refusalCode:'SOURCE_RECORDING_UNCONFIRMED',report};
  }
}
