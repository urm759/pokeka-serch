const assert = require("assert");
const model = require("../market-analysis.js");

function date(day) {
  return `2026-08-${String(day).padStart(2, "0")}`;
}

function history(prices, options = {}) {
  return prices.map((price, index) => ({
    date: date(1 + index * 3),
    rawPrice: Math.round(price / 1.6),
    psaPrice: price,
    listings: options.listings?.[index] ?? 12,
    rawTx30: options.rawTx30 ?? 35,
    psaTx30: options.psaTx30 ?? 12,
  }));
}

function containsUnsafeNumber(value) {
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(containsUnsafeNumber);
  if (value && typeof value === "object") return Object.values(value).some(containsUnsafeNumber);
  return false;
}

const stable = model.evaluatePriceFloor({
  history: history([56000, 56500, 55800, 56200, 56400, 56300, 56600, 56500, 56700, 56600, 56800]),
  rawTx30: 40,
  psaTx30: 18,
  monthlyPsaIncrease: 10,
  releaseAgeDays: 600,
  storeAgreement: 92,
  marketRelativeStrength: 4,
  inventorySources: [{ source: "同一店舗A", stock: 18, dailySales: 1 }],
});
assert.notStrictEqual(stable.state, "蓄積中");
assert.strictEqual(stable.direction, "横ばい");
assert(Number.isFinite(stable.score));
assert.strictEqual(stable.inventoryDays, 18);

const sparse = model.evaluatePriceFloor({
  history: history([50000, 50000]),
  rawTx30: 0,
  psaTx30: 0,
  inventorySources: [{ source: "同一店舗A", stock: 0, dailySales: 0 }],
});
assert.strictEqual(sparse.state, "蓄積中");
assert.strictEqual(sparse.score, null);
assert.strictEqual(sparse.inventoryDays, null);

const brokenSupport = model.evaluatePriceFloor({
  history: history([56000, 55800, 56200, 55900, 56100, 55700, 56000, 48000]),
  rawTx30: 35,
  psaTx30: 12,
  monthlyPsaIncrease: 6,
  releaseAgeDays: 500,
  storeAgreement: 85,
});
assert.strictEqual(brokenSupport.state, "下値割れ");
assert(brokenSupport.supportHigh < 52000);

const buyback = model.buybackMetrics({
  marketPrice: 84000,
  buybackPrice: 83000,
  saleFeeRate: 8,
  priceDate: "2026-08-31",
  asOfDate: "2026-09-01",
});
assert.strictEqual(buyback.marketRatio, 0.988);
assert.strictEqual(buyback.marketDifference, -0.012);
assert.strictEqual(buyback.takeHomeRatio, 1.074);
assert.strictEqual(buyback.stale, false);

const stale = model.buybackMetrics({
  marketPrice: 84000,
  buybackPrice: 90000,
  priceDate: "2026-08-01",
  asOfDate: "2026-09-01",
});
assert.strictEqual(stale.stale, true);

const mismatch = model.buybackMetrics({
  marketPrice: 84000,
  buybackPrice: 83000,
  cardMatched: false,
});
assert.strictEqual(mismatch.valid, false);
assert.strictEqual(mismatch.reason, "カード取り違え疑い");

const demand = model.evaluateStoreDemand({ rows: [
  { shopId: "a", ...model.buybackMetrics({ marketPrice: 100000, buybackPrice: 99000, priceDate: "2026-08-31", asOfDate: "2026-09-01" }), c7: 6, c30: 20, avg30: 97000 },
  { shopId: "b", ...model.buybackMetrics({ marketPrice: 100000, buybackPrice: 98000, priceDate: "2026-08-31", asOfDate: "2026-09-01" }), c7: 5, c30: 18, avg30: 97000 },
  { shopId: "campaign", ...model.buybackMetrics({ marketPrice: 100000, buybackPrice: 180000, priceDate: "2026-08-31", asOfDate: "2026-09-01" }), c7: 1, c30: 1, avg30: 180000 },
  { shopId: "old", ...stale, c7: 7, c30: 30, avg30: 90000 },
] });
assert.strictEqual(demand.label, "強い");
assert.strictEqual(demand.trustedCount, 2);
assert(demand.rows.find((row) => row.shopId === "campaign").outlier);
assert.strictEqual(demand.best.shopId, "a");

const singleCampaign = model.evaluateStoreDemand({ rows: [
  { shopId: "only", ...model.buybackMetrics({ marketPrice: 100000, buybackPrice: 150000, priceDate: "2026-08-31", asOfDate: "2026-09-01" }), c7: 1, c30: 1, avg30: 150000 },
] });
assert.notStrictEqual(singleCampaign.label, "強い");

const shopSummary = model.summarizeShopRates(demand.rows, { minimumCount: 3 });
assert.strictEqual(shopSummary.trustedCount, 2);
assert.strictEqual(shopSummary.median, 0.99);
assert.strictEqual(shopSummary.trimmedAverage, 0.985);
assert.strictEqual(shopSummary.reference, true);

const zeroValues = model.buybackMetrics({ marketPrice: 0, buybackPrice: 0, saleFeeRate: 100 });
assert.strictEqual(zeroValues.valid, false);

for (const result of [stable, sparse, brokenSupport, buyback, stale, mismatch, demand, singleCampaign, shopSummary, zeroValues]) {
  assert.strictEqual(containsUnsafeNumber(result), false);
}

console.log(JSON.stringify({
  stable: { state: stable.state, score: stable.score, direction: stable.direction, inventoryDays: stable.inventoryDays },
  sparse: { state: sparse.state, score: sparse.score, inventoryDays: sparse.inventoryDays },
  buyback: { marketRatio: buyback.marketRatio, difference: buyback.marketDifference, takeHomeRatio: buyback.takeHomeRatio },
  demand: { label: demand.label, trusted: demand.trustedCount, excluded: demand.excludedCount, best: demand.best.shopId },
  shop: { median: shopSummary.median, average: shopSummary.average, trimmedAverage: shopSummary.trimmedAverage },
}, null, 2));
