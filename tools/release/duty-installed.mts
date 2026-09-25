import {createCooperativeGateway} from '@ramex-labs/continuity-mcp-gateway/cooperative';
import {inspectCase} from '@ramex-labs/continuity-mcp-gateway/operations';
declare const gateway:Awaited<ReturnType<typeof createCooperativeGateway>>;
declare const result:ReturnType<typeof inspectCase>;
const current: string | undefined = gateway.status('job').investigation?.dutyDisposition;
const uncertainty: 'NOT_PROVEN' | undefined = (await gateway.recover('job')).investigation?.externalOutcome;
const contested:number | undefined = result.dutySummary?.states.CONTESTED;
void [current,uncertainty,contested];
