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
  hasAnomaly: false,
  hasDataShortage: false,
  riskEligible: true,
  minExpectedProfit: 10000,
  minExpectedRoi: 30,
  minAnnualEfficiency: 40,
};
const go = model.purchaseDecision({ ...commonDecisionInput, economics });
assert.equal(go.verdict, "GO");
assert.equal(go.singleCardSpend, 30000);
assert.notEqual(go.singleCardSpend, 30000 * 10);

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

const anomaly = model.purchaseDecision({ ...commonDecisionInput, economics, hasAnomaly: true });
assert.equal(anomaly.verdict, "要確認");
assert.ok(anomaly.reasons.includes("異常値の確認が必要"));

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
  decisions: { profitable: go.verdict, negativeAtCurrentPrice: stop.verdict, anomaly: anomaly.verdict, capitalShortage: capitalShortage.verdict, lowQuality: lowQuality.verdict, noViablePrice: noViablePrice.verdict },
}, null, 2));
