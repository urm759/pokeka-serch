(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CurrentMarketModel = api;
})(typeof window === 'object' ? window : globalThis, function () {
  const finite = value => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
  function evaluate(input, model) {
    const card = input.card || {}, reasons = [], warnings = [];
    const now = input.now ?? Date.now();
    const age = value => value && Number.isFinite(Date.parse(value)) ? (now - Date.parse(value)) / 3600000 : null;
    const marketPrice = finite(card.psa10);
    const marketAge = age(input.marketUpdatedAt);
    if (!(marketPrice > 0)) reasons.push('PSA10現在相場未取得');
    if (marketAge == null || marketAge < 0 || marketAge > 30) reasons.push('PSA10相場が古い・確認日時不明');
    const saleAge = age(card.psa10Audit?.lastTradeAt);
    if (card.psa10Audit?.measured && (saleAge == null || saleAge > 30 * 24)) reasons.push('個別成約が古い・成約日時不明');
    if (card.dataQuality?.manualReview || card.dataQuality?.dataAnomaly || card.priceIntegrity?.disputed
      || card.priceAggregation?.conflicted || card.buybackAggregation?.conflicted) reasons.push('価格対立・誤紐付け・手動確認');
    if (card.psa10Audit?.confidence === '低' || card.priceAggregation?.confidence === '低') reasons.push('相場データ信頼度不足');
    if (finite(card.overallAssessment?.score) == null) reasons.push('銘柄品質データ不足');
    else if (card.overallAssessment.score < 60) reasons.push('銘柄品質60点未満');
    const assumptions = input.assumptions;
    if (finite(assumptions?.hitRate) == null || assumptions.hitRate < 0 || assumptions.hitRate > 1
      || !(finite(assumptions?.lowerGradePrice) > 0)) reasons.push('想定10率・PSA9価格未取得');
    const fee = finite(input.fee), extra = finite(input.extraCost), rate = finite(input.feeRate);
    if (fee == null || fee < 0 || extra == null || extra < 0 || rate == null || rate < 0 || rate >= 100) reasons.push('費用設定を確認');
    const offer = card.currentStoreOffer;
    const offerAge = age(offer?.updatedAt);
    const storeUsable = offer?.available === true && offer?.fresh === true && finite(offer.value) > 0 && offerAge != null && offerAge >= 0 && offerAge <= 48;
    const manual = finite(input.manualPrice);
    const purchasePrice = storeUsable ? Number(offer.value) : manual != null && manual >= 0 ? manual : null;
    const purchaseKind = storeUsable ? 'store' : purchasePrice != null ? 'manual' : 'missing';
    const policy = input.exitPolicy || 'buyback';
    const buyback = input.buybackExit;
    if (policy !== 'marketplace' && (!buyback?.usable || Number(buyback.storeCount) < 2 || !buyback.scenarios?.current)) reasons.push('買取出口データ不足・フリマへの自動切替なし');
    if (card.psa9Audit?.estimated !== false) warnings.push('PSA9は推定値');
    else if (card.psa9Audit?.measurementType !== 'actual') warnings.push('PSA9は集計値・個別実成約未取得');
    const psa9UpdatedAt = card.psa9Audit?.latestSaleAt || card.psa9Audit?.updatedAt || null;
    if (card.psa9Audit?.estimated === false && (age(psa9UpdatedAt) == null || age(psa9UpdatedAt) > 30 * 24)) reasons.push('PSA9価格が古い・確認日時不明');
    if (finite(card.official?.rate) == null) warnings.push('公式取得率未取得・設定10率を使用');
    else if (age(card.official?.f) == null || age(card.official?.f) > 48) warnings.push('公式Populationの確認日が古い・未取得');
    if (card.dataQuality?.dataShortage) warnings.push(...(card.dataQuality.dataShortageReasons || ['一部データ不足']));
    warnings.push('非10の残り確率をPSA9価格で仮置き。PSA8以下・鑑定失敗の確率と売価は未評価');
    let economics = null, cap = null, rawCap = null, psa9Profit = null, exitLabel = policy === 'marketplace' ? 'フリマ' : policy === 'both' ? '買取店・フリマの低い方' : '買取店';
    let current = null, psa10Net = null;
    if (!reasons.length) {
      const args = { assumptions, forecastPrice: marketPrice, purchasePrice: purchasePrice ?? 0,
        fee, saleFeeRate: rate, saleExtraCost: extra, riskBufferPct: 0, lockDays: input.lockDays };
      const market = model.expectedEconomics(args);
      const store = buyback?.usable ? model.economicsFromExpectedSale({ purchasePrice: purchasePrice ?? 0, fee,
        expectedSale: buyback.scenarios.current.expectedSale, lockDays: input.lockDays }) : null;
      const useMarket = policy === 'marketplace' || policy === 'both' && market.expectedSale < store.expectedSale;
      current = useMarket ? market : store;
      psa10Net = useMarket ? market.psa10Net : buyback.scenarios.current.netPsa10;
      rawCap = current.expectedSale - fee;
      cap = rawCap < 0 ? 0 : Math.floor(rawCap / 500) * 500;
      economics = purchasePrice == null ? null : current;
      // PSA9 is a separate lower-grade marketplace exit, also when PSA10 uses buyback.
      psa9Profit = purchasePrice == null ? null : market.lowerGradeNet - fee - purchasePrice;
    }
    return { eligible: reasons.length === 0, reasons: [...new Set(reasons)], warnings: [...new Set(warnings)],
      cap, rawCap, noNonLossPrice: rawCap != null && rawCap < 0, purchasePrice, purchaseKind,
      purchaseSource: storeUsable ? offer.source : purchasePrice != null ? '手入力試算・購入先未確認' : '購入価格未取得',
      economics, psa9Profit, exitLabel, assumedRate: finite(assumptions?.hitRate),
      lowerGradePrice: finite(assumptions?.lowerGradePrice),
      psa9UpdatedAt,
      rateSource: assumptions?.hitRateSource || '未取得', psa9Type: card.psa9Audit?.estimated !== false ? '推定値' : card.psa9Audit?.measurementType === 'actual' ? '実成約' : '集計値',
      psa10Roi: economics && purchasePrice + fee > 0 ? (psa10Net - purchasePrice - fee) / (purchasePrice + fee) * 100 : null,
      buybackDeductionRate: buyback?.scenarios?.current?.deductionRate ?? null,
    };
  }
  function matchesCap(view, minimum) { return minimum == null || finite(view.cap) != null && view.cap >= minimum; }
  return { evaluate, matchesCap };
});
