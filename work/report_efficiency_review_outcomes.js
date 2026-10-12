const fs=require('node:fs'),path=require('node:path');
const {snapshot,compare,unpack}=require('./audit_completion_outcomes');
const root=path.join(__dirname,'..');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const before=unpack(read('work/efficiency-review-acquisition-before.json')),after=snapshot(root);
const baseline=read('work/efficiency-review-monitor-before.json').fixedCohortFreshness.sources.hareruya2;
const observation=[baseline.latest,baseline.previous].filter(r=>Date.parse(r.at)<=Date.parse(before.at)).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0];
const monitor=read('data/priority-price-monitor.json').fixedCohortFreshness.sources.hareruya2;
const price=read('work/candidate-shop-refresh.json').sources.hareruya2,poke=read('work/pokedata-budget-progress.json');
const filledByItem={};
for(const [id,row] of Object.entries(after.rows)) {
  if(!before.rows[id])continue;
  for(const item of row.fields.filter(item=>!before.rows[id].fields.includes(item)))filledByItem[item]=(filledByItem[item]||0)+1;
}
const report={version:1,at:after.at,...compare(before,after),
  filledByItem,filledAnalysisRequiredItems:['domesticPrice','psa10Price','psa10Trades','psaOfficial'].reduce((n,key)=>n+(filledByItem[key]||0),0),
  priceRun:{attempted:price.attemptedCount,confirmed:price.refreshedCount,changed:price.changedCount,failed:price.failedCount,httpRequests:price.httpRequests,durationMs:price.durationMs,nextId:price.nextId,stopReason:price.stopReason},
  pokeRun:{attempted:poke.attempted,publicNewRecords:poke.publicNewRecords,newLinked:poke.newLinked,failed:poke.failed,httpRequests:poke.httpRequests,durationMs:poke.durationMs,checkpoint:poke.checkpoint,status:poke.status,stopReason:poke.stopReason,authenticatedSales:poke.authenticatedSales},
  fixedFreshness:{before:observation,after:monitor.latest,intervalMinimum:monitor.intervalMinimum},
  evidence:'Only this saved baseline is used for growth. Manual acquisition is not proof of scheduled operation. Public PokeDATA metadata is not authenticated sale-price acquisition.',
  llmCalls:0,codexCalls:0,regularOperationVerified:false};
fs.writeFileSync(path.join(root,'data/efficiency-review-outcomes.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
