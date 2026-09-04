const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (relative, fallback) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8").replace(/^\uFEFF/, "")); } catch { return fallback; }
};
const write = (relative, value) => fs.writeFileSync(path.join(ROOT, relative), JSON.stringify(value), "utf8");
const aliases = read("work/manual-card-aliases.json", { aliases: [] });
const cards = read("data/pokemon-cards.json", []);
const psa = read("data/psa-population-summary.json", { v: 1, cards: {} });
const cardById = new Map(cards.map((card) => [String(card.id), card]));
const urlFields = {
  cardrush: "cardrushUrl",
  hareruya2: "hareruya2Url",
  yuyutei: "yuyuteiUrl",
  torecacamp: "torecacampUrl",
};
let applied = 0;
for (const alias of aliases.aliases || []) {
  if (alias.status === "disabled") continue;
  const card = cardById.get(String(alias.cardId));
  if (!card) continue;
  const field = urlFields[alias.source];
  if (field && /^https:\/\//.test(String(alias.detailUrl || ""))) {
    card[field] = alias.detailUrl;
    applied += 1;
  }
  if (alias.source === "psaOfficial" && alias.psa && Number(alias.psa.psaTotal) > 0) {
    const total = Number(alias.psa.psaTotal);
    const ten = Math.max(0, Number(alias.psa.psa10Count || 0));
    psa.cards ||= {};
    psa.cards[card.id] = {
      n: alias.psa.cardName || card.name,
      e: card.name,
      ten,
      total,
      rate: ten / total * 100,
      u: alias.detailUrl || alias.psa.sourceUrl || "",
      m: "manual-alias",
      f: alias.confirmedAt || new Date().toISOString(),
    };
    applied += 1;
  }
}
write("data/pokemon-cards.json", cards);
psa.matched = Object.keys(psa.cards || {}).length;
write("data/psa-population-summary.json", psa);
console.log(JSON.stringify({ configured: (aliases.aliases || []).length, applied }));
