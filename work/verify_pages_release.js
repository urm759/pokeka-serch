const fs=require('node:fs'),cp=require('node:child_process');
const sha=process.argv[2];if(!/^[a-f0-9]{40}$/.test(sha||''))throw Error('Full publication commit required');
const c=cp.spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\npath=urm759/pokeka-serch.git\n\n',encoding:'utf8'});
const token=c.stdout.split('\n').find(l=>l.startsWith('password='))?.slice(9);
(async()=>{let run=null;const start=Date.now();
  while(Date.now()-start<120000){
    const res=await fetch(`https://api.github.com/repos/urm759/pokeka-serch/actions/runs?head_sha=${sha}&per_page=20`,
      {headers:{Authorization:`Bearer ${token}`,'User-Agent':'pokeka-publication-verification'},signal:AbortSignal.timeout(20000)});
    if(!res.ok)throw Error('Pages verification HTTP '+res.status);
    run=(await res.json()).workflow_runs?.find(r=>r.name==='pages build and deployment');
    if(run?.status==='completed')break;await new Promise(r=>setTimeout(r,15000));
  }
  const proof={commit:sha,checkedAt:new Date().toISOString(),runId:run?.id,status:run?.status||'not-created',conclusion:run?.conclusion,url:run?.html_url};
  fs.writeFileSync('work/current-guide-pages.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
  if(run?.conclusion!=='success')process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1});
