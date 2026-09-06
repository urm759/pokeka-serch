const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { eventPhase, periodComparison } = require("./build_market_research.js");
const { cardVariant, findDomestic } = require("./update_pokedata_batch.js");
const { wilsonUpper95 } = require("./audit_pokedata_matches.js");

const ROOT = path.join(__dirname, "..");
assert.strictEqual(cardVariant("Abra Master Ball Holo"), "master-ball");
assert.strictEqual(cardVariant("Abra Poke Ball Pattern Holofoil"), "poke-ball");
assert.strictEqual(cardVariant("Abra"), "standard");

const domestic = new Map([["SV2A|63", [
  { id: "normal", name: "ケーシィ [SV2a 063/165]" },
  { id: "master", name: "ケーシィ: マスターボールミラー[SV2a 063/165]" },
  { id: "poke", name: "ケーシィ: モンスターボールミラー[SV2a 063/165]" },
]]]);
assert.strictEqual(findDomestic({ id: 1, set_code: "SV2a", num: "063", name: "Abra Master Ball Holo" }, domestic, []).localCardId, "master");
assert.strictEqual(findDomestic({ id: 2, set_code: "SV2a", num: "63", name: "Abra Poke Ball Pattern Holofoil" }, domestic, []).localCardId, "poke");
assert.strictEqual(findDomestic({ id: 3, set_code: "SV2a", num: "063", name: "Abra" }, domestic, []).localCardId, "normal");

const insufficient = periodComparison({ periods: { days30: { count: 2, medianJpy: 120 }, days90: { count: 2, medianJpy: 120 }, all: { count: 2, medianJpy: 120 } } }, 100, 3);
assert.strictEqual(insufficient.days30.comparable, false);
assert.strictEqual(insufficient.days30.differenceRatePct, null);
const sufficient = periodComparison({ periods: { days30: { count: 3, medianJpy: 120 }, days90: { count: 3, medianJpy: 120 }, all: { count: 3, medianJpy: 120 } } }, 100, 3);
assert.strictEqual(sufficient.days30.level, "国内が安い");
assert.strictEqual(sufficient.days30.differenceRatePct, 20);

assert.strictEqual(eventPhase("2026-06-14", { start: "2026-06-15", end: "2026-07-15" }), "before");
assert.strictEqual(eventPhase("2026-06-15", { start: "2026-06-15", end: "2026-07-15" }), "during");
assert.strictEqual(eventPhase("2026-07-16", { start: "2026-06-15", end: "2026-07-15" }), "after");
assert.ok(wilsonUpper95(0, 300) * 100 < 2);

const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const decision = fs.readFileSync(path.join(ROOT, "decision-model.js"), "utf8");
assert.ok(app.includes("国内仕入れ上限へ未反映"));
assert.ok(app.includes("参考値・件数不足"));
assert.ok(!decision.includes("market-research-summary"));
assert.ok(!decision.includes("overseasLead"));

const cards = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "pokemon-cards.json"), "utf8"));
assert.strictEqual(cards.length, new Set(cards.map((card) => String(card.id))).size, "duplicate domestic card id");
const audit = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "modern-high-rarity-audit.json"), "utf8"));
assert.strictEqual(audit.duplicateIds, 0);
assert.ok((audit.records || []).every((row) => row.releaseYear >= 2015));
assert.ok((audit.records || []).every((row) => audit.config.rarityWhitelist.includes(row.rarity)));
console.log(JSON.stringify({ passed: true, tests: 23 }));
