const fs = require('node:fs'), path = require('node:path');
const read = (root, file, fallback = {}) => { try { return JSON.parse(fs.readFileSync(path.join(root, file))); } catch { return fallback; } };
const SUPPORT = ['grossBuybackRate', 'buybackShops', 'buybackPremiumPct', 'continuity30', 'continuityObservedDays'];
function filter(rows, { cards = [], population = {}, populationSpec, buybacks = {}, quarantines = [] } = {}) {
  const catalog = new Map(cards.map(c => [c.id, c])), heldShops = new Set(quarantines.map(r => r.id));
  const accepted = [], masks = [], rejected = [];
  let retainedWithShopHold = 0;
  for (const original of rows) {
    const card = catalog.get(original.id), at = Date.parse(original.availableAt);
    if (!card || card.identityReviewRequired || card.identityKey !== original.identity || card.language !== 'ja') {
      rejected.push({ id: original.id, availableAt: original.availableAt, reason: '当該国内PSA10観測のカード仕様が未確定・変更' }); continue;
    }
    // Shop raw-price holds do not invalidate independently proven domestic PSA10 observations.
    if (heldShops.has(card.id)) retainedWithShopHold++;
    const row = { ...original, features: { ...original.features } }, reasons = [];
    for (const field of ['pop7', 'pop30']) {
      const value = row.features[field];
      if (value && (population.specificationHeld?.[card.id]
        || !population.cards?.[card.id] || population.cards[card.id].u !== value.sourceUrl
        || populationSpec && populationSpec[card.id] !== value.specificationIdentity
        || !Number.isFinite(Date.parse(value.endAt)) || Date.parse(value.endAt) > at)) {
        row.features[field] = null; reasons.push({ field, reason: '当該公式POPの仕様保留・正規URL対応未確認' });
      }
    }
    if (['grossBuybackRate', 'buybackPremiumPct', 'continuity30'].some(k => row.features[k] != null) || row.features.buybackShops > 0) {
      const evidence = original.featureEvidence?.buyback;
      const proven = Array.isArray(evidence) && evidence.length > 0 && evidence.every(e => {
        const quote = buybacks.shops?.[e.shop]?.[card.id]?.[e.day];
        return quote && !quote.quarantined && !quote.cardMismatchSuspected && quote.matchStatus !== 'mismatch'
          && quote.identityAuditVersion === 3 && quote.identity === original.identity && quote.grade === 'PSA10' && quote.currency === 'JPY'
          && quote.observedAt === e.observedAt && quote.price === e.price && quote.url === e.url
          && Number.isFinite(at) && Date.parse(quote.observedAt) <= at;
      });
      if (!proven) for (const field of SUPPORT) {
        if (row.features[field] != null) reasons.push({ field, reason: evidence ? '買取特徴の原票保留・観測根拠不一致' : '旧特徴の店舗別原票参照なし・遡及推定せず検証保留' });
        row.features[field] = null;
      }
    }
    if (reasons.length) masks.push({ id: row.id, availableAt: row.availableAt, reasons });
    accepted.push(row);
  }
  return { rows: accepted, details: { masks, rejected }, summary: { rawRows: rows.length, eligibleRows: accepted.length,
    excludedRows: rejected.length, maskedRows: masks.length, maskedFields: masks.reduce((n, r) => n + r.reasons.length, 0),
    retainedWithShopHold, reasons: [...masks.flatMap(r => r.reasons), ...rejected].reduce((a, r) => (a[r.reason] = (a[r.reason] || 0) + 1, a), {}),
    policy: '原票を変更せず検証入力だけ隔離。店舗素体価格の保留を国内PSA10価格や取引へ伝播させない。0補完・将来の特徴で過去を再構築しない' } };
}
function load(root) {
  const population = read(root, 'data/psa-population-summary.json'), shards = new Map(), populationSpec = {};
  for (const [id, entry] of Object.entries(population.cards || {})) if (entry.sh) {
    if (!shards.has(entry.sh)) shards.set(entry.sh, read(root, 'data/psa-history/' + entry.sh + '.json'));
    populationSpec[id] = shards.get(entry.sh).identities?.[id] || null;
  }
  return { cards: read(root, 'data/pokemon-cards.json', []), population, populationSpec,
    buybacks: read(root, 'work/buyback-price-observations.json'), quarantines: read(root, 'data/shop-identity-quarantine.json').rows || [] };
}
module.exports = { filter, load };
