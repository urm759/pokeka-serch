const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const capture = JSON.parse(fs.readFileSync(path.join(__dirname, "pokedata-browser-captures.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "data", "pokedata", "manifest.json"), "utf8"));
const battle = manifest.sets.find((entry) => entry.setName === "Battle Partners");
const terastal = manifest.sets.find((entry) => entry.setName === "Terastal Festival ex");

assert(battle);
assert(terastal);
assert(capture.cards.length >= 11);
assert.equal(battle.acquisition.browserValidatedCards, 11);
assert(battle.acquisition.usableRawMedianCards >= 10);
assert(battle.acquisition.usablePsa10MedianCards >= 10);
assert.equal(battle.acquisition.actualPriceCoveragePct, 19.3);
assert.equal(terastal.linkageCount, 100);
assert.equal(manifest.totalLinkageRecords, 232);

for (const captured of capture.cards) {
  assert(captured.rows.length > 0);
  assert(captured.rows.every((row) => /^¥?[0-9,]+$/.test(String(row.priceText || "").replace(/\s/g, ""))));
  const salesPath = path.join(root, "data", "pokedata-sales", `${captured.localId}.json`);
  assert(fs.existsSync(salesPath), `missing sales audit for ${captured.localId}`);
  const sales = JSON.parse(fs.readFileSync(salesPath, "utf8"));
  assert.equal(sales.acquisitionAudit.method, "authenticated-browser-dom");
  assert.equal(sales.acquisitionAudit.missingCauseCounts["価格形式解析失敗"], 0);
  assert(sales.acquisitionAudit.browserPricedRows > 0);
  assert.equal(sales.summaries.raw.originalCount, sales.summaries.raw.adoptedCount + sales.summaries.raw.excludedCount);
  assert.equal(sales.summaries.psa10.originalCount, sales.summaries.psa10.adoptedCount + sales.summaries.psa10.excludedCount);
}

console.log(JSON.stringify({
  authenticatedCards: capture.cards.length,
  battleLinkedCards: battle.count,
  battleRealPriceCoveragePct: battle.acquisition.actualPriceCoveragePct,
  expandedSet: terastal.setName,
  expandedRecords: terastal.linkageCount,
}));
