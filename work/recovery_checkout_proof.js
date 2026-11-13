const crypto=require('node:crypto');
function parse(run,job,text){
 if(!/^[a-f0-9]{40}$/.test(run.head_sha||'')||String(job.run_id)!==String(run.id)||job.status!=='completed')throw Error('Checkout proof run/job mismatch');
 const checkouts=(job.steps||[]).filter(s=>/^Run actions\/checkout@/.test(s.name)&&s.conclusion==='success'&&Number.isFinite(Date.parse(s.started_at))&&Number.isFinite(Date.parse(s.completed_at)));
 const lines=text.split(/\r?\n/),proofs=[];
 for(const step of checkouts){
  const selected=lines.filter(l=>{const at=Date.parse(l.split(' ')[0]);return at>=Date.parse(step.started_at)&&at<Date.parse(step.completed_at)+1000;});
  if(!selected.some(l=>/\[command\].*\bgit checkout .* -B main refs\/remotes\/origin\/main$/.test(l)))continue;
  for(let i=0;i<selected.length-1;i++)if(/\[command\].*\bgit log -1 --format=%H$/.test(selected[i])){
   const sha=selected[i+1].match(/^\S+ ([a-f0-9]{40})$/)?.[1];
   if(sha)proofs.push({checkoutCommit:sha,stepStartedAt:step.started_at,stepCompletedAt:step.completed_at,checkoutLines:selected.filter(l=>/git checkout|git log -1|^\S+ [a-f0-9]{40}$/.test(l))});
  }
 }
 if(proofs.length!==1)throw Error('Unique main checkout proof unavailable; source archive retained');
 return {version:1,runId:String(run.id),runAttempt:run.run_attempt,jobId:job.id,triggerCommit:run.head_sha,...proofs[0],logSha256:crypto.createHash('sha256').update(text).digest('hex'),method:'trusted-actions-checkout-main-step'};
}
module.exports={parse};
