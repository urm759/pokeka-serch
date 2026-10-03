const assert = require("node:assert/strict");
const model = require("../decision-model.js");
const memo = require("../purchase-memo-model.js");
const display = require("../limit-display-model.js");
const limit = { modelInput: { saleFeeRate: 8, saleExtraCost: 1000, forecastPrice: 100000 },
  assumptions: { hitRate: 0.7, lowerGradePrice: 40000, lowerGradeSource: "推定" }, stressForecastPrice: 60000,
  exitPolicy: { adoptedPolicy: "marketplace" }, finalMaxPrice: 0, capitalMaxPrice: 0 };
const before = structuredClone(limit);
const input = { limit, purchasePrice: 30000, fee: 13000, lockDays: 91, currentPrice: 110000 };
const row = memo.trial(input, model);
assert.equal(Math.round(row.rows.current.expectedProfit), 37880);
assert.equal(Math.round(row.rows.stress.expectedProfit), 5680);
assert.equal(row.lowerGradeProfit, -7200);
assert.match(row.warning, /損失保証ではありません/);
const changed = memo.trial({ ...input, purchasePrice: 35000, fee: 15000 }, model);
assert.equal(row.rows.stress.expectedProfit - changed.rows.stress.expectedProfit, 7000);
assert.deepEqual(limit, before);
const shopLimit = { ...limit, exitPolicy: { adoptedPolicy: "buyback" }, buybackExit: { scenarios: { current: { expectedSale: 80000 }, central: { expectedSale: 75000 }, stress: { expectedSale: 48000 } } } };
assert.equal(memo.trial({ ...input, limit: shopLimit }, model).rows.stress.expectedProfit, 5000);
assert.equal(memo.trial({ ...input, purchasePrice: null }, model).available, false);
assert.equal(memo.trial({ ...input, currentPrice: null }, model).available, false);
const zero = display.summarize({ limit, psa10Price: 110000 });
assert.equal(zero.stableLabel, "設定条件を満たす上限なし");
assert.match(zero.reason, /資金枠なし/);
assert.equal(display.summarize({ limit, psa10Price: null }).stableLabel, "算出不可・データ不足");
assert.deepEqual(limit, before);
console.log("memo scenarios, plan costs, zero-cap reasons and non-mutation tests passed");
