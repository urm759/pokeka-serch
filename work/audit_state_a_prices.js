const fs = require("fs");
const path = require("path");
const integrity = require("../price-integrity.js");
const decisionModel = require("../decision-model.js");

const root = path.join(__dirname, "..");
const read = (name, fallback) => {
  const file = path.join(root, name);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
};
const write = (name, data) => fs.writeFileSync(path.join(root, name), JSON.stringify(data), "utf8");
const cards = read("data/pokemon-cards.json", []);
const sources = [
  ["カードラッシュ", "cardrush", "cardrushPrice"],
  ["晴れる屋2", "hareruya2", "hareruya2Price"],
  ["遊々亭", "yuyutei", "yuyuteiPrice"],
  ["トレカキャンプ", "torecacamp", "torecacampPrice"],
].map(([label, key, field]) => ({ label, field, data: read(`data/${key}-stock-summary.json`, { cards: {} }) }));
const previous = read("data/state-a-price-evidence.json", { cards: {} });
const evidence = { version: 1, updatedAt: new Date().toISOString(), cards: { ...previous.cards } };
const asOfDate = String(read("data/pokemon-cards-meta.json", {}).updatedAt || new Date().toISOString()).slice(0, 10);
const suspects = [];
for (const card of cards) {
  const entries = sources.map((source) => {
    const row = source.data.cards?.[card.id] || {};
    return {
      source: source.label,
      kind: "販売価格",
      value: row[source.field],
      updatedAt: source.data.updatedAt,
      valid: row.priceQuarantined !== true && !decisionModel.isSuspectedCardMismatch(row),
      conditionAccepted: row.conditionAccepted !== false,
    };
  });
  const result = integrity.audit(card.price, entries, { asOfDate });
  if (!result.disputed) continue;
  suspects.push({
    id: card.id, name: card.name, sourcePrice: result.sourcePrice,
    shopMedian: result.shopMedian, ratio: Number(result.ratio.toFixed(4)),
    shops: result.corroboratingShops, evidence: evidence.cards[card.id]?.status || "unknown",
    url: `https://toreca-souba.com/cards/${encodeURIComponent(card.id)}`,
  });
}
suspects.sort((a, b) => (a.id === "pk-22204" ? -1 : b.id === "pk-22204" ? 1 : Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio))));

async function fetchEvidence(row) {
  const old = evidence.cards[row.id];
  if (old?.checkedAt && Date.now() - Date.parse(old.checkedAt) < 7 * 86400000) return false;
  try {
    const response = await fetch(row.url, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "PokemonCardPriceAudit/1.0" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    evidence.cards[row.id] = { status: integrity.classifyReference(html), checkedAt: new Date().toISOString(), url: row.url };
    return true;
  } catch (error) {
    evidence.cards[row.id] = { ...old, status: old?.status || "unknown", lastAttemptAt: new Date().toISOString(), error: String(error.message || error) };
    return false;
  }
}

async function main() {
  const limit = Math.max(0, Math.min(100, Number(process.env.PRICE_EVIDENCE_FETCH_LIMIT ?? 8)));
  const deadline = Date.now() + Math.max(1000, Number(process.env.PRICE_EVIDENCE_MAX_RUNTIME_MS ?? 90000));
  let fetched = 0;
  for (const row of suspects) {
    if (fetched >= limit || Date.now() >= deadline) break;
    if (evidence.cards[row.id]?.checkedAt && Date.now() - Date.parse(evidence.cards[row.id].checkedAt) < 7 * 86400000) continue;
    await fetchEvidence(row);
    fetched += 1;
    write("data/state-a-price-evidence.json", evidence);
    if (fetched < limit) await new Promise((resolve) => setTimeout(resolve, 700));
  }
  write("data/state-a-price-evidence.json", evidence);
  for (const row of suspects) row.evidence = evidence.cards[row.id]?.status || "unknown";
  const audit = {
    version: 1, asOfDate, totalCards: cards.length, disputedCount: suspects.length,
    inspectedSourcePages: Object.keys(evidence.cards).length,
    unbackedCount: suspects.filter((row) => row.evidence === "unbacked").length,
    definition: "みんトレ参考価格と、35%以内で近接する状態A店舗価格2件以上の中央値が4倍以上乖離。安値・高値とも自動採用せずGO保留。店舗価格は成約ではない。",
    cards: suspects,
  };
  write("data/state-a-price-audit.json", audit);
  console.log(JSON.stringify({ totalCards: cards.length, disputed: suspects.length, pagesFetched: fetched, unbacked: audit.unbackedCount, mew: suspects.find((row) => row.id === "pk-22204") }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
