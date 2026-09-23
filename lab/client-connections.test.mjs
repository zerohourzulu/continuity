import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {generateKeyPairSync} from 'node:crypto';
import {setImmediate} from 'node:timers/promises';
import {createCooperativeClient} from '../packages/remote-tools/client.mjs';
import {decodeTransport,encodeTransport,verifyRequest,signResponse,canonicalDigest} from '../packages/remote-tools/wire.mjs';

test('signed local requests use fresh connections and a lost response is never automatically resent',async t=>{
  const coordinator=generateKeyPairSync('ed25519'),provider=generateKeyPairSync('ed25519');
  const serviceId='connection-test',key='0x'+'a'.repeat(64),sockets=new Set();let requests=0;
  const server=http.createServer(async(req,res)=>{
    requests++;sockets.add(req.socket);
    if(requests===4){req.socket.destroy();return;}
    try {
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const body=verifyRequest(decodeTransport(Buffer.concat(chunks)),coordinator.publicKey,{serviceId});
      assert.equal(body.operation,'status');
      const signed=signResponse({version:'continuity-cooperative-response/1',serviceId,requestDigest:canonicalDigest(body),sequence:requests,result:{state:'UNKNOWN',key}},provider.privateKey);
      res.writeHead(200,{'content-type':'application/json'});res.end(encodeTransport(signed));
    }catch{res.writeHead(400);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const client=createCooperativeClient({url:`http://127.0.0.1:${server.address().port}`,serviceId,coordinatorPrivateKey:coordinator.privateKey,servicePublicKey:provider.publicKey});
  for(let i=0;i<3;i++){assert.equal((await client.status(key)).result.state,'UNKNOWN');await setImmediate();}
  assert.equal(sockets.size,3,'A later request must not reuse an idle connection');
  await assert.rejects(client.status(key));assert.equal(requests,4,'Transport failure must not trigger an automatic resend');
});
