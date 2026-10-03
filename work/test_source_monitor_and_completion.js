const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pcHealth, fresh } = require("./source_monitor.js");
const { plan } = require("./consume_completion_queue.js");
const { resolve } = require("./cardshop151.js");
const { candidates } = require("./discover_psa_set_urls.js");
const model = require("../decision-model.js");
const { savedMatchConfidence } = require("./update_shop_buybacks.js");
assert.equal(savedMatchConfidence({ matchScore: null }), null, "unknown score is not a failed identity comparison");
assert.equal(savedMatchConfidence({ matchScore: "" }), null);
assert.equal(savedMatchConfidence({ matchScore: 84 }), "low");
assert.equal(savedMatchConfidence({ matchScore: 100 }), "high");
const now = Date.parse("2026-10-01T08:00:00Z");
assert.equal(pcHealth({}, now).status, "PC観測未受信");
assert.equal(pcHealth({ observedAt: "2026-10-01T07:50:00Z", tasks: [{ name: "0430", preStartFailure: true, reason: "起動失敗" }] }, now).status, "起動前失敗");
assert.equal(pcHealth({ observedAt: "2026-10-01T07:50:00Z", independentObserverRegistered: false, tasks: [{ name: "0430", preStartFailure: true, reason: "起動失敗" }] }, now).status, "起動前失敗", "registration warning must not hide a detected startup failure");
assert(!fresh("2026-10-02", now, 48));
assert(!fresh(null, now, 48));
const queue = { queue: ["low", "blocked", "high"], cards: { low: { p: 1 }, high: { p: 100 }, blocked: { p: 200 } } };
const list = plan(queue.queue.map((id) => ({ id })), queue, { cards: { blocked: { failures: 3 } } }, now);
assert.deepEqual(list.map((r) => r.card.id), ["high", "low"]);
assert.equal(plan([{ id: "high" }], queue, { cards: { high: { nextRetryAt: "2026-10-02" } } }, now).length, 0);
const fixture = { id: "one", model: "126/100", name: "リーリエのピッピex SAR [SV9 126/100]", language: "ja", setCode: "SV9" };
const row = { genre: "ポケモンカード", type: "PSA10", name: "リーリエのピッピex", listNo: "126/100" };
assert.equal(resolve(row, [fixture]).cardId, "one");
assert.equal(resolve(row, [fixture, { ...fixture, id: "mirror", name: "リーリエのピッピex SAR: マスターボールミラー [SV9 126/100]" }]).status, "確認待ち");
assert.equal(resolve({ ...row, type: "PSA9" }, [fixture]).status, "対象外");
assert.equal(resolve(row, [{ ...fixture, language: "en" }]).status, "確認待ち");
assert.equal(resolve({ ...row, listNo: "115/100" }, [fixture]).status, "確認待ち");
assert.equal(candidates('<a href="/pop/tcg-cards/2025/pokemon-japanese-sv9-battle-partners/292980">x</a>')[0].setCode, "SV9");
assert.equal(candidates("guess SV9" ).length, 0);
const input = { rows: [
  { shopId: "mail", valid: true, buybackPrice: 80000, fulfilment: "mail" },
  { shopId: "store", valid: true, buybackPrice: 82000, fulfilment: "store" },
], currentPsa10Price: 100000, centralPsa10Price: 90000, stressPsa10Price: 70000,
  assumptions: { hitRate: 0.8, lowerGradePrice: 40000 }, fee: 13000, deductionRate: 3, saleFeeRate: 8, minExpectedProfit: 9000 };
assert.equal(model.conservativeBuybackExit(input).usable, false, "mail-only never uses store-only price");
const both = model.conservativeBuybackExit({ ...input, buybackStoreMode: "all", storeTravelCost: 2000 });
assert.equal(both.storeCount, 2);
assert.equal(both.travelCost, 1000);
assert.equal(both.scenarios.current.netPsa10, 77570);
const high = model.conservativeBuybackExit({ ...input, buybackStoreMode: "all", rows: [...input.rows, { shopId: "high", valid: true, outlier: true, buybackPrice: 4500000 }] });
assert.equal(high.storeCount, 3, "a genuine high quote is not a mismatched card");
assert.equal(high.grossCurrent, 82000, "one high quote cannot dominate the conservative median");
assert.equal(model.conservativeBuybackExit({ ...input, buybackStoreMode: "all", rows: input.rows.map((r) => ({ ...r, quarantined: true })) }).usable, false);
assert.equal(model.conservativeBuybackExit({ ...input, buybackStoreMode: "selected", selectedBuybackStores: ["store"] }).usable, false);
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "shop_buyback_catalog.json"), "utf8")).shops["cardshop151-store"] || [];
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/pokemon-cards.json"), "utf8"));
const sourceSummary = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/shop-buyback-summary.json"), "utf8"));
if (sourceSummary.shops["cardshop151-store"]?.refreshed) {
  const positive = Object.values(sourceSummary.cards).filter((c) => Number(c.shops?.["cardshop151-store"]?.price) > 0).length;
  assert.equal(positive, sourceSummary.shops["cardshop151-store"].activeMatched, "removed/stopped complete-listing prices must not remain current quotes");
}
for (const item of catalog) {
  const match = resolve({ genre: "ポケモンカード", type: "PSA10", name: item.identityEvidence.name, listNo: item.identityEvidence.number }, cards);
  assert.equal(match.cardId, item.cardId, "saved CardShop151 identity must revalidate");
  assert.equal(item.fulfilment, "store");
}
console.log(JSON.stringify({ monitor: "passed", completionPriority: "passed", buybackSettings: "passed", cardshop151Audited: catalog.length }));
