const fs=require('node:fs'),path=require('node:path');
const read=(root,file,fallback={})=>{try{return JSON.parse(fs.readFileSync(path.join(root,file)));}catch{return fallback;}};
function evaluate(source,cohort,history,now=Date.now()) {
  const cards=new Map([...(source.fixedCards||[]),...(source.cards||[])].map(r=>[r.id,r])),proofs=new Map();
  for(const run of history||[])for(const r of run.records||[]) {
    const at=Date.parse(r.confirmedAt);
    if(r.status!=='verified'||!Number.isFinite(at)||at>now)continue;
    if(!proofs.has(r.id))proofs.set(r.id,new Set());proofs.get(r.id).add(at);
  }
  const bucket={},rows=cohort.map(id=>{
    const c=cards.get(id),at=Date.parse(c?.lastConfirmedAt),known=Number.isFinite(at)&&at<=now;
    const stale=!known||now-at>6*3600000,status=c?.status||'確定商品URLなし・再探索待ち';
    const state=/アクセス|認証/.test(status)?'access-stopped':/手動確認|仕様保留/.test(status)?'manual-review'
      :!c?'url-discovery':/再試行/.test(status)?'retry-wait':stale?'automatic-overdue':'within-target';
    bucket[state]=(bucket[state]||0)+1;
    const times=[...(proofs.get(id)||[])].sort((a,b)=>a-b),gaps=times.slice(1).map((t,i)=>t-times[i]);
    return {id,state,status,lastConfirmedAt:known?c.lastConfirmedAt:null,lastAttemptAt:c?.lastAttemptAt||null,
      targetOverdueHours:known?Math.max(0,(now-at)/3600000-6):null,
      confirmedIntervalSamples:gaps.length,lastConfirmedIntervalMs:gaps.at(-1)??null,
      maxConfirmedIntervalMs:gaps.length?Math.max(...gaps):null,
      evidence:'個別confirmedAtのみ。ジョブ終了・ファイル公開時刻では価格確認日時を補わない'};
  });
  const latest=(history||[]).filter(r=>r.mode==='deadline-price-refresh').at(-1);
  return {summary:{cohort:cohort.length,buckets:bucket,
    withMeasuredCardIntervals:rows.filter(r=>r.confirmedIntervalSamples>0).length,
    latestDeadlineRun:latest?{startedAt:latest.startedAt,endedAt:latest.endedAt,durationMs:latest.durationMs,
      verified:latest.refreshedCount,httpRequests:latest.httpRequests,proactiveVerified:latest.proactiveVerified??null,stopReason:latest.stopReason||null}:null,
    capacity:source.capacity||null},rows};
}
function build(root,monitor,history,now=Date.now()) {
  const executions=read(root,'work/source-update-history.json').sources||{},sources={};
  for(const id of ['hareruya2','cardrush'])if(monitor.sources?.[id]) {
    const cohort=history.sources?.[id]?.cohort||[];
    sources[id]=evaluate(monitor.sources[id],cohort,executions[id],now);
    sources[id].summary.intervalMinimum=history.sources?.[id]?.intervalMinima?.at(-1)||null;
  }
  const result={version:1,generatedAt:new Date(now).toISOString(),sources,
    scheduling:read(root,'data/priority-price-execution.json').startDelayMs??null,
    limits:'6時間は確認目標で、48時間等の計算採用期限とは別。区間最低は前回値の保守的推計、連続実測ではない。開始遅延だけで原因を断定しない',
    llmCalls:0,codexCalls:0};
  require('./acquisition_retry').atomicWrite(path.join(root,'data/operational-freshness-audit.json'),result,0);
  return result;
}
module.exports={evaluate,build};
