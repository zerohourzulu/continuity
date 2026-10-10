// Fixed original-result recovery process; no signer or submit route.
import { openApprovalApplication } from './application.mjs';
if(process.argv.length!==5) throw new Error('RECOVERY_ARGUMENTS');
const application=openApprovalApplication({policyPath:process.argv[2],caseDirectory:process.argv[3]});
const result=await application.reconcile(process.argv[4]);process.stdout.write(JSON.stringify(result)+'\n');
