const HOUR = 3600000;
function stageEvidence(run,jobs=[],execution=null){
 const steps=jobs.flatMap(j=>(j.steps||[]).map(s=>({...s,jobId:j.id}))).filter(s=>s.started_at&&s.completed_at);
 const span=match=>{const selected=steps.filter(s=>match.test(s.name));return selected.length?{startedAt:selected.map(s=>s.started_at).sort()[0],endedAt:selected.map(s=>s.completed_at).sort().at(-1),conclusions:[...new Set(selected.map(s=>s.conclusion))]}:null;};
 const starts=jobs.map(j=>j.started_at).filter(Boolean).sort(),jobStartedAt=starts[0]||null;
 const own=String(execution?.runId)===String(run.id)?execution:null;
 const source=(own?.runs||[]).filter(r=>r.failureClass==='source-acquisition'||/^work\/(daily_fast_update|refresh_candidate_shops|run_tracked_update)\.js$/.test(r.script||''));
 return {id:run.id,event:run.event,attempt:run.run_attempt||1,createdAt:run.created_at,workflowStartedAt:run.run_started_at||null,jobStartedAt,
  createdToJobStartMs:jobStartedAt?Math.max(0,Date.parse(jobStartedAt)-Date.parse(run.created_at)):null,
  acquisition:source.length?source.map(r=>({script:r.script,startedAt:r.startedAt,endedAt:r.endedAt,status:r.status,attempted:r.attempted,refreshed:r.refreshed,httpRequests:r.httpRequests})):null,
  aggregation:own?(own.runs||[]).filter(r=>r.script&&!source.includes(r)).map(r=>({script:r.script,startedAt:r.startedAt,endedAt:r.endedAt,status:r.status})):null,
  acquisitionAndAggregationStep:span(/Refresh due purchase prices|deterministic delta|bounded source checkpoints/),validation:span(/Verify safety|fast regression|publication safety/),
  saveAndPush:span(/Commit changed|Commit safe|Commit all|Publish validated data/),pagesPublishedAt:null,
  note:'API更新日時・Git pushはPages公開日時ではない。個別実取得数が不明の工程はnull、再利用・skipを取得成功へ加算しない。'};
}
function audit(runs, { now = Date.now(), intervalMs = 2 * HOUR, minute = 20, verifiedRuns=[],jobsByRun={},execution=null } = {}) {
  const rows = runs.filter(r => r.event === 'schedule' && Number.isFinite(Date.parse(r.created_at)))
    .sort((a,b) => Date.parse(a.created_at)-Date.parse(b.created_at));
  const successes = rows.filter(r => r.conclusion === 'success');
  const gaps = successes.slice(1).map((r,i) => ({ from:successes[i].updated_at, to:r.updated_at,
    ms:Date.parse(r.updated_at)-Date.parse(successes[i].updated_at), fromRun:successes[i].id, toRun:r.id })).filter(g=>g.ms>0);
  const generatedGaps = rows.slice(1).map((r,i)=>Date.parse(r.created_at)-Date.parse(rows[i].created_at));
  const slots=[];
  if(rows.length) {
    let at=Date.parse(rows[0].created_at); const date=new Date(at); date.setUTCMinutes(minute,0,0); date.setUTCHours(Math.floor(date.getUTCHours()/2)*2);
    at=date.getTime(); if(at>Date.parse(rows[0].created_at))at-=intervalMs;
    for(;at<=now-3*HOUR;at+=intervalMs) {
      const run=rows.find(r=>Date.parse(r.created_at)>=at && Date.parse(r.created_at)<at+intervalMs);
      slots.push({expectedAt:new Date(at).toISOString(),runId:run?.id||null,
        status:!run?'実行未確認（未生成・2時間以上の遅延を識別不能）':run.status!=='completed'?'待機・実行中':run.conclusion==='success'?'成功':`工程失敗：${run.conclusion}`});
    }
  }
  const latestGap=gaps.at(-1)?.ms ?? null;
  const conservativeGap=gaps.length?Math.max(...gaps.slice(-12).map(g=>g.ms)):null;
  const publications=verifiedRuns.filter(r=>['priority','catchup','daily'].includes(r.key)&&Number.isFinite(Date.parse(r.recordedAt)))
    .sort((a,b)=>Date.parse(a.recordedAt)-Date.parse(b.recordedAt));
  const publicationGaps=publications.slice(1).map((r,i)=>({from:publications[i].recordedAt,to:r.recordedAt,
    fromRun:publications[i].runId,toRun:r.runId,route:r.key,ms:Date.parse(r.recordedAt)-Date.parse(publications[i].recordedAt)}));
  const latestCreated=rows.at(-1)?.created_at||null;
  return {version:2,checkedAt:new Date(now).toISOString(),configuredIntervalMs:intervalMs,
    latestScheduledCreationAt:latestCreated,uncreatedTailMs:latestCreated?Math.max(0,now-Date.parse(latestCreated)):null,
    creationTailExceeded:latestCreated?now-Date.parse(latestCreated)>intervalMs:null,
    stageEvidence:runs.map(r=>stageEvidence(r,jobsByRun[r.id]||[],execution)),
    verifiedPublicationCadence:{samples:publications.length,gaps:publicationGaps,
      latestMs:publicationGaps.at(-1)?.ms??null,maximumMs:publicationGaps.length?publicationGaps.reduce((maximum,g)=>Math.max(maximum,g.ms),-Infinity):null,
      basis:'取得・検証・保存・公開照合済みの経路を含む。独立取得元の部分失敗でジョブ全体が赤い場合も、正常値の公開証拠がある実行を別集計。カード別確認間隔・継続鮮度とは別'},
    runStages:rows.map(r=>({id:r.id,url:r.html_url,status:r.status,conclusion:r.conclusion,createdAt:r.created_at,startedAt:r.run_started_at,
      queuedMs:r.run_started_at?Math.max(0,Date.parse(r.run_started_at)-Date.parse(r.created_at)):null,
      updatedAt:r.updated_at,note:'取得・保存・公開の個別工程は実行ログ/受領証で確認。APIの最終更新を公開時刻として代用しない'})),
    observedSuccessfulIntervalMs:conservativeGap,lastSuccessfulIntervalMs:latestGap,
    observedGeneratedIntervalMs:generatedGaps.length?Math.max(...generatedGaps.slice(-12)):null,
    sampleCount:rows.length,successSampleCount:successes.length,gaps,slots,
    missingSlots:slots.filter(s=>!s.runId).length,failedRuns:rows.filter(r=>r.conclusion==='failure').map(r=>({id:r.id,url:r.html_url,createdAt:r.created_at})),
    basis:'直近取得履歴内の成功終了間隔最大値。未生成と長時間遅延はAPIだけでは断定不可。設定間隔と別表示、鮮度基準は変更しない',
    llmCalls:0,codexCalls:0};
}
module.exports={audit,stageEvidence};
if(require.main===module) (async()=>{
  const fs=require('node:fs'),path=require('node:path');
  const file=path.join(__dirname,'../data/refresh-cadence-audit.json');
  try {
    const headers={'User-Agent':'pokeka-cadence-audit',Accept:'application/vnd.github+json'};
    if(process.env.GITHUB_TOKEN)headers.Authorization='Bearer '+process.env.GITHUB_TOKEN;
    const response=await fetch('https://api.github.com/repos/urm759/pokeka-serch/actions/workflows/priority-price-refresh.yml/runs?per_page=30',
      {headers,signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('GitHub cadence HTTP '+response.status);
    const runs=(await response.json()).workflow_runs||[],jobsByRun={};
    // Bounded measurement only; missing API evidence remains unknown.
    for(const run of runs.slice(0,3)){
      try{const r=await fetch('https://api.github.com/repos/urm759/pokeka-serch/actions/runs/'+run.id+'/jobs',{headers,signal:AbortSignal.timeout(15000)});if(r.ok)jobsByRun[run.id]=(await r.json()).jobs||[];}catch{/* Prior cadence and acquisition processing are independent. */}
    }
    const execFile=path.join(__dirname,'../data/priority-price-execution.json');
    const execution=fs.existsSync(execFile)?JSON.parse(fs.readFileSync(execFile)):null;
    const value=audit(runs,{jobsByRun,execution});
    fs.writeFileSync(file+'.tmp',JSON.stringify(value));fs.renameSync(file+'.tmp',file);
    console.log(JSON.stringify({samples:value.sampleCount,configuredMs:value.configuredIntervalMs,observedMs:value.observedSuccessfulIntervalMs}));
  }catch(error){console.error('Cadence observation unavailable; previous evidence retained: '+error.message);}
})();
