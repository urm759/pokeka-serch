import policy from '../../work/cloud_wakeup_policy.js';
const REPO='urm759/pokeka-serch',HOUR=3600000;
export async function tick({env,storage,now=Date.now(),scheduledAt=now,request}){
 const next=(Math.floor((now-7*60000)/(15*60000))+1)*15*60000+7*60000;
 const result={at:new Date(now).toISOString(),scheduledAt:new Date(scheduledAt).toISOString(),cronNominalAt:new Date(Math.floor(scheduledAt/60000)*60000).toISOString(),scheduledEventDelayMs:now-scheduledAt,nextCheckAt:new Date(next).toISOString(),sourceAcquisitions:0,llmCalls:0,codexCalls:0};
 if(env.ENABLED!=='true')return {...result,status:'disabled'};
 const state=await storage.get('state')||{};
 const save=async()=>{state.lastCheck={...result};state.history=[...(state.history||[]),{...result}].slice(-672);await storage.put('state',state);};
 if(state.held||Date.parse(state.nextAttemptAt)>now){result.status=state.held?'held':'backoff';result.reason=state.lastFailure?.reason||'previous-failure-awaiting-review';result.lastFailure=state.lastFailure||null;result.nextAttemptAt=state.nextAttemptAt||null;await save();return result;}
 try{
  if(!env.GH_ACTIONS_TOKEN&&!request)throw Object.assign(Error('Missing Actions secret'),{terminal:true});
  request||=async(method,endpoint,body)=>{
   let r;try{r=await fetch('https://api.github.com/repos/'+REPO+endpoint,{method,redirect:'error',headers:{'User-Agent':'pokeka-independent-non-ai-wakeup',Accept:'application/vnd.github+json',Authorization:'Bearer '+env.GH_ACTIONS_TOKEN,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000)});}catch(error){error.endpoint=endpoint;throw error;}
   if(!r.ok){const e=Error('GitHub HTTP '+r.status);e.httpStatus=r.status;throw e;}
   return r.status===204?null:r.json();
  };
  // Completed run history fills 100 rows quickly. Query the latest Priority
  // directly and all live statuses separately, so older pending writers cannot
  // disappear behind a full page of completed runs.
  let stageStarted=Date.now();result.stage='github-inventory';const inventory=await policy.inventory(request);result.inventoryMs=Date.now()-stageStarted;if(!inventory.complete){result.status=inventory.reason;await save();return result;}
  const runs=inventory.runs;
  stageStarted=Date.now();result.stage='pending-evidence';result.pendingAudit=await policy.inspectPending(runs,request,now,state.pendingEvidence||[]);result.pendingEvidenceMs=Date.now()-stageStarted;state.pendingEvidence=result.pendingAudit;
  const decision=policy.plan(runs,state,now,result.pendingAudit);Object.assign(result,decision);
  if(decision.due){
   state.lastDispatchAt=result.at;state.lastRequestId='cloud-wakeup-'+new Date(scheduledAt).toISOString();
   result.status='dispatch-intent';result.requestId=state.lastRequestId;await save();
   stageStarted=Date.now();result.stage='dispatch-request';const dispatched=await request('POST','/actions/workflows/watch-data-health.yml/dispatches',{ref:'main',return_run_details:true,inputs:{timer_scheduled_at:result.scheduledAt,timer_request_id:result.requestId}});result.dispatchMs=Date.now()-stageStarted;result.dispatchAcceptedAt=new Date().toISOString();
   if(/^\d+$/.test(String(dispatched?.workflow_run_id))&&dispatched.html_url==='https://github.com/'+REPO+'/actions/runs/'+dispatched.workflow_run_id){result.dispatchedRunId=dispatched.workflow_run_id;result.dispatchedRunUrl=dispatched.html_url;state.lastDispatchedRun={id:result.dispatchedRunId,url:result.dispatchedRunUrl,requestId:result.requestId};}
   result.status='dispatch-accepted-awaiting-execution';
  }else result.status='not-dispatched';
 }catch(error){
  result.status='failed';result.reason=error.httpStatus?'GitHub HTTP '+error.httpStatus:error.terminal?'Configuration/schema review required':'Network/response uncertain; persisted intent and cooldown retained';
  result.errorType=String(error.name||'Error').slice(0,80);result.endpoint=error.endpoint||null;
  state.lastFailure={at:result.at,reason:result.reason,stage:result.stage,errorType:result.errorType,endpoint:result.endpoint};
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
