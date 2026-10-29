const assert=require('node:assert/strict'),b=require('./build_buyback_support'),m=require('../exploration-metrics');
const source={shops:{a:{merchantId:'a'},aMail:{merchantId:'a',fulfilment:'mail'},b:{merchantId:'b'},stop:{stopped:true},hold:{permission:'pending'}}};
const entries={a:{meanDays:[['2026-09-01',.8],['2026-10-29',1.2]]},aMail:{meanDays:[['2026-10-29',1.4]]},b:{meanDays:[['2026-10-29',1]]},stop:{meanDays:[['2026-10-29',99]]},hold:{meanDays:[['2026-10-29',99]]}};
const w=m.buybackMeanWindows(entries,source.shops,'all',[],'2026-10-29');assert.equal(w[75].mean,1);assert.equal(w[75].days,2);assert.equal(w[75].stores,2);assert.equal(w[75].lastDate,'2026-10-29');assert(w[75].reference);assert.equal(w[30].mean,1.2);assert.equal(w[7].mean,1.2);
assert.equal(m.buybackMeanWindows(entries,source.shops,'selected',['a'],'2026-10-29')[75].mean,1);
assert.equal(m.buybackMeanWindows({},source.shops,'all',[],'2026-10-29')[75].mean,null,'no zero/carryforward');
const rows=[{id:'fixture',shop:'a',date:'2026-09-01',priceDate:'2026-09-01',timeSkewHours:0,ratio:.8,price:800,marketPrice:1000,observedAt:'2026-09-01T01:00:00Z',marketAt:'2026-09-01T01:00:00Z',identity:'spec',band:'under30k'},
{id:'fixture',shop:'a',date:'2026-10-29',priceDate:null,timeSkewHours:0,ratio:1.2,price:1200,marketPrice:1000,observedAt:'2026-10-29T01:00:00Z',marketAt:'2026-10-29T01:00:00Z',identity:'spec',band:'under30k'}];
const result=b.aggregate(rows,source,[],Date.parse('2026-10-29T08:00:00Z')).summary;
assert.equal(result.cards.fixture.a.days.length,1,'legacy7/30 retained without extending initial history');assert.equal(result.cards.fixture.a.meanDays.length,1,'unknown quote date not adopted in new mean');assert.equal(result.meanWindows.fixture.all[75].mean,.8);
const wrapped={cards:{fixture:{a:{identity:'spec'}}},support:result},compact=require('./build_ui_data').project('buyback-observation-summary',wrapped);
assert.equal(compact.support.cards.fixture.a.meanDays,undefined);
assert.deepEqual(m.buybackSupport(compact,'fixture','all',[],Date.parse('2026-10-29T08:00:00Z'),null,'spec').meanWindows[75],m.buybackSupport(wrapped,'fixture','all',[],Date.parse('2026-10-29T08:00:00Z'),null,'spec').meanWindows[75]);
assert.equal(m.buybackSupport(compact,'fixture','selected',['a'],Date.parse('2026-10-29T08:00:00Z'),null,'spec').meanWindows,null,'custom selection waits for lazy details instead of showing all shops');
console.log('PASS75day mean: aligned proof, observed-day equal weight, physical-merchant max once, selected channels, stopped/held, no fill, compact/detail');
