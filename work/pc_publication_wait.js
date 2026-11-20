// Read-only coordination using the existing repository credential. Saved PC
// inputs remain owned by the existing worker; no new acquisition or AI task.
const cp=require('node:child_process');
const REPO='urm759/pokeka-serch',HOUR=3600000;
const WRITERS=new Map([
 ['.github/workflows/daily-fast-update.yml','update'],
 ['.github/workflows/priority-price-refresh.yml','refresh'],
 ['.github/workflows/safe-checkpoint-backfill.yml','backfill'],
 ['.github/workflows/resolve-unmatched-cards.yml','resolve'],
 ['.github/workflows/watch-data-health.yml','catchup']
]);
function client(root){
 const remote=cp.execFileSync('git',['remote','get-url','origin'],{cwd:root,encoding:'utf8'}).trim();
 if(!['https://github.com/'+REPO+'.git','https://github.com/'+REPO,'git@github.com:'+REPO+'.git'].includes(remote))throw Error('Repository mismatch');
 const raw=cp.execFileSync('git',['credential','fill'],{cwd:root,input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:15000});
 const token=raw.split(/\r?\n/).find(l=>l.startsWith('password='))?.slice(9);if(!token)throw Error('Credential unavailable');
 return async endpoint=>{const r=await fetch('https://api.github.com/repos/'+REPO+endpoint,{redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('GitHub HTTP '+r.status);return r.json();};
}
async function inspect(request,now=Date.now()){
 const data=await request('/actions/runs?status=in_progress&per_page=100');
 if(!Array.isArray(data.workflow_runs)||data.total_count>100)throw Error('Incomplete active run inventory');
 const active=[];
 for(const r of data.workflow_runs){
  if(!WRITERS.has(r.path)||r.status!=='in_progress'||r.head_branch!=='main'||r.repository?.full_name!==REPO||r.head_repository?.full_name!==REPO)continue;
  const response=await request('/actions/runs/'+r.id+'/jobs?per_page=100');
  if(!Array.isArray(response.jobs)||response.total_count>100)throw Error('Incomplete active job inventory');
  for(const j of response.jobs){const started=Date.parse(j.started_at);
   if(j.name===WRITERS.get(r.path)&&j.status==='in_progress'&&Number.isFinite(started)&&started<=now&&now-started<2*HOUR)active.push({runId:r.id,jobId:j.id,name:j.name,startedAt:j.started_at});
  }
 }
 return {at:new Date(now).toISOString(),status:active.length?'active-cloud-writer':'no-active-cloud-writer',active};
}
async function wait({root,request,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),maximumMs=30*60000,pollMs=60000}={}){
 const started=now();let checks=0,last;
 try{
  request ||= client(root);
  do{last=await inspect(request,now());checks++;if(!last.active.length)return {...last,ready:true,checks,waitMs:now()-started};
   if(now()-started>=maximumMs)break;
   await sleep(Math.min(pollMs,maximumMs-(now()-started)));
  }while(true);
  return {...last,status:'saved-awaiting-cloud-writer',ready:false,checks,waitMs:now()-started};
 }catch{return {status:'coordination-unavailable-use-validated-merge',ready:true,checks,waitMs:now()-started,evidence:'API state unknown; no run cancelled, no price timestamp changed; normal strict merge remains required'};}
}
module.exports={inspect,wait,WRITERS};
