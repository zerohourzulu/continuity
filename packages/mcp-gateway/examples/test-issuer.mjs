// Synthetic token issuer for the local demo/tests. Not an OAuth login service.
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
export async function testIssuer(){
 const {privateKey,publicKey}=await generateKeyPair('ES256'),jwk={...await exportJWK(publicKey),kid:'local-example',alg:'ES256',use:'sig'};
 let issuer;
 const server=createServer((req,res)=>{
  res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');
  if(req.url==='/.well-known/oauth-authorization-server')res.end(JSON.stringify({issuer,authorization_endpoint:issuer+'authorize',token_endpoint:issuer+'token',response_types_supported:['code'],grant_types_supported:['authorization_code'],code_challenge_methods_supported:['S256'],authorization_response_iss_parameter_supported:true}));
  else{res.statusCode=501;res.end(JSON.stringify({error:'test_fixture_has_no_login_flow'}));}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 issuer=`http://127.0.0.1:${server.address().port}/`;
 return {issuer,keys:[jwk],privateKey,
  async issue(resource,claims={},header={}){const at=Math.floor(Date.now()/1000);return new SignJWT({iss:issuer,aud:resource,sub:'alice',client_id:'example-client',continuity_binding:'agent-a',scope:'mcp:access',iat:at,exp:at+120,jti:randomUUID(),...claims})
   .setProtectedHeader({alg:'ES256',typ:'at+jwt',kid:jwk.kid,...header}).sign(privateKey);},
  async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
