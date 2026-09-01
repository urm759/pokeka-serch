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
assert.strictEqual(sparse.direction, "暫定横ばい");

const deduped = model.normalizeHistory([
  { date: "2026-08-01", psaPrice: 50000 },
  { date: "2026-08-01", psaPrice: 51000 },
]);
assert.strictEqual(deduped.length, 1);
assert.strictEqual(deduped[0].psaPrice, 51000);

const brokenSupport = model.evaluatePriceFloor({
  history: history([56000, 55800, 56200, 55900, 56100, 55700, 56000, 48000]),
  rawTx30: 35,
  psaTx30: 12,
  monthlyPsaIncrease: 6,
  releaseAgeDays: 500,
  storeAgreement: 85,
});
assert.strictEqual(brokenSupport.state, "下値割れ");
assert.strictEqual(brokenSupport.supportConfirmed, true);
assert(brokenSupport.supportLow > 54000);
assert.strictEqual(brokenSupport.supportClose.contacts >= 3, true);

assert.strictEqual(sparse.supportConfirmed, false);

const shortThreeTouches = model.evaluatePriceFloor({
  history: [
    ["2026-01-01", 50000, 90000, 20, 8, 2, 400, 100, 50000, 89000],
    ["2026-01-02", 50000, 90500, 20, 8, 2, 400, 100, 50000, 89500],
    ["2026-01-03", 50000, 90000, 20, 8, 2, 400, 100, 50000, 89000],
    ["2026-01-04", 50000, 92000, 20, 8, 2, 400, 100, 50000, 90000],
  ],
  psaTx30: 20,
  rawTx30: 40,
});
assert.strictEqual(shortThreeTouches.state, "蓄積中");
assert.strictEqual(shortThreeTouches.supportConfirmed, false, "必要期間不足中は3日接触でも暫定観測帯にする");
assert(Number.isFinite(sparse.supportLow));

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
  { shopId: "a", ...model.buybackMetrics({ marketPrice: 100000, buybackPrice: 99000, priceDate: "2026-08-31", asOfDate: "2026-09-01" }), c7: 6, c30: 12, observed7: 7, observed30: 14, avg30: 97000 },
  { shopId: "b", ...model.buybackMetrics({ marketPrice: 100000, buybackPrice: 98000, priceDate: "2026-08-31", asOfDate: "2026-09-01" }), c7: 5, c30: 11, observed7: 7, observed30: 14, avg30: 97000 },
  { shopId: "campaign", ...model.buybackMetrics({ marketPrice: 100000, buybackPrice: 180000, priceDate: "2026-08-31", asOfDate: "2026-09-01" }), c7: 1, c30: 1, observed7: 7, observed30: 14, avg30: 180000 },
  { shopId: "old", ...stale, c7: 7, c30: 14, observed7: 7, observed30: 14, avg30: 90000 },
], psaTx30: 20 });
assert.strictEqual(demand.label, "普通");
assert.strictEqual(demand.trustedCount, 2);
assert(demand.rows.find((row) => row.shopId === "campaign").outlier);
assert.strictEqual(demand.best.shopId, "a");
assert.deepStrictEqual(Object.keys(demand.components), ["buybackRatio", "storeCount", "continuity", "priceTrend", "liquidity"]);
assert.strictEqual(demand.confidenceCap, 100);

const lowObservation = model.evaluateStoreDemand({ rows: [
  { shopId: "a", ...model.buybackMetrics({ marketPrice: 50000, buybackPrice: 49000, priceDate: "2026-08-31", asOfDate: "2026-09-01" }), c7: 3, c30: 3, observed7: 3, observed30: 3, avg30: 48000 },
], psaTx30: 50 });
assert(lowObservation.score <= 59);
assert.strictEqual(lowObservation.confidenceCap, 59);
for (const [days, cap] of [[7, 69], [13, 84], [14, 100]]) {
  const capped = model.evaluateStoreDemand({ rows: [
    { shopId: "a", ...model.buybackMetrics({ marketPrice: 50000, buybackPrice: 49000, priceDate: "2026-08-31", asOfDate: "2026-09-01" }), c7: days, c30: days, observed7: Math.min(7, days), observed30: days, avg30: 48000 },
  ], psaTx30: 50 });
  assert.strictEqual(capped.confidenceCap, cap);
  assert(capped.score <= cap);
}

const rankedCards = [{ id: "top", psa10: 100000, buybackAnalysis: demand }];
for (let index = 0; index < 9; index += 1) {
  rankedCards.push({ id: `peer-${index}`, psa10: 100000, buybackAnalysis: { ...demand, score: 50 + index, absoluteStrongEligible: false } });
}
model.applyStoreDemandRelativeRanking(rankedCards);
assert.strictEqual(demand.label, "強い");
assert(rankedCards.filter((card) => card.buybackAnalysis.label === "強い").length <= 3);

const singleCampaign = model.evaluateStoreDemand({ rows: [
  { shopId: "only", ...model.buybackMetrics({ marketPrice: 100000, buybackPrice: 150000, priceDate: "2026-08-31", asOfDate: "2026-09-01" }), c7: 1, c30: 1, observed7: 7, observed30: 14, avg30: 150000 },
] });
assert.notStrictEqual(singleCampaign.label, "強い");

const shopSummary = model.summarizeShopRates(demand.rows, { minimumCount: 3 });
assert.strictEqual(shopSummary.trustedCount, 2);
assert.strictEqual(shopSummary.median, 0.99);
assert.strictEqual(shopSummary.trimmedAverage, 0.985);
assert.strictEqual(shopSummary.reference, true);

const zeroValues = model.buybackMetrics({ marketPrice: 0, buybackPrice: 0, saleFeeRate: 100 });
assert.strictEqual(zeroValues.valid, false);

const quarantined = model.buybackMetrics({ marketPrice: 50000, buybackPrice: 4500000, dataQuarantined: true });
assert.strictEqual(quarantined.valid, false);
assert.strictEqual(quarantined.reason, "データ異常（自動隔離）");
assert.strictEqual(model.extremePriceState(50000, 4500000).severe, true);

const reliability = model.sourceReliability({ scheduledDays: 14, successfulDays: 12, priceObservations: 100, outliers: 4, matchedItems: 80, mismatchSuspicions: 2 });
assert.strictEqual(reliability.successRate, 0.857);
assert.strictEqual(reliability.outlierRate, 0.04);
assert.strictEqual(reliability.mismatchRate, 0.025);
assert(Number.isFinite(reliability.score));

const missingReliability = model.sourceReliability({ scheduledDays: 0, successfulDays: 0, priceObservations: 0, outliers: 0 });
assert.strictEqual(missingReliability.successRate, null);
assert.strictEqual(missingReliability.score, null);

for (const result of [stable, sparse, brokenSupport, buyback, stale, mismatch, demand, singleCampaign, shopSummary, zeroValues, quarantined, reliability, missingReliability]) {
  assert.strictEqual(containsUnsafeNumber(result), false);
}

console.log(JSON.stringify({
  stable: { state: stable.state, score: stable.score, direction: stable.direction, inventoryDays: stable.inventoryDays },
  sparse: { state: sparse.state, score: sparse.score, inventoryDays: sparse.inventoryDays },
  buyback: { marketRatio: buyback.marketRatio, difference: buyback.marketDifference, takeHomeRatio: buyback.takeHomeRatio },
  demand: { label: demand.label, trusted: demand.trustedCount, excluded: demand.excludedCount, best: demand.best.shopId },
  shop: { median: shopSummary.median, average: shopSummary.average, trimmedAverage: shopSummary.trimmedAverage },
}, null, 2));
