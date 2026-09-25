import type {LocalExecutionOptions,PortableAuthorizationDomain} from '@ramex-labs/continuity/adapter';
export type ToolApproval = {name:string;inputSchema:Record<string,unknown>;outputSchema?:Record<string,unknown>;annotations?:Record<string,unknown>;execution?:Record<string,unknown>};
export type Upstream = {id:string;command:string;args:string[];cwd?:string;protocol?:'2026-07-28'|'legacy'};
export type Job = {name:string;upstream:string;tool:string;businessKey:string;action:string;resource:string;role:string;tenure:string;approval:ToolApproval};
export type GatewayOptions = {local:LocalExecutionOptions;storage:string;upstreams:Upstream[];operations:Job[];timeoutMs?:number};
export type GatewayResult = Readonly<{status:string;reason?:string;operationId?:string;canonicalDisposition?:string|null;externalOutcome?:'NOT_PROVEN';upstreamResult?:{isError:boolean;content:{type:'text';text:string}[];structuredContent?:unknown};[key:string]:unknown}>;
export interface Gateway {
 tools():{name:string;inputSchema:Record<string,unknown>;description:string}[];
 run(name:string,input:unknown):Promise<GatewayResult>;
 status(name:string):GatewayResult;
 why(name:string):Readonly<Record<string,unknown>>;
 close():Promise<void>;
}
/** Privileged application configuration; never expose the factory to an agent. */
export function createGateway(options:GatewayOptions):Promise<Gateway>;
export function operationIdentity(domain:PortableAuthorizationDomain,businessKey:string):string;
export function publicError(error:{code?:string;mayHaveCommitted?:boolean}):GatewayResult;
