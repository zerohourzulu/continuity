/** Browser evaluation profile ONLY. Not a general polyfill for node:util.
 * Only JSON-parsed requests and locally constructed records enter this worker.
 * Reject non-cloneable values (including Proxy) conservatively. A clone test
 * can invoke accessors, so this must NEVER be offered as a hostile-object SDK.
 * The byte boundary excludes caller accessors/functions before this point.
 */
const clone=globalThis.structuredClone?.bind(globalThis);
if(!clone)throw Error('This browser needs structuredClone support.');
export const types=Object.freeze({isProxy(value){
 if(value===null || !['object','function'].includes(typeof value))return false;
 try {clone(value);return false;} catch {return true;}
}});
