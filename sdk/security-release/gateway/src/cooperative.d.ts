import type {LocalExecutionOptions,PortableAuthorizationDomain} from '@ramex-labs/continuity/adapter';
import type {createCooperativeClient,ToolDefinition} from '@ramex-labs/continuity-remote';
import type {Gateway,GatewayResult} from './gateway.js';
import type {inspectContinuationDutyPolicy} from '@ramex-labs/continuity/duties';
export type CooperativeGatewayResult = GatewayResult & Readonly<{
 /** Present for an activated investigation; interpreted by the shared Core. */
 investigation?:NonNullable<ReturnType<typeof inspectContinuationDutyPolicy>['policy']>;
}>;
export interface CooperativeGatewayOptions {
 local:LocalExecutionOptions;
 storage:string;
 registry:{serviceId:string;account:string;tools:readonly ToolDefinition[]};
 destination:Parameters<typeof createCooperativeClient>[0];
 operations:Array<{name:string;tool:string;businessKey:string;role:string;tenure:string}>;
}
export interface CooperativeGateway extends Gateway {
 run(name:string,input:unknown):Promise<CooperativeGatewayResult>;
 status(name:string):CooperativeGatewayResult;
 /** Authenticated lookup of the original attempt; never prepare or commit again. */
 recover(name:string):Promise<CooperativeGatewayResult>;
 /** Separate admitted cancellation operation. A retry never sends cancel again. */
 cancel(name:string):Promise<CooperativeGatewayResult>;
 /** Record a verified retained APPLIED report with separately granted observation power. */
 observe(name:string):Promise<GatewayResult>;
}
export declare function createCooperativeGateway(options:CooperativeGatewayOptions):Promise<CooperativeGateway>;
export declare function cancellationIdentity(domain:PortableAuthorizationDomain,businessKey:string):string;
