import http from 'node:http';
import { openDestinationStore } from './durable-store.mjs';
import { stateOf } from '@ramex-labs/continuity/adapter';
import { captureHistory } from '@ramex-labs/continuity/adapter';
import { capture, exact, textId, hashId, integer, canonicalDigest, encodeTransport, decodeTransport,
  publicKeyIdentity, verifyRequest, signResponse, validateOperationShape, validateReport, MAX_WIRE_BYTES } from './wire.mjs';

const refuse=code=>{throw Object.assign(new Error(code),{code});};
const same=(a,b)=>canonicalDigest(a)===canonicalDigest(b);
const response=(state,code)=>({state,code});
const refusals=['NO_CHECKPOINT','CHECKPOINT_CONFLICT','CHECKPOINT_CHANGED','OPERATION_CONFLICT','BUSINESS_KEY_CONFLICT',
  'AUTHORIZATION_REFUSED','CLOCK_INVALID','CAPACITY_EXHAUSTED','INVALID_OPERATION'];
const requestBytes=request=>new Promise((resolve,reject)=>{
  const parts=[];let size=0,settled=false;
  const timer=setTimeout(()=>{if(!settled){settled=true;reject(Error('REQUEST_TIMEOUT'));request.destroy();}},5000);
  const end=()=>clearTimeout(timer);
  request.on('data',chunk=>{if(settled)return;size+=chunk.length;if(size>MAX_WIRE_BYTES){settled=true;end();reject(Error('REQUEST_LIMIT'));request.destroy();}else parts.push(chunk);});
  request.on('end',()=>{if(settled)return;settled=true;end();resolve(Buffer.concat(parts));});
  request.on('error',error=>{if(settled)return;settled=true;end();reject(error);});
  request.on('aborted',()=>{if(settled)return;settled=true;end();reject(Error('REQUEST_ABORTED'));});
});

/** Synthetic effects only: effect and deduplication record share one commit. */
export async function createCooperativeDestination({directory,domain,serviceId,coordinatorPublicKey,servicePrivateKey,now,validateOperation}) {
  domain=capture(domain);textId(serviceId);
  if(typeof now!=='function'||typeof validateOperation!=='function'||servicePrivateKey.type!=='private'||coordinatorPublicKey.type!=='public')throw Error('INVALID_CONFIGURATION');
  const coordinatorKey=publicKeyIdentity(coordinatorPublicKey),serviceKey=publicKeyIdentity(servicePrivateKey);
  const store=openDestinationStore({directory,initial:{version:'continuity-cooperative-destination/1',domain,serviceId,
    coordinatorKey,serviceKey,sequence:0,lastTime:0,checkpoint:null,attempts:[],businessKeys:[],effects:[]}});
  const clock=state=>{
    let at;try{at=integer(now());}catch{refuse('CLOCK_INVALID');}
    if(at<state.lastTime||(state.checkpoint&&at<state.checkpoint.head.canonicalTime))refuse('CLOCK_INVALID');
    state.lastTime=at;
    return at;
  };
  const normalized=(events,operation,at,state)=>{
    let result;
    try{result=capture(validateOperation(events,operation,at,capture(state)));}
    catch{refuse('AUTHORIZATION_REFUSED');}
    exact(result,['intentId','idempotencyKey','submissionFingerprint','tool','arguments','businessKey','contractId']);
    hashId(result.idempotencyKey);hashId(result.submissionFingerprint);
    for(const name of ['intentId','tool','businessKey','contractId'])textId(result[name]);
    if(result.intentId!==operation.intentId||result.tool!==operation.tool||result.businessKey!==operation.businessKey||
        result.contractId!==operation.contractId||!same(result.arguments,operation.arguments))refuse('INVALID_OPERATION');
    return result;
  };
  const validateSaved=state=>{
    const heads=new Map();
    if(state.checkpoint!==null){
      exact(state.checkpoint,['head','events']);const events=captureHistory(state.checkpoint.events),replayed=stateOf(events);
      if(!same(replayed.genesis.domain,domain)||!same(replayed.head,state.checkpoint.head))throw Error('STORAGE_UNAVAILABLE');
      heads.set(replayed.head.position,replayed.head);
    }
    const keys=new Set(),business=new Set(),effects=new Set();
    for(const item of state.attempts){
      exact(item,['key','fingerprint','intentId','operation','normalized','checkpointHead','preparedAt','report']);
      hashId(item.key);hashId(item.fingerprint);integer(item.preparedAt);validateOperationShape(item.operation);validateReport(item.report);
      exact(item.normalized,['intentId','idempotencyKey','submissionFingerprint','tool','arguments','businessKey','contractId']);
      exact(item.checkpointHead,['hash','position','canonicalTime']);hashId(item.checkpointHead.hash);
      integer(item.checkpointHead.position);integer(item.checkpointHead.canonicalTime);
      if(!state.checkpoint||item.checkpointHead.position>state.checkpoint.head.position||
        item.preparedAt<item.checkpointHead.canonicalTime)throw Error('STORAGE_UNAVAILABLE');
      if(!heads.has(item.checkpointHead.position))heads.set(item.checkpointHead.position,
        stateOf(state.checkpoint.events.slice(0,item.checkpointHead.position+1)).head);
      if(!same(heads.get(item.checkpointHead.position),item.checkpointHead))throw Error('STORAGE_UNAVAILABLE');
      if(keys.has(item.key)||item.normalized.idempotencyKey!==item.key||item.normalized.submissionFingerprint!==item.fingerprint||
          !same(item.normalized,{...item.operation,idempotencyKey:item.key,submissionFingerprint:item.fingerprint})||
          item.intentId!==item.operation.intentId||item.report.key!==item.key||item.report.fingerprint!==item.fingerprint||
          item.report.intentId!==item.intentId||item.report.tool!==item.operation.tool||item.report.businessKey!==item.operation.businessKey||
          item.report.contractId!==item.operation.contractId||item.report.checkpointHash!==item.checkpointHead.hash)throw Error('STORAGE_UNAVAILABLE');
      keys.add(item.key);
    }
    for(const binding of state.businessKeys){exact(binding,['businessKey','key','intentId']);if(business.has(binding.businessKey)||
      !state.attempts.some(item=>item.key===binding.key&&item.intentId===binding.intentId&&item.operation.businessKey===binding.businessKey))throw Error('STORAGE_UNAVAILABLE');business.add(binding.businessKey);}
    if(business.size!==state.attempts.length)throw Error('STORAGE_UNAVAILABLE');
    for(const effect of state.effects){
      exact(effect,['effectId','key','fingerprint','tool','arguments','businessKey','contractId']);
      const attempt=state.attempts.find(item=>item.key===effect.key);
      if(effects.has(effect.key)||!attempt||attempt.report.state!=='APPLIED'||attempt.report.effectId!==effect.effectId||
          effect.fingerprint!==attempt.fingerprint||effect.tool!==attempt.normalized.tool||
          !same(effect.arguments,attempt.normalized.arguments)||effect.businessKey!==attempt.normalized.businessKey||effect.contractId!==attempt.normalized.contractId)throw Error('STORAGE_UNAVAILABLE');
      effects.add(effect.key);
    }
    if(state.attempts.some(item=>(item.report.state==='APPLIED')!==effects.has(item.key)))throw Error('STORAGE_UNAVAILABLE');
    return state;
  };
  try{validateSaved(store.read());}catch(error){store.close();throw error;}
  const handle=body=>{
    try{
      const committed=store.transact(state=>{
        validateSaved(state);
        const before=capture(state);
        try {
        const {operation,payload}=body;
        let result;
        if(operation==='checkpoint'){
          const at=clock(state);let events,replayed;
          try{events=captureHistory(payload.events);replayed=stateOf(events);}catch{refuse('CHECKPOINT_CONFLICT');}
          if(!same(replayed.genesis.domain,domain)||at<replayed.head.canonicalTime)refuse('CHECKPOINT_CONFLICT');
          if(state.checkpoint){
            const prior=state.checkpoint.events;
            if(events.length<prior.length||!same(events.slice(0,prior.length),prior))refuse('CHECKPOINT_CONFLICT');
            if(events.length===prior.length)return{state,result:{state:'CHECKPOINTED',head:state.checkpoint.head}};
          }
          state.checkpoint={events,head:replayed.head};state.lastTime=at;
          result={state:'CHECKPOINTED',head:replayed.head};
        }else if(operation==='prepare'){
          if(!state.checkpoint)refuse('NO_CHECKPOINT');
          const at=clock(state),op=payload.operation,norm=normalized(state.checkpoint.events,op,at,state);
          const prior=state.attempts.find(item=>item.key===norm.idempotencyKey);
          if(prior){
            if(!same(prior.operation,op)||!same(prior.normalized,norm))refuse('OPERATION_CONFLICT');
            if(!same(prior.checkpointHead,state.checkpoint.head))refuse('CHECKPOINT_CHANGED');
            return{state,result:prior.report};
          }
          if(state.businessKeys.some(item=>item.businessKey===norm.businessKey))refuse('BUSINESS_KEY_CONFLICT');
          if(state.attempts.length>=256)refuse('CAPACITY_EXHAUSTED');
          const report={state:'PENDING',key:norm.idempotencyKey,fingerprint:norm.submissionFingerprint,
            intentId:norm.intentId,tool:norm.tool,businessKey:norm.businessKey,contractId:norm.contractId,checkpointHash:state.checkpoint.head.hash};
          state.attempts.push({key:norm.idempotencyKey,fingerprint:norm.submissionFingerprint,intentId:norm.intentId,
            operation:op,normalized:norm,checkpointHead:state.checkpoint.head,preparedAt:at,report});
          state.businessKeys.push({businessKey:norm.businessKey,key:norm.idempotencyKey,intentId:norm.intentId});
          state.lastTime=at;result=report;
        }else{
          const prior=state.attempts.find(item=>item.key===payload.key);
          if(!prior)return{state,result:{state:'UNKNOWN',key:payload.key}};
          if(operation==='status')return{state,result:prior.report};
          if(operation==='cancel'){
            if(prior.report.state==='APPLIED')return{state,result:{state:'TOO_LATE',report:prior.report}};
            if(prior.report.state==='CANCELLED')return{state,result:prior.report};
            // Cancellation reduces authority. A faulty clock cannot block it
            // or lower the floor used to admit future work.
            try{state.lastTime=Math.max(state.lastTime,integer(now()));}catch{}
            prior.report={...prior.report,state:'CANCELLED'};result=prior.report;
          }else if(operation==='commit'){
            if(prior.report.state!=='PENDING')return{state,result:prior.report};
            if(!state.checkpoint||!same(prior.checkpointHead,state.checkpoint.head))refuse('CHECKPOINT_CHANGED');
            const at=clock(state),norm=normalized(state.checkpoint.events,prior.operation,at,state);
            if(!same(norm,prior.normalized))refuse('OPERATION_CONFLICT');
            const effectId='effect:'+prior.key.slice(2);
            state.effects.push({effectId,key:prior.key,fingerprint:prior.fingerprint,tool:norm.tool,
              arguments:norm.arguments,businessKey:norm.businessKey,contractId:norm.contractId});
            prior.report={...prior.report,state:'APPLIED',effectId};state.lastTime=at;result=prior.report;
          }else refuse('INVALID_OPERATION');
        }
        validateSaved(state);return{state,result};
        }catch(error){
          if(!refusals.includes(error.code))throw error;
          // An observed later trusted time survives a refusal. Otherwise a
          // subsequent backward clock could revive an expired permission.
          return{state:{...before,lastTime:Math.max(before.lastTime,state.lastTime)},result:response('REFUSED',error.code)};
        }
      });
      return{sequence:committed.state.sequence,result:committed.result};
    }catch(error){
      const code=refusals.includes(error.code)?error.code:'STORAGE_UNAVAILABLE';
      return{sequence:store.read().sequence,result:response('REFUSED',code)};
    }
  };
  const sockets=new Set();let closing=false;
  const server=http.createServer(async(request,res)=>{
    if(request.method!=='POST'||request.url!=='/cooperative'){res.writeHead(404);res.end();return;}
    try{
      const envelope=decodeTransport(await requestBytes(request));
      const body=verifyRequest(envelope,coordinatorPublicKey,{serviceId});
      const result=handle(body);
      const receipt=signResponse({version:'continuity-cooperative-response/1',serviceId,requestDigest:canonicalDigest(body),...result},servicePrivateKey);
      res.writeHead(200,{'content-type':'application/json'});res.end(encodeTransport(receipt));
    }catch{if(!res.destroyed){res.writeHead(400);res.end();}}
  });
  server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
  server.requestTimeout=5000;server.headersTimeout=5000;
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);resolve();});});}
  catch(error){store.close();throw error;}
  return Object.freeze({
    url:`http://127.0.0.1:${server.address().port}`,
    inspect(){return capture(validateSaved(store.read()));},
    async close(){if(closing)return;closing=true;for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));store.close();},
  });
}
