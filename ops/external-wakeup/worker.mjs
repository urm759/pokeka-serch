import policy from '../../work/cloud_wakeup_policy.js';
const REPO='urm759/pokeka-serch',HOUR=3600000;
export async function tick({env,storage,now=Date.now(),scheduledAt=now,request}){
 const result={at:new Date(now).toISOString(),scheduledAt:new Date(scheduledAt).toISOString(),sourceAcquisitions:0,llmCalls:0,codexCalls:0};
 if(env.ENABLED!=='true')return {...result,status:'disabled'};
 const state=await storage.get('state')||{};
 const save=async()=>{state.lastCheck={...result};state.history=[...(state.history||[]),{...result}].slice(-672);await storage.put('state',state);};
 if(state.held||Date.parse(state.nextAttemptAt)>now){result.status=state.held?'held':'backoff';await save();return result;}
 try{
  if(!env.GH_ACTIONS_TOKEN&&!request)throw Object.assign(Error('Missing Actions secret'),{terminal:true});
  request||=async(method,endpoint,body)=>{
   const r=await fetch('https://api.github.com/repos/'+REPO+endpoint,{method,redirect:'error',headers:{'User-Agent':'pokeka-independent-non-ai-wakeup',Accept:'application/vnd.github+json',Authorization:'Bearer '+env.GH_ACTIONS_TOKEN,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
   if(!r.ok){const e=Error('GitHub HTTP '+r.status);e.httpStatus=r.status;throw e;}
   return r.status===204?null:r.json();
  };
  // Completed run history fills 100 rows quickly. Query the latest Priority
  // directly and all live statuses separately, so older pending writers cannot
  // disappear behind a full page of completed runs.
  const runs=[];
  const endpoints=['/actions/workflows/priority-price-refresh.yml/runs?per_page=1',
    ...['queued','in_progress','waiting','pending','requested'].map(s=>'/actions/runs?status='+s+'&per_page=100')];
  const inventories=await Promise.all(endpoints.map(endpoint=>request('GET',endpoint)));
  for(const [i,inventory] of inventories.entries()){
   const endpoint=endpoints[i];
   if(!Array.isArray(inventory?.workflow_runs))throw Object.assign(Error('Run inventory schema mismatch'),{terminal:true});
   if(!endpoint.includes('/workflows/')&&inventory.workflow_runs.length>=100){result.status='active-window-full-review';await save();return result;}
   runs.push(...inventory.workflow_runs);
  }
  const decision=policy.plan(policy.relevant(runs),state,now);Object.assign(result,decision);
  if(decision.due){
   state.lastDispatchAt=result.at;state.lastRequestId='cloud-wakeup-'+new Date(scheduledAt).toISOString();
   result.status='dispatch-intent';result.requestId=state.lastRequestId;await save();
   await request('POST','/actions/workflows/watch-data-health.yml/dispatches',{ref:'main',inputs:{timer_scheduled_at:result.scheduledAt,timer_request_id:result.requestId}});
   result.status='dispatch-accepted-awaiting-execution';
  }else result.status='not-dispatched';
 }catch(error){
  result.status='failed';result.reason=error.httpStatus?'GitHub HTTP '+error.httpStatus:error.terminal?'Configuration/schema review required':'Network/response uncertain; persisted intent and cooldown retained';
  if(error.terminal||[401,403,404,422].includes(error.httpStatus))state.held=true;
  else state.nextAttemptAt=new Date(now+HOUR).toISOString();
 }
 await save();return result;
}
export class WakeState {
 constructor(state,env){this.state=state;this.env=env;}
 async fetch(request){
  if(request.method!=='POST'||new URL(request.url).pathname!=='/tick')return new Response('Not found',{status:404});
  const {scheduledAt}=await request.json();if(!Number.isFinite(scheduledAt)||scheduledAt>Date.now()+60000)return new Response('Invalid clock',{status:400});
  return this.state.blockConcurrencyWhile(async()=>Response.json(await tick({env:this.env,storage:this.state.storage,scheduledAt})));
 }
}
export default {
 fetch(){return new Response('No public trigger',{status:404});},
 async scheduled(event,env){
  if(env.ENABLED!=='true'){console.log(JSON.stringify({status:'disabled',llmCalls:0,codexCalls:0}));return;}
  const id=env.WAKE_STATE.idFromName(REPO),r=await env.WAKE_STATE.get(id).fetch('https://internal/tick',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scheduledAt:event.scheduledTime})});
  if(!r.ok)throw Error('Wake state error '+r.status);console.log(await r.text());
 }
};
