/** Minimal wire client for the selected 2026-07-28 Tasks extension. */
export function taskClient(url,token){
 let id=0;
 return async(method,params={},options={})=>{
  const body={jsonrpc:'2.0',id:++id,method,params:{...params,_meta:{
   'io.modelcontextprotocol/protocolVersion':'2026-07-28',
   'io.modelcontextprotocol/clientInfo':{name:'continuity-tasks-example',version:'1'},
   'io.modelcontextprotocol/clientCapabilities':{extensions:{'io.modelcontextprotocol/tasks':{}}},
   ...options.meta,
  }}};
  const response=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json',accept:'application/json, text/event-stream',
   'mcp-protocol-version':'2026-07-28','mcp-method':method,...(params.taskId||params.name?{'mcp-name':params.taskId??params.name}:{}),...options.headers},body:JSON.stringify(body)});
  const value=await response.json();if(response.status!==200)throw Object.assign(new Error('HTTP '+response.status),{response:value});
  if(value.error)throw Object.assign(new Error(value.error.message),{code:value.error.code});return value.result;
 };
}
export async function pollTask(call,taskId,{until=task=>task.status!=='working',attempts=30,interval=100}={}){
 for(let i=0;i<attempts;i++){const task=await call('tasks/get',{taskId});if(until(task))return task;await new Promise(resolve=>setTimeout(resolve,interval));}
 throw new Error('Task polling bound reached');
}
