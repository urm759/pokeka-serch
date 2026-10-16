const fs=require('node:fs'),path=require('node:path'),outcomes=require('./audit_completion_outcomes');
const root=path.join(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p)));
const baseline=read('work/search-profile-cycle-baseline-price-colour-20261016.json');
const logs=['target-refresh','maintenance','maintenance-second','completion-continued'].map(name=>{
  const r=read('work/price-colour-'+name+'.log');
  return {name,startedAt:r.startedAt,endedAt:r.endedAt,attempted:r.attemptedCount??r.attempted,
    verified:r.refreshedCount??r.acquired,newPrice:r.newAcquiredCount??r.newAcquired,http:r.httpRequests??null,
    durationMs:r.durationMs,stopReason:r.stopReason,newLinked:r.newLinkedCount??r.newLinked};
});
const cycle=read('data/search-profile-cycle-progress.json').cycles.find(c=>c.key==='price-colour-20261016');
const report={version:1,at:new Date().toISOString(),baselineAt:baseline.at,actualExecutions:logs,
  discovery:read('work/price-colour-discovery-continued.log'),
  incomingData:read('work/expanded-daily-merge.json'),
  overall:outcomes.compare(outcomes.unpack(baseline.snapshot),outcomes.snapshot(root,Date.now())),
  profiles:cycle.profiles.map(p=>({id:p.id,before:p.before,after:p.after,firstQualified:p.firstQualified,
    requalified:p.requalified,freshnessRestored:p.freshnessRestored,lost:p.lost,lostReasons:p.lostReasons,
    completed:p.completed,purchaseFilled:p.purchaseFilled,medianEvidenceRecovered:p.medianEvidenceRecovered})),
  unique:cycle.uniqueOutcomes,freshness:read('data/priority-price-monitor.json').fixedCohortFreshness.sources.hareruya2,
  sameDataCodeAudit:'data/price-comparison-audit.json',
  research:{observedDays:read('data/supply-demand-validation-summary.json').observedDays,
    labels:read('data/supply-demand-validation-summary.json').availableLabelCounts,
    learning:read('data/supply-demand-validation-summary.json').learning},
  limitations:'原票取得、保存済み定期データ受領、根拠再集計、時間経過を分離。コード訂正の復帰を実取得初適合と数えない。手動回復は定期維持成功ではない。',
  llmCalls:0,codexCalls:0,aiSchedules:'停止維持'};
fs.writeFileSync(path.join(root,'data/price-operations-outcomes.json'),JSON.stringify(report));
console.log(JSON.stringify({overall:report.overall,profiles:report.profiles.map(({lostReasons,...p})=>p),unique:report.unique}));
