const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.join(__dirname, '..');
const DAY = 86400000;
const minimumObservationDays = { 7: 5, 30: 15, 75: 45, 200: 200 };
const PERIODS = [7, 30, 75, 200];
const dayTime = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return NaN;
  const stamp = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0,10) === value ? stamp : NaN;
};
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const median = values => { const a = values.slice().sort((x, y) => x - y); return a.length ? (a[Math.floor(a.length / 2)] + a[Math.floor((a.length - 1) / 2)]) / 2 : null; };
const shard = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 16; };
function maximumDrawdown(rows, dateKey = 0, priceKey = 2) {
  const ordered = rows.slice().sort((a,b) => dayTime(a[dateKey])-dayTime(b[dateKey]));
  if (new Set(ordered.map(r=>r[dateKey])).size < 2) return null;
  let peak = ordered[0], result = { percent:0, peakDate:null, troughDate:null, peakPrice:null, troughPrice:null };
  for (const row of ordered.slice(1)) {
    const percent = (row[priceKey]/peak[priceKey]-1)*100;
    if (percent < result.percent) result = {percent,peakDate:peak[dateKey],troughDate:row[dateKey],peakPrice:peak[priceKey],troughPrice:row[priceKey]};
    if (row[priceKey] > peak[priceKey]) peak = row;
  }
  return result;
}
function statistics(rows, asOf, days, dateKey, priceKey) {
  const end = dayTime(asOf), start = end - (days - 1) * DAY;
  const accepted = rows.filter(r => dayTime(r[dateKey]) >= start && dayTime(r[dateKey]) <= end && positive(r[priceKey]));
  const prices = accepted.map(r => r[priceKey]);
  const mean=prices.length?prices.reduce((a,b)=>a+b,0)/prices.length:null;
  const dates=[...new Set(accepted.map(r=>r[dateKey]))].sort(),span=dates.length?(dayTime(dates.at(-1))-dayTime(dates[0]))/DAY+1:0;
  const maxGap=dates.length>1?Math.max(...dates.slice(1).map((d,i)=>(dayTime(d)-dayTime(dates[i]))/DAY-1)):null;
  const cv=prices.length>=2&&mean>0?Math.sqrt(prices.reduce((sum,p)=>sum+(p-mean)**2,0)/prices.length)/mean*100:null;
  return { mean: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length * 100) / 100 : null,
    coefficientVariation:cv,spanDays:span,maxMissingGap:maxGap, median: median(prices), count: accepted.length, observedDays: new Set(accepted.map(r => r[dateKey])).size,
    missingDays: days - new Set(accepted.map(r => r[dateKey])).size,
    legacyUnverifiedDays: dateKey === 0 ? accepted.filter(r => r.length < 11).length : 0,
    start: new Date(start).toISOString().slice(0, 10), end: asOf,
    latestDate: accepted.map(r => r[dateKey]).sort().at(-1) || null,
    min: prices.length ? Math.min(...prices) : null, max: prices.length ? Math.max(...prices) : null,
    drawdown: dateKey === 0 ? maximumDrawdown(accepted,dateKey,priceKey) : null };
}
function variationEvidence(snapshots) {
  // Overlapping windows are not independent votes. Use one sufficiently observed window.
  const chosen=[200,75,30,7].map(d=>[d,snapshots[d]]).find(([d,s])=>d>=30&&s.observedDays>=15&&s.observedDays/d>=.5&&s.spanDays>=14&&s.maxMissingGap<=7&&s.legacyUnverifiedDays===0&&s.ageDays<=2);
  if(!chosen)return null;
  const [days,s]=chosen;return [days,Math.round(s.coefficientVariation*100)/100,s.drawdown?.percent??null,s.observedDays,s.spanDays,s.maxMissingGap,s.latestDate];
}
function observationStatus(stat, days, asOf) {
  const ageDays = stat.latestDate ? Math.round((dayTime(asOf) - dayTime(stat.latestDate)) / DAY) : null;
  return { requiredObservedDays: minimumObservationDays[days], ageDays,
    observationSufficient: stat.observedDays >= minimumObservationDays[days] && (days !== 200 || !stat.legacyUnverifiedDays),
    completeCalendarWindow: stat.observedDays === days && stat.legacyUnverifiedDays === 0,
    status: !stat.count ? '蓄積中' : days === 200 && (stat.observedDays < 200 || stat.legacyUnverifiedDays > 0)
      ? `期間内の観測平均・${stat.observedDays}/200日・参考${stat.legacyUnverifiedDays ? '（旧記録の取得根拠未確認）' : ''}` : ageDays > 2 ? '参考値・最終観測が古い'
      : stat.observedDays < minimumObservationDays[days] ? '参考値・観測不足' : '観測条件充足・参考値' };
}
function dailyRows(rows, card = null) {
  const dates = new Map();
  const evidence = require('./psa10_observation_evidence');
  const expectedIdentity = card ? evidence.identity(card) : null;
  for (const row of rows || []) {
    if (!Array.isArray(row) || !Number.isFinite(dayTime(row[0])) || !positive(row[2])) continue;
    if (row.length >= 11 && (!Array.isArray(row[10]) || evidence.calendarDay(row[10][0]) !== row[0]
      || (card && row[10][1] !== expectedIdentity))) continue;
    const previous = dates.get(row[0]);
    if (Array.isArray(previous?.[10]) && (!Array.isArray(row[10])
      || Date.parse(row[10][0]) < Date.parse(previous[10][0]))) continue;
    dates.set(row[0], row);
  }
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
function build(root = ROOT, now = new Date()) {
  const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const history = read('work/market_stability_history.json');
  const cards = read('data/pokemon-cards.json');
  const meta = read('data/pokemon-cards-meta.json');
  // The window advances even when acquisition fails; old data must age rather than reset the clock.
  const asOf = require('./psa10_observation_evidence').calendarDay(now.toISOString());
  const summary = { version: 6, asOf, periods: PERIODS, migration:'独自観測比較90→75暦日・日付原票から再集計。取得元独自90日・鑑定返却期間は別', calendar: 'Asia/Tokyo・直近暦日・同日1記録（株の取引日ではない）', retentionDays: 365,
    observationEvidenceIndices:{7:13,30:14,75:15,200:12}, drawdownIndices:{7:16,30:17,75:18,200:19},
    drawdownRule:'日付順の高値から後続の安値への最大下落。2観測日未満は算出不可。欠測補完なし・予測やGOへ未反映',
    minimumActualTrades: 3, minimumObservationDays, staleObservationDays: 2, shards: 16,
    snapshotSource: '国内・みんトレPSA10集約相場の日次観測（実成約平均ではない）',
    rule: '同日1記録・欠損補完なし・参考表示のみ・仕入れ上限とGOへ未反映', cards: {} };
  const chunks = Array.from({ length: 16 }, () => ({ version: 2, asOf,
    legacyEvidenceNote: '旧形式の記録は原票を保持して参考集計。取得根拠を捏造せず、完全200日観測には含めない', cards: {} }));
  const tradeDemand=require('./psa10_trade_statistics').prepare(root,cards,now);
  summary.tradeDemand=tradeDemand.summary;
  let actualCards = 0, historyCards = 0;
  const byPeriod = Object.fromEntries(PERIODS.map(days => [days,{meanCards:0, observationSufficientCards:0, recentSufficientCards:0, staleCards:0, completeCalendarCards:0}]));
  for (const card of cards) {
    const daily = dailyRows(history.cards[card.id], card);
    const actual = actualRows(card);
    const snapshots = Object.fromEntries(PERIODS.map(days => {
      const stat = statistics(daily, asOf, days, 0, 2);
      return [days, {...stat,...observationStatus(stat,days,asOf)}];
    }));
    const trades = Object.fromEntries([7, 30, 75].map(days => [days, { ...statistics(actual.rows, asOf, days, 'date', 'price'),
      sufficient: statistics(actual.rows, asOf, days, 'date', 'price').count >= 3 }]));
    if (!daily.length && !actual.rows.length) continue;
    if(!summary.variation)summary.variation={version:1,cards:{},rule:"同じ日次原票の1期間を採用。重複4票にしない。15日以上・期間50%以上・観測14日間以上・連続欠測7日以下・根拠確認・最終2日以内"};
    const variability=variationEvidence(snapshots);if(variability)summary.variation.cards[card.id]=variability;
    summary.cards[card.id] = [snapshots[7].mean, snapshots[7].count, snapshots[30].mean, snapshots[30].count,
      snapshots[30].ageDays, snapshots[75].mean, snapshots[75].count, snapshots[7].ageDays, snapshots[75].ageDays,
      snapshots[200].mean, snapshots[200].count, snapshots[200].ageDays, snapshots[200].legacyUnverifiedDays,
      snapshots[7].legacyUnverifiedDays,snapshots[30].legacyUnverifiedDays,snapshots[75].legacyUnverifiedDays,
      ...PERIODS.map(days=>snapshots[days].drawdown?.percent ?? null)];
    if (daily.length) historyCards++;
    for (const days of PERIODS) {
      const stat = snapshots[days], coverage = byPeriod[days];
      coverage.meanCards += Number(stat.count > 0);
      coverage.observationSufficientCards += Number(stat.observationSufficient);
      coverage.recentSufficientCards += Number(stat.observationSufficient && stat.ageDays <= 2);
      coverage.staleCards += Number(stat.count > 0 && stat.ageDays > 2);
      coverage.completeCalendarCards += Number(stat.completeCalendarWindow);
    }
    chunks[shard(card.id)].cards[card.id] = { snapshots, actualTrades: actual.rows.length ? trades : null,
      actualTradeStatus: actual.rows.length ? '国内PSA10実成約・期間件数を確認' : '国内PSA10個別実成約未取得',
      actualSources: [...new Set(actual.rows.map(r => r.source))], rejected: actual.rejected,
      duplicateDatesRemoved: (history.cards[card.id] || []).filter(r => positive(r[2])).length
        - new Set((history.cards[card.id] || []).filter(r => positive(r[2])).map(r => r[0])).size,
      excludedObservationRows: (history.cards[card.id]?.length || 0) - daily.length,tradeDemand:tradeDemand.details.get(card.id) };
    if (actual.rows.length) actualCards++;
  }
  summary.coverage = { catalog: cards.length, snapshotCards: historyCards, historyCards, summaryCards: Object.keys(summary.cards).length,
    actualTradeCards: actualCards, byPeriod };
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
module.exports = { build, statistics, dailyRows, actualRows, shard, observationStatus, maximumDrawdown, variationEvidence };
