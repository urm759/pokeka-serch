// Opt-in substitute exit (fleaFallback=1, 2026-11-24 plan A, user-approved). No source requests, no AI.
const assert = require('assert'), model = require('../current-market-model.js'), decisionModel = require('../decision-model.js');
const at = Date.parse('2026-11-24T08:00:00Z');
const card = { psa10: 40000, psa10Audit: { measured: false, confidence: '高' }, overallAssessment: { score: 80 },
  psa9Audit: { estimated: false, measurementType: 'actual', value: 15500, latestSaleAt: '2026-11-23T00:00:00Z' },
  official: { rate: 0.5, f: '2026-11-24T00:00:00Z' }, dataQuality: {},
  currentStoreOffer: { available: true, fresh: true, value: 14400, updatedAt: '2026-11-24T06:00:00Z', source: 'テスト店' } };
const base = { card, assumptions: { hitRate: 0.5, lowerGradePrice: 15500 }, marketUpdatedAt: '2026-11-24T06:00:00Z', fee: 6980, feeRate: 8, extraCost: 0, lockDays: 175, now: at };
const noStore = { usable: false, storeCount: 0, scenarios: {} };
const off = model.evaluate({ ...base, exitPolicy: 'both', buybackExit: noStore }, decisionModel);
assert.equal(off.eligible, false); assert(off.reasons.includes('買取出口データ不足・フリマへの自動切替なし'), 'without the setting a missing store exit stays unavailable');
assert.equal(off.marketplaceFallback, false);
const on = model.evaluate({ ...base, exitPolicy: 'both', buybackExit: noStore, marketplaceFallback: true }, decisionModel);
const market = model.evaluate({ ...base, exitPolicy: 'marketplace', buybackExit: noStore }, decisionModel);
assert.equal(on.eligible, true, on.reasons.join('/')); assert.equal(on.marketplaceFallback, true); assert.equal(on.exitLabel, 'フリマ（店舗買取なし・代替）');
assert.equal(on.rawCap, market.rawCap, 'the substitute uses the same marketplace net as the marketplace policy, the sale price is unchanged');
assert.equal(on.psa10Net, market.psa10Net);
// A usable store exit is never replaced: the flag changes nothing there.
const store = { usable: true, storeCount: 2, scenarios: { current: { expectedSale: 30000, netPsa10: 36000, deductionRate: 5 } } };
const withStore = model.evaluate({ ...base, exitPolicy: 'both', buybackExit: store }, decisionModel);
const withStoreFlag = model.evaluate({ ...base, exitPolicy: 'both', buybackExit: store, marketplaceFallback: true }, decisionModel);
assert.deepEqual(withStoreFlag, { ...withStore }, 'flag is inert when two usable stores exist');
assert.equal(withStoreFlag.marketplaceFallback, false);
// One usable store is still not a usable store exit.
const one = model.evaluate({ ...base, exitPolicy: 'both', buybackExit: { ...store, storeCount: 1 }, marketplaceFallback: true }, decisionModel);
assert.equal(one.marketplaceFallback, true);

// App level: turning the setting on may only change cards that pass every gate; all other cards keep their reasons.
const { load } = require('./audit_search_profit_consistency');
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const url = 'https://urm759.github.io/pokeka-serch/?fee=6980&psaMin=10000&guide=80&lock=175&psaPlan=value&buybackDeduction=5&preset=combined&psa9RatioMin=70&psa9Aggregate=1&psa9Market=1&exitPolicy=both&buybackStores=all&purchaseMin=0&purchaseMax=30000&effMin=35&effBuy=auto&effScenario=current&effRef=1&filterExpRoi=20&filterExpProfit=5000&psaMax=100000&bbMeanMin=0&bbRatio75Min=0.9&bbRatioRef=1&calcBuy=median&medianBuyPct=off&storeDemand=normal-up';
const iso = new Date(at).toISOString();
const before = load(app, iso, { url }), after = load(app, iso, { url: url + '&fleaFallback=1' });
assert.equal(before.state.marketplaceFallback, false); assert.equal(after.state.marketplaceFallback, true, 'URL parameter reaches the state');
const a = before.prepareCalculatedCards(before.state.cards), b = after.prepareCalculatedCards(after.state.cards);
const byId = new Map(b.map(c => [c.id, c]));
assert.equal(JSON.stringify(a.map(c => [c.id, c.buyLimits, c.purchaseDecision])), JSON.stringify(b.map(c => [c.id, c.buyLimits, c.purchaseDecision])), 'caps and decisions never change');
let changed = 0;
for (const c of a) {
  const x = before.cardSearchExclusions(c), y = after.cardSearchExclusions(byId.get(c.id));
  if (JSON.stringify(x) === JSON.stringify(y)) continue;
  changed++;
  const exit = c.buyLimits?.clean?.buybackExit, usable = Boolean(exit?.usable) && Number(exit.storeCount) >= 2 && Number.isFinite(exit?.scenarios?.current?.expectedSale) && Number.isFinite(exit?.scenarios?.current?.netPsa10);
  assert(!usable, 'only cards without a usable store exit change: ' + c.id);
  assert(Number(c.p10tv30) >= 5 && Number(c.psa10) > 0 && Number(c.snkPsa10Min) > 0 && Number(c.psa10) <= Number(c.snkPsa10Min) * 1.05, 'only cards passing the liquidity gates change: ' + c.id);
}
console.log('PASS marketplace substitute exit: off is unchanged, on only for under-2-store cards, same marketplace net, inert with stores; app-level changes limited to gated cards (' + changed + ' changed), caps/decisions unchanged');
