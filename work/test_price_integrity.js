const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const integrity = require("../price-integrity.js");

const root = path.join(__dirname, "..");
const asOfDate = JSON.parse(fs.readFileSync(path.join(root, "data", "pokemon-cards-meta.json"), "utf8")).updatedAt.slice(0, 10);
const shop = (source, value) => ({ source, kind: "販売価格", value, updatedAt: asOfDate, conditionAccepted: true, valid: true });
const mew = integrity.audit(2550, [shop("晴れる屋2", 190000), shop("カードラッシュ", 198000), shop("遊々亭", 198000)], { asOfDate });
assert.equal(mew.disputed, true);
assert.equal(mew.shopMedian, 198000);
assert.equal(mew.corroboratingShopCount, 3);
assert.equal(integrity.audit(800000, [shop("A", 190000), shop("B", 198000)], { asOfDate }).disputed, true, "high reference prices are held too");
assert.equal(integrity.audit(190000, [shop("A", 190000), shop("B", 198000)], { asOfDate }).disputed, false);
assert.equal(integrity.audit(2550, [shop("A", 190000)], { asOfDate }).disputed, false, "one shop is not independent corroboration");
assert.equal(integrity.audit(2550, [shop("A", 190000), { ...shop("B", 198000), updatedAt: "2026-01-01" }], { asOfDate }).disputed, false, "stale shops do not corroborate");
assert.equal(integrity.classifyReference("美品の参考価格（実売の裏付けなし）"), "unbacked");
assert.equal(integrity.classifyReference("直近30日の取引53件に基づく"), "unknown", "all-condition trades do not prove state-A sales");

const evidence = JSON.parse(fs.readFileSync(path.join(root, "data", "state-a-price-evidence.json"), "utf8"));
const audit = JSON.parse(fs.readFileSync(path.join(root, "data", "state-a-price-audit.json"), "utf8"));
assert.equal(evidence.cards["pk-22204"]?.status, "unbacked");
assert.equal(audit.totalCards, JSON.parse(fs.readFileSync(path.join(root, "data", "pokemon-cards.json"), "utf8")).length);
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const window = {
  PurchaseDecisionModel: require("../decision-model.js"), PriceIntegrity: integrity,
  MarketAnalysisModel: require("../market-analysis.js"), BacktestModel: require("../backtest-model.js"),
  SnkrRawFlipModel: require("../snkr-raw-flip-model.js"), POKEMON_CARDS_META: { updatedAt: asOfDate },
};
const context = vm.createContext({ window, document: { getElementById: () => null, querySelectorAll: () => [] }, console, URL, URLSearchParams, setTimeout, clearTimeout });
vm.runInContext(`${appSource.split("// Browser event bindings start here; the audit runner evaluates the same model above this line.")[0]}\nglobalThis.testApi = { state, calc };`, context, { filename: "app.js" });
const { state, calc } = context.testApi;
state.priceEvidence = evidence;
for (const [key, field] of [["cardrush", "cardrushStock"], ["hareruya2", "hareruya2Stock"], ["yuyutei", "yuyuteiStock"], ["torecacamp", "torecacampStock"]]) {
  const payload = JSON.parse(fs.readFileSync(path.join(root, "data", `${key}-stock-summary.json`), "utf8"));
  state[field] = payload.cards;
  state.sourceUpdates[key] = payload.updatedAt;
}
state.sourceUpdates.toreca = asOfDate;
state.snkrRawFlipSummary = JSON.parse(fs.readFileSync(path.join(root, "data", "snkr-raw-flip-summary.json"), "utf8")).cards;
const sourceCard = JSON.parse(fs.readFileSync(path.join(root, "data", "pokemon-cards.json"), "utf8")).find((row) => row.id === "pk-22204");
const calculatedMew = calc({ ...sourceCard, price: 2550 });
assert(Number.isNaN(calculatedMew.price), "neither the low quote nor high shop prices may become the adopted market price");
assert.equal(calculatedMew.dataQuality.manualReview, true);
assert.equal(calculatedMew.purchaseDecision, null, "conflicted price cannot enter GO");
assert.equal(calculatedMew.stateATx30d, null, "all-condition trades may not become state-A trades");
assert.equal(calculatedMew.snkrRawFlip.domesticAveragePrice, null, "the raw-flip panel must not repeat an unbacked reference quote");
console.log(JSON.stringify({ disputed: audit.disputedCount, mewEvidence: evidence.cards["pk-22204"].status }));
