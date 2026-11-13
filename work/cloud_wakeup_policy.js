// Pure shared policy for the existing PC fallback and the opt-in cloud timer.
// Dispatch acceptance is not evidence of acquisition, publication or freshness.
const HOUR=3600000,REPO='urm759/pokeka-serch',LIVE=['queued','in_progress','waiting','pending','requested'];
const WORKFLOWS=['priority-price-refresh.yml','daily-fast-update.yml','safe-checkpoint-backfill.yml','refresh-all-site-data.yml','watch-data-health.yml','backfill-data.yml','gemrate-reference-publication.yml'];
function relevant(runs){return runs.filter(r=>WORKFLOWS.some(n=>r.path?.endsWith('/'+n)));}
const snapshot=r=>JSON.stringify([String(r.id),r.run_attempt||1,r.head_sha,r.path,r.head_branch,r.status,r.created_at,r.updated_at]);
function orphanVerified(run,proof,now){return proof?.disposition==='orphaned-queued-no-jobs'&&proof.snapshot===snapshot(run)&&proof.jobsCount===0&&proof.laterSuccessfulJobVerified===true&&Date.parse(proof.verifiedAt)<=now&&Date.parse(proof.validUntil)>now;}
async function inventory(request){
 const endpoints=['/actions/workflows/priority-price-refresh.yml/runs?per_page=1',...LIVE.map(s=>'/actions/runs?status='+s+'&per_page=100')];
 const values=await Promise.all(endpoints.map(p=>request('GET',p))),runs=[];
 for(let i=0;i<values.length;i++){if(!Array.isArray(values[i]?.workflow_runs))throw Object.assign(Error('Run inventory schema mismatch'),{terminal:true});if(i&&values[i].workflow_runs.length>=100)return {complete:false,runs:[],reason:'active-window-full-review'};runs.push(...values[i].workflow_runs);}
 return {complete:true,runs:[...new Map(relevant(runs).map(r=>[r.id,r])).values()]};
}
async function inspectPending(runs,request,now=Date.now(),prior=[]){
 const entries=[],candidates=runs.filter(r=>['queued','requested'].includes(r.status)&&now-Date.parse(r.created_at)>=24*HOUR&&now-Date.parse(r.updated_at)>=24*HOUR);
 const pending=[];
 for(const run of candidates){const cached=prior.find(p=>orphanVerified(run,p,now));if(cached)entries.push(cached);else pending.push(run);}
 const audited=await Promise.all(pending.slice(0,3).map(async run=>{
  const file=run.path?.split('/').at(-1);if(!WORKFLOWS.includes(file))return null;
  const [current,jobs,success]=await Promise.all([request('GET','/actions/runs/'+run.id),request('GET','/actions/runs/'+run.id+'/jobs?filter=all&per_page=100'),request('GET','/actions/workflows/'+file+'/runs?status=success&per_page=1')]);
  const proof={runId:run.id,snapshot:snapshot(run),verifiedAt:new Date(now).toISOString(),validUntil:new Date(now+20*60000).toISOString(),jobsCount:jobs?.total_count??null,disposition:'still-blocking',reason:'pending-evidence-incomplete'};
  if(snapshot(current)!==snapshot(run)||current.head_branch!=='main'||current.repository?.full_name!==REPO||current.head_repository?.full_name!==REPO){proof.reason='pending-run-changed-or-identity-unconfirmed';return proof;}
  if(jobs?.total_count!==0||!Array.isArray(jobs.jobs)||jobs.jobs.length){proof.reason='pending-run-has-jobs';return proof;}
  const later=success?.workflow_runs?.find(r=>r.status==='completed'&&r.conclusion==='success'&&r.path===run.path&&r.head_branch==='main'&&Date.parse(r.created_at)>Date.parse(run.updated_at));
  if(!later){proof.reason='later-completion-unconfirmed';return proof;}
  const laterJobs=await request('GET','/actions/runs/'+later.id+'/jobs?filter=all&per_page=100');
  const verified=laterJobs?.jobs?.some(j=>String(j.run_id)===String(later.id)&&j.status==='completed'&&j.conclusion==='success'&&Date.parse(j.started_at)>Date.parse(run.updated_at)&&Date.parse(j.completed_at)<=now);
  proof.laterSuccessfulJobVerified=Boolean(verified);proof.laterSuccessfulRunId=later.id;
  if(verified){proof.disposition='orphaned-queued-no-jobs';proof.reason='no-jobs-and-later-same-workflow-completed';}
  return proof;
 }));
 return [...entries,...audited.filter(Boolean)];
}
function plan(runs,state={},now=Date.now(),evidence=state.pendingEvidence||[]){
 if(state.held)return {due:false,reason:'authentication-or-api-hold'};
 const pending=runs.filter(r=>LIVE.includes(r.status)),ignored=pending.filter(r=>evidence.some(p=>orphanVerified(r,p,now))),blocking=pending.filter(r=>!ignored.includes(r));
 const context={blockingRunIds:blocking.map(r=>r.id),ignoredPendingRunIds:ignored.map(r=>r.id)};
 if(blocking.length)return {...context,due:false,reason:'existing-cloud-run-pending'};
 const latest=runs.filter(r=>r.path?.endsWith('/priority-price-refresh.yml')&&Number.isFinite(Date.parse(r.created_at))).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))[0];
 if(!latest)return {...context,due:false,reason:'priority-history-unconfirmed'};
 const gap=now-Date.parse(latest.created_at),last=Date.parse(state.lastDispatchAt);
 if(gap<0||gap<2.5*HOUR)return {...context,due:false,reason:'creation-within-existing-interval',creationGapMs:gap};
 if(Number.isFinite(last)&&(now<last||now-last<2.5*HOUR))return {...context,due:false,reason:'dispatch-cooldown',creationGapMs:gap};
 return {...context,due:true,reason:'no-cloud-creation-for-2.5h',latestRun:latest.id,creationGapMs:gap};
}
module.exports={plan,relevant,WORKFLOWS,inventory,inspectPending,orphanVerified};
