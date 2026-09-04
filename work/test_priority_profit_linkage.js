const assert = require("assert");
const fs = require("fs");
const path = require("path");
const model = require("../decision-model.js");
const identity = require("./card_identity.js");

const root = path.join(__dirname, "..");
const assumptions = {
  hitRate: 0.7,
  lowerGradePrice: 30000,
};
const common = {
  assumptions,
  fee: 13000,
  saleFeeRate: 8,
  saleExtraCost: 1000,
  riskBufferPct: 0,
  lockDays: 91,
};

// Under identical sale conditions, changing only purchase price changes profit
// by exactly the inverse purchase-price difference.
const current = model.expectedEconomics({ ...common, purchasePrice: 40000, forecastPrice: 90000 });
const atLimit = model.expectedEconomics({ ...common, purchasePrice: 50000, forecastPrice: 90000 });
assert.strictEqual(atLimit.expectedProfit, current.expectedProfit - (50000 - 40000));

const matrix = model.economicsScenarioMatrix({
  ...common,
  currentPurchasePrice: 40000,
  operationalLimitPrice: 50000,
  currentPsa10Price: 100000,
  centralForecastPrice: 90000,
  supplyStressPrice: 70000,
});
assert.ok(matrix.currentPurchase.centralForecast.expectedProfit > matrix.currentPurchase.supplyStress.expectedProfit);
assert.ok(matrix.operationalLimit.supplyStress.expectedProfit < matrix.currentPurchase.supplyStress.expectedProfit);

const buyback = model.buybackExitProfit({
  buybackPrice: 100000,
  purchasePrice: 50000,
  gradingFee: 13000,
  extraCost: 1000,
  deductionRate: 3,
});
assert.strictEqual(buyback.beforeDeductionProfit, 36000);
assert.strictEqual(buyback.deductionAmount, 3000);
assert.strictEqual(buyback.afterDeductionProfit, 33000);
assert.strictEqual(buyback.deductionRate, 3);

const actualPsa9 = model.resolvePsa9Price({ directPrice: 46000, directCount: 4, fallbackPrice: 30000 });
assert.strictEqual(actualPsa9.value, 46000);
assert.strictEqual(actualPsa9.estimated, false);
const inferredPsa9 = model.resolvePsa9Price({ fallbackPrice: 30000, fallbackSource: "推定" });
assert.strictEqual(inferredPsa9.estimated, true);

const initialCap = model.operationalCap({ theoreticalCap: 61789, history: [], asOfDate: "2026-09-04" });
assert.strictEqual(initialCap.initial, true);
assert.strictEqual(initialCap.previous, null);
assert.strictEqual(initialCap.operational, 60000);
assert.notStrictEqual(initialCap.operational, 50000);
assert.strictEqual(initialCap.calculationVersion, "operational-cap-v2");

const exact = identity.compareIdentity(
  "ブラッキーVMAX CSR[S8b 245/184]",
  "ブラッキーVMAX【CSR】{245/184} [S8b]"
);
assert.ok(exact.score >= 85 && !exact.hardMismatch);
const specialMismatch = identity.compareIdentity(
  "ピカチュウ マスターボールミラー[SV2a 025/165]",
  "ピカチュウ ミラー[SV2a 025/165]"
);
assert.strictEqual(specialMismatch.hardMismatch, true);
const sameNumberWrongName = identity.compareIdentity(
  "イーブイ U :1ED [SC 014/020]",
  "ポケモンいれかえ【-】{014/020} [SC]"
);
assert.strictEqual(sameNumberWrongName.nameCompatible, false);

const listings = JSON.parse(fs.readFileSync(path.join(root, "data", "snkr-listing-summary.json"), "utf8"));
assert.ok(Object.keys(listings.cards || {}).length > 0);
for (const row of Object.values(listings.cards || {}).slice(0, 100)) {
  assert.ok(Number.isFinite(row.current));
  assert.ok(row.change7 == null || Number.isFinite(row.change7));
  assert.ok(row.change30 == null || Number.isFinite(row.change30));
}

const linkage = JSON.parse(fs.readFileSync(path.join(root, "data", "linkage-review.json"), "utf8"));
assert.ok(linkage.sources?.cardrush?.unresolved > 0);
assert.ok(Array.isArray(linkage.sources?.cardrush?.ambiguousCandidates));
const governance = JSON.parse(fs.readFileSync(path.join(root, "data", "evaluation-governance.json"), "utf8"));
assert.strictEqual(governance.appliedToProduction, false);
assert.strictEqual(governance.status, "insufficient-validation");
assert.ok(governance.candidateSampleSize > 0);
assert.ok(governance.minimums.maximumParameterChangePct > 0);

console.log(JSON.stringify({
  scenarios: "ok",
  buybackDeduction: "ok",
  psa9MeasuredVsEstimated: "ok",
  operationalCap: initialCap.operational,
  snkrListings: Object.keys(listings.cards).length,
  ambiguousCardrush: linkage.sources.cardrush.ambiguousCandidates.length,
  learningStatus: governance.status,
}));
