const fs=require('node:fs'),cp=require('node:child_process');
const beforeRef='ffdf2ac0',read=(file,ref)=>JSON.parse(ref?cp.execFileSync('git',['show',ref+':'+file],{maxBuffer:96e6}):fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const before=read('data/card-catalog-completion.json',beforeRef),after=read('data/card-catalog-completion.json');
const required=require('./completion_routes').REQUIRED,filled=[],gained=[],lost=[],newCards=[];
for(const[id,row]of Object.entries(after.cards)){
  const b=before.cards[id];if(!b){newCards.push(id);continue;}
  const fields=required.filter(k=>row.i?.[k]==='取得済み'&&b.i?.[k]!=='取得済み');
  if(fields.length)filled.push({id,fields});
  if(row.s==='分析可能'&&b.s!=='分析可能')gained.push(id);
  if(row.s!=='分析可能'&&b.s==='分析可能')lost.push(id);
}
const population=read('data/psa-population-summary.json'),oldPopulation=read('data/psa-population-summary.json',beforeRef);
const report={at:new Date().toISOString(),beforeRef,sourceCommit:'9d120659',listedBefore:before.summary.siteTotal,listedAfter:after.summary.siteTotal,newCards,
  requiredFilled:filled,newAnalyzable:gained,lostAnalyzable:lost,analyzableBefore:before.summary.analyzable,analyzableAfter:after.summary.analyzable,
  psaUsableNet:Object.keys(population.cards).length-Object.keys(oldPopulation.cards).length,
  freshnessBefore:read('data/priority-price-monitor.json',beforeRef).fixedCohortFreshness.sources.hareruya2.latest,
  freshnessAfter:read('data/priority-price-monitor.json').fixedCohortFreshness.sources.hareruya2.latest,
  purchaseRecovery:read('data/purchase-price-recovery.json'),acquisition:read('data/candidate-shop-refresh.json'),
  incomplete:read('data/one-item-completion-audit.json').byRoute,
  note:'非AIの既存定期補完による新規取得と共通IDの補完を比較。表示機能の追加をデータ成果に数えない。完全日次観測・国内実成約・期間モデルの完了とは別。',llmCalls:0,codexCalls:0};
fs.writeFileSync('data/observation-efficiency-acquisition.json',JSON.stringify(report));
console.log(JSON.stringify({newCatalog:newCards.length,requiredFilled:filled.length,newAnalyzable:gained.length,lostAnalyzable:lost.length,analyzableNet:report.analyzableAfter-report.analyzableBefore,psaNet:report.psaUsableNet,cohortFresh:report.freshnessAfter.fresh6hPct}));
