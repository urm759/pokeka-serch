const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.join(__dirname, '..');
const DAY = 86400000;
const dayTime = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? Date.parse(value + 'T00:00:00Z') : NaN;
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const median = values => { const a = values.slice().sort((x, y) => x - y); return a.length ? (a[Math.floor(a.length / 2)] + a[Math.floor((a.length - 1) / 2)]) / 2 : null; };
const shard = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 16; };
function statistics(rows, asOf, days, dateKey, priceKey) {
  const end = dayTime(asOf), start = end - (days - 1) * DAY;
  const accepted = rows.filter(r => dayTime(r[dateKey]) >= start && dayTime(r[dateKey]) <= end && positive(r[priceKey]));
  const prices = accepted.map(r => r[priceKey]);
  return { mean: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length * 100) / 100 : null,
    median: median(prices), count: accepted.length, observedDays: new Set(accepted.map(r => r[dateKey])).size,
    start: new Date(start).toISOString().slice(0, 10), end: asOf,
    latestDate: accepted.map(r => r[dateKey]).sort().at(-1) || null,
    min: prices.length ? Math.min(...prices) : null, max: prices.length ? Math.max(...prices) : null };
}
function dailyRows(rows) {
  const dates = new Map();
  for (const row of rows || []) if (Array.isArray(row) && Number.isFinite(dayTime(row[0])) && positive(row[2])) dates.set(row[0], row);
  return [...dates.values()];
}
function actualRows(card) {
  const rows = [], rejected = {};
  const reject = reason => rejected[reason] = (rejected[reason] || 0) + 1;
  const ids = new Set();
  for (const row of card.snkPsa10Trades || []) {
    // No inference from aggregate, overseas, offers, or uncertain identity.
    if (row.measurementType !== 'actual' || row.market !== 'domestic' || row.currency !== 'JPY'
      || row.cardId !== card.id || row.identityKey !== card.identityKey || row.language !== 'ja'
      || row.gradingCompany !== 'PSA' || Number(row.grade) !== 10 || row.identityConfirmed !== true) { reject('国内PSA10実成約の仕様・根拠未確認'); continue; }
    if (!positive(row.price) || !Number.isFinite(dayTime(row.date))) { reject('価格・成約日不明'); continue; }
    if (row.id && ids.has(row.source + '/' + row.id)) { reject('同一成約ID重複'); continue; }
    if (row.id) ids.add(row.source + '/' + row.id);
    rows.push(row);
  }
  return { rows, rejected };
}
function build(root = ROOT) {
  const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const history = read('work/market_stability_history.json');
  const cards = read('data/pokemon-cards.json');
  const meta = read('data/pokemon-cards-meta.json');
  const asOf = String(meta.updatedAt || meta.generatedAt || history.dates.at(-1)).slice(0, 10);
  const summary = { version: 1, asOf, periods: [7, 30, 90], minimumActualTrades: 3, shards: 16,
    snapshotSource: '国内・みんトレPSA10集約相場の日次観測（実成約平均ではない）',
    rule: '同日1記録・欠損補完なし・参考表示のみ・仕入れ上限とGOへ未反映', cards: {} };
  const chunks = Array.from({ length: 16 }, () => ({ version: 1, asOf, cards: {} }));
  let actualCards = 0;
  for (const card of cards) {
    const daily = dailyRows(history.cards[card.id]);
    const actual = actualRows(card);
    const snapshots = Object.fromEntries([7, 30, 90].map(days => [days, statistics(daily, asOf, days, 0, 2)]));
    const trades = Object.fromEntries([7, 30, 90].map(days => [days, { ...statistics(actual.rows, asOf, days, 'date', 'price'),
      sufficient: statistics(actual.rows, asOf, days, 'date', 'price').count >= 3 }]));
    if (!daily.length && !actual.rows.length) continue;
    summary.cards[card.id] = [snapshots[7].mean, snapshots[7].count, snapshots[30].mean, snapshots[30].count];
    chunks[shard(card.id)].cards[card.id] = { snapshots, actualTrades: actual.rows.length ? trades : null,
      actualTradeStatus: actual.rows.length ? '国内PSA10実成約・期間件数を確認' : '国内PSA10個別実成約未取得',
      actualSources: [...new Set(actual.rows.map(r => r.source))], rejected: actual.rejected,
      duplicateDatesRemoved: (history.cards[card.id]?.length || 0) - daily.length };
    if (actual.rows.length) actualCards++;
  }
  summary.coverage = { catalog: cards.length, snapshotCards: Object.keys(summary.cards).length, actualTradeCards: actualCards };
  const written = [];
  const write = (file, data) => { const target = path.join(root, file), text = JSON.stringify(data);
    if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') === text) return;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target + '.tmp', text); fs.renameSync(target + '.tmp', target); written.push(file); };
  const inputHash = crypto.createHash('sha256').update(JSON.stringify([history, cards.map(c => [c.id, c.identityKey, c.snkPsa10Trades]), asOf])).digest('hex');
  summary.inputHash = inputHash;
  for (let i = 0; i < chunks.length; i++) write(`data/psa10-periods/${i}.json`, chunks[i]);
  write('data/psa10-period-summary.json', summary);
  return { ...summary.coverage, asOf, changedFiles: written.length, inputHash };
}
if (require.main === module) console.log(JSON.stringify(build()));
module.exports = { build, statistics, dailyRows, actualRows, shard };
