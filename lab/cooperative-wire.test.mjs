import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import * as wire from '../packages/remote-tools/wire.mjs';

test('typed transport preserves bigint and tag-shaped objects without prototype keys or numeric loss',()=>{
  const value={quantity:2n**255n,lookalike:['bigint','42'],object:{tag:'bigint',value:'42'},zero:0,yes:true};
  const decoded=wire.decodeTransport(wire.encodeTransport(value));
  assert.equal(decoded.quantity,value.quantity);assert.equal(typeof decoded.lookalike[1],'string');
  assert.equal(wire.canonicalDigest(decoded),wire.canonicalDigest(value));
  assert.throws(()=>wire.encodeTransport({x:undefined}));assert.throws(()=>wire.encodeTransport({x:NaN}));
  assert.throws(()=>wire.decodeTransport(Buffer.from('{"x":1,"x":2}')));
  assert.throws(()=>wire.decodeTransport(Buffer.alloc(wire.MAX_WIRE_BYTES+1,32)));
});

test('signatures bind the exact nonce, service and full effect; report replies cannot be replayed against a fresh request',()=>{
  const signer=generateKeyPairSync('ed25519'),provider=generateKeyPairSync('ed25519');
  const body={version:'continuity-cooperative-request/1',serviceId:'service:test',nonce:'0'.repeat(64),operation:'status',payload:{key:'0x'+'a'.repeat(64)}};
  const signed=wire.signRequest(body,signer.privateKey);
  assert.equal(wire.verifyRequest(signed,signer.publicKey,{serviceId:'service:test'}).nonce,body.nonce);
  for(const change of [x=>x.body.nonce='1'.repeat(64),x=>x.body.serviceId='service:other',x=>x.body.payload.key='0x'+'b'.repeat(64)]){
    const forged=structuredClone(signed);change(forged);assert.throws(()=>wire.verifyRequest(forged,signer.publicKey,{serviceId:'service:test'}));
  }
  const reply=wire.signResponse({version:'continuity-cooperative-response/1',serviceId:body.serviceId,requestDigest:wire.canonicalDigest(body),sequence:2,result:{state:'UNKNOWN',key:body.payload.key}},provider.privateKey);
  // Verification arguments are selected by the initiating client, never the response.
  assert.throws(()=>wire.verifyResponse(reply,provider.publicKey,{serviceId:'service:test',requestDigest:wire.canonicalDigest({...body,nonce:'2'.repeat(64)})}));
});
