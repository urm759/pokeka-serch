const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CARDS_PATH = path.join(ROOT, "data", "pokemon-cards.json");
const BUYBACK_PATH = path.join(ROOT, "data", "shop-buyback-summary.json");
const POPULATION_PATH = path.join(ROOT, "data", "psa-population-summary.json");
const MANIFEST_PATH = path.join(__dirname, "psa_set_urls.json");
const OUTPUT_PATH = path.join(__dirname, "psa_priority_queue.json");

function readJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return fallback; }
}

function normalizeNo(value) {
  return String(value || "").replace(/^#/, "").trim().replace(/^0+(?=\d)/, "").toUpperCase();
}

function identity(card) {
  const query = String(card.psaQuery || "").match(/^Pokemon Japanese\s+(.+?)\s+([^\s]+)$/i);
  if (query) return { setCode: query[1].toUpperCase(), cardNo: normalizeNo(query[2].split("/")[0]) };
  const inside = String(card.name || "").match(/\[([^\]]+)\]/)?.[1] || "";
  const parts = inside.trim().toUpperCase().split(/\s+/);
  const setCode = parts[0] || "";
  const number = parts.slice(1).find((part) => /^\d/.test(part)) || "";
  return { setCode, cardNo: normalizeNo(number.split("/")[0]) };
}

function releaseYear(entry) {
  return Number(String(entry.name || "").match(/^(\d{4})/)?.[1] || 9999);
}

function main() {
  const cards = readJson(CARDS_PATH, []);
  const buybacks = readJson(BUYBACK_PATH, { cards: {} }).cards || {};
  const population = readJson(POPULATION_PATH, { cards: {} }).cards || {};
  const manifest = readJson(MANIFEST_PATH, []);
  const legacyEntries = manifest.filter((entry) => releaseYear(entry) <= 2016 && entry.url);
  const legacySetCodes = new Set(legacyEntries.map((entry) => String(entry.setCode || "").toUpperCase()));

  const rows = cards.map((card) => {
    const buyback = buybacks[card.id];
    const key = identity(card);
    if (!buyback?.currentShops || population[card.id] || !legacySetCodes.has(key.setCode) || !key.cardNo) return null;
    return {
      cardId: card.id,
      name: card.name,
      setCode: key.setCode,
      cardNo: key.cardNo,
      currentShops: Number(buyback.currentShops || 0),
      buybackPrice: Number(buyback.avg30 || buyback.avg7 || 0),
      priority: Number(buyback.currentShops || 0) * 1_000_000_000 + Number(buyback.avg30 || buyback.avg7 || 0),
    };
  }).filter(Boolean).sort((a, b) => b.priority - a.priority);

  const setPriority = [...new Set(rows.map((row) => row.setCode))];
  const orderedSets = [
    ...legacyEntries.filter((entry) => setPriority.includes(String(entry.setCode || "").toUpperCase())),
    ...legacyEntries.filter((entry) => !setPriority.includes(String(entry.setCode || "").toUpperCase())),
  ].map((entry) => ({ setCode: entry.setCode, name: entry.name, url: entry.url }));
  const payload = {
    generatedAt: new Date().toISOString(),
    purpose: "PSA未紐付けかつ現行買取表掲載の2016年以前カードを先行処理するキュー",
    total: rows.length,
    rows,
    orderedSets,
  };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf8");
  console.log(JSON.stringify({ priorityCards: rows.length, prioritySets: setPriority, output: OUTPUT_PATH }));
}

main();
