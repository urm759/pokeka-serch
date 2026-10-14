const fs=require('node:fs'), path=require('node:path');
const {snapshot,compare,unpack}=require('./audit_completion_outcomes');
const root=path.join(__dirname,'..'),read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const baseline=read('work/search-profile-cycle-baseline-trade-demand-20261015.json');
const before=unpack(baseline.snapshot),after=snapshot(root);
const result={version:1,at:after.at,baseline:'048066e5',...compare(before,after),
  counts:read('data/psa10-period-summary.json').tradeDemand.coverage,
  profiles:read('data/search-profile-cycle-progress.json'),
  acquisition:read('work/trade-demand-acquisition-runs-20261015.json'),
  fixedCohortFreshness:read('data/priority-price-monitor.json').fixedCohortFreshness,
  performance:read('work/trade-demand-browser-performance-20261015.json').pairs,
  note:'手動実取得/定期統合を別記録。URL発見・根拠再評価・鮮度回復・必須補完・初適合は別。90/200日国内個別成約取得は未実装/正規提供条件待ち。今回の新指標は探索参考のみ。',
  allDataComplete:false,llmCalls:0,codexCalls:0};
fs.writeFileSync(path.join(root,'data/trade-demand-outcomes.json'),JSON.stringify(result));
console.log(JSON.stringify({filled:result.filledCards,newAnalyzable:result.newlyAnalyzable,sources:result.sources,counts:result.counts,freshness:result.fixedCohortFreshness}));
