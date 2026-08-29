(function attachDecisionModel(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PurchaseDecisionModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createDecisionModel() {
  const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

  function median(values) {
    const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function aggregatePrices(entries, options = {}) {
    const valid = entries
      .map((entry) => ({ ...entry, value: Number(entry.value) }))
      .filter((entry) => entry.value > 0 && Number.isFinite(entry.value));
    if (!valid.length) return { value: NaN, included: [], outliers: [] };

    const anchor = Number(options.anchor) > 0 ? Number(options.anchor) : median(valid.map((entry) => entry.value));
    const minRatio = Number(options.minRatio ?? 0.55);
    const maxRatio = Number(options.maxRatio ?? 1.8);
    let included = valid.filter((entry) => entry.allowAnchor || (entry.value / anchor >= minRatio && entry.value / anchor <= maxRatio));
    let outliers = valid.filter((entry) => !included.includes(entry));
    return {
      value: included.length ? median(included.map((entry) => entry.value)) : NaN,
      included,
      outliers,
      anchor,
    };
  }

  function capitalPlan(settings) {
    const totalCapital = Math.max(0, Number(settings.totalCapital || 0));
    const lockedCapital = Math.max(0, Number(settings.lockedCapital || 0));
    const gradingReserve = Math.max(0, Number(settings.gradingReserve || 0));
    const submissionCount = Math.max(1, Math.floor(Number(settings.submissionCount || 1)));
    const fee = Math.max(0, Number(settings.fee || 0));
    const availableCapital = Math.max(0, totalCapital - lockedCapital - gradingReserve);
    const requiredReserve = fee * submissionCount;
    return {
      totalCapital,
      lockedCapital,
      gradingReserve,
      availableCapital,
      submissionCount,
      requiredReserve,
      reserveSufficient: gradingReserve >= requiredReserve,
      perCardBatchCap: availableCapital / submissionCount,
    };
  }

  function gradeAssumptions(input) {
    const conditionFactor = input.condition === "scratch" ? 0.55 : 1;
    const officialRate = Number(input.officialRate);
    const hasOfficialRate = Number.isFinite(officialRate) && officialRate >= 0;
    const baseRate = hasOfficialRate ? officialRate / 100 : Number(input.fallbackRate || 0.7);
    const actualPsa9 = Number(input.psa9Price);
    const fallbackLowerGrade = Number(input.fallbackLowerGradePrice || 0);
    const lowerGradeBase = actualPsa9 > 0
      ? Math.min(actualPsa9, Number(input.forecastPrice || actualPsa9) * 0.95)
      : fallbackLowerGrade;
    return {
      hitRate: clamp(baseRate * conditionFactor, 0.01, 0.98),
      hitRateSource: hasOfficialRate ? "PSA公式取得率" : String(input.fallbackLabel || "設定取得率"),
      lowerGradePrice: Math.max(0, lowerGradeBase * (input.condition === "scratch" ? 0.8 : 1)),
      lowerGradeSource: actualPsa9 > 0 ? "PSA9市場価格" : "平均美品の75%推定",
    };
  }

  function expectedEconomics(input) {
    const purchasePrice = Math.max(0, Number(input.purchasePrice || 0));
    const fee = Math.max(0, Number(input.fee || 0));
    const saleMultiplier = Math.max(0, 1 - Number(input.saleFeeRate || 0) / 100);
    const saleExtraCost = Math.max(0, Number(input.saleExtraCost || 0));
    const riskMultiplier = Math.max(0, 1 - Number(input.riskBufferPct || 0) / 100);
    const psa10Net = Number(input.forecastPrice || 0) * saleMultiplier - saleExtraCost;
    const lowerGradeNet = Number(input.assumptions.lowerGradePrice || 0) * saleMultiplier - saleExtraCost;
    const expectedSaleBeforeRisk = input.assumptions.hitRate * psa10Net + (1 - input.assumptions.hitRate) * lowerGradeNet;
    const expectedSale = expectedSaleBeforeRisk * riskMultiplier;
    const expectedProfit = expectedSale - purchasePrice - fee;
    const investment = purchasePrice + fee;
    const expectedRoi = investment > 0 ? expectedProfit / investment * 100 : NaN;
    const annualEfficiency = investment > 0 && Number(input.lockDays) > 0 ? expectedRoi * 365 / Number(input.lockDays) : NaN;
    return { purchasePrice, psa10Net, lowerGradeNet, expectedSaleBeforeRisk, expectedSale, expectedProfit, expectedRoi, annualEfficiency };
  }

  function maxBuyPrice(input) {
    const zeroPurchase = expectedEconomics({ ...input, purchasePrice: 0 });
    const annualRequiredRoi = Number(input.lockDays) > 0 ? Number(input.minAnnualEfficiency || 0) * Number(input.lockDays) / 365 : 0;
    const requiredRoi = Math.max(0, Number(input.minExpectedRoi || 0), annualRequiredRoi) / 100;
    const roiCap = (zeroPurchase.expectedSale - Number(input.fee || 0) * (1 + requiredRoi)) / (1 + requiredRoi);
    const profitCap = zeroPurchase.expectedSale - Number(input.fee || 0) - Number(input.minExpectedProfit || 0);
    const capital = input.capital || capitalPlan(input);
    const shareCap = Math.max(0, Number(input.totalCapital || capital.totalCapital) * Number(input.maxCapitalShare || 100) / 100);
    const rawMax = Math.min(roiCap, profitCap, capital.perCardBatchCap, shareCap);
    const step = Math.max(1, Number(input.step || 500));
    return Math.max(0, Math.floor(rawMax / step) * step);
  }

  function purchaseDecision(input) {
    const reasons = [];
    const economics = input.economics;
    const capital = input.capital;
    const purchasePrice = Number(economics.purchasePrice || 0);
    const plannedBatchSpend = purchasePrice * capital.submissionCount;
    if (economics.expectedProfit < 0) reasons.push("期待利益がマイナス");
    else if (economics.expectedProfit < Number(input.minExpectedProfit || 0)) reasons.push("最低期待利益を未達");
    if (economics.expectedRoi < Number(input.minExpectedRoi || 0)) reasons.push("最低期待利益率を未達");
    if (economics.annualEfficiency < Number(input.minAnnualEfficiency || 0)) reasons.push("最低年換算効率を未達");
    if (plannedBatchSpend > capital.availableCapital) reasons.push("同時提出分の仕入れ総額が使用可能資金を超過");
    if (!capital.reserveSufficient) reasons.push("鑑定費予備資金が不足");
    if (input.hasAnomaly) reasons.push("異常値の確認が必要");

    let verdict = "見送り";
    if (economics.expectedProfit >= 0 && Number(input.maxBuyPrice || 0) > 0) {
      const fullyEligible = purchasePrice <= Number(input.maxBuyPrice)
        && reasons.length === 0
        && Number(input.qualityScore || 0) >= 60;
      verdict = fullyEligible ? "GO" : "価格次第";
    }
    if (economics.expectedProfit < 0 || !capital.reserveSufficient || capital.availableCapital <= 0) verdict = "見送り";
    return { verdict, reasons, plannedBatchSpend, availableCapital: capital.availableCapital };
  }

  return { aggregatePrices, capitalPlan, expectedEconomics, gradeAssumptions, maxBuyPrice, median, purchaseDecision };
});
