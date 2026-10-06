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
  const parsed = require("./build_psa_linkage_queue.js").psaIdentity(card);
  if (parsed.cardNumber) return { setCode: parsed.setCode, cardNo: parsed.cardNumber };
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
  const completion = readJson(path.join(__dirname, "card-completion-queue.json"), { cards: {} });
  const linkage = readJson(path.join(ROOT, "work/psa-linkage-all.json"), readJson(path.join(ROOT, "data/psa-linkage-priority.json"), { priorityTop: [] }));
  const linkageById = new Map((linkage.rows || linkage.priorityTop || []).map((row) => [row.cardId, row]));
  const completionRows = cards.map((card) => {
    const pending = linkageById.get(card.id);
    if (!pending?.sourceSetUrl || pending.status !== "unlinked" || population[card.id]) return null;
    const item = completion.cards[card.id] || {};
    return { cardId: card.id, name: card.name, setCode: pending.setCode, cardNo: pending.cardNumber,
      priority: Number(item.p || 0) * 1000000 + (item.m?.length === 1 ? 10000000000 : 0),
      reason: item.r || [pending.reason], sourceSetUrl: pending.sourceSetUrl };
  }).filter(Boolean);
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

  for (const row of completionRows) if (!rows.some((r) => r.cardId === row.cardId)) rows.push(row);
  const focus = require("./focus_monitor.js").write(ROOT);
  for (const card of cards) {
    const watched = focus.cards[card.id];
    if (!watched || !watched.pending.some((key) => ["psaPopulation", "psaRate"].includes(key))) continue;
    const key = identity(card);
    const source = manifest.find((entry) => String(entry.setCode || "").toUpperCase() === key.setCode && entry.url);
    if (!source) continue;
    const row = { cardId: card.id, name: card.name, ...key, priority: 1e13, focused: true,
      reason: [watched.priorityReason], sourceSetUrl: source.url };
    const at = rows.findIndex((r) => r.cardId === card.id);
    if (at >= 0) rows[at] = row; else rows.push(row);
  }
  rows.sort((a, b) => b.priority - a.priority);
  const setPriority = [...new Set(rows.map((row) => row.setCode))];
  const orderedSets = [
    ...manifest.filter((entry) => setPriority.includes(String(entry.setCode || "").toUpperCase())).sort((a, b) => setPriority.indexOf(String(a.setCode).toUpperCase()) - setPriority.indexOf(String(b.setCode).toUpperCase())),
    ...legacyEntries.filter((entry) => !setPriority.includes(String(entry.setCode || "").toUpperCase())),
  ].map((entry) => ({ setCode: entry.setCode, name: entry.name, url: entry.url }));
  const payload = {
    generatedAt: new Date().toISOString(),
    purpose: "補完優先度・あと1項目で分析可能・買取掲載をPSA認証取得へ接続。年代を限定せず曖昧URLは除外",
    total: rows.length,
    rows,
    orderedSets,
    focusSetUrls: [...new Set(rows.filter((r) => r.focused).map((r) => r.sourceSetUrl))],
    maxFocusedShare: focus.maxFocusedShare,
  };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload), "utf8");
  console.log(JSON.stringify({ priorityCards: rows.length, prioritySets: setPriority, output: OUTPUT_PATH }));
}

main();
