const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const start = app.indexOf('function priceComparisonCells(');
const context = vm.createContext({ Intl, Date, decisionModel: require('../decision-model.js'), fmt: new Intl.NumberFormat('ja-JP'), escapeHtml: s => String(s).replaceAll('<', '&lt;') });
vm.runInContext(app.slice(start, app.indexOf('\nfunction render()', start)) + '\nglobalThis.cells=priceComparisonCells;', context);
const now = Date.parse('2026-10-06T12:00:00Z');
const limit = { stableCap: 40000, currentCap: 61000, reason: '供給ストレスで制限' };
const card = {
  price: 9999, psa10: 82000, futurePriceForecast: { centralPrice: 999999 },
  currentStoreOffer: { value: 32000, source: '晴れる屋2', available: true, fresh: true, updatedAt: '2026-10-06T10:00:00Z', inventoryAt: '2026-10-06T10:00:00Z' },
  psa10Audit: { adoptedPrice: 82000, source: 'みんトレ集約値' },
};
const snapshot = JSON.stringify(card);
const render = (c = card, date = '2026-10-06T10:00:00Z') => context.cells(c, limit, date, now);
const html = render();
assert.match(html, /¥32,000/);
assert.match(html, /¥82,000/);
assert.doesNotMatch(html, /999,999|9,999/);
assert.ok(html.indexOf('data-price-kind="store"') < html.indexOf('data-price-kind="psa10"'));
assert.ok(html.indexOf('data-price-kind="stable"') < html.indexOf('data-price-kind="break-even"'));
assert.match(html, /推奨仕入れ値ではありません/);
assert.match(html, /2026\/10\/06 19:00/);
assert.match(render({ ...card, currentStoreOffer: null }), /未取得.*素体相場で代用しません・GO不可/s);
assert.match(render({ ...card, currentStoreOffer: null }), /48時間以内0／古値0／日時不明0元/);
assert.doesNotMatch(render({ ...card, currentStoreOffer: null }), /9,999/);
assert.doesNotMatch(render({ ...card, currentStoreOffer: { ...card.currentStoreOffer, fresh: false } }), /32,000/);
assert.doesNotMatch(render({ ...card, currentStoreOffer: { ...card.currentStoreOffer, updatedAt: '2026-09-01' } }), /32,000/);
assert.doesNotMatch(render({ ...card, currentStoreOffer: { ...card.currentStoreOffer, inventoryAt: null } }), /32,000/);
assert.doesNotMatch(render({ ...card, currentStoreOffer: { ...card.currentStoreOffer, inventoryAt: '2026-09-16' } }), /32,000/);
assert.match(render(card, '2026-09-01'), /古い価格/);
assert.match(render(card, null), /確認日時未取得/);
assert.match(render(card, '2026-10-06'), /時刻未取得/);
for (const missing of [null, NaN, Infinity, 0, -1]) {
  const output = render({ ...card, psa10: missing, psa10Audit: { adoptedPrice: missing } });
  assert.match(output, /未取得・予測値で補完しません/);
  assert.doesNotMatch(output, /NaN|Infinity|999,999/);
}
assert.equal(JSON.stringify(card), snapshot, 'Display must not mutate financial inputs');
for (const [state, cap, text] of [['loss-at-zero',null,'0円仕入れでも赤字'],['unavailable',null,'データ不足で算出不可'],['available',0,'¥0']]) {
  const output=context.cells(card,{...limit,currentCapState:state,currentCap:cap},'2026-10-06T10:00:00Z',now);
  assert.match(output,new RegExp(text));
  if(state!=='available') assert.doesNotMatch(output, /<strong>¥0<\/strong>/);
}
assert.match(app, /card-details-body">\s*<div class="detail-limit-comparison">\$\{limitComparison\}/);
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
assert.match(css, /\.candidate-glance,\.price-comparison-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(css, /\.candidate-glance \.price-cell strong,\.price-comparison-grid \.price-cell strong/);
console.log('Price comparison display: purchase/current market isolation, missing/stale values, shared two-column layout passed');
