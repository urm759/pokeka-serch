const HOUR = 3600000;
function audit(runs, { now = Date.now(), intervalMs = 2 * HOUR, minute = 20 } = {}) {
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
  return {version:1,checkedAt:new Date(now).toISOString(),configuredIntervalMs:intervalMs,
    observedSuccessfulIntervalMs:conservativeGap,lastSuccessfulIntervalMs:latestGap,
    observedGeneratedIntervalMs:generatedGaps.length?Math.max(...generatedGaps.slice(-12)):null,
    sampleCount:rows.length,successSampleCount:successes.length,gaps,slots,
    missingSlots:slots.filter(s=>!s.runId).length,failedRuns:rows.filter(r=>r.conclusion==='failure').map(r=>({id:r.id,url:r.html_url,createdAt:r.created_at})),
    basis:'直近取得履歴内の成功終了間隔最大値。未生成と長時間遅延はAPIだけでは断定不可。設定間隔と別表示、鮮度基準は変更しない',
    llmCalls:0,codexCalls:0};
}
module.exports={audit};
if(require.main===module) (async()=>{
  const fs=require('node:fs'),path=require('node:path');
  const file=path.join(__dirname,'../data/refresh-cadence-audit.json');
  try {
    const headers={'User-Agent':'pokeka-cadence-audit',Accept:'application/vnd.github+json'};
    if(process.env.GITHUB_TOKEN)headers.Authorization='Bearer '+process.env.GITHUB_TOKEN;
    const response=await fetch('https://api.github.com/repos/urm759/pokeka-serch/actions/workflows/priority-price-refresh.yml/runs?per_page=30',
      {headers,signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('GitHub cadence HTTP '+response.status);
    const value=audit((await response.json()).workflow_runs||[]);
    fs.writeFileSync(file+'.tmp',JSON.stringify(value));fs.renameSync(file+'.tmp',file);
    console.log(JSON.stringify({samples:value.sampleCount,configuredMs:value.configuredIntervalMs,observedMs:value.observedSuccessfulIntervalMs}));
  }catch(error){console.error('Cadence observation unavailable; previous evidence retained: '+error.message);}
})();
