const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const current = require('../current-market-model.js');
const model = require('../decision-model.js');
const at = '2026-10-06T10:00:00Z';
const input = {
  now: Date.parse(at), marketUpdatedAt: at, exitPolicy: 'marketplace',
  fee: 10000, feeRate: 8, extraCost: 1000, lockDays: 119,
  assumptions: { hitRate: .8, lowerGradePrice: 40000, hitRateSource: '公式取得率' },
  card: { psa10: 100000, price: 90000, overallAssessment: { score: 80 },
    official: { rate: 80, total: 1000, ten: 800, f: at }, psa9Audit: { estimated: true },
    currentStoreOffer: { value: 50000, available: true, fresh: true, updatedAt: at, source: '店舗A' } },
};
const evaluate = overrides => current.evaluate({ ...input, ...overrides }, model);
const v = evaluate();
assert(v.eligible);
assert(Math.abs(v.economics.expectedSale - 79960) < 1e-8);
assert(Math.abs(v.economics.expectedProfit - 19960) < 1e-8);
assert(Math.abs(v.economics.expectedRoi - 19960 / 60000 * 100) < 1e-8);
assert.equal(v.psa9Profit, -24200);
assert.equal(v.cap, 69500);
assert.equal(evaluate({ manualPrice: 100 }).purchasePrice, 50000, 'real available price wins');
const noOffer = { ...input.card, currentStoreOffer: null };
const missing = evaluate({ card: noOffer });
assert.equal(missing.purchasePrice, null);
assert.equal(missing.economics, null, 'raw market is not a buy price');
assert.equal(missing.cap, v.cap, 'cap discovery does not invent a purchase');
const manual = evaluate({ card: noOffer, manualPrice: 0 });
assert.equal(manual.purchaseKind, 'manual');
assert.equal(manual.purchasePrice, 0);
assert.equal(manual.economics.expectedProfit, v.economics.expectedProfit + 50000);
assert(v.warnings.some(x => x.includes('PSA8以下')));
assert(v.warnings.some(x => x.includes('PSA9は推定値')));
for (const card of [
  { ...input.card, priceIntegrity: { disputed: true } },
  { ...input.card, dataQuality: { manualReview: true } },
  { ...input.card, overallAssessment: { score: 59 } },
  { ...input.card, psa9Audit: { estimated: false, measurementType: 'aggregate' } },
]) assert(!evaluate({ card }).eligible);
assert(!evaluate({ marketUpdatedAt: '2026-10-01' }).eligible);
assert(!evaluate({ marketUpdatedAt: '2027-01-01' }).eligible);
assert.equal(evaluate({ card: { ...input.card, currentStoreOffer: { ...input.card.currentStoreOffer, updatedAt: '2026-10-01' } } }).purchasePrice, null);
assert(!evaluate({ exitPolicy: 'buyback' }).eligible, 'no silent marketplace fallback');
const buybackExit = { usable: true, storeCount: 2, scenarios: { current: { expectedSale: 75000, netPsa10: 85000, deductionRate: 3 } } };
assert.equal(evaluate({ exitPolicy: 'buyback', buybackExit }).economics.expectedProfit, 15000);
assert.equal(evaluate({ exitPolicy: 'both', buybackExit }).economics.expectedProfit, 15000);
assert.equal(evaluate({ exitPolicy: 'buyback', buybackExit, feeRate: 15 }).economics.expectedProfit, 15000, 'buyback already includes deduction and costs, no extra flea fee');
assert(evaluate({ feeRate: 15 }).economics.expectedProfit < v.economics.expectedProfit);
assert.equal(evaluate({ extraCost: 2000 }).economics.expectedProfit, v.economics.expectedProfit - 1000);
const zero = evaluate({ fee: v.economics.expectedSale });
assert.equal(zero.rawCap, 0);
assert.equal(zero.cap, 0);
assert(current.matchesCap(zero, 0));
assert(!current.matchesCap({ cap: null }, 0));
assert(!evaluate({ assumptions: { hitRate: null, lowerGradePrice: null } }).eligible);
for (const value of [NaN, Infinity, -1]) assert(!evaluate({ fee: value }).eligible);

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const elements = new Map();
let saved = {};
const document = { getElementById: id => { if (!elements.has(id)) elements.set(id, { value: '', checked: false }); return elements.get(id); }, querySelectorAll: () => [] };
const context = vm.createContext({ window: { location: { href: 'https://example.test/' }, PurchaseDecisionModel: model,
  CurrentMarketModel: current, ReleaseYearFilter: require('../release-year-filter.js'),
  CandidateVisibility: require('../candidate-visibility.js'), PurchaseRatioModel: require('../purchase-ratio-model.js') },
  document, URL, URLSearchParams, console, setTimeout, clearTimeout,
  localStorage: { getItem: key => saved[key] ?? null, setItem: (key, value) => saved[key] = value } });
vm.runInContext(source.split('// Browser event bindings start here;')[0] + '\nglobalThis.api={state,searchProfitView,cardSearchExclusions,readUrl,buildShareUrl,saveQuickFilters,restoreQuickFilters,sorters,gradeRateSummary,currentMarketProfitPanel};', context);
const api = context.api, state = api.state;
Object.assign(state, { purchaseMode: 'current-market', exitPolicy: 'marketplace', minSaleTx: 0, minRoi: 0, maxPsa10: null, minExpectedProfitFilter: 0, minExpectedRoiFilter: 0, sourceUpdates: { toreca: new Date().toISOString() } });
const card = { ...input.card, id: 'fixture', name: 'テスト SR[SV1 100/078]',
  currentStoreOffer: { ...input.card.currentStoreOffer, updatedAt: new Date().toISOString() },
  catalogCompletion: { s: '分析可能' }, saleTx30d: 40, psaTx30d: 40,
  priceAggregation: { confidence: '高' }, purchaseDecision: { verdict: '価格次第' },
  psaDecision: { expectedProfit: -10000 }, buyLimits: { clean: { finalMaxPrice: 10000, assumptions: input.assumptions } } };
state.catalogCompletion = { cards: { fixture: card.catalogCompletion } };
const view = api.searchProfitView(card);
assert.equal(view.purchaseKind, 'store');
assert(view.referenceOnly);
assert(view.economics.expectedProfit > 0);
assert(!api.cardSearchExclusions(card).includes('利益条件'));
assert(!api.cardSearchExclusions(card).includes('実店舗価格が安定上限超過'));
const missingBuy = {...card,currentStoreOffer:null};
assert.equal(api.searchProfitView(missingBuy).economics,null);
assert.equal(api.searchProfitView(missingBuy).psa9Profit,null);
assert(api.searchProfitView(missingBuy).cap > 0);
assert(!api.cardSearchExclusions(missingBuy).includes('購入価格未取得'));
state.currentMarketSearchKind='purchase';
assert(api.cardSearchExclusions(missingBuy).includes('購入価格未取得'));
const lossBuy={...card,currentStoreOffer:{...card.currentStoreOffer,value:200000}};
assert(api.cardSearchExclusions(lossBuy).includes('実購入時の赤字'));
assert(!api.cardSearchExclusions(lossBuy).includes('購入価格未取得'));
state.currentMarketSearchKind='cap';
assert(!api.cardSearchExclusions(lossBuy).includes('実購入時の赤字'));
const cheaper = { ...card, roi: -999, profit: -999, currentStoreOffer: { ...card.currentStoreOffer, value: 40000 } };
const dearer = { ...card, roi: 999, profit: 999, currentStoreOffer: { ...card.currentStoreOffer, value: 60000 } };
assert(api.sorters['roi-desc'](cheaper, dearer) < 0);
assert(api.sorters['profit-desc'](cheaper, dearer) < 0);
state.purchaseMode = 'normal';
assert(api.sorters['roi-desc'](cheaper, dearer) > 0, 'old mode retains the original sorter');
state.purchaseMode = 'current-market';
state.currentMarketCapMin = view.cap + 500;
assert(api.cardSearchExclusions(card).includes('現相場損益分岐上限'));
state.currentMarketCapMin = 0;
state.currentMarketManualPrice = 0;
const url = api.buildShareUrl();
assert.equal(url.searchParams.get('preset'), 'current-market');
assert.equal(url.searchParams.get('marketCapMin'), '0');
assert.equal(url.searchParams.get('marketBuy'), '0');
context.window.location.href = url.href;
api.readUrl();
assert.equal(elements.get('currentMarketCapMinInput').value, '0');
state.minRoi=null;
state.currentMarketSearchKind='purchase';
const offUrl=api.buildShareUrl();
assert.equal(offUrl.searchParams.get('roi'),'off');
assert.equal(offUrl.searchParams.get('marketSearch'),'purchase');
context.window.location.href=offUrl.href;
api.readUrl();
assert.equal(elements.get('roiInput').value,'');
api.saveQuickFilters();
context.window.location.href='https://example.test/';
elements.get('roiInput').value='0';
api.restoreQuickFilters();
assert.equal(elements.get('roiInput').value,'');
assert(!source.includes('state.minRoi = Number(els.roiInput.value || 0)'));
assert.equal(elements.get('currentMarketManualPriceInput').value, '0');
api.saveQuickFilters();
context.window.location.href = 'https://example.test/';
elements.get('currentMarketCapMinInput').value = '';
api.restoreQuickFilters();
assert.equal(elements.get('currentMarketCapMinInput').value, '0');
assert(!api.gradeRateSummary({ official: { total: 100 } }).includes('NaN'));
const panel = api.currentMarketProfitPanel(v);
assert(panel.includes('40,000'));
assert(panel.includes('推定値'));
assert(!panel.includes('NaN'));
assert(!api.currentMarketProfitPanel(missing).includes('NaN'));
assert(api.gradeRateSummary({ official: { rate: 0, total: 100, ten: 0 } }).includes('0.0%'));
assert(source.includes('period-profit-detail'), 'return model comparison remains in details');
assert(source.includes('currentMarketInputTimer = setTimeout(syncFromUI, 200)'), 'typed inputs update state without depending on blur');
console.log('Current-market: actual/manual price, current exits, fees, deduction, null/zero, stale/conflict safety, URL/storage and unchanged stable limits PASS');
