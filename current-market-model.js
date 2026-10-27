(function (root, factory) {
  const api = factory(() => typeof module === 'object' && module.exports ? require('./limit-display-model.js') : root.LimitDisplayModel);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CurrentMarketModel = api;
})(typeof window === 'object' ? window : globalThis, function (resolveDisplayModel) {
  function assertDependencies() {
    const displayModel=resolveDisplayModel();
    if(typeof displayModel?.classifyCap!=='function') {
      const error=new Error('計算モジュールの読込失敗・版不一致：limit-display-model.js / classifyCap。再読み込みしてください。');
      error.code='CALCULATION_DEPENDENCY_UNAVAILABLE';
      throw error;
    }
    return displayModel;
  }
  const finite = value => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
  function evaluate(input, model) {
    const displayModel=assertDependencies();
    const card = input.card || {}, reasons = [], warnings = [], referenceReasons = [];
    const reference = input.referenceCalculation === true;
    const hold = (reason, canReference = false) => {
      if (reference && canReference) { referenceReasons.push(reason); warnings.push('参考値・'+reason); }
      else reasons.push(reason);
    };
    const now = input.now ?? Date.now();
    const age = value => value && Number.isFinite(Date.parse(value)) ? (now - Date.parse(value)) / 3600000 : null;
    const marketPrice = finite(card.psa10);
    const marketAge = age(input.marketUpdatedAt);
    if (!(marketPrice > 0)) reasons.push('PSA10現在相場未取得');
    if (marketAge == null || marketAge < 0 || marketAge > 30) reasons.push('PSA10相場が古い・確認日時不明');
    const saleAge = age(card.psa10Audit?.lastTradeAt);
    if (card.psa10Audit?.measured && (saleAge == null || saleAge > 30 * 24)) reasons.push('個別成約が古い・成約日時不明');
    if (card.dataQuality?.manualReview || model.hasBlockingDataAnomaly(card.dataQuality) || card.priceIntegrity?.disputed
      || (card.priceAggregation?.comparison || card.priceAggregation)?.conflicted || card.buybackAggregation?.conflicted) reasons.push('価格対立・誤紐付け・手動確認');
    if (card.psa10Audit?.confidence === '低' || card.priceAggregation?.confidence === '低') {
      if (!reference) reasons.push('相場データ信頼度不足');
      else {
        if (card.psa10Audit?.confidence === '低') hold(card.psa10Audit.measured ? 'PSA10個別成約の低信頼理由・採用根拠を要確認' : 'PSA10集計の取引件数・期間充足不足', !card.psa10Audit.measured && finite(card.psa10Audit.includedCount) != null);
        if (card.priceAggregation?.confidence === '低') hold('素体価格の採用元・観測充足不足', Number(card.dataQuality?.trustedPriceCount) > 0);
      }
    }
    if (finite(card.overallAssessment?.score) == null) hold('銘柄品質データ不足',true);
    else if (card.overallAssessment.score < 60) hold('銘柄品質60点未満',true);
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
    if (policy !== 'marketplace' && (!buyback?.usable || !(finite(buyback.storeCount) >= 2) || finite(buyback.scenarios?.current?.expectedSale) == null || finite(buyback.scenarios?.current?.netPsa10) == null)) reasons.push('買取出口データ不足・フリマへの自動切替なし');
    if (card.psa9Audit?.estimated !== false) warnings.push('PSA9は推定値');
    else if (card.psa9Audit?.measurementType !== 'actual') warnings.push('PSA9は集計値・個別実成約未取得');
    const psa9UpdatedAt = card.psa9Audit?.latestSaleAt || card.psa9Audit?.updatedAt || null;
    if (card.psa9Audit?.estimated === false && age(psa9UpdatedAt) == null) hold(reference ? 'PSA9日時未確認' : 'PSA9価格の確認日時不足',reference && finite(card.psa9Audit.value) > 0);
    else if (card.psa9Audit?.estimated === false && (age(psa9UpdatedAt) < 0 || age(psa9UpdatedAt) > 30 * 24)) reasons.push('PSA9価格が古い・日時不正');
    if (reference) {
      if (!(finite(card.psa9Audit?.value) > 0) || card.psa9Audit?.estimated !== false) reasons.push('PSA9価格自体が未取得・推定だけでは計算しない');
      if (card.psa9Audit?.identityConfirmed === false || card.psa9Audit?.specificationMismatch
        || card.psa9Audit?.country && card.psa9Audit.country !== 'jp' || card.psa9Audit?.currency && card.psa9Audit.currency !== 'JPY') reasons.push('PSA9仕様・国内価格の一致未確認');
    }
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
      cap = displayModel.classifyCap(rawCap).cap;
      economics = purchasePrice == null ? null : current;
      // PSA9 is a separate lower-grade marketplace exit, also when PSA10 uses buyback.
      psa9Profit = purchasePrice == null ? null : market.lowerGradeNet - fee - purchasePrice;
    }
    return { eligible: reasons.length === 0, reasons: [...new Set(reasons)], warnings: [...new Set(warnings)],
      calculationState: reasons.length ? 'unavailable' : referenceReasons.length ? 'reference' : 'calculated', referenceReasons: [...new Set(referenceReasons)],
      ...displayModel.classifyCap(rawCap), noNonLossPrice: rawCap != null && rawCap < 0, purchasePrice, purchaseKind,
      purchaseSource: storeUsable ? offer.source : purchasePrice != null ? '手入力試算・購入先未確認' : '購入価格未取得',
      economics, psa9Profit, exitLabel, psa10Net,
      psa10Profit: economics ? psa10Net - purchasePrice - fee : null,
      assumedRate: finite(assumptions?.hitRate),
      lowerGradePrice: finite(assumptions?.lowerGradePrice),
      psa9UpdatedAt,
      rateSource: assumptions?.hitRateSource || '未取得', psa9Type: card.psa9Audit?.estimated !== false ? '推定値' : card.psa9Audit?.measurementType === 'actual' ? '実成約' : '集計値',
      psa10Roi: economics && purchasePrice + fee > 0 ? (psa10Net - purchasePrice - fee) / (purchasePrice + fee) * 100 : null,
      buybackDeductionRate: buyback?.scenarios?.current?.deductionRate ?? null,
      investmentExtra: extra + (current && current.exitType === 'buyback' ? finite(buyback?.scenarios?.current?.travelCost) || 0 : 0),
    };
  }
  function matchesCap(view, minimum) { return minimum == null || !view.noNonLossPrice && view.capState !== 'loss-at-zero' && finite(view.cap) != null && view.cap >= minimum; }
  function compareCaps(a, b) {
    const rank = view => view.capState === 'loss-at-zero' || view.noNonLossPrice ? 1 : finite(view.cap) != null ? 2 : 0;
    return rank(b) - rank(a) || (rank(a) === 2 ? b.cap - a.cap : 0);
  }
  function capExclusion(view) { return view.capState === 'loss-at-zero' || view.noNonLossPrice ? '0円仕入れでも赤字' : finite(view.cap) == null ? '損益分岐上限・データ不足で算出不可' : '現相場損益分岐上限'; }
  // Reference evaluation is opt-in and never replaces the purchase-GO evaluator.
  const evaluateReference = (input,model) => evaluate({...input,referenceCalculation:true},model);
  function targetGuide(view, input = {}) {
    const displayModel=assertDependencies();
    const fee = finite(input.fee), profit = finite(input.minProfit), roi = finite(input.minRoi);
    const extra = finite(view.investmentExtra) ?? 0;
    const available = view.eligible && finite(view.rawCap) != null && fee != null && fee >= 0
      && profit != null && profit >= 0 && roi != null && roi >= 0 && extra >= 0;
    // The net exit already deducts selling costs; include funded costs only in the ROI denominator.
    const rawCap = available ? Math.min(view.rawCap - profit, (view.rawCap - roi / 100 * (fee + extra)) / (1 + roi / 100)) : null;
    const classified = displayModel.classifyCap(rawCap);
    const market = finite(input.rawMarket), practicalPrice = market > 0 ? market * .7 : null;
    const economicsAt = buy => {
      if (!available || finite(buy) == null || buy < 0) return null;
      const expectedProfit = view.rawCap - buy, investment = buy + fee + extra;
      return {purchasePrice:buy,expectedSale:view.rawCap + fee,expectedProfit,investment,
        expectedRoi:investment > 0 ? expectedProfit / investment * 100 : null};
    };
    return {...classified, rawCap, economics:economicsAt(classified.cap),
      minProfit:profit,minRoi:roi,investmentExtra:extra,practicalPrice,
      belowPractical:classified.cap != null && practicalPrice != null && classified.cap < practicalPrice,
      noProfitMargin:profit === 0 && roi === 0, economicsAt};
  }
  return { evaluate, evaluateReference, targetGuide, matchesCap, compareCaps, capExclusion, assertDependencies };
});
