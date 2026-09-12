const fs = require("fs");
const path = require("path");
const searchModel = require("../search-index-model.js");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const CATALOG = path.join(DATA, "card-catalog");

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

function buildSearchIndex(cards, catalogIndex) {
  const catalogById = new Map((catalogIndex.cards || []).map((row) => [String(row.id), row]));
  return (cards || []).map((card) => {
    const catalog = catalogById.get(String(card.id)) || {};
    const aliases = [...new Set([card.baseName, card.englishName].filter(Boolean).map(String))];
    const printedNumber = String(card.model || "").includes("/") ? String(card.model) : String(card.cardNumber || "");
    const normalizedNumber = searchModel.numberKey(printedNumber);
    const normalizedSet = searchModel.compact(card.setCode || card.model || "");
    return {
      id: String(card.id),
      n: String(card.name || ""),
      a: aliases,
      s: String(card.setCode || card.model || ""),
      no: printedNumber,
      r: String(card.rarity || ""),
      v: String(card.variant || ""),
      j: String(card.language || "ja"),
      d: catalog.status === "分析可能" ? "要計算" : "データ不足",
      f: { analysis: catalog.status === "分析可能" ? 1 : 0, siteNew: catalog.siteNew ? 1 : 0, recent: catalog.recentRelease ? 1 : 0 },
      p: `data/card-catalog/chunks/${String(Number(catalog.chunk || 0)).padStart(3, "0")}.json`,
      c: Number(catalog.chunk || 0),
      x: normalizedNumber && normalizedSet ? `${normalizedSet}|${normalizedNumber}` : "",
      nok: normalizedNumber,
      sk: normalizedSet,
      k: searchModel.compact(`${card.name || ""} ${aliases.join(" ")} ${card.setCode || ""} ${printedNumber} ${card.rarity || ""} ${card.id || ""}`),
    };
  });
}

function main() {
  const cards = read(path.join(DATA, "pokemon-cards.json"), []);
  const catalogIndex = read(path.join(CATALOG, "index.json"), { cards: [] });
  const payload = { version: 1, generatedAt: new Date().toISOString(), count: cards.length, cards: buildSearchIndex(cards, catalogIndex) };
  fs.writeFileSync(path.join(CATALOG, "search-index.json"), JSON.stringify(payload), "utf8");
  console.log(JSON.stringify({ count: payload.count, bytes: fs.statSync(path.join(CATALOG, "search-index.json")).size }));
}

if (require.main === module) main();
module.exports = { buildSearchIndex };
