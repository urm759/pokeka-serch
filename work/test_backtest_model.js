const assert = require("assert");
const model = require("../backtest-model.js");

function unsafe(value) {
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(unsafe);
  if (value && typeof value === "object") return Object.values(value).some(unsafe);
  return false;
}

const forecast = model.standardForecast({
  marketPrice: 100000, purchasePrice: 50000, change30: -5,
  floorScore: 72, demandScore: 78, psaRate: 0.7, psaTx30: 20,
});
assert(forecast.central > 0);
assert(forecast.bearish <= forecast.central);
assert(forecast.central <= forecast.bullish);

const initial = model.encodeSnapshot({
  date: "2026-01-01", marketPrice: 100000, purchasePrice: 50000, psaRate: 0.7,
  lowerGradePrice: 37500, gradingFee: 13000, saleFeeRate: 10, saleExtraCost: 0,
  forecastBearish: 90000, forecastCentral: 105000, forecastBullish: 115000,
  floorScore: 72, demandScore: 78, futureScore: 70, exitScore: 75, qualityScore: 73,
  verdict: "GO", supportConfirmed: true, supportCloseLow: 88000, supportCloseHigh: 92000,
  supportInstantLow: 85000, supportInstantHigh: 90000, buybackRatio: 0.85, lockDays: 91,
  expectedProfit: 20000, expectedRoi: 31, predictedDirection: "上昇", dataCompleteness: "高",
});
const future = model.encodeSnapshot({
  date: "2026-01-08", marketPrice: 108000, purchasePrice: 50000, psaRate: 0.7,
  lowerGradePrice: 37500, gradingFee: 13000, saleFeeRate: 10, saleExtraCost: 0,
  buybackRatio: 0.83,
});
const outcome = model.buildOutcome(initial, future, 7);
assert.strictEqual(outcome.directionMatched, true);
assert.strictEqual(outcome.rangeHit, true);
assert.strictEqual(outcome.supportBroken, false);
assert.strictEqual(outcome.buybackMaintained, true);
assert(Number.isFinite(outcome.reevaluatedExpectedProfit));
assert(Number.isFinite(outcome.predictionErrorPct));
assert(Number.isFinite(outcome.baselineErrorPct));

const actual = model.actualProfit({ grade: "PSA10", salePrice: 108000 }, initial);
assert(Number.isFinite(actual.realizedProfit));
assert.strictEqual(model.actualProfit({ grade: "", salePrice: 108000 }, initial), null);

assert.strictEqual(model.goConfidence({ verdict: "GO", floorScore: 70, demandScore: 75, floorState: "形成中", demandLabel: "強い" }), "GO・確認済み");
assert.strictEqual(model.goConfidence({ verdict: "GO", floorScore: null, demandScore: 75, floorState: "蓄積中", demandLabel: "強い" }), "暫定GO");
assert.strictEqual(model.goConfidence({ verdict: "GO", floorScore: 70, demandScore: 75, floorState: "下値割れ", demandLabel: "強い" }), "GO・高リスク");

const missing = model.buildOutcome(
  model.encodeSnapshot({ date: "2026-01-01", marketPrice: 100000, purchasePrice: 50000 }),
  model.encodeSnapshot({ date: "2026-01-08", marketPrice: 90000 }),
  7
);
assert.strictEqual(missing.reevaluatedExpectedProfit, null);
assert.strictEqual(missing.supportBroken, null);

const aggregate = model.aggregate([outcome, missing]);
assert.strictEqual(aggregate.evaluated, 2);
assert(Number.isFinite(aggregate.predictionErrorMedian));

for (const result of [forecast, outcome, actual, missing, aggregate]) assert.strictEqual(unsafe(result), false);

console.log(JSON.stringify({ forecast, outcome, actual, aggregate }, null, 2));
