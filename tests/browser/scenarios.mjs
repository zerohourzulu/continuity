import {defaultCase} from '../../website/playground/model.js';
const base=()=>defaultCase();
export const scenarios=[
 ['review survives',base(),'ALLOW'],
 ['collection stays denied',{...base(),operation:1},'DENY'],
 ['review revoked',{...base(),withdrawReview:true},'DENY'],
 ['explicit prohibition',{...base(),deny:true},'DENY'],
 ['old agent',{...base(),actor:0,operation:1},'DENY'],
 ['before collection',{...base(),step:0,actor:0,operation:1},'ALLOW'],
 ['unfinished before handover',{...base(),step:1,actor:0,operation:0},'ALLOW'],
 ['new direct permission',{...base(),actor:2,operation:4,grants:[{agent:2,operation:4,expired:false,revoked:false}]},'ALLOW'],
 ['expired permission',{...base(),actor:2,operation:4,grants:[{agent:2,operation:4,expired:true,revoked:false}]},'DENY'],
 ['revoked direct permission',{...base(),actor:2,operation:4,grants:[{agent:2,operation:4,expired:false,revoked:true}]},'DENY'],
 ['title alone gives no power',{...base(),actor:2,operation:2,roles:[{role:0,agent:2,operations:[]}]},'DENY'],
 ['role plus explicit permission',{...base(),actor:2,operation:2,roles:[{role:0,agent:2,operations:[2,3]}]},'ALLOW'],
 ['other actor cannot borrow permission',{...base(),actor:3,operation:2,roles:[{role:0,agent:2,operations:[2]}]},'DENY'],
 ['another valid permission survives revocation',{...base(),withdrawReview:true,grants:[{agent:1,operation:0,expired:false,revoked:false}]},'ALLOW'],
 ['global stop defeats alternate permission',{...base(),deny:true,grants:[{agent:1,operation:0,expired:false,revoked:false}]},'DENY'],
 ['maximum configuration',{...base(),names:Array.from({length:12},(_,i)=>'Helper '+i),actor:11,operation:11,roles:Array.from({length:7},(_,i)=>({role:i,agent:i+2,operations:Array.from({length:12},(_,i)=>i)})),grants:Array.from({length:32},(_,i)=>({agent:11,operation:i%12,expired:false,revoked:i!==11}))},'ALLOW'],
];
