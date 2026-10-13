const fs=require('node:fs'),cp=require('node:child_process');
const beforeRef='b0bf0a1f',read=(file,ref)=>JSON.parse(ref?cp.execFileSync('git',['show',ref+':'+file],{maxBuffer:96e6}):fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const before=read('data/card-catalog-completion.json',beforeRef),after=read('data/card-catalog-completion.json');
const required=require('./completion_routes').REQUIRED,filled=[],analyzed=[],lost=[];
for(const [id,row]of Object.entries(after.cards)) {
  const b=before.cards[id];if(!b)continue;
  const fields=Object.keys(row.i||{}).filter(k=>row.i[k]==='取得済み'&&b.i?.[k]!=='取得済み');
  if(fields.length)filled.push({id,fields});
  if(row.s==='分析可能'&&b.s!=='分析可能')analyzed.push(id);
  if(row.s!=='分析可能'&&b.s==='分析可能')lost.push({id,status:row.s,missing:row.m});
}
const p1=read('data/psa-population-summary.json',beforeRef),p2=read('data/psa-population-summary.json');
const added=Object.keys(p2.cards).filter(id=>!p1.cards[id]),removed=Object.keys(p1.cards).filter(id=>!p2.cards[id]);
const report={version:1,at:new Date().toISOString(),beforeRef,
  listedBefore:before.summary.total,listedAfter:after.summary.total,newCatalog:Object.keys(after.cards).filter(id=>!before.cards[id]),
  requiredFilled:filled.filter(r=>r.fields.some(f=>required.includes(f))),referenceFilled:filled.filter(r=>!r.fields.some(f=>required.includes(f))),
  analyzedBefore:before.summary.analyzable,analyzedAfter:after.summary.analyzable,newlyAnalyzable:analyzed,lostAnalyzable:lost,
  psa:{before:Object.keys(p1.cards).length,after:Object.keys(p2.cards).length,newLinked:added,lost:removed,usableNet:added.length-removed.length,held:Object.keys(p2.specificationHeld||{}).length},
  pcScheduled:read('data/psa-pc-observation.json').acquisitionState,
  oneAway:read('data/one-item-completion-audit.json').byRoute,
  freshness:read('data/priority-price-monitor.json').fixedCohortFreshness,
  note:'同じ掲載ID群。実定期取得による増分と保存済み取り込みは区別。本作業による追加PSA再取得なし。GO基準変更なし。国内個別実成約・認証/許諾・期間実証の残件を消さない。',llmCalls:0,codexCalls:0};
fs.writeFileSync('data/runtime-improvement-outcomes.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({requiredFilled:report.requiredFilled.length,analysisAdded:analyzed.length,analysisLost:lost.length,psaNet:report.psa.usableNet,analysisNet:report.analyzedAfter-report.analyzedBefore,newCatalog:report.newCatalog.length,oneAway:report.oneAway}));
