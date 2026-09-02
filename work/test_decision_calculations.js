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
assert(stressPriceDecision.reasons.includes("弱気予測でも赤字にならない上限を反映"));

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
assert.ok(lillieStressNoLoss >= 40500 && lillieStressNoLoss <= 41500, `弱気赤字回避 ${lillieStressNoLoss}`);
assert.ok(lillieUltra >= 31500 && lillieUltra <= 32500, `超低リスク ${lillieUltra}`);
assert.ok(lillieResilience.psa9NonLossMaxPrice >= 29000 && lillieResilience.psa9NonLossMaxPrice <= 30000);
assert.ok(lillieResilience.expectedBreakEvenPrice > 0);
assert.ok(lillieResilience.breakEvenRoom.amount > 0);
assert.ok(lillieResilience.bearishExpectedProfit < 0);

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
  decisions: { profitable: go.verdict, negativeAtCurrentPrice: stop.verdict, manualReview: manualReview.verdict, dataShortage: dataShortage.verdict, capitalShortage: capitalShortage.verdict, lowQuality: lowQuality.verdict, noViablePrice: noViablePrice.verdict },
}, null, 2));
