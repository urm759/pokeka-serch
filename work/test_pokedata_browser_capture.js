const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const capture = JSON.parse(fs.readFileSync(path.join(__dirname, "pokedata-browser-captures.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "data", "pokedata", "manifest.json"), "utf8"));
const battle = manifest.sets.find((entry) => entry.setName === "Battle Partners");
const terastal = manifest.sets.find((entry) => entry.setName === "Terastal Festival ex");
const sv2a = manifest.sets.find((entry) => entry.setName === "Pokemon Card 151 Japanese");

assert(battle);
assert(terastal);
assert(sv2a);
assert(capture.cards.length >= 215);
assert.equal(battle.acquisition.browserValidatedCards, battle.count);
assert(battle.acquisition.usableRawMedianCards >= 50);
assert(battle.acquisition.usablePsa10MedianCards >= 15);
assert.equal(battle.acquisition.pricedCardPct, 100);
assert.equal(terastal.linkageCount, 629);
assert.equal(terastal.sourceCount, 629);
assert.equal(terastal.acquisition.browserValidatedCards + terastal.acquisition.browserUnavailableCards, terastal.count);
assert(terastal.acquisition.browserValidatedCards >= 140);
assert.equal(manifest.totalLinkageRecords, manifest.sets.reduce((sum, entry) => sum + Number(entry.linkageCount || 0), 0));
assert.equal(sv2a.sourceCount, 516);
assert.equal(sv2a.linkageCount, 516);
assert(sv2a.acquisition.browserPricedCards >= 3);
assert.equal(battle.acquisition.sourcePriceMissingRows, 0);
assert.equal(battle.acquisition.formatParseFailureRows, 0);
assert(battle.acquisition.classificationCounts["auto-matched"] > 0);
assert(battle.acquisition.classificationCounts.unverifiable > 0);

for (const captured of capture.cards) {
  const salesPath = path.join(root, "data", "pokedata-sales", `${captured.localId}.json`);
  assert(fs.existsSync(salesPath), `missing sales audit for ${captured.localId}`);
  const sales = JSON.parse(fs.readFileSync(salesPath, "utf8"));
  if (captured.pageValid === false || captured.rows.length === 0) {
    assert.equal(captured.rows.length, 0);
    assert.equal(sales.acquisitionAudit.method, "authenticated-browser-unavailable");
    assert.equal(sales.acquisitionAudit.missingCauseCounts["参照ページ無効"], 1);
    continue;
  }
  assert(captured.rows.length > 0);
  assert(captured.rows.every((row) => /^¥?[0-9,]+$/.test(String(row.priceText || "").replace(/\s/g, ""))));
  assert.equal(sales.acquisitionAudit.method, "authenticated-browser-dom");
  assert.equal(sales.acquisitionAudit.missingCauseCounts["価格形式解析失敗"], 0);
  assert(sales.acquisitionAudit.classificationCounts);
  assert(sales.acquisitionAudit.browserPricedRows > 0);
  assert.equal(sales.summaries.raw.originalCount, sales.summaries.raw.adoptedCount + sales.summaries.raw.excludedCount);
  assert.equal(sales.summaries.psa10.originalCount, sales.summaries.psa10.adoptedCount + sales.summaries.psa10.excludedCount);
}

console.log(JSON.stringify({
  inspectedCards: capture.cards.length,
  authenticatedCards: manifest.acquisition.browserValidatedCards,
  unavailableCards: manifest.acquisition.browserUnavailableCards,
  battleLinkedCards: battle.count,
  battleRealPriceCoveragePct: battle.acquisition.pricedCardPct,
  expandedSet: terastal.setName,
  expandedRecords: terastal.linkageCount,
}));
