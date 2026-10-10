import { humanInspectionError } from './human-error.mjs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openEvidenceClient } from '../../retained-evidence-mcp/src/client.mjs';
import { resolveProfile } from '../../retained-evidence-mcp/src/profile.mjs';
import { commonCaseSpec, COMMON_PROFILES } from './specs.mjs';
import { verifyAcceptedCoreSource } from './source-identity.mjs';

export async function readCommonCase(profileName) {
  if(arguments.length!==1) throw new Error('EXPECTED_ONE_FIXED_PROFILE');
  const spec=commonCaseSpec(profileName),profile=resolveProfile(profileName);
  if(profile.expectedCatalogSha256!==spec.catalogSha256 || profile.verifierId!==spec.verifierId) throw new Error('VERIFIER_PROFILE_MISMATCH');
  const sourceIdentity=await verifyAcceptedCoreSource();
  const {verifyCommonEvidence}=await import('./verify.mjs');
  const reader=await openEvidenceClient({profile:profileName});
  try {
    const artifacts=Object.create(null);
    for(const id of spec.evidenceIds) artifacts[id]=await reader.readEvidence(id);
    const report=verifyCommonEvidence(profileName,artifacts);
    const result={...report,sources:{...report.sources,sourcePinVerification:'VERIFIED_BEFORE_IMPORT',sourceIdentity}};
    if(Buffer.byteLength(JSON.stringify(result)+'\n')>65536) throw new Error('INSPECTION_OUTPUT_LIMIT');
    return result;
  } finally {await reader.close();}
}
export async function compareCommonCases() {
  if(arguments.length!==0) throw new Error('COMPARISON_ACCEPTS_NO_ARGUMENTS');
  const cases=[];
  for(const profile of COMMON_PROFILES) cases.push(await readCommonCase(profile));
  const result={schemaVersion:'continuity-common-case-comparison/1',
    explanation:'One accepted Core 0.2 verifier checks both retained cases. The packet case includes independently hash-checked retained files; the simulator case includes no packet-file evidence. Both duties remain unresolved. Historical verification grants no permission to act.',
    cases,scope:{readOnly:true,newAction:false,grantsCurrentAuthority:false,wallClockFreshnessClaimed:false}};
  if(Buffer.byteLength(JSON.stringify(result)+'\n')>131072) throw new Error('COMPARISON_OUTPUT_LIMIT');
  return result;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  Promise.resolve().then(async()=>{
    const [command,...extra]=process.argv.slice(2);
    if(extra.length || (command!=='compare' && !COMMON_PROFILES.includes(command))) throw new Error('Usage: node src/inspect.mjs compare | core02-packet | core02-simulated');
    process.stdout.write(JSON.stringify(command==='compare'?await compareCommonCases():await readCommonCase(command))+'\n');
  }).catch(error=>{process.stderr.write(humanInspectionError(error)+'\n');process.exitCode=1;});
}
