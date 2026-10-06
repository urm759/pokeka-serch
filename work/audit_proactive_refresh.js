const fs = require('node:fs');
const path = require('node:path');
const {load, timingConfig} = require('./priority_price_queue.js');
const {lead} = require('./proactive_refresh.js');
const root=path.join(__dirname,'..');
const now=Date.now();
const execution=JSON.parse(fs.readFileSync(path.join(root,'data/priority-price-execution.json'),'utf8'));
const rows=[];
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
  postChangeScheduledValidation:execution.priceQueueModel==='proactive-v1' ? '修正後の実行記録あり・定期実績はscheduledSlotAtと停止理由を参照' : '未実行・次回スクリプト記録との照合待ち',
  measuredExecution:execution.priceQueueModel==='proactive-v1' ? {runId:execution.runId,scheduledAt:execution.scheduledSlotAt,startDelayMs:execution.startDelayMs,durationMs:execution.durationMs,runs:execution.runs} : null,
  llmCalls:0,codexCalls:0};
fs.writeFileSync(path.join(root,'data/proactive-refresh-audit.json'),JSON.stringify(result));
console.log(JSON.stringify(result));
