const fs=require('node:fs'), path=require('node:path'),cp=require('node:child_process');
const {snapshot,compare,unpack}=require('./audit_completion_outcomes');
const root=path.join(__dirname,'..'),read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const baseline=read('work/search-profile-cycle-baseline-trade-demand-20261015.json');
const before=unpack(baseline.snapshot),after=snapshot(root);
const savedManual=JSON.parse(cp.execFileSync('git',['show','4d9e3375:data/trade-demand-outcomes.json'],{encoding:'utf8',maxBuffer:20e6}));
const previousCompletion=JSON.parse(cp.execFileSync('git',['show','4d9e3375:data/card-catalog-completion.json'],{encoding:'utf8',maxBuffer:20e6}));
const completion=read('data/card-catalog-completion.json'),names=new Map(read('data/pokemon-cards.json').map(c=>[c.id,c.name]));
const result={version:1,at:after.at,baseline:'048066e5',...compare(before,after),
  manual:{addedCards:savedManual.addedCards,filledCards:savedManual.filledCards,newlyAnalyzable:savedManual.newlyAnalyzable,sources:savedManual.sources},
  integratedScheduled:'33d8074ae62bf39663012e9de308d9ca46b2c1ee',
  integrationAnalysisChanges:Object.keys(completion.cards).filter(id=>(previousCompletion.cards[id]?.s==='分析可能')!==(completion.cards[id]?.s==='分析可能')).map(id=>({id,name:names.get(id),before:previousCompletion.cards[id]?.s,after:completion.cards[id]?.s,missing:completion.cards[id]?.m,reasons:completion.cards[id]?.r})),
  counts:read('data/psa10-period-summary.json').tradeDemand.coverage,
  profiles:read('data/search-profile-cycle-progress.json'),
  acquisition:read('work/trade-demand-acquisition-runs-20261015.json'),
  fixedCohortFreshness:read('data/priority-price-monitor.json').fixedCohortFreshness,
  performance:read('work/trade-demand-browser-performance-20261015.json').pairs,
  note:'手動実取得/定期統合を別記録。URL発見・根拠再評価・鮮度回復・必須補完・初適合は別。90/200日国内個別成約取得は未実装/正規提供条件待ち。今回の新指標は探索参考のみ。',
  allDataComplete:false,llmCalls:0,codexCalls:0};
fs.writeFileSync(path.join(root,'data/trade-demand-outcomes.json'),JSON.stringify(result));
console.log(JSON.stringify({filled:result.filledCards,newAnalyzable:result.newlyAnalyzable,sources:result.sources,counts:result.counts,freshness:result.fixedCohortFreshness}));
