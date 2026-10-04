(function (root, factory) {
  const model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  if (root) root.PurchaseMemoModel = model;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function trial(input, model) {
    const purchase = input.purchasePrice, fee = input.fee, limit = input.limit;
    if (purchase == null || fee == null || !Number.isFinite(Number(purchase)) || Number(purchase) < 0 || !Number.isFinite(Number(fee)) || Number(fee) < 0
      || !limit?.assumptions || limit.assumptions.hitRate == null || !Number.isFinite(Number(limit.assumptions.hitRate)) || Number(limit.assumptions.hitRate) < 0 || Number(limit.assumptions.hitRate) > 1
      || limit.assumptions.lowerGradePrice == null || !Number.isFinite(Number(limit.assumptions.lowerGradePrice)) || Number(limit.assumptions.lowerGradePrice) < 0 || !(Number(input.currentPrice) > 0)) return { available: false, reason: "試算データ不足" };
    const args = { ...limit.modelInput, assumptions: limit.assumptions, purchasePrice: Number(purchase), fee: Number(fee), lockDays: input.lockDays, riskBufferPct: 0 };
    const buyback = limit.buybackExit?.scenarios || {};
    const policy = limit.exitPolicy?.adoptedPolicy || "marketplace";
    const rows = {};
    const forecastHorizonDays = Number(input.forecastHorizonDays || 91);
    const periodMatched = Number(input.lockDays) === forecastHorizonDays;
    for (const [name, price] of Object.entries({ current: input.currentPrice, central: limit.modelInput?.forecastPrice, stress: limit.stressForecastPrice })) {
      if (name !== "current" && (!periodMatched || input.forecastUnavailable)) { rows[name] = null; continue; }
      if (!(Number(price) > 0)) { rows[name] = null; continue; }
      const market = model.expectedEconomics({ ...args, forecastPrice: Number(price) });
      const sale = buyback[name === "current" ? "current" : name === "central" ? "central" : "stress"]?.expectedSale;
      const shop = sale != null && Number.isFinite(Number(sale)) ? model.economicsFromExpectedSale({ ...args, expectedSale: sale }) : null;
      rows[name] = policy === "buyback" ? shop : policy === "both" ? (shop ? (shop.expectedProfit < market.expectedProfit ? shop : market) : null) : market;
    }
    return { available: true, purchasePrice: args.purchasePrice, fee: args.fee, lockDays: args.lockDays, exitPolicy: policy, rows, forecastHorizonDays, periodMatched, forecastReferenceOnly: Boolean(input.forecastReferenceOnly),
      lowerGradeProfit: Number(limit.assumptions.lowerGradePrice) * Math.max(0, 1 - Number(args.saleFeeRate || 0) / 100) - Number(args.saleExtraCost || 0) - args.purchasePrice - args.fee,
      lowerGradeSource: limit.assumptions.lowerGradeSource,
      warning: `期待黒字は損失保証ではありません。現相場・PSA9損益は現在価格が続く仮定で、返却時の予測ではありません。${input.forecastUnavailable ? `返却${input.lockDays}日の履歴不足・算出不可。中央・ストレス損益を推定で埋めません。` : periodMatched ? `予測期間と返却目安は${forecastHorizonDays}日。${input.forecastReferenceOnly ? '期間検証不足の参考試算・仕入れ判定へ未適用。' : ''}` : `期間不一致・返却時試算不可（予測${forecastHorizonDays}日／返却${input.lockDays}日）。中央・ストレス損益は表示しません。`}一覧の計算式・上限は変更しません。` };
  }
  return { trial };
});
