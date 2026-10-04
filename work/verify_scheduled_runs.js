const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),ids=[37157851485,37148675779,37161147855,37155060396];
async function main(){
 const headers={Accept:'application/vnd.github+json','User-Agent':'pokeka-source-audit'};
 if(process.env.GITHUB_TOKEN)headers.Authorization=`Bearer ${process.env.GITHUB_TOKEN}`;
 async function get(url){const res=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});if(!res.ok)throw new Error(`GitHub audit HTTP ${res.status}`);return res.json();}
 const latest=await get('https://api.github.com/repos/urm759/pokeka-serch/actions/workflows/priority-price-refresh.yml/runs?event=schedule&per_page=1');
 const targets=[...new Set([...ids,...latest.workflow_runs.map(r=>r.id)])];
 const runs=[];
 for(const id of targets){
  const base=`https://api.github.com/repos/urm759/pokeka-serch/actions/runs/${id}`,run=await get(base),jobs=await get(`${base}/jobs?per_page=100`);
  runs.push({id,name:run.name,event:run.event,url:run.html_url,commit:run.head_sha,status:run.status,conclusion:run.conclusion,startedAt:run.run_started_at,endedAt:run.updated_at,
    durationSeconds:(Date.parse(run.updated_at)-Date.parse(run.run_started_at))/1000,
    jobs:jobs.jobs.map(j=>({name:j.name,conclusion:j.conclusion,steps:j.steps.map(s=>({name:s.name,conclusion:s.conclusion,startedAt:s.started_at,endedAt:s.completed_at}))}))});
 }
 const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
 const backfill=read('work/safe-backfill-progress.json');
 const output={checkedAt:new Date().toISOString(),runs,safeBackfill:backfill,
   caution:'確認したのは変更前の定期実行。取得不能・手動確認待ちを含む処理成功を全件完了としない。変更後の次回定期実行は別途確認する'};
 fs.writeFileSync(path.join(root,'data/scheduled-verification.json'),JSON.stringify(output));
 console.log(JSON.stringify({runs:runs.map(r=>({...r,jobs:r.jobs.map(j=>({name:j.name,conclusion:j.conclusion,failedSteps:j.steps.filter(s=>s.conclusion==='failure'),publicationSteps:j.steps.filter(s=>/publish|Commit/i.test(s.name))}))})),checkedAt:output.checkedAt}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
