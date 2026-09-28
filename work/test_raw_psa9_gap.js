const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const model = require("../raw-psa9-gap-model.js");

const asOf = "2026-09-29T00:00:00Z";
const card = { id: "sample", name: "テストex SAR [M2 110/080]", language: "ja" };
const identity = model.identityFromCard(card);
const raw = { cardId: card.id, status: "ok", identityValid: true, linkageConfidence: "exact",
  identity: { expected: identity, observed: identity }, historyComplete30d: true,
  sold30Median: 10000, sold30Count: 4, newestSaleAt: "2026-09-27T00:00:00Z", fetchedAt: "2026-09-28T00:00:00Z" };
const trade = (id, price, overrides = {}) => ({ id, cardId: card.id, ...identity, gradingCompany: "PSA", grade: 9,
  singleCard: true, country: "JP", currency: "JPY", saleType: "sold", soldAt: "2026-09-26T00:00:00Z", price, ...overrides });
const base = { asOf, cardId: card.id, identity, raw, psa9Trades: [trade("one", 12000), trade("two", 13000), trade("three", 14000)],
  psa9Aggregate: 50000, psa10Price: 30000, psa10Rate: 70, gradingFee: 13000, lockDays: 90, saleFeeRate: 10 };
const valid = model.evaluate(base);
assert.equal(valid.status, "比較可能・参考");
assert.equal(valid.gapJpy, 3000);
assert.equal(valid.netGapJpy, 1700, "手数料はPSA9の売価全体から引く");
assert.equal(valid.psa10.premiumToRawJpy, 20000);
assert.equal(valid.usedForPurchaseDecision, false);
assert.equal(model.evaluate({ ...base, psa9Trades: [] }).status, "検証不能", "PSA9集計価格は個別成約の代わりにならない");
assert.equal(model.evaluate({ ...base, raw: { ...raw, fetchedAt: "2026-09-10T00:00:00Z" } }).status, "検証不能");
assert.equal(model.evaluate({ ...base, priceConflict: true }).status, "検証不能");
assert.equal(model.evaluate({ ...base, psa9Trades: [trade("one", 12000), trade("two", 13000), trade("three", 30000)] }).status, "検証不能", "PSA9価格対立を比較に使わない");
assert.equal(model.evaluate({ ...base, raw: { ...raw, identity: { ...raw.identity, observed: { ...identity, variant: "masterball" } } } }).status, "検証不能");
assert.equal(model.evaluate({ ...base, psa9Trades: [trade("one", 12000), trade("two", 13000), trade("three", 14000, { number: "111" })] }).status, "検証不能");
assert.equal(model.evaluate({ ...base, psa9Trades: [trade("one", 12000), trade("two", 13000), trade("three", 14000, { country: "US" })] }).status, "検証不能");
assert.equal(model.evaluate({ ...base, psa9Trades: [trade("one", 12000), trade("two", 13000), trade("three", 14000, { grade: 10 })] }).status, "検証不能");
assert.equal(model.evaluate({ ...base, psa9Trades: [trade("one", 12000), trade("one", 13000), trade("three", 14000)] }).status, "検証不能");
assert.equal(model.evaluate({ ...base, saleFeeRate: null }).status, "検証不能");
assert.equal(model.evaluate({ ...base, psa10Rate: null }).grading.psa10Rate, null, "公式未取得を0%にしない");
const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
assert(app.includes("${rawPsa9Panel}"));
assert(app.includes("usedForPurchaseDecision") === false, "試験指標を判定入力へ混入させない");
console.log("raw state-A versus domestic PSA9 reference tests passed");
