const assert = require("assert");
const fs = require("fs");
const path = require("path");
const model = require("../snkr-raw-flip-model.js");
const collector = require("./update_snkr_raw_flip.js");

const profit = model.calculate({ purchasePrice: 79800, sold30Median: 100000, currentListingPrice: 81000, feeRate: 7, shipping: 210, otherCost: 0 });
assert.equal(profit.priceBasis, "sold30Median");
assert.equal(profit.takeHome, 92790);
assert.equal(profit.profit, 12990);
assert.equal(Math.round(profit.roi * 10) / 10, 16.3);

const listingOnly = model.classify({ purchasePrice: 10000, currentListingPrice: 15000, sold7Count: null, sold30Count: null, fetchedAt: new Date().toISOString(), status: "ok", identityValid: true, linkageConfidence: "exact" }, { feeRate: 7, shipping: 210, minProfit: 0, minRoi: 0, maxAgeHours: 48 });
assert.equal(listingOnly.tier, "reference");
assert.equal(listingOnly.soldConfirmed, false);
assert.equal(listingOnly.sold30Count, null, "取得不能件数を0にしない");

const instant = model.classify({ purchasePrice: 79800, sold30Median: 100000, currentListingPrice: 81000, sold7Count: 13, sold30Count: 78, fetchedAt: new Date().toISOString(), status: "ok", identityValid: true, linkageConfidence: "exact" }, { feeRate: 7, shipping: 210, minProfit: 0, minRoi: 0, minSold7: 1, minSold30: 3, maxAgeHours: 48 });
assert.equal(instant.tier, "instant");

const stale = model.classify({ purchasePrice: 10000, sold30Median: 20000, sold7Count: 10, sold30Count: 20, fetchedAt: "2020-01-01T00:00:00Z", status: "ok", identityValid: true, linkageConfidence: "exact" }, { feeRate: 7, maxAgeHours: 48 });
assert.equal(stale.tier, "none", "古い価格を候補にしない");

const card = { name: 'メガリザードンXex SAR [M2 110/080](拡張パック「インフェルノX」)', setCode: "M2", model: "110/080", language: "ja" };
const exact = collector.validateIdentity(card, { title: "メガリザードンXex SAR [M2 110/080]", setCode: "M2", number: "110", rarity: "SAR", variant: "normal", language: "ja" });
assert.equal(exact.valid, true);
const wrongNumber = collector.validateIdentity(card, { title: "メガリザードンXex SAR [M2 111/080]", setCode: "M2", number: "111", rarity: "SAR", variant: "normal", language: "ja" });
assert.equal(wrongNumber.valid, false);
const wrongMirror = collector.validateIdentity({ name: "ピカチュウ マスターボールミラー [SV2a 025/165]", setCode: "SV2a", model: "025/165" }, { title: "ピカチュウ [SV2a 025/165]", setCode: "SV2A", number: "025", rarity: "", variant: "normal", language: "ja" });
assert.equal(wrongMirror.valid, false);

const summaryPath = path.join(__dirname, "..", "data", "snkr-raw-flip-summary.json");
if (fs.existsSync(summaryPath)) {
  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  assert.ok(summary.coverage.totalCards > 0);
  assert.ok(summary.coverage.exactMatchedCards > 0);
  assert.equal(summary.source.psaMixed, false);
  for (const row of Object.values(summary.cards)) {
    if (row.status !== "ok") continue;
    assert.equal(row.identityValid, true);
    assert.equal(row.linkageConfidence, "exact");
    assert.notEqual(row.sold30Count, undefined);
  }
}

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
assert.match(appSource, /purchaseMode === "snkr-raw"/);
assert.match(appSource, /PSA提出判断と独立/);
assert.doesNotMatch(fs.readFileSync(path.join(__dirname, "..", "decision-model.js"), "utf8"), /snkrRawFlip/, "既存PSA計算モデルへ混入させない");

console.log("snkr raw flip tests: ok");
