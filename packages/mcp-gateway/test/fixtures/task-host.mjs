import {readFileSync} from 'node:fs';
import {createPrivateKey,createPublicKey} from 'node:crypto';
import {privateKeyToAccount} from 'viem/accounts';
import {serveGatewayHttp} from '../../src/http.mjs';
const config=JSON.parse(readFileSync(process.argv[2],'utf8'));
const account=privateKeyToAccount(readFileSync(config.keyFile,'utf8').trim());
const gateway=config.gateway;
gateway.local.now=Date.now;gateway.local.signHash=h=>account.signMessage({message:{raw:h}});
gateway.destination.coordinatorPrivateKey=createPrivateKey(gateway.destination.coordinatorPrivateKey);
gateway.destination.servicePublicKey=createPublicKey(gateway.destination.servicePublicKey);
const http=await serveGatewayHttp({issuer:config.issuer,keys:config.keys,allowTestIssuer:true,isActive:()=>true,
 bindings:[{id:'agent-a',subject:'alice',clientId:'example-client',kind:'cooperative',tasks:true,gateway}]});
process.send({url:http.resourceUrl});
process.on('message',async message=>{if(message==='close'){await http.close();process.exit(0);}});
