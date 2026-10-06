const fs = require('node:fs');
const path = require('node:path');
const {load, timingConfig} = require('./priority_price_queue.js');
const {lead} = require('./proactive_refresh.js');
const root=path.join(__dirname,'..');
const now=Date.now();
const execution=JSON.parse(fs.readFileSync(path.join(root,'data/priority-price-execution.json'),'utf8'));
const history=JSON.parse(fs.readFileSync(path.join(root,'work/source-update-history.json'),'utf8'));
const fixed=JSON.parse(fs.readFileSync(path.join(root,'work/priority-freshness-history.json'),'utf8'));
const measuredExecutions={};
for(const id of ['hareruya2','cardrush']) {
  measuredExecutions[id]=(history.sources?.[id] || []).filter(r=>r.mode==='deadline-price-refresh').slice(-12).map(r=>({
    startedAt:r.startedAt,endedAt:r.endedAt,durationMs:r.durationMs,workflowRunId:r.workflowRunId || null,
    deadlineOrderVersion:r.deadlineOrderVersion || '修正前・順序バージョン未記録',
    acquired:r.newAcquiredCount ?? null,linked:r.newLinkedCount ?? null,confirmed:r.refreshedCount ?? null,
    proactiveVerified:r.proactiveVerified ?? null,httpRequests:r.httpRequests ?? null,stopReason:r.stopReason || null}));
}
const rows=[];
let previous={};
try { previous=JSON.parse(fs.readFileSync(path.join(root,'data/proactive-refresh-audit.json'),'utf8')); } catch { /* First build has no publication evidence. */ }
for(const source of ['cardrush','hareruya2']) {
  for(const hours of [0,1,2,3,4,6]) {
    const plan=load(source,root,now+hours*3600000);
    rows.push({source,simulatedAt:new Date(now+hours*3600000).toISOString(),hoursAhead:hours,
      overdue:plan.records.filter(r=>r.important&&r.due).length,
      proactivelyEligible:plan.records.filter(r=>r.proactive&&r.eligible).length,
      normalEligible:plan.queue.filter(r=>!r.important).length,
      manualWait:plan.records.filter(r=>r.important&&r.status==='手動確認待ち').length});
  }
}
const result={version:1,generatedAt:new Date(now).toISOString(),method:'現在の保存確認時刻を固定した時刻前進シミュレーション。将来の実取得ではない',
  window:lead(timingConfig(root)),freshnessHours:6,normalShare:0.25,rows,
  postChangeScheduledValidation:execution.priceQueueModel==='deadline-v2' && execution.scheduledSlotAt ? '期限順修正後の定期実処理記録あり。保存・Pages結果はworkflow実行リンクを参照' : '期限順修正後の定期実行未確認・スクリプト記録待ち',
  measuredExecution:['proactive-v1','deadline-v2'].includes(execution.priceQueueModel) ? {runId:execution.runId,headSha:execution.headSha || null,model:execution.priceQueueModel,scheduledAt:execution.scheduledSlotAt,startDelayMs:execution.startDelayMs,durationMs:execution.durationMs,runs:execution.runs} : null,
  measuredExecutions,
  publicationEvidence:previous.publicationEvidence || null,
  freshnessEvidence:Object.fromEntries(Object.entries(fixed.sources || {}).map(([id,r])=>[id,{
    observedMinimumPct:r.observations.slice(-12).some(o=>Number.isFinite(o.fresh6hPct)) ? Math.min(...r.observations.slice(-12).map(o=>o.fresh6hPct).filter(Number.isFinite)) : null,
    basis:'直近12観測の最低率。連続測定の実行間最低値ではない',conservativeInterval:r.intervalMinima?.at(-1)||null}])),
  llmCalls:0,codexCalls:0};
fs.writeFileSync(path.join(root,'data/proactive-refresh-audit.json'),JSON.stringify(result));
console.log(JSON.stringify(result));
