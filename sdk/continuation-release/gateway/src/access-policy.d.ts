import type {AccessIdentity} from './http.js';
export interface AccessPolicy {
 /** Synchronous current check. Missing, corrupt, changed or inaccessible policy refuses access. */
 isActive(identity:AccessIdentity):boolean;
 /** Permanent within this policy directory. Serialize operator mutation calls. */
 revokeBinding(bindingId:string):void;
 revokeToken(identity:AccessIdentity):void;
}
export declare function initializeAccessPolicy(options:{directory:string;issuer:string;bindings:Array<{bindingId:string;subject:string;clientId:string}>}):AccessPolicy;
export declare function openAccessPolicy(options:{directory:string}):AccessPolicy;
