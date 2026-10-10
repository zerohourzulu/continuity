import {explainRecord,explainBytes,explainCode,help} from '@ramex-labs/continuity/messages';
const result:string=explainRecord('mcp',{jsonrpc:'2.0',error:{code:-32602,message:'INVALID_PARAMS'}});
const other:string=explainBytes('mcp',new Uint8Array());
const code:string=explainCode('gateway','GATEWAY_CONFIGURATION_UNAVAILABLE');
const h:string=help;
void [result,other,code,h];
