const fs = require("node:fs");
const path = require("node:path");
const model = require("../raw-psa9-gap-model.js");

const ROOT = path.join(__dirname, "..");
const cards = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "pokemon-cards.json"), "utf8"));
const rawRows = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "snkr-raw-flip-summary.json"), "utf8")).cards || {};
const priceAudit = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "state-a-price-audit.json"), "utf8"));
const disputed = new Set((Array.isArray(priceAudit.cards) ? priceAudit.cards : Object.values(priceAudit.cards || {})).map((row) => row.id));
const counts = { totalCards: 0, stateAThirtyDaySales: 0, stateAFreshExact: 0, psa9AggregateOnly: 0, domesticPsa9IndividualSales: 0, rawAndPsa9Aggregate: 0, verifiedComparable: 0 };
const examples = [];
const now = new Date().toISOString();
for (const card of Array.isArray(cards) ? cards : cards.cards || []) {
  counts.totalCards += 1;
  const raw = rawRows[card.id];
  if (Number(raw?.sold30Count) > 0 && Number(raw?.sold30Median) > 0) counts.stateAThirtyDaySales += 1;
  if (Number(card.snkPsa9Price) > 0 && !Array.isArray(card.snkPsa9Trades)) counts.psa9AggregateOnly += 1;
  if (raw?.sold30Median && card.snkPsa9Price) counts.rawAndPsa9Aggregate += 1;
  if (Array.isArray(card.snkPsa9Trades) && card.snkPsa9Trades.length) counts.domesticPsa9IndividualSales += 1;
  const result = model.evaluate({ cardId: card.id, identity: model.identityFromCard(card), raw,
    psa9Trades: card.snkPsa9Trades, psa9Aggregate: card.snkPsa9Price, psa10Price: card.snkPsa10Price,
    saleFeeRate: 0, priceConflict: disputed.has(card.id), asOf: now });
  if (result.raw.median && !result.reasons.some((reason) => reason.includes("取得日が古い"))) counts.stateAFreshExact += 1;
  if (result.status === "比較可能・参考") counts.verifiedComparable += 1;
  if (examples.length < 5 && raw?.sold30Median && card.snkPsa9Price) examples.push({ id: card.id, name: card.name, status: result.status, reasons: result.reasons,
    stateAMedian: result.raw.median, stateACount: result.raw.count, psa9IndividualCount: result.psa9.count,
    psa9AggregateReference: result.psa9.aggregateReference, gapJpy: result.gapJpy });
}
const audit = { version: 1, checkedAt: now, definition: "状態Aと国内PSA9の同一仕様・30日個別実成約を比較。集計価格・推定価格・海外成約は不採用。仕入れ判定へ未反映", counts, examples };
fs.writeFileSync(path.join(ROOT, "data", "raw-psa9-gap-audit.json"), JSON.stringify(audit), "utf8");
console.log(JSON.stringify(audit));
