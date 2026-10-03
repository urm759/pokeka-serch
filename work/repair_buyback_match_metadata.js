const fs = require("node:fs");
const path = require("node:path");
const { savedMatchConfidence } = require("./update_shop_buybacks.js");
const root = path.join(__dirname, "..");
const file = path.join(root, "data/shop-buyback-summary.json");
const summary = JSON.parse(fs.readFileSync(file, "utf8"));
const rows = [];
for (const [cardId, card] of Object.entries(summary.cards || {})) {
  for (const [shopId, row] of Object.entries(card.shops || {})) {
    if (row.matchConfidence !== "low" || row.matchScore != null) continue;
    if (row.cardMismatchSuspected || row.matchStatus === "mismatch" || row.quarantined) continue;
    rows.push({ cardId, shopId, previousConfidence: row.matchConfidence, confidence: null,
      priceDate: row.priceDate, reason: "Missing score was incorrectly converted to zero; identity remains unverified." });
    row.matchConfidence = savedMatchConfidence(row);
  }
}
if (rows.length) {
  fs.writeFileSync(file, JSON.stringify(summary));
  fs.writeFileSync(path.join(root, "data/buyback-match-metadata-audit.json"), JSON.stringify({
    repairedAt: new Date().toISOString(), changedRows: rows.length,
    changedCards: new Set(rows.map((r) => r.cardId)).size,
    priceDatesUnchanged: true, identityNotConfirmed: true, rows,
  }));
}
console.log(JSON.stringify({ repairedRows: rows.length, repairedCards: new Set(rows.map((r) => r.cardId)).size }));
