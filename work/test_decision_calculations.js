const assert = require("node:assert/strict");
const model = require("../decision-model.js");

const capital = model.capitalPlan({
  totalCapital: 500000,
  lockedCapital: 100000,
  gradingReserve: 130000,
  submissionCount: 10,
  fee: 12980,
});
assert.equal(capital.availableCapital, 270000);
assert.equal(capital.perCardBatchCap, 27000);
assert.equal(capital.requiredReserve, 129800);
assert.equal(capital.reserveSufficient, true);
assert.equal(capital.singleCardReserveSufficient, true);

const assumptions = model.gradeAssumptions({
  condition: "clean",
  officialRate: 70,
  fallbackRate: 0.5,
  psa9Price: 30000,
  fallbackLowerGradePrice: 20000,
  forecastPrice: 100000,
});
assert.equal(assumptions.hitRate, 0.7);
assert.equal(assumptions.lowerGradePrice, 30000);
assert.equal(assumptions.lowerGradeSource, "PSA9市場価格");

const economics = model.expectedEconomics({
  purchasePrice: 30000,
  forecastPrice: 100000,
  assumptions,
  fee: 13000,
  saleFeeRate: 10,
  saleExtraCost: 1000,
  riskBufferPct: 0,
  lockDays: 91,
});
assert.equal(economics.expectedSale, 70100);
assert.equal(economics.expectedProfit, 27100);
assert.ok(Math.abs(economics.expectedRoi - 63.0232558) < 0.0001);

const economicsWithOverseasReference = model.expectedEconomics({
  purchasePrice: 30000,
  forecastPrice: 100000,
  assumptions,
  fee: 13000,
  saleFeeRate: 10,
  saleExtraCost: 1000,
  riskBufferPct: 0,
  lockDays: 91,
  pokedataReference: { ebayPsa10MedianJpy: 1, referenceOnly: true },
});
assert.deepEqual(economicsWithOverseasReference, economics, "海外参考価格を仕入れ計算へ混入させない");

const capitalLimitedMax = model.maxBuyPrice({
  forecastPrice: 100000,
  assumptions,
  fee: 12980,
  saleFeeRate: 10,
  saleExtraCost: 1000,
  riskBufferPct: 0,
  lockDays: 91,
  minExpectedProfit: 10000,
  minExpectedRoi: 30,
  minAnnualEfficiency: 40,
  maxCapitalShare: 100,
  totalCapital: 500000,
  capital,
  step: 500,
});
assert.ok(capitalLimitedMax > capital.perCardBatchCap);
assert.equal(model.capitalLimits({ capital, maxCapitalShare: 100 }).practicalCap, 270000);
const displayedCaps = model.purchaseCaps({ capital, economicMaxPrice: capitalLimitedMax, maxCapitalShare: 100 });
assert.equal(displayedCaps.economicMaxPrice, capitalLimitedMax);
assert.equal(displayedCaps.capitalMaxPrice, 270000);
assert.equal(displayedCaps.finalMaxPrice, capitalLimitedMax);
const stressLimitedCaps = model.purchaseCaps({ capital, economicMaxPrice: 50000, stressMaxPrice: 38000, maxCapitalShare: 100 });
assert.equal(stressLimitedCaps.normalMaxPrice, 50000);
assert.equal(stressLimitedCaps.stressMaxPrice, 38000);
assert.equal(stressLimitedCaps.finalMaxPrice, 38000);
assert.equal(stressLimitedCaps.limitingFactor, "stress-break-even");
assert.equal(stressLimitedCaps.supplyRiskReflected, false);
const alreadySafeCaps = model.purchaseCaps({ capital, economicMaxPrice: 35000, stressMaxPrice: 38000, maxCapitalShare: 100 });
assert.equal(alreadySafeCaps.finalMaxPrice, 35000);
assert.equal(alreadySafeCaps.limitingFactor, "normal-economics");
assert.equal(alreadySafeCaps.supplyRiskReflected, true, "既存上限が厳しい場合は供給リスクを二重控除しない");
const capitalAlreadySafeCaps = model.purchaseCaps({ capital, economicMaxPrice: 300000, stressMaxPrice: 280000, maxCapitalShare: 100 });
assert.equal(capitalAlreadySafeCaps.finalMaxPrice, 270000);
assert.equal(capitalAlreadySafeCaps.limitingFactor, "capital");
assert.equal(capitalAlreadySafeCaps.supplyRiskReflected, true, "資金上限がストレス上限以下なら追加控除しない");
assert.equal(model.purchaseLimitMarketRatio(7000, 10000), 70);
assert.equal(model.purchaseLimitMarketRatio(0, 10000), 0);
assert.equal(model.purchaseLimitMarketRatio(7000, 0), null);
assert.equal(model.matchConfidenceLabel(85), "high");
assert.equal(model.matchConfidenceLabel(84), "low");
assert.equal(model.isSuspectedCardMismatch({ matchConfidence: "low", matchScore: 85 }), false);
assert.equal(model.isSuspectedCardMismatch({ matchConfidence: "low", matchScore: 84 }), true);
assert.equal(model.isSuspectedCardMismatch({ matchStatus: "mismatch", matchScore: 100 }), true);

const prices = model.aggregatePrices([
  { source: "みんトレ", value: 30000 },
  { source: "カードラッシュ", value: 32000 },
  { source: "単独店舗", value: 100000 },
], { minRatio: 0.55, maxRatio: 1.8 });
assert.equal(prices.value, 31000);
assert.equal(prices.outliers.length, 1);
assert.equal(prices.outliers[0].source, "単独店舗");
assert.equal(prices.strategy, "多数価格帯");

const majorityPrices = model.aggregatePrices([
  { source: "みんトレ", value: 30000 },
  { source: "店舗A", value: 100000 },
  { source: "店舗B", value: 102000 },
]);
assert.equal(majorityPrices.value, 101000);
assert.equal(majorityPrices.outliers[0].source, "みんトレ");

const splitPrices = model.aggregatePrices([
  { source: "店舗A", value: 30000 },
  { source: "店舗B", value: 32000 },
  { source: "店舗C", value: 100000 },
  { source: "店舗D", value: 102000 },
]);
assert.equal(splitPrices.conflicted, true);
assert.equal(splitPrices.outliers.length, 0);

const auditedPrices = model.aggregatePrices([
  { source: "最新A", value: 30000, updatedAt: "2026-09-03", conditionAccepted: true },
  { source: "最新B", value: 32000, updatedAt: "2026-09-02", conditionAccepted: true },
  { source: "古すぎ", value: 31000, updatedAt: "2026-06-01", conditionAccepted: true },
  { source: "傷あり", value: 15000, updatedAt: "2026-09-03", conditionAccepted: false },
], { asOfDate: "2026-09-04", staleAfterDays: 14, excludeAfterDays: 45 });
assert.equal(auditedPrices.value, 31000);
assert.equal(auditedPrices.included.length, 2);
assert.equal(auditedPrices.excluded.length, 2);
assert.ok(auditedPrices.excluded.some((entry) => entry.excludedReasons.includes("美品・状態A以外")));
assert.ok(auditedPrices.excluded.some((entry) => entry.excludedReasons.includes("更新95日前")));

const psa9Direct = model.resolvePsa9Price({ directPrice: 42000, directCount: 3, fallbackPrice: 10000 });
assert.equal(psa9Direct.value, 42000);
assert.equal(psa9Direct.estimated, false);
const psa9ThirtyDay = model.resolvePsa9Price({
  asOfDate: "2026-09-04",
  trades: [
    { price: 39000, date: "2026-08-20" },
    { price: 41000, date: "2026-09-01" },
    { price: 120000, date: "2026-08-25" },
  ],
  fallbackPrice: 15000,
});
assert.equal(psa9ThirtyDay.value, 40000);
assert.equal(psa9ThirtyDay.estimated, false);
assert.equal(psa9ThirtyDay.periodDays, 30);
const psa9Cohort = model.resolvePsa9Price({ psa10Price: 100000, cohortRatio: 0.62, cohortCount: 15, fallbackPrice: 30000 });
assert.equal(psa9Cohort.value, 62000);
assert.equal(psa9Cohort.source, "年代・価格帯・レアリティ別PSA10比率");
const psa9Fallback = model.resolvePsa9Price({ psa10Price: 100000, cohortRatio: 0.62, cohortCount: 5, fallbackPrice: 30000 });
assert.equal(psa9Fallback.value, 30000);
assert.equal(psa9Fallback.estimated, true);

const initialOperational = model.operationalCap({ theoreticalCap: 63400, history: [] });
assert.equal(initialOperational.operational, 62500);
assert.equal(initialOperational.provisional, true);
assert.equal(initialOperational.initial, true);
assert.equal(initialOperational.previous, null);
assert.equal(initialOperational.previousDate, null);
assert.equal(initialOperational.initialSafetyFactor, 1);
assert.equal(initialOperational.smoothing, "平滑化なし");
assert.notEqual(initialOperational.operational, 50000, "初回上限へ固定5万円を混入しない");
const loweredOperational = model.operationalCap({ theoreticalCap: 35000, history: [{ date: "2026-09-03", theoretical: 40000, operational: 40000 }] });
assert.equal(loweredOperational.operational, 35000);
assert.equal(loweredOperational.reason, "危険方向のため上限引き下げを即時反映");
assert.equal(loweredOperational.initial, false);
assert.equal(loweredOperational.previousDate, "2026-09-03");
const deadbandOperational = model.operationalCap({ theoreticalCap: 41000, history: [{ date: "2026-09-03", theoretical: 40000, operational: 40000 }] });
assert.equal(deadbandOperational.operational, 40000);
const confirmedRaise = model.operationalCap({ theoreticalCap: 47000, history: [
  { date: "2026-09-01", theoretical: 45000, operational: 40000 },
  { date: "2026-09-02", theoretical: 46000, operational: 40000 },
] });
assert.equal(confirmedRaise.operational, 45000);
assert.equal(confirmedRaise.reason, "安全な理論上限の継続を確認して値上げ");

const operationalCaps = model.purchaseCaps({ capital, economicMaxPrice: 50000, stressBreakEvenMaxPrice: 48000, operationalMaxPrice: 44000, maxCapitalShare: 100 });
assert.equal(operationalCaps.finalMaxPrice, 44000);
assert.equal(operationalCaps.limitingFactor, "operational");

const generousCapital = model.capitalPlan({ totalCapital: 1000000, lockedCapital: 0, gradingReserve: 130000, submissionCount: 10, fee: 13000 });
const commonDecisionInput = {
  capital: generousCapital,
  economicMaxPrice: 40000,
  qualityScore: 75,
  requiresManualReview: false,
  manualReviewReasons: [],
  dataShortageReasons: [],
  riskEligible: true,
  minExpectedProfit: 10000,
  minExpectedRoi: 30,
  minAnnualEfficiency: 40,
};
const go = model.purchaseDecision({ ...commonDecisionInput, economics });
assert.equal(go.verdict, "GO");
assert.equal(go.singleCardSpend, 30000);
assert.notEqual(go.singleCardSpend, 30000 * 10);
const stressPriceDecision = model.purchaseDecision({ ...commonDecisionInput, economics, economicMaxPrice: 40000, stressMaxPrice: 28000 });
assert.equal(stressPriceDecision.verdict, "価格次第");
assert.equal(stressPriceDecision.finalMaxPrice, 28000);
assert(stressPriceDecision.reasons.includes("供給ストレス時でも赤字にならない上限を反映"));

const belowLimitButLowRoi = model.purchaseDecision({
  ...commonDecisionInput,
  economicMaxPrice: 40000,
  operationalMaxPrice: 40000,
  economics: { ...economics, purchasePrice: 36000, expectedProfit: 12000, expectedRoi: 24.7, annualEfficiency: 99 },
});
assert.equal(belowLimitButLowRoi.verdict, "価格次第");
assert(belowLimitButLowRoi.reasons.includes("最低期待利益率を未達"));
assert(belowLimitButLowRoi.reasons.includes("価格条件は通過・利益条件の再調整が必要"));

const lillieAssumptions = {
  hitRate: 0.779,
  lowerGradePrice: 46000,
};
const lillieBase = {
  assumptions: lillieAssumptions,
  fee: 12980,
  saleFeeRate: 8,
  saleExtraCost: 0,
  riskBufferPct: 0,
  lockDays: 91,
  step: 500,
};
const lillieNormal = model.targetProfitMaxBuyPrice({ ...lillieBase, forecastPrice: 102700 }, 9000);
const lillieStressNoLoss = model.targetProfitMaxBuyPrice({ ...lillieBase, forecastPrice: 62500 }, 0);
const lillieUltra = model.targetProfitMaxBuyPrice({ ...lillieBase, forecastPrice: 62500 }, 9000);
const lillieResilience = model.resilienceMetrics({
  ...lillieBase,
  forecastPrice: 102700,
  purchasePrice: 61400,
  currentPsa10Price: 109900,
  bearishPsa10Price: 62500,
  targetProfit: 9000,
});
assert.ok(lillieNormal >= 60000 && lillieNormal <= 61500, `通常上限 ${lillieNormal}`);
assert.ok(lillieStressNoLoss >= 40500 && lillieStressNoLoss <= 41500, `供給ストレス時赤字回避 ${lillieStressNoLoss}`);
assert.ok(lillieUltra >= 31500 && lillieUltra <= 32500, `超低リスク ${lillieUltra}`);
assert.ok(lillieResilience.psa9NonLossMaxPrice >= 29000 && lillieResilience.psa9NonLossMaxPrice <= 30000);
assert.ok(lillieResilience.expectedBreakEvenPrice > 0);
assert.ok(lillieResilience.breakEvenRoom.amount > 0);
assert.ok(lillieResilience.bearishExpectedProfit < 0);

const lillieScenarioMatrix = model.economicsScenarioMatrix({
  ...lillieBase,
  currentPurchasePrice: 61400,
  storeOfferPrice: 50000,
  operationalLimitPrice: 41000,
  currentPsa10Price: 109900,
  centralForecastPrice: 102700,
  supplyStressPrice: 62500,
});
for (const saleKey of ["currentMarket", "centralForecast", "supplyStress"]) {
  const atCurrent = lillieScenarioMatrix.currentPurchase[saleKey];
  const atLimit = lillieScenarioMatrix.operationalLimit[saleKey];
  const expectedAtLimit = atCurrent.expectedProfit - (41000 - 61400);
  assert.ok(Math.abs(atLimit.expectedProfit - expectedAtLimit) < 0.000001, `${saleKey}の仕入値差分が一致`);
}
assert.ok(lillieScenarioMatrix.storeOffer.centralForecast.expectedProfit > lillieScenarioMatrix.currentPurchase.centralForecast.expectedProfit);
assert.ok(lillieScenarioMatrix.storeOffer.centralForecast.expectedProfit < lillieScenarioMatrix.operationalLimit.centralForecast.expectedProfit);
assert.ok(lillieScenarioMatrix.currentPurchase.currentMarket.expectedProfit > lillieScenarioMatrix.currentPurchase.centralForecast.expectedProfit);
assert.ok(lillieScenarioMatrix.currentPurchase.centralForecast.expectedProfit > lillieScenarioMatrix.currentPurchase.supplyStress.expectedProfit);

const verifiedAvailability = model.purchaseAvailability({
  marketPrice: 45000,
  finalLimit: 50000,
  offer: { source: "店舗A", value: 48000, fresh: true, available: true },
  verdict: "GO",
});
assert.equal(verifiedAvailability.marketWithinLimit, true);
assert.equal(verifiedAvailability.verifiedNow, true);
assert.equal(verifiedAvailability.label, "購入先確認済み／今すぐ仕入れ");
const marketOnlyAvailability = model.purchaseAvailability({ marketPrice: 45000, finalLimit: 50000, verdict: "GO" });
assert.equal(marketOnlyAvailability.verifiedNow, false);
assert.equal(marketOnlyAvailability.label, "相場基準では仕入れ圏");
const staleAvailability = model.purchaseAvailability({
  marketPrice: 45000,
  finalLimit: 50000,
  offer: { source: "店舗A", value: 48000, fresh: false, available: true },
  verdict: "GO",
});
assert.equal(staleAvailability.verifiedNow, false);
const unavailableOffer = model.purchaseAvailability({
  marketPrice: 45000,
  finalLimit: 50000,
  offer: { source: "店舗A", value: 48000, fresh: true, available: false },
  verdict: "GO",
});
assert.equal(unavailableOffer.verifiedNow, false);
const reviewAvailability = model.purchaseAvailability({
  marketPrice: 45000,
  finalLimit: 50000,
  offer: { source: "店舗A", value: 48000, fresh: true, available: true },
  verdict: "要確認",
  priceReviewRequired: true,
});
assert.equal(reviewAvailability.verifiedNow, false);
assert.equal(reviewAvailability.label, "価格要確認");
const lillieFullForceStoreEconomics = model.expectedEconomics({
  purchasePrice: 36000,
  forecastPrice: 70000,
  assumptions: { hitRate: 0.6, lowerGradePrice: 38000 },
  fee: 12980,
  saleFeeRate: 8,
  saleExtraCost: 0,
  riskBufferPct: 0,
  lockDays: 91,
});
const lillieFullForceDecision = model.purchaseDecision({
  ...commonDecisionInput,
  economics: lillieFullForceStoreEconomics,
  operationalMaxPrice: 37500,
});
const lillieFullForceAvailability = model.purchaseAvailability({
  marketPrice: 33500,
  finalLimit: 37500,
  offer: { source: "晴れる屋2状態A", value: 36000, fresh: true, available: true },
  verdict: lillieFullForceDecision.verdict,
  decisionReasons: lillieFullForceDecision.reasons,
});
assert.equal(lillieFullForceDecision.verdict, "価格次第");
assert.equal(lillieFullForceAvailability.offerWithinLimit, true);
assert.equal(lillieFullForceAvailability.verifiedNow, false);
assert.equal(lillieFullForceAvailability.label, "価格は仕入れ圏／利益・判定条件未達");
assert.equal(model.bargainDecisionEligible({ verdict: "見送り", goConfidence: "GO・高リスク" }), false);
assert.equal(model.bargainDecisionEligible({ verdict: "価格次第" }), true);
assert.equal(model.bargainDecisionEligible({ verdict: "GO", goConfidence: "暫定GO" }), true);

const concentration = model.operationalCapConcentration([50000, 50000, 62500, 41000, 50000, 0, null]);
assert.deepEqual(concentration, { price: 50000, count: 3, total: 5, sharePct: 60 });

const lillieCurrentAtFinal = model.expectedEconomics({ ...lillieBase, forecastPrice: 109900, purchasePrice: lillieStressNoLoss });
const lillieStressAtFinal = model.expectedEconomics({ ...lillieBase, forecastPrice: 62500, purchasePrice: lillieStressNoLoss });
const lillieStressAtUltra = model.expectedEconomics({ ...lillieBase, forecastPrice: 62500, purchasePrice: lillieUltra });
assert.ok(lillieCurrentAtFinal.expectedProfit > lillieStressAtFinal.expectedProfit);
assert.ok(lillieStressAtFinal.expectedProfit >= 0 && lillieStressAtFinal.expectedProfit < 500, `最終上限・供給ストレス ${lillieStressAtFinal.expectedProfit}`);
assert.ok(lillieStressAtUltra.expectedProfit >= 9000 && lillieStressAtUltra.expectedProfit < 9500, `超低リスク・供給ストレス ${lillieStressAtUltra.expectedProfit}`);

const lillieCaps = model.purchaseCaps({
  capital: generousCapital,
  economicMaxPrice: lillieNormal,
  stressBreakEvenMaxPrice: lillieStressNoLoss,
  ultraLowRiskMaxPrice: lillieUltra,
  maxCapitalShare: 100,
});
assert.equal(lillieCaps.finalMaxPrice, lillieStressNoLoss);
const lillieLowRiskCaps = model.purchaseCaps({
  capital: generousCapital,
  economicMaxPrice: lillieNormal,
  stressBreakEvenMaxPrice: lillieStressNoLoss,
  ultraLowRiskMaxPrice: lillieUltra,
  lowRiskMode: true,
  maxCapitalShare: 100,
});
assert.equal(lillieLowRiskCaps.finalMaxPrice, lillieUltra);
assert.equal(lillieLowRiskCaps.limitingFactor, "ultra-low-risk");

const portfolioStress = model.portfolioStress([{
  ...lillieBase,
  purchasePrice: 41000,
  currentPsa10Price: 109900,
  quantity: 2,
}], [10, 20, 30, 40, 50]);
assert.equal(portfolioStress.length, 5);
assert.ok(portfolioStress.every((row) => Number.isFinite(row.expectedProfit) && Number.isFinite(row.requiredReserve)));
assert.ok(portfolioStress[0].expectedProfit > portfolioStress[4].expectedProfit);
assert.ok(portfolioStress[4].requiredReserve >= portfolioStress[0].requiredReserve);
const invalidStress = model.portfolioStress([{ purchasePrice: NaN, currentPsa10Price: Infinity, assumptions: lillieAssumptions }]);
assert.ok(invalidStress.every((row) => Number.isFinite(row.expectedProfit) && Number.isFinite(row.lossTotal)));

const oneCardPortfolio = model.portfolioPlan([{ price: 30000, quantity: 1 }], generousCapital);
const repeatedCardPortfolio = model.portfolioPlan([{ price: 30000, quantity: 3 }], generousCapital);
assert.equal(oneCardPortfolio.totalPurchase, 30000);
assert.equal(repeatedCardPortfolio.totalPurchase, 90000);

const lossEconomics = model.expectedEconomics({
  purchasePrice: 80000,
  forecastPrice: 70000,
  assumptions,
  fee: 13000,
  saleFeeRate: 10,
  saleExtraCost: 1000,
  riskBufferPct: 0,
  lockDays: 91,
});
const stop = model.purchaseDecision({ ...commonDecisionInput, economics: lossEconomics });
assert.ok(lossEconomics.expectedProfit < 0);
assert.equal(stop.verdict, "価格次第");
const noViablePrice = model.purchaseDecision({ ...commonDecisionInput, economicMaxPrice: 0, economics: lossEconomics });
assert.equal(noViablePrice.verdict, "見送り");

const manualReview = model.purchaseDecision({ ...commonDecisionInput, economics, requiresManualReview: true, manualReviewReasons: ["状態A価格が対立"] });
assert.equal(manualReview.verdict, "要確認");
assert.ok(manualReview.reasons.includes("状態A価格が対立"));

const dataShortage = model.purchaseDecision({ ...commonDecisionInput, economics, dataShortageReasons: ["PSA公式未取得"] });
assert.equal(dataShortage.verdict, "GO");
assert.ok(dataShortage.reasons.includes("データ不足（PSA公式未取得）"));

const shortCapital = model.capitalPlan({ totalCapital: 50000, lockedCapital: 10000, gradingReserve: 13000, submissionCount: 10, fee: 13000 });
const capitalShortage = model.purchaseDecision({ ...commonDecisionInput, capital: shortCapital, economics });
assert.equal(capitalShortage.verdict, "資金不足");
assert.equal(capitalShortage.capitalMaxPrice, 27000);
assert.equal(capitalShortage.finalMaxPrice, 27000);

const lowQuality = model.purchaseDecision({ ...commonDecisionInput, economics, qualityScore: 59 });
assert.equal(lowQuality.verdict, "見送り");
assert.ok(lowQuality.reasons.includes("銘柄品質60点未満（59/100）"));

console.log(JSON.stringify({
  capital: { available: capital.availableCapital, perCardForTen: capital.perCardBatchCap, singleCardSpend: go.singleCardSpend, selectedThreeCopies: repeatedCardPortfolio.totalPurchase },
  economics: { expectedSale: economics.expectedSale, expectedProfit: economics.expectedProfit, expectedRoi: Number(economics.expectedRoi.toFixed(1)) },
  outlier: { median: prices.value, excluded: prices.outliers[0], majorityMedian: majorityPrices.value },
  lillie: { normal: lillieNormal, stressNoLoss: lillieStressNoLoss, ultraLowRisk: lillieUltra, psa9NoLoss: Math.floor(lillieResilience.psa9NonLossMaxPrice / 500) * 500, bearishExpectedProfitAtCurrentRaw: Math.round(lillieResilience.bearishExpectedProfit) },
  scenarios: Object.fromEntries(Object.entries(lillieScenarioMatrix).map(([purchaseKey, scenarios]) => [purchaseKey, Object.fromEntries(Object.entries(scenarios).map(([saleKey, result]) => [saleKey, { expectedProfit: Math.round(result.expectedProfit), expectedRoi: Number(result.expectedRoi.toFixed(1)) }]))])),
  availability: { verified: verifiedAvailability.label, marketOnly: marketOnlyAvailability.label, review: reviewAvailability.label },
  representativeReasons: { verifiedOffer: verifiedAvailability.reason, marketOnly: marketOnlyAvailability.reason, initialLimit: initialOperational.reason, priceConditional: stressPriceDecision.reasons },
  operationalAudit: { initial: initialOperational, concentration },
  decisions: { profitable: go.verdict, negativeAtCurrentPrice: stop.verdict, manualReview: manualReview.verdict, dataShortage: dataShortage.verdict, capitalShortage: capitalShortage.verdict, lowQuality: lowQuality.verdict, noViablePrice: noViablePrice.verdict },
}, null, 2));
