// Independent PC timer fallback for an uncreated cloud run, not a new schedule.
// Uses existing Git credentials only. No token is persisted or printed.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const HOUR=3600000,REPO='urm759/pokeka-serch';
function plan(runs,state={},now=Date.now()){
 if(state.held)return {due:false,reason:'authentication-or-api-hold'};
 if(runs.some(r=>['queued','in_progress','waiting','pending','requested'].includes(r.status)))return {due:false,reason:'existing-cloud-run-pending'};
 const latest=runs.filter(r=>r.path?.endsWith('/priority-price-refresh.yml')&&Number.isFinite(Date.parse(r.created_at)))
  .sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))[0];
 if(!latest)return {due:false,reason:'priority-history-unconfirmed'};
 const gap=now-Date.parse(latest.created_at),last=Date.parse(state.lastDispatchAt);
 if(gap<0||gap<2.5*HOUR)return {due:false,reason:'creation-within-existing-interval',creationGapMs:gap};
 if(Number.isFinite(last)&&(now<last||now-last<2.5*HOUR))return {due:false,reason:'dispatch-cooldown',creationGapMs:gap};
 return {due:true,reason:'no-cloud-creation-for-2.5h',latestRun:latest.id,creationGapMs:gap};
}
async function run({root,store,now=Date.now(),request}={}){
 const file=path.join(store,'pc-priority-watchdog.json'),state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{};
 const result={at:new Date(now).toISOString(),origin:'existing-PC-hourly-timer',sourceAcquisitions:0,llmCalls:0,codexCalls:0};
 const save=()=>{require('./acquisition_retry').atomicWrite(file,{...state,...result});fs.appendFileSync(path.join(store,'pc-priority-watchdog-history.jsonl'),JSON.stringify(result)+'\n');};
 if(state.held){result.status='held';save();return result;}
 try{
  if(!request){
   const remote=cp.execFileSync('git',['remote','get-url','origin'],{cwd:root,encoding:'utf8'}).trim();
   if(!['https://github.com/'+REPO+'.git','https://github.com/'+REPO,'git@github.com:'+REPO+'.git'].includes(remote))throw Error('Repository mismatch');
   const raw=cp.execFileSync('git',['credential','fill'],{cwd:root,input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:15000});
   const token=raw.split(/\r?\n/).find(l=>l.startsWith('password='))?.slice(9);if(!token)throw Error('Existing credential unavailable');
   request=async(method,endpoint,body)=>{
    const response=await fetch('https://api.github.com/repos/'+REPO+endpoint,{method,redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
    if(!response.ok){const e=Error('GitHub API HTTP '+response.status);e.httpStatus=response.status;throw e;}
    return response.status===204?null:response.json();
   };
  }
  // The same global concurrency group covers Daily/Safe/Priority. A queued or
  // active data workflow is not a missing execution and must not be duplicated.
  const names=['priority-price-refresh.yml','daily-fast-update.yml','safe-checkpoint-backfill.yml','refresh-all-site-data.yml','watch-data-health.yml'];
  const runs=(await request('GET','/actions/runs?per_page=100')).workflow_runs||[];
  const relevant=runs.filter(r=>names.some(n=>r.path?.endsWith('/'+n)));
  const decision=plan(relevant,state,now);Object.assign(result,decision);
  if(decision.due){
   // Persist the intent BEFORE the POST: an uncertain response must not cause
   // repeated dispatches. This is not proof of acquisition or publication.
   state.lastDispatchAt=result.at;result.status='dispatch-intent';save();
   await request('POST','/actions/workflows/priority-price-refresh.yml/dispatches',{ref:'main'});
   result.status='dispatch-accepted-awaiting-execution';
  }else result.status='not-dispatched';
 }catch(error){
  result.status='watchdog-failed';result.reason=/^GitHub API HTTP \d+$/.test(error.message)?error.message:'Repository/API/credential check failed; review local configuration';
  if([401,403,404,422].includes(error.httpStatus)||!error.httpStatus)state.held=true;
 }
 save();return result;
}
module.exports={plan,run};
