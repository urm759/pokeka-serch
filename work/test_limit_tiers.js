const assert = require("assert");
const model = require("../decision-model.js");

const assumptions = {
  hitRate: 0.845217549,
  lowerGradePrice: 28000,
  hitRateSource: "PSA公式取得率",
  lowerGradeSource: "PSA9実成約",
};
const common = {
  assumptions,
  fee: 12980,
  saleFeeRate: 0,
  saleExtraCost: 0,
  lockDays: 97,
  step: 500,
};

const centralPrice = 45750;
const stressPrice = 34500;
const normalLimit = model.targetProfitMaxBuyPrice({ ...common, forecastPrice: centralPrice }, 10000);
const stressBreakEvenLimit = model.targetProfitMaxBuyPrice({ ...common, forecastPrice: stressPrice }, 0);
const stressAt17000 = model.expectedEconomics({ ...common, purchasePrice: 17000, forecastPrice: stressPrice });
const resilienceAt17000 = model.resilienceMetrics({
  ...common,
  purchasePrice: 17000,
  currentPsa10Price: 50900,
  bearishPsa10Price: stressPrice,
  targetProfit: 10000,
});
const operational = model.operationalCap({
  theoreticalCap: normalLimit,
  asOfDate: "2026-09-12",
  history: [{ date: "2026-09-11", theoretical: 15000, operational: 15000 }],
});
const aggressive = model.aggressivePurchaseZone({
  offer: { value: 17000, fresh: true, available: true },
  operationalLimit: operational.operational,
  stressBreakEvenLimit,
  centralExpectedProfit: model.expectedEconomics({ ...common, purchasePrice: 17000, forecastPrice: centralPrice }).expectedProfit,
  stressExpectedProfit: stressAt17000.expectedProfit,
  psa9Profit: resilienceAt17000.psa9Profit,
});

assert.strictEqual(normalLimit, 20000, "中央予測の目標利益上限");
assert.strictEqual(stressBreakEvenLimit, 20500, "供給ストレス期待損益0円上限");
assert.strictEqual(Math.floor(resilienceAt17000.psa9NonLossMaxPrice / 500) * 500, 15000, "PSA9赤字回避上限");
assert.strictEqual(operational.operational, 15000, "過去上限からの平滑化");
assert(Math.abs(stressAt17000.expectedProfit - 3504) < 80, `17,000円時の供給ストレス利益: ${stressAt17000.expectedProfit}`);
assert.strictEqual(Math.round(resilienceAt17000.psa9Profit), -1980, "17,000円時のPSA9損益");
assert.strictEqual(aggressive.eligible, true, "攻め仕入れ圏");
assert.strictEqual(aggressive.excludedFromNormalGo, true, "通常GOへ混入しない");

const estimated = model.resolvePsa9Price({ fallbackPrice: 21000 });
const actual = model.resolvePsa9Price({ directPrice: 28000, directCount: 3, directKind: "actual" });
assert.strictEqual(estimated.measurementType, "estimate");
assert.strictEqual(estimated.count, 0);
assert.strictEqual(actual.measurementType, "actual");
assert.strictEqual(actual.count, 3);

console.log(JSON.stringify({ normalLimit, stressBreakEvenLimit, psa9NonLossLimit: 15000, operationalLimit: operational.operational, stressProfitAt17000: Math.round(stressAt17000.expectedProfit), psa9ProfitAt17000: Math.round(resilienceAt17000.psa9Profit), aggressive: aggressive.eligible }));
