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
assert.equal(capitalLimitedMax, 27000);

const prices = model.aggregatePrices([
  { source: "みんトレ", value: 30000, allowAnchor: true },
  { source: "カードラッシュ", value: 32000 },
  { source: "単独店舗", value: 100000 },
], { anchor: 30000, minRatio: 0.55, maxRatio: 1.8 });
assert.equal(prices.value, 31000);
assert.equal(prices.outliers.length, 1);
assert.equal(prices.outliers[0].source, "単独店舗");

const generousCapital = model.capitalPlan({ totalCapital: 1000000, lockedCapital: 0, gradingReserve: 130000, submissionCount: 10, fee: 13000 });
const commonDecisionInput = {
  capital: generousCapital,
  maxBuyPrice: 40000,
  qualityScore: 75,
  hasAnomaly: false,
  minExpectedProfit: 10000,
  minExpectedRoi: 30,
  minAnnualEfficiency: 40,
};
const go = model.purchaseDecision({ ...commonDecisionInput, economics });
assert.equal(go.verdict, "GO");

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
assert.equal(stop.verdict, "見送り");

console.log(JSON.stringify({
  capital: { available: capital.availableCapital, perCardForTen: capital.perCardBatchCap, maxBuyAfterBatchLimit: capitalLimitedMax },
  economics: { expectedSale: economics.expectedSale, expectedProfit: economics.expectedProfit, expectedRoi: Number(economics.expectedRoi.toFixed(1)) },
  outlier: { median: prices.value, excluded: prices.outliers[0] },
  decisions: { profitable: go.verdict, negativeProfit: stop.verdict },
}, null, 2));
