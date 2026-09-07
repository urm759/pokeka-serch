const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { canonicalIdentity } = require("./card_identity");

const ROOT = path.join(__dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const cards = read("data/pokemon-cards.json");
const inventory = read("work/toreca-source-inventory.json");
const completion = read("data/card-catalog-completion.json");
const manifest = read("data/card-catalog/manifest.json");
const index = read("data/card-catalog/index.json");
const analysis = read("data/card-catalog/analysis.json");
const queue = read("work/card-completion-queue.json");

assert.equal(completion.summary.sourceTotal, inventory.total, "source total must come from the independent inventory");
assert.equal(completion.summary.siteTotal, cards.length, "site total must equal the rendered catalog");
assert.equal(completion.summary.unlisted, 0, "every source card must be listed");
assert.equal(completion.summary.listingRatePct, 100, "listing and analysis completion must be separate");
assert.equal(index.cards.length, cards.length, "the lightweight index must include every card");
assert.equal(manifest.totalCards, cards.length, "chunk manifest total must match the catalog");
assert.equal(manifest.files.reduce((sum, row) => sum + row.count, 0), cards.length, "all chunks must cover every card exactly once");
assert.equal(analysis.length, completion.summary.analyzable, "initial payload must contain only analyzable cards");
assert.ok(analysis.every((card) => completion.cards[card.id]?.s === "分析可能"), "data-shortage cards must not enter the initial buying list");
assert.ok(cards.some((card) => completion.cards[card.id]?.s !== "分析可能"), "missing-data cards must remain searchable instead of disappearing");
assert.equal(completion.summary.newCards, Object.values(completion.cards).filter((card) => card.n === 1).length, "new-card count must survive no-change refreshes");
assert.ok(cards.filter((card) => completion.cards[card.id]?.n === 1).every((card) => card.firstSeenAt), "new cards must retain their first-seen date");
assert.equal(queue.version, 2, "completion queue must use the compact schema");
assert.ok(Array.isArray(queue.itemSchema) && queue.itemSchema.length === 5, "compact queue schema must remain decodable");
assert.ok(fs.statSync(path.join(ROOT, "work/card-completion-queue.json")).size < 25 * 1024 * 1024, "manual-upload queue file must stay under 25 MB");

const normal = canonicalIdentity({ name: "ピカチュウ C [SV2a 025/165](ポケモンカード151)" });
const master = canonicalIdentity({ name: "ピカチュウ C: マスターボールミラー [SV2a 025/165](ポケモンカード151)" });
assert.notEqual(normal.key, master.key, "normal and mirror cards must remain separate");
const promoA = canonicalIdentity({ name: "ピカチュウ P [XY-P 064](マクドナルド配布)" });
const promoB = canonicalIdentity({ name: "ピカチュウ P [XY-P 064](ポケモンパン配布)" });
assert.notEqual(promoA.key, promoB.key, "different promo distributions must not be collapsed");
const sameA = canonicalIdentity({ name: "ピカチュウ P [XY-P 064](マクドナルド配布)" });
assert.equal(promoA.key, sameA.key, "only complete normalized identity matches may deduplicate");

const unavailable = Object.values(completion.cards).find((row) => row.i?.psa10Price === "取得元にデータなし");
assert.ok(unavailable, "source-with-no-data must be represented explicitly");
assert.notEqual(unavailable.i.psa10Price, "取得済み", "unavailable values must never become zero-valued acquired data");

const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
assert.ok(appSource.includes("./data/card-catalog/analysis.json"), "initial load must use the analysis payload");
assert.ok(appSource.includes("loadCatalogChunk"), "full catalog must be loaded lazily by chunks");
assert.ok(appSource.includes("catalogReady &&"), "quick presets must exclude incomplete cards");
const updateSource = fs.readFileSync(path.join(__dirname, "update_pokemon_site.js"), "utf8");
assert.ok(updateSource.includes('all.filter((c) => c.title === "ポケモン")'), "Toreca ingestion must not filter by rarity");

console.log(JSON.stringify({
  cards: cards.length,
  analyzable: analysis.length,
  chunks: manifest.files.length,
  newCards: completion.summary.newCards,
  queueRemaining: completion.summary.priorityQueueRemaining,
  tests: 23,
}));
