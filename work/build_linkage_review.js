const fs = require("fs");
const path = require("path");
const { compareIdentity, extractIdentity } = require("./card_identity.js");

const ROOT = path.join(__dirname, "..");
const read = (relative, fallback) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8").replace(/^\uFEFF/, "")); } catch { return fallback; }
};
const cards = read("data/pokemon-cards.json", []);
const aliases = read("work/manual-card-aliases.json", { aliases: [] });
const psaSummary = read("data/psa-population-summary.json", { cards: {} });
const psaRows = read("data/psa-official-populations.json", { rows: [] }).rows || [];
const priority = (card) => Number(card.p10tv30 || 0) * 10 + Number(card.tv30 || 0);
const byIdentity = (entries, toIdentity) => {
  const index = new Map();
  for (const entry of entries) {
    const identity = extractIdentity(toIdentity(entry));
    if (!identity.setCode || !identity.cardNumber) continue;
    const key = `${identity.setCode}|${identity.cardNumber}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({ entry, identity });
  }
  return index;
};

const definitions = [
  { id: "cardrush", field: "cardrushUrl", catalog: read("work/cardrush_catalog.json", []), identity: (row) => row.name, url: (row) => row.detailUrl },
  { id: "hareruya2", field: "hareruya2Url", catalog: read("work/hareruya2_catalog.json", []), identity: (row) => row.name, url: (row) => row.detailUrl },
  { id: "yuyutei", field: "yuyuteiUrl", catalog: read("work/yuyutei_catalog.json", []), identity: (row) => ({ ...row, name: `${row.title || ""} [${row.setCode || ""} ${row.cardNo || ""}]` }), url: (row) => row.detailUrl },
  { id: "torecacamp", field: "torecacampUrl", catalog: read("work/torecacamp_catalog.json", []), identity: (row) => row.title, url: (row) => row.detailUrl },
  { id: "psaOfficial", field: null, catalog: psaRows, identity: (row) => ({ ...row, name: `${row.cardName || ""} [${row.setCode || ""} ${row.cardNo || ""}]` }), url: (row) => row.sourceUrl },
];

const sources = {};
for (const definition of definitions) {
  const index = byIdentity(definition.catalog, definition.identity);
  const matchedIds = definition.id === "psaOfficial" ? new Set(Object.keys(psaSummary.cards || {})) : null;
  const targets = cards
    .filter((card) => Number(card.snkPsa10Price) > 0 && !(definition.field ? card[definition.field] : matchedIds.has(card.id)))
    .sort((left, right) => priority(right) - priority(left));
  const ambiguous = [];
  const uniqueSuggestions = [];
  for (const card of targets) {
    const identity = extractIdentity(card);
    if (!identity.setCode || !identity.cardNumber) continue;
    const candidates = (index.get(`${identity.setCode}|${identity.cardNumber}`) || [])
      .map(({ entry }) => {
        const comparison = compareIdentity(card, definition.identity(entry));
        return {
          url: definition.url(entry),
          name: String(entry.name || entry.title || entry.cardName || ""),
          score: comparison.score,
          nameCompatible: comparison.nameCompatible,
        };
      })
      .filter((candidate) => candidate.score >= 80 && (definition.id === "psaOfficial" || candidate.nameCompatible))
      .sort((left, right) => right.score - left.score);
    if (candidates.length === 1 && candidates[0].score >= 90) {
      uniqueSuggestions.push({ cardId: card.id, cardName: card.name, ...candidates[0] });
    } else if (candidates.length > 1) {
      ambiguous.push({ cardId: card.id, cardName: card.name, identity, candidates: candidates.slice(0, 8) });
    }
  }
  sources[definition.id] = {
    unresolved: targets.length,
    uniqueSuggestionCount: uniqueSuggestions.length,
    ambiguousCount: ambiguous.length,
    uniqueSuggestions: uniqueSuggestions.slice(0, 200),
    ambiguousCandidates: ambiguous.slice(0, 200),
  };
}

const output = {
  version: 1,
  generatedAt: new Date().toISOString(),
  manualAliasCount: (aliases.aliases || []).length,
  instructions: "確定した候補は work/manual-card-aliases.json の aliases に source, cardId, detailUrl, status=confirmed を追加します。曖昧候補は番号・レアリティ・絵柄を確認するまで自動採用しません。",
  sources,
};
fs.writeFileSync(path.join(ROOT, "data", "linkage-review.json"), JSON.stringify(output), "utf8");
console.log(JSON.stringify(Object.fromEntries(Object.entries(sources).map(([id, value]) => [id, { unresolved: value.unresolved, unique: value.uniqueSuggestionCount, ambiguous: value.ambiguousCount }]))));
