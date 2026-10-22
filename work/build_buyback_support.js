const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const market = require('../market-analysis'), evidence = require('./psa10_observation_evidence');
const ROOT = path.join(__dirname, '..');
const periods = [7, 30], DAY = 86400000;
const band = price => price < 30000 ? 'under30k' : price < 100000 ? 'from30kTo100k' : 'over100k';
const physicalKey = card => [String(card.identityKey).split('|').slice(0,6).join('|'),
  String(card.name || '').normalize('NFKC').match(/(?:電話)?抽選\s*\d+\s*名|当選者|当選品|電話抽選/)?.[0]?.replace(/\s/g,'') || '',card.variant || ''].join('|');
const constrained = row => row.campaign === true || row.quantityLimited === true || row.conditionsConfirmed === false
  || /キャンペーン|数量限定|先着|お一人様|まとめ売り|セット販売|PSA\s*9|BGS|CGC|TAG|ACE/i.test(row.title || '');
const stopped = meta => Boolean(meta?.reviewStatus || meta?.acquisitionStopped
  || /HTTP\s*(?:401|403)|認証切れ|許諾確認待ち/.test(meta?.error || ''));
function joined(observations, history, cards, source, now = Date.now()) {
  const byId = new Map(cards.map(c => [c.id, c])), rows = [], audit = { accepted: 0, rejected: 0, reasons: {} };
  const reject = reason => { audit.rejected++; audit.reasons[reason] = (audit.reasons[reason] || 0) + 1; };
  for (const [shop, entries] of Object.entries(observations.shops || {})) {
    if (!source.shops?.[shop] || ['pending','retired'].includes(source.shops[shop].acquisitionPermission)) { for (const dates of Object.values(entries)) for (const date of Object.keys(dates)) reject('取得・再利用停止'); continue; }
    for (const [id, dates] of Object.entries(entries)) {
      const card = byId.get(id);
      if (!card || card.language !== 'ja' || card.identityReviewRequired || !card.identityKey) { reject('国内カード仕様未確定'); continue; }
      const prices = new Map(require('./build_psa10_period_statistics').dailyRows(history.cards?.[id],card).map(row => [row[0], row]));
      for (const [date, quote] of Object.entries(dates)) {
        const point = prices.get(date), observed = point?.[10];
        if (quote.quarantined || quote.cardMismatchSuspected || quote.matchStatus === 'mismatch') { reject('買取原票の仕様・価格保留'); continue; }
        if (quote.identityAuditVersion !== 3 || quote.identity !== card.identityKey || quote.grade !== 'PSA10' || quote.currency !== 'JPY'
          || evidence.calendarDay(quote.observedAt) !== date || Date.parse(quote.observedAt) > now || !Number.isFinite(quote.price) || !(quote.price > 0)) { reject('買取の仕様・日付・価格証拠不足'); continue; }
        if (constrained(quote)) { reject('キャンペーン・数量・条件付き提示'); continue; }
        if (!Array.isArray(observed) || observed[1] !== evidence.identity(card) || evidence.calendarDay(observed[0]) !== date
          || Date.parse(observed[0]) > now || !Number.isFinite(point?.[2]) || !(point[2] > 0)) { reject('同日の国内PSA10価格確認証拠なし'); continue; }
        if (Date.parse(date) < Date.parse(evidence.calendarDay(new Date(now).toISOString())) - 29 * DAY) continue;
        const currentQuote=source.cards?.[id]?.shops?.[shop];
        const priceDate=quote.priceDate || (currentQuote?.price===quote.price && currentQuote.priceDate===date ? currentQuote.priceDate : null);
        const timeSkewHours=Math.abs(Date.parse(quote.observedAt)-Date.parse(observed[0]))/3600000;
        rows.push({ id, physicalIdentity: physicalKey(card), shop, date, priceDate, timeSkewHours, ratio: quote.price / point[2], price: quote.price, marketPrice: point[2],
          observedAt: quote.observedAt, marketAt: observed[0], identity: quote.identity, url: quote.url,
          title: quote.title, fulfilment: source.shops?.[shop]?.fulfilment || 'mail', band: band(point[2]) });
        audit.accepted++;
      }
    }
  }
  return { rows, audit };
}
function baseline(target, peers, commonIds) {
  // The subject never contributes to its own normal rate. A price outlier is only
  // separated from the peer baseline, not from the subject's valid offer.
  const key = r => r.physicalIdentity || r.id, unique = new Map();
  for (const row of peers.filter(r => key(r) !== key(target) && r.shop === target.shop && r.date === target.date && r.band === target.band)) {
    if (!unique.has(key(row))) unique.set(key(row),[]); unique.get(key(row)).push(row);
  }
  const own = [...unique.values()].map(rows=>({...rows[0],ratio:market.median(rows.map(r=>r.ratio))})), common = own.filter(r => commonIds.has(key(r)));
  const useCommon = common.length >= 3, selected = useCommon ? common : own;
  const marked = market.markRatioOutliers(selected.map(r => ({ ...r, marketRatio: r.ratio, valid: true, stale: false })));
  const trusted = marked.filter(r => !r.outlier), count = trusted.length;
  // Inclusive ties give a conservative rank. Rank is descriptive, never a score.
  const topPct = count >= 10 ? (trusted.filter(r => r.ratio >= target.ratio).length + 1) / (count + 1) * 100 : null;
  return [count >= 3 ? market.median(trusted.map(r => r.ratio)) : null, count, selected.length,
    marked.filter(r => r.outlier).length, common.length, useCommon ? 'common' : 'own-band', target.band, count < 10, topPct];
}
function aggregate(rows, source, cards, now = Date.now()) {
  const asOf = evidence.calendarDay(new Date(now).toISOString()), groups = new Map(), common = new Map();
  for (const row of rows) {
    if (!(row.timeSkewHours <= 6)) continue;
    const key = [row.shop, row.date, row.band].join('|');
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row);
    const cohort = [row.date, row.band].join('|');
    if (!common.has(cohort)) common.set(cohort, new Map());
    const merchants = common.get(cohort).get(row.physicalIdentity || row.id) || new Set();
    merchants.add(source.shops?.[row.shop]?.merchantId || row.shop); common.get(cohort).set(row.physicalIdentity || row.id, merchants);
  }
  const output = { version: 1, asOf, staleHours: 48, periods, shops: {}, cards: {},
    timingPolicy:{maxSkewHours:6,rule:'現在比較は同日・実確認の差6時間以内。超過/提示日不明は過去時点の参考比較だけ。採算出口とは別'},
    schema: {current: ['ratio','grossOffer','domesticPsa10','quoteObservedAt','marketObservedAt','date','currentlyListed','quotePriceDate','timeSkewHours'],
      baseline: ['median','acceptedCards','rawCards','excludedOutliers','commonCards','cohort','priceBand','reference','inclusiveTopPct'],
      period: ['meanRatio','medianRatio','observedDays','daysAtOrAboveMarket','lastObservedAt','firstDate'],
      premium: ['meanPremiumPct','observedDays','positiveDays','reference']},
    rule: '減額前提示/同日確認した国内PSA10。店舗・同日1記録。標準は対象自身除外・同日同価格帯・3枚未満不可/10枚未満参考。共通カード群3枚以上を優先。手数料等なし。需要・価格上昇・購入GOを保証しない' };
  for (const [shop, meta] of Object.entries(source.shops || {})) output.shops[shop] = {
    name: meta.name, fulfilment: meta.fulfilment || 'mail', merchantId: meta.merchantId || shop,
    permission: meta.acquisitionPermission || null, stopped: stopped(meta) };
  const detail = {}, byCardShop = new Map();
  for (const row of rows) {
    const peers = groups.get([row.shop, row.date, row.band].join('|')) || [];
    const commonIds = new Set([...(common.get([row.date, row.band].join('|')) || [])].filter(([, shops]) => shops.size >= 2).map(([id]) => id));
    row.baseline = baseline(row, peers, commonIds);
    row.premium = row.baseline[0] > 0 ? (row.ratio / row.baseline[0] - 1) * 100 : null;
    const key = [row.id, row.shop].join('|'); if (!byCardShop.has(key)) byCardShop.set(key, []); byCardShop.get(key).push(row);
    (detail[row.id] ||= []).push(row);
  }
  for (const records of byCardShop.values()) {
    records.sort((a,b) => a.date.localeCompare(b.date)); const last = records.at(-1);
    const quote = source.cards?.[last.id]?.shops?.[last.shop];
    const currentlyListed = quote?.listingActive === true && quote?.quarantined !== true && quote?.matchConfidence === 'high' && quote.price === last.price
      && quote.priceDate === last.date && !constrained(quote) && !stopped(source.shops?.[last.shop]);
    const result = { h: evidence.identity({ identityKey: last.identity }),
      current: [last.ratio, last.price, last.marketPrice, last.observedAt, last.marketAt, last.date, currentlyListed,last.priceDate ?? null,last.timeSkewHours ?? null],
      baseline: last.timeSkewHours <= 6 ? last.baseline : [null,0,0,0,0,'unmatched-time',last.band,true,null],
      days: records.filter(r=>r.timeSkewHours<=6).map(r => [r.date, r.ratio]), periods: {}, premium: {} };
    for (const days of periods) {
      const selected = records.filter(r => r.timeSkewHours <= 6 && Date.parse(r.date) >= Date.parse(asOf) - (days - 1) * DAY);
      if (!selected.length) continue;
      result.periods[days] = [market.mean(selected.map(r => r.ratio)), market.median(selected.map(r => r.ratio)), selected.length,
        selected.filter(r => r.ratio >= 1).length, selected.at(-1).observedAt, selected[0].date];
      const premium = selected.filter(r => Number.isFinite(r.premium));
      result.premium[days] = [premium.length ? market.mean(premium.map(r => r.premium)) : null, premium.length,
        premium.filter(r => r.premium > 0).length, premium.length !== days || premium.some(r => r.baseline[7])];
    }
    (output.cards[last.id] ||= {})[last.shop] = result;
  }
  return { summary: output, detail };
}
function build(root = ROOT) {
  const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const source = read('data/shop-buyback-summary.json'), cards = read('data/pokemon-cards.json');
  const permissions = read('work/buyback-source-permissions.json');
  for (const [shop, permission] of Object.entries(permissions.sources || {})) if (source.shops?.[shop]) source.shops[shop].acquisitionPermission = permission.status;
  const { rows, audit } = joined(read('work/buyback-price-observations.json'), read('work/market_stability_history.json'), cards, source);
  const latest=new Map();
  for(const row of rows) {const key=row.id+'|'+row.shop;if(!latest.has(key)||Date.parse(latest.get(key).observedAt)<Date.parse(row.observedAt))latest.set(key,row);}
  const active=[...latest.values()].filter(r=>source.cards?.[r.id]?.shops?.[r.shop]?.listingActive===true&&!stopped(source.shops?.[r.shop]));
  audit.timing={historicalPriceDateUnknown:rows.filter(r=>!r.priceDate).length,historicalSkewOver6Hours:rows.filter(r=>r.timeSkewHours>6).length,
    currentComparisons:active.length,currentPriceDateUnknown:active.filter(r=>!r.priceDate).length,currentSkewOver6Hours:active.filter(r=>r.timeSkewHours>6).length,
    recheck: active.filter(r=>!r.priceDate || r.timeSkewHours>6).map(r=>({id:r.id,shop:r.shop,field:'buybackExitEvidence',source:'shopBuyback',mode:'bulk',automatic:source.shops?.[r.shop]?.acquisitionPermission!=='pending',reason:!r.priceDate?'提示日未確認':'国内相場との確認時差超過',automaticReviewRelease:false}))};
  const result = aggregate(rows, source, cards); result.summary.audit = audit;
  const write = (file, value) => { const target = path.join(root,file); fs.mkdirSync(path.dirname(target),{recursive:true}); require('./acquisition_retry').atomicWrite(target,value,0); };
  const existing = read('data/buyback-observation-summary.json'); existing.support = result.summary;
  const shards = {};
  existing.support.detailFiles = {};
  for (const [id, detail] of Object.entries(result.detail)) {
    const shard = crypto.createHash('sha256').update(id).digest()[0] % 32;
    (shards[shard] ||= {})[id] = detail;
    existing.support.detailFiles[id] = `data/buyback-support-details/${shard}.json`;
  }
  for (const [shard, detail] of Object.entries(shards)) write(`data/buyback-support-details/${shard}.json`, { version: 1, asOf: result.summary.asOf, cards: detail,
    summaries: Object.fromEntries(Object.keys(detail).map(id=>[id,result.summary.cards[id]])) });
  write('data/buyback-observation-summary.json', existing);
  const report = { version: 1, asOf: result.summary.asOf, cards: Object.keys(result.summary.cards).length, rows: rows.length,
    stores: new Set(rows.map(r=>r.shop)).size, days: new Set(rows.map(r=>r.date)).size, audit, llmCalls: 0, codexCalls: 0,
    note: '履歴の実取得日時・仕様が照合できた日だけ集計。新規取得・補完や候補増加とは別。原票は必要時のみ読込' };
  write('data/buyback-support-audit.json', report); return report;
}
if (require.main === module) console.log(JSON.stringify(build()));
module.exports = { joined, baseline, aggregate, build, constrained, physicalKey, stopped };
