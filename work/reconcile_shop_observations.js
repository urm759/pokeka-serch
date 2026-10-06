const fs = require('node:fs'), path = require('node:path');
const { shopObservation } = require('../decision-model.js');
const SOURCES = ['cardrush', 'hareruya2', 'yuyutei', 'torecacamp'];
function reconcile(cards, catalog, summary, source) {
  const byId = new Map(catalog.filter(r => r.cardId).map(r => [r.cardId, r]));
  const byUrl = new Map(catalog.map(r => [r.detailUrl, r]));
  let restored = 0, unknown = 0;
  for (const card of cards) {
    const row = summary.cards?.[card.id];
    if (!row) continue;
    const entry = byId.get(card.id) || byUrl.get(card[`${source}Url`]);
    if (!Object.hasOwn(row, 'observedAt') && !Object.hasOwn(row, 'updatedAt')) {
      row.observedAt = entry?.observedAt || null;
      if (row.observedAt) restored++;
    }
    if (!Object.hasOwn(row, 'identityVerified')) row.identityVerified = entry?.cardId === card.id;
    if (!shopObservation(row).priceAt) unknown++;
  }
  return { restored, unknown, total: Object.keys(summary.cards || {}).length, fileUpdatedAtNotUsed: true };
}
function run(root = path.join(__dirname, '..')) {
  const read = (p, fallback) => { try { return JSON.parse(fs.readFileSync(path.join(root,p),'utf8')); } catch { return fallback; } };
  const cards = read('data/pokemon-cards.json', []), sources = {};
  for (const source of SOURCES) {
    const file = `data/${source}-stock-summary.json`, summary = read(file, {cards:{}});
    sources[source] = reconcile(cards, read(`work/${source}_catalog.json`,[]), summary, source);
    const original = fs.readFileSync(path.join(root,file),'utf8'), next = JSON.stringify(summary);
    if (original !== next) fs.writeFileSync(path.join(root,file),next);
  }
  const result = {at:new Date().toISOString(), acquired:0, llmCalls:0, sources,
    reason:'保存済みカタログの個別観測日時のみ復元。ファイル更新日を価格・在庫確認日へ転用しない。新規取得ではない。'};
  fs.writeFileSync(path.join(root,'data/shop-observation-reconciliation.json'),JSON.stringify(result));
  return result;
}
if (require.main === module) console.log(JSON.stringify(run()));
module.exports = {reconcile, run};
