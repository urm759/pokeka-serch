const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const HISTORY = path.join(__dirname, "snkr_listing_history.json");
const OUTPUT = path.join(ROOT, "data", "snkr-listing-summary.json");
const read = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")); } catch { return fallback; }
};
const cards = read(path.join(ROOT, "data", "pokemon-cards.json"), []);
const meta = read(path.join(ROOT, "data", "pokemon-cards-meta.json"), {});
const history = read(HISTORY, { version: 1, dates: [] });
const date = String(meta.updatedAt || meta.generatedAt || new Date().toISOString()).slice(0, 10);
const snapshot = {};
for (const card of cards) {
  if (card.snkListings == null || !(Number(card.snkPsa10Price) > 0)) continue;
  snapshot[card.id] = [Math.max(0, Number(card.snkListings)), Number(card.snkPsa10Min) > 0 ? Number(card.snkPsa10Min) : null];
}
history.dates = (history.dates || []).filter((entry) => entry.date !== date).slice(-30);
history.dates.push({ date, cards: snapshot });
history.updatedAt = new Date().toISOString();

const findPast = (days) => {
  const target = Date.parse(`${date}T00:00:00Z`) - days * 86400000;
  return [...history.dates]
    .filter((entry) => Date.parse(`${entry.date}T00:00:00Z`) <= target)
    .sort((left, right) => String(right.date).localeCompare(String(left.date)))[0] || null;
};
const past7 = findPast(7);
const past30 = findPast(30);
const summary = {};
for (const [cardId, values] of Object.entries(snapshot)) {
  const previous7 = past7?.cards?.[cardId]?.[0];
  const previous30 = past30?.cards?.[cardId]?.[0];
  summary[cardId] = {
    current: values[0],
    listingFloor: values[1],
    change7: Number.isFinite(previous7) ? values[0] - previous7 : null,
    change30: Number.isFinite(previous30) ? values[0] - previous30 : null,
    previous7Date: Number.isFinite(previous7) ? past7.date : null,
    previous30Date: Number.isFinite(previous30) ? past30.date : null,
    status: Number.isFinite(previous7) && Number.isFinite(previous30) ? "判定可" : "蓄積中",
  };
}
fs.writeFileSync(HISTORY, JSON.stringify(history), "utf8");
fs.writeFileSync(OUTPUT, JSON.stringify({ version: 1, updatedAt: history.updatedAt, date, observations: history.dates.length, cards: summary }), "utf8");
console.log(JSON.stringify({ date, cards: Object.keys(summary).length, observations: history.dates.length }));
