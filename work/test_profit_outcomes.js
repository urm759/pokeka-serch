const fs=require('fs'),assert=require('node:assert/strict');
// Reuse the existing independent comparison fixture and expose only display APIs.
let fixture=fs.readFileSync('work/test_sale_reference_comparisons.js','utf8').split('const primary=')[0];
fixture=fixture.replace('saleReferenceYen};','saleReferenceYen,profitOutcomeAudit,profitOutcomeMarkup};');
const {a,card,s}=new Function('require',fixture+';return {a,card,s};')(require);
const before=JSON.stringify({e:a.cardEfficiency(card),p:a.searchProfitView(card),state:s});
const r=a.profitOutcomeAudit(card);
assert.equal(r.market.buy,20000);assert.equal(r.market.net,27390);
assert.equal(r.market.profit,410);assert.equal(r.market.investment,27190);assert.equal(r.market.roi,410/27190*100);
assert.equal(r.selected.net,26290);assert.equal(r.selected.profit,-690);assert.equal(r.selected.investment,27290);
assert.equal(r.lowerNet,8990);assert.equal(r.expected.net,22830);assert.equal(r.expected.profit,-4150);
assert.equal(r.expected.net,r.rate*r.selected.net+(1-r.rate)*r.lowerNet);
assert.equal(r.expected.roi,r.expected.profit/r.expected.investment*100);
assert.equal(r.travel,100);assert.equal(r.extra,210);
assert(a.profitOutcomeMarkup(card).includes('取得率不使用'));
assert.equal(before,JSON.stringify({e:a.cardEfficiency(card),p:a.searchProfitView(card),state:s}));
for(const rate of [0,.5,.8,1,null])for(const price of [0,10000,null]){
  const c={...card,id:'independent',testView:{...card.testView,assumedRate:rate,lowerGradePrice:price}};
  assert.equal(a.profitOutcomeAudit(c).market.profit,410,'PSA10-only sale does not depend on hit rate or PSA9');
}
for(const [fee,extra,saleFee]of [[0,0,0],[6980,210,8],[12980,1000,12]]){
  Object.assign(s,{fee,saleExtraCost:extra,saleFeeRate:saleFee});const x=a.profitOutcomeAudit(card).market;
  assert.equal(x.profit,30000*(1-saleFee/100)-extra-20000-fee);
  assert.equal(x.roi,x.profit/(20000+fee+extra)*100);
}
for(const patch of [{fee:-1},{saleExtraCost:-1},{saleFeeRate:100}]){
  Object.assign(s,{fee:6980,saleExtraCost:210,saleFeeRate:8},patch);assert.equal(a.profitOutcomeAudit(card).market.profit,null);
}
Object.assign(s,{fee:6980,saleExtraCost:210,saleFeeRate:8});
assert.equal(a.profitOutcomeAudit({...card,psa10ObservedAt:'2026-11-10T00:00:00Z'}).market.profit,null);
assert.equal(a.profitOutcomeAudit({...card,priceAggregation:{included:[card.priceAggregation.included[0]]}}).market.profit,null);
assert.equal(a.profitOutcomeAudit({...card,identityReviewRequired:true}).market.profit,null);
console.log('PASS three profit outcomes: median, gross/net, rate, non10, per-exit costs once, funded-cost ROI, null/stale/identity guards, no main/state mutation');
