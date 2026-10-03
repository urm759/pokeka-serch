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
    for (const [name, price] of Object.entries({ current: input.currentPrice, central: limit.modelInput?.forecastPrice, stress: limit.stressForecastPrice })) {
      if (!(Number(price) > 0)) { rows[name] = null; continue; }
      const market = model.expectedEconomics({ ...args, forecastPrice: Number(price) });
      const sale = buyback[name === "current" ? "current" : name === "central" ? "central" : "stress"]?.expectedSale;
      const shop = sale != null && Number.isFinite(Number(sale)) ? model.economicsFromExpectedSale({ ...args, expectedSale: sale }) : null;
      rows[name] = policy === "buyback" ? shop : policy === "both" ? (shop ? (shop.expectedProfit < market.expectedProfit ? shop : market) : null) : market;
    }
    return { available: true, purchasePrice: args.purchasePrice, fee: args.fee, lockDays: args.lockDays, exitPolicy: policy, rows,
      lowerGradeProfit: Number(limit.assumptions.lowerGradePrice) * Math.max(0, 1 - Number(args.saleFeeRate || 0) / 100) - Number(args.saleExtraCost || 0) - args.purchasePrice - args.fee,
      lowerGradeSource: limit.assumptions.lowerGradeSource,
      warning: "期待黒字は損失保証ではありません。PSA9以下・鑑定失敗・売価下落で赤字になる場合があります。価格は既存91日予測の仮定で、選択プラン納期への再予測はしません。一覧の判定・上限は変更しません。" };
  }
  return { trial };
});
