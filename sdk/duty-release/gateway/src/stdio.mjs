import {spawn} from 'node:child_process';
import {getDefaultEnvironment} from '@modelcontextprotocol/client/stdio';
import {parseStrictJson} from './strict-json.mjs';
import {check} from './data.mjs';

/** SDK transport interface, with byte-level validation before JSON parsing.
 * No shell, arbitrary URL, child environment from a tool, or stderr forwarding.
 */
export class ProtectedStdioTransport {
 constructor(config){this.config=config;this.pending=Buffer.alloc(0);this.frames=0;this.closed=false;}
 async start(){
  check(!this.child&&!this.closed);
  const c=this.child=spawn(this.config.command,this.config.args,{cwd:this.config.cwd,env:getDefaultEnvironment(),shell:false,stdio:['pipe','pipe','ignore']});
  this.exited=new Promise(resolve=>c.once('close',()=>{clearTimeout(this.frameTimer);this.closed=true;this.onclose?.();resolve();}));
  const reject=()=>{this.onerror?.(Error('UPSTREAM_INVALID_FRAME'));void this.close();};
  c.stdin.on('error',()=>reject());c.stdout.on('error',()=>reject());
  c.stdout.on('data',chunk=>{
   if(this.closed)return;
   try{
    // Bound the entire raw receive chunk as well as each complete frame.
    check(this.pending.length+chunk.length<=131072);
    this.pending=Buffer.concat([this.pending,chunk]);let end;
    while((end=this.pending.indexOf(10))!==-1){
     const frame=this.pending.subarray(0,end);this.pending=this.pending.subarray(end+1);
     check(++this.frames<=1024);
     const message=parseStrictJson(frame,{maxBytes:65536,maxDepth:24,maxNodes:8192});
     this.onmessage?.(message);
    }
    check(this.pending.length<=65536);clearTimeout(this.frameTimer);
    if(this.pending.length)this.frameTimer=setTimeout(reject,5000);
   }catch{reject();}
  });
  c.stdout.on('end',()=>{if(this.pending.length)reject();});
  await new Promise((resolve,reject)=>{c.once('spawn',resolve);c.once('error',reject);});
 }
 async send(message){
  check(this.child&&!this.closed,'UPSTREAM_UNAVAILABLE');
  const bytes=Buffer.from(JSON.stringify(message)+'\n');check(bytes.length<=65536,'UPSTREAM_REQUEST_LIMIT');
  await new Promise((resolve,reject)=>this.child.stdin.write(bytes,error=>error?reject(error):resolve()));
 }
 async close(){
  if(!this.child||this.closed)return;this.closed=true;clearTimeout(this.frameTimer);
  this.child.stdin.end();this.child.kill('SIGTERM');
  const timer=setTimeout(()=>this.child.kill('SIGKILL'),1000);timer.unref();
  await this.exited;clearTimeout(timer);
 }
}
