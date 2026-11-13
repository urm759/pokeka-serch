// Pure shared policy for the existing PC fallback and the opt-in cloud timer.
// Dispatch acceptance is not evidence of acquisition, publication or freshness.
const HOUR=3600000;
const WORKFLOWS=['priority-price-refresh.yml','daily-fast-update.yml','safe-checkpoint-backfill.yml','refresh-all-site-data.yml','watch-data-health.yml','backfill-data.yml','gemrate-reference-publication.yml'];
function relevant(runs){return runs.filter(r=>WORKFLOWS.some(n=>r.path?.endsWith('/'+n)));}
function plan(runs,state={},now=Date.now()){
 if(state.held)return {due:false,reason:'authentication-or-api-hold'};
 if(runs.some(r=>['queued','in_progress','waiting','pending','requested'].includes(r.status)))return {due:false,reason:'existing-cloud-run-pending'};
 const latest=runs.filter(r=>r.path?.endsWith('/priority-price-refresh.yml')&&Number.isFinite(Date.parse(r.created_at))).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))[0];
 if(!latest)return {due:false,reason:'priority-history-unconfirmed'};
 const gap=now-Date.parse(latest.created_at),last=Date.parse(state.lastDispatchAt);
 if(gap<0||gap<2.5*HOUR)return {due:false,reason:'creation-within-existing-interval',creationGapMs:gap};
 if(Number.isFinite(last)&&(now<last||now-last<2.5*HOUR))return {due:false,reason:'dispatch-cooldown',creationGapMs:gap};
 return {due:true,reason:'no-cloud-creation-for-2.5h',latestRun:latest.id,creationGapMs:gap};
}
module.exports={plan,relevant,WORKFLOWS};
