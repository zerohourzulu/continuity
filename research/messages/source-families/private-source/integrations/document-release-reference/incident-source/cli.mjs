#!/usr/bin/env node
import { humanSourceRefusal } from './human-error.mjs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {HELP,parseSourceArgs} from './contract.mjs';
import {runSourceVerification} from './application.mjs';

export async function main(args){
  let options;
  try{options=parseSourceArgs(args);}catch{
    process.stderr.write('SOURCE_VERIFICATION_REFUSED: invalid explicit selection. Use --help.\n');
    return 1;
  }
  if(options.help){process.stdout.write(HELP);return 0;}
  const result=await runSourceVerification(options);
  if(result.exitCode===0){
    process.stdout.write('SOURCE_SIGNATURE_VERIFIED: Signature matches the selected source-key policy.\n');
    process.stdout.write(`Credential class: ${result.report.verifiedStatement.credentialClass}. Private record completed.\n`);
    process.stdout.write('Policy freshness and institution identity are not established; incident truth is not verified.\n');
    process.stdout.write('Signing time is not witnessed. Core authority and case inclusion are not evaluated. No powers granted.\n');
  }else if(result.exitCode===2){
    process.stderr.write('RECORDING_UNCONFIRMED: retain partial files; a nonzero or missing terminal result overrides positive files. Do not reuse the output directory.\n');
  }else{
    process.stderr.write('SOURCE_VERIFICATION_REFUSED: '+humanSourceRefusal(result.refusalCode,result.report)+'\n');
  }
  return result.exitCode;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{process.exitCode=await main(process.argv.slice(2));}catch{
    process.stderr.write('RECORDING_UNCONFIRMED: no confirmed terminal result; preserve any partial record.\n');
    process.exitCode=2;
  }
}
