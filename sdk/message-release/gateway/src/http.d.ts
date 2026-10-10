import type {GatewayOptions} from './gateway.js';
import type {CooperativeGatewayOptions} from './cooperative.js';
export interface AccessIdentity {readonly issuer:string;readonly subject:string;readonly clientId:string;readonly bindingId:string;readonly tokenId:string}
export type HttpGatewayBinding = {id:string;subject:string;clientId:string} &
 ({kind?:undefined;gateway:GatewayOptions}|{kind:'cooperative';gateway:CooperativeGatewayOptions;tasks?:true});
export interface HttpGatewayOptions {
 /** Always binds 127.0.0.1. Zero chooses an available port. */
 port?:number;
 issuer:string;
 /** Public ES256/P-256 JWKs only. No URLs, shared secrets or private keys. */
 keys:Array<{kty:'EC';crv:'P-256';x:string;y:string;kid:string;alg?:'ES256';use?:'sig'}>;
 bindings:HttpGatewayBinding[];
 /** Synchronous, host-owned revocation/binding policy; only true permits access. */
 isActive:(identity:AccessIdentity)=>boolean;
 /** Trusted milliseconds; clock rollback fails closed. */
 now?:()=>number;
 /** Allows only an explicit 127.0.0.1 HTTP test issuer. Not a production login flow. */
 allowTestIssuer?:boolean;
}
export declare function serveGatewayHttp(options:HttpGatewayOptions):Promise<Readonly<{resourceUrl:string;metadataUrl:string;close():Promise<void>}>>;
