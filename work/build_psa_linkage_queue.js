const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));

function makeQueue({ cards, population, buybacks, setDates, setUrls, analysisIds, now }) {
  const setMap = new Map(setUrls.map((entry) => [String(entry.setCode || "").toUpperCase(), entry.url]));
  const today = Date.parse(now);
  const counts = { linked: 0, unlinked: 0, ambiguous: 0, setUrlUnmapped: 0 };
  const rows = [];
  for (const card of cards) {
    if (population[card.id]) { counts.linked++; continue; }
    const setCode = String(card.setCode || "").toUpperCase();
    const cardNumber = String(card.name || "").match(/\[[^\s\]]+\s+(\d+)\/\d+\]/)?.[1] || null;
    const ambiguous = Boolean(card.identityReviewRequired || !cardNumber || !setCode);
    const url = setMap.get(setCode) || null;
    const status = ambiguous ? "ambiguous" : !url ? "set-url-unmapped" : "unlinked";
    if (status === "ambiguous") counts.ambiguous++;
    else if (status === "set-url-unmapped") counts.setUrlUnmapped++;
    else counts.unlinked++;
    const buyback = buybacks[card.id] || {};
    const releaseDate = setDates[setCode] || null;
    const releaseAgeDays = releaseDate ? Math.max(0, Math.floor((today - Date.parse(releaseDate)) / 86400000)) : null;
    const recent = releaseAgeDays != null && releaseAgeDays <= 365;
    const analysis = analysisIds.has(card.id);
    const shopCount = Number(buyback.currentShops || 0);
    const listings30 = Number(buyback.total30 || 0);
    const score = Math.min(100, shopCount * 8) + Math.min(100, listings30)
      + (recent ? 35 : 0) + (analysis ? 30 : 0)
      + Math.min(30, Number(card.p10tv30 || 0));
    rows.push({ cardId: card.id, name: card.name, setCode, cardNumber,
      releaseDate, status, sourceSetUrl: url, priority: score,
      reason: [shopCount ? `買取掲載${shopCount}店・30日${listings30}回` : null,
        recent ? "発売1年以内" : null, analysis ? "分析対象" : null,
        card.p10tv30 ? `PSA10取引30日${card.p10tv30}件` : null].filter(Boolean).join(" / ") || "通常巡回" });
  }
  rows.sort((a, b) => b.priority - a.priority || a.cardId.localeCompare(b.cardId));
  return { generatedAt: now, totalCards: cards.length, counts, priorityTop: rows.slice(0, 200),
    note: "セットURL未登録はPSAデータ不存在を意味しません。認証・取得不能はカード単位の未一致とは分けて扱います。" };
}

function main() {
  const cards = read("data/pokemon-cards.json");
  const population = read("data/psa-population-summary.json").cards || {};
  const buybacks = read("data/shop-buyback-summary.json").cards || {};
  const setDates = read("work/set-release-dates.json").dates || {};
  const setUrls = read("work/psa_set_urls.json");
  const analysisIds = new Set(read("data/card-catalog/analysis.json").map((card) => card.id));
  const queue = makeQueue({ cards, population, buybacks, setDates, setUrls, analysisIds, now: new Date().toISOString() });
  fs.writeFileSync(path.join(root, "data", "psa-linkage-priority.json"), JSON.stringify(queue));
  console.log(JSON.stringify({ counts: queue.counts, top: queue.priorityTop.slice(0, 3).map((row) => row.name) }));
}

if (require.main === module) main();
module.exports = { makeQueue };
