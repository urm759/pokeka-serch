const assert = require('node:assert/strict');
const fs = require('node:fs');
const m = require('../decision-model.js');
const {reconcile} = require('./reconcile_shop_observations.js');
const {historySummary} = require('./update_yuyutei_torecacamp.js');
const now = Date.parse('2026-10-07T04:00:00Z'), at = '2026-10-07T03:00:00Z';
const row = (source,value,extra={}) => ({source,value,kind:'販売価格',available:true,updatedAt:at,inventoryAt:at,identityVerified:true,...extra});
const aggregation = entries => m.aggregatePrices(entries,{asOfDate:'2026-10-07'});
const entries = [row('low',3000),row('A',10000),row('B',10100),row('C',10200)];
const a = aggregation(entries);
assert(a.outliers.some(r => r.source === 'low'));
assert.equal(m.storeOffers(entries,a,{now}).offer.source,'low','verified low price is not a purchase rejection');
assert(!m.storeOffers([row('low',3000,{identityVerified:false})],a,{now}).offer);
for (const extra of [{updatedAt:null},{inventoryAt:null},{updatedAt:'2026-09-16'},{inventoryAt:'2026-09-16'},
  {available:false},{valid:false},{conditionAccepted:false},{updatedAt:'2026-10-08'}]) {
  const r = [row('A',10000,extra)];
  assert.equal(m.storeOffers(r,aggregation(r),{now}).offer,null);
}
assert(m.storeOffers([row('A',10000,{updatedAt:new Date(now-48*3600000).toISOString()})],a,{now}).offer);
assert(!m.storeOffers([row('A',10000,{updatedAt:new Date(now-48*3600000-1).toISOString()})],a,{now}).offer);
const huge=[row('sold',10000,{kind:'成約相場'}),row('huge',4500000)];
assert(!m.storeOffers(huge,aggregation(huge),{now}).offer,'existing extreme-price quarantine remains');
assert.deepEqual(m.shopObservation({observedAt:'2026-09-16'}),{priceAt:'2026-09-16',inventoryAt:'2026-09-16'});
assert.equal(m.shopObservation({updatedAt:null}).priceAt,null);
assert.equal(m.shopObservation({observedAt:null,updatedAt:at}).priceAt,null);
assert.equal(m.shopObservation({priceObservedAt:null,observedAt:at}).priceAt,null);
const cards=[{id:'test',torecacampUrl:'https://test/product'}];
const summary={updatedAt:at,cards:{test:{torecacampPrice:4280,available:true}}};
const catalog=[{cardId:'test',observedAt:'2026-09-16'}];
reconcile(cards,catalog,summary,'torecacamp');
assert.equal(summary.cards.test.observedAt,'2026-09-16');
summary.updatedAt='2026-10-08'; reconcile(cards,[],summary,'torecacamp');
assert.equal(summary.cards.test.observedAt,'2026-09-16','unvisited date survives file rewrite');
const hist=historySummary(cards,[{...catalog[0],price:4280,stock:3}],{dates:['2026-10-07'],stocks:{test:[3]}},'yuyuteiPrice');
assert.equal(hist.test.observedAt,'2026-09-16','stock history date is not a page observation');
assert.equal(hist.test.yuyuteiPrice,4280);
const app=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
assert(app.includes('decisionModel.shopObservation(row)'));
const { retainedPriceObservations } = require('./retained_price_observation.js');
assert.deepEqual(retainedPriceObservations({}, {price:4280,snkPsa10Price:9800}, '2026-09-16'),
  {priceObservedAt:'2026-09-16',psa10ObservedAt:'2026-09-16'});
assert.deepEqual(retainedPriceObservations({}, {price:4280,priceObservedAt:null}, at),
  {priceObservedAt:null,psa10ObservedAt:null});
assert.deepEqual(retainedPriceObservations({price:4280,snkPsa10Price:9800}, {priceObservedAt:'2026-09-16'}, at), {});
console.log('Individual observations, expiry, preserved unvisited dates and independent low-price offers PASS');
