// Discovery is three-state: missing evidence is neither qualification nor failure.
function priceGate(value, params, minKey, maxKey) {
  if (!Number.isFinite(value) || value <= 0) return 'unknown';
  for (const [key, below] of [[minKey, true], [maxKey, false]]) {
    const raw = params.get(key);
    if (raw == null || raw === '' || raw === 'off') continue;
    const bound = Number(raw);
    if (Number.isFinite(bound) && (below ? value < bound : value > bound)) return 'fail';
  }
  return 'pass';
}
function gates(card, params) {
  const offer = card.currentStoreOffer;
  return {
    referencePrice: priceGate(card.price, params, 'priceMin', 'priceMax'),
    psa10Price: priceGate(card.psa10, params, 'psaMin', 'psaMax'),
    purchasePrice: priceGate(offer?.fresh && offer.available ? offer.value : null, params, 'purchaseMin', 'purchaseMax'),
  };
}
function priority(card, detail = {}, support = null) {
  const reasons = [...(detail.r || [])];
  const knownOutletCount = Number(card.buybackShops || 0);
  let score = Number(detail.p || 0) + (detail.m?.length === 1 ? 500 : 0) + Math.min(5, knownOutletCount) * 100;
  if (detail.m?.length === 1) reasons.push('必須あと1項目を優先');
  if (knownOutletCount >= 2) reasons.push('複数店舗の買取掲載を確認');
  if (support?.multiStoreSupport) { score += 200; reasons.push('複数店舗の相場以上提示を確認・参考支持で取得順のみ優先'); }
  return { score, reasons: [...new Set(reasons)] };
}
module.exports = { priceGate, gates, priority };
