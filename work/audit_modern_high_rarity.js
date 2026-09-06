const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CONFIG = path.join(__dirname, "modern-high-rarity-config.json");
const OUTPUT = path.join(ROOT, "data", "modern-high-rarity-audit.json");

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")); } catch { return fallback; }
}
function write(file, value) {
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value), "utf8");
  fs.renameSync(temporary, file);
}
function setCode(card) {
  return (String(card?.name || "").match(/\[\s*([A-Za-z0-9+\-]+)\s+\d/) || [])[1]?.toUpperCase() || null;
}
function cardNumber(card) {
  const standard = String(card?.name || "").match(/\[\s*[A-Za-z0-9+\-]+\s+(\d{1,4}(?:-\d{1,4})?(?:\/\d{1,4})?)/);
  const promo = String(card?.name || "").match(/\[\s*(\d{1,4})\s+[A-Za-z0-9-]+-P\s*\]/i);
  return standard?.[1] || promo?.[1] || null;
}
function rarity(card) {
  const explicit = String(card?.rarity || "").toUpperCase();
  if (explicit) return explicit;
  return (String(card?.name || "").match(/(?:^|\s)(MUR|BWR|SAR|SSR|CSR|HR|UR|SR)(?=[:\s\[])/i) || [])[1]?.toUpperCase() || null;
}
function inferredYear(code) {
  const key = String(code || "").toUpperCase();
  if (/^M\d/.test(key)) return 2025;
  if (/^SV/.test(key)) return 2023;
  if (/^S(?:\d|V-P|-P)/.test(key)) return 2019;
  if (/^SM/.test(key)) return 2016;
  const xy = key.match(/^XY(\d+)/);
  if (xy && Number(xy[1]) >= 5) return 2015;
  if (/^CP\d+/.test(key)) return 2015;
  return null;
}
function language(card) {
  const name = String(card?.name || "");
  if (/【英語版】|\bEN\b/i.test(name)) return "en";
  if (/【中国語版】|簡体字|繁体字/.test(name)) return "zh";
  if (/【韓国語版】/.test(name)) return "ko";
  if (/【インドネシア語版】/.test(name)) return "id";
  return "ja";
}
function releaseInfo(card, snapshotDate) {
  const days = Number(card?.days);
  const base = new Date(`${String(snapshotDate || "").slice(0, 10)}T00:00:00Z`);
  // The source uses 0 both for a same-day release and for an unknown release
  // date. Treat it as unknown and use a conservative set-series fallback.
  if (Number.isFinite(days) && days > 0 && !Number.isNaN(base.getTime())) {
    const date = new Date(base.getTime() - Math.round(days) * 86400000);
    return { year: date.getUTCFullYear(), date: date.toISOString().slice(0, 10), source: "みんトレ発売経過日数" };
  }
  const year = inferredYear(setCode(card));
  return year ? { year, date: null, source: "セット系列からの保守的推定" } : { year: null, date: null, source: "未取得" };
}
function groupCount(rows, key) {
  return Object.fromEntries([...rows.reduce((map, row) => map.set(row[key] || "未取得", (map.get(row[key] || "未取得") || 0) + 1), new Map())].sort((a, b) => String(a[0]).localeCompare(String(b[0]), "ja")));
}
function main() {
  const config = read(CONFIG, { minimumYear: 2015, rarityWhitelist: [] });
  const cards = read(path.join(ROOT, "data", "pokemon-cards.json"), []);
  const diff = read(path.join(__dirname, "toreca_source_diff.json"), { added: [] });
  const inventory = read(path.join(__dirname, "toreca-source-inventory.json"), null);
  const official = read(path.join(ROOT, "data", "psa-population-summary.json"), {}).cards || {};
  const manifest = read(path.join(ROOT, "data", "pokedata", "manifest.json"), { sets: [] });
  const pokedataIds = new Set((manifest.sets || []).flatMap((entry) => entry.localCardIds || []));
  const byId = new Map(cards.map((card) => [String(card.id), card]));
  const sourceCards = Array.isArray(inventory?.cards) ? inventory.cards : [];
  const snapshotDate = inventory?.updatedAt || diff.updatedAt || new Date().toISOString();
  const classify = (card) => {
    const value = rarity(card);
    const release = releaseInfo(card, snapshotDate);
    const lang = language(card);
    if (!config.rarityWhitelist.includes(value)) return { eligible: false, reason: "対象外レアリティ", value, release, lang };
    if (!config.languageWhitelist.includes(lang)) return { eligible: false, reason: "対象外言語", value, release, lang };
    if (!Number.isFinite(release.year)) return { eligible: false, reason: "発売年不明", value, release, lang };
    if (release.year < config.minimumYear) return { eligible: false, reason: "2015年未満", value, release, lang };
    return { eligible: true, reason: null, value, release, lang };
  };
  const sourceClassified = sourceCards.map((card) => ({ card, classification: classify(card) }));
  const sourceEligible = sourceClassified.filter((row) => row.classification.eligible);
  const siteEligible = cards.filter((card) => classify(card).eligible);
  const sourceEligibleIds = new Set(sourceEligible.map((row) => String(row.card.id)));
  const siteIds = new Set(cards.map((card) => String(card.id)));
  const missingAfterRows = sourceEligible.filter((row) => !siteIds.has(String(row.card.id)));
  const addedEligibleIds = new Set((diff.added || []).map((row) => String(row.id)).filter((id) => sourceEligibleIds.has(id)));
  const detailRow = (card) => {
    const code = setCode(card);
    const value = rarity(card);
    const release = releaseInfo(card, snapshotDate);
    const psa = official[card.id] || null;
    return {
      domesticId: card.id, cardName: card.name, setCode: code, cardNumber: cardNumber(card), rarity: value,
      language: language(card), releaseYear: release.year, releaseDate: release.date, releaseYearSource: release.source,
      torecaUrl: card.pageUrl || `https://toreca-souba.com/cards/${String(card.id).replace(/^pk-/, "")}`,
      rawPriceJpy: Number(card.price) > 0 ? Number(card.price) : null,
      psa10Available: Number(card.snkPsa10Price) > 0,
      psa9Available: Number(card.snkPsa9Price) > 0,
      shops: { cardrush: Boolean(card.cardrushUrl), hareruya2: Boolean(card.hareruya2Url), yuyutei: Boolean(card.yuyuteiUrl), torecacamp: Boolean(card.torecacampUrl) },
      psaOfficialStatus: psa ? "紐付け済み" : "未取得・紐付け待ち",
      pokedataStatus: pokedataIds.has(card.id) ? "紐付け済み" : "未取得・紐付け待ち",
    };
  };
  const missingAfterDetails = missingAfterRows.map((row) => detailRow(row.card));
  const unknownYearRows = sourceClassified.filter((row) => row.classification.reason === "発売年不明").map((row) => detailRow(row.card));
  const exclusionCounts = sourceClassified.reduce((out, row) => {
    if (row.classification.reason) out[row.classification.reason] = (out[row.classification.reason] || 0) + 1;
    return out;
  }, {});
  const sourceDuplicateIds = sourceCards.length - new Set(sourceCards.map((card) => String(card.id))).size;
  const reproducible = Boolean(inventory && Number(inventory.total) === sourceCards.length && sourceCards.length > 0);
  const result = {
    version: 2, updatedAt: new Date().toISOString(), snapshotDate, config, reproducible,
    sourceListedTotal: sourceCards.length, sourceSnapshotDeclaredTotal: Number(inventory?.total || 0), siteTotal: cards.length,
    releaseYearKnownTotal: sourceClassified.filter((row) => Number.isFinite(row.classification.release.year)).length,
    releaseYearUnknownTotal: unknownYearRows.length,
    targetRarityTotal: sourceClassified.filter((row) => config.rarityWhitelist.includes(row.classification.value)).length,
    eligibleSourceTotal: sourceEligible.length,
    eligibleCurrentTotal: siteEligible.length,
    matchedTotal: sourceEligible.filter((row) => siteIds.has(String(row.card.id))).length,
    missingBefore: addedEligibleIds.size,
    addedThisRun: addedEligibleIds.size,
    missingAfter: missingAfterDetails.length,
    exclusionCounts,
    excludedLowerRarity: sourceClassified.filter((row) => config.excludedRarities.includes(row.classification.value)).length,
    duplicateIds: cards.length - new Set(cards.map((card) => String(card.id))).size,
    sourceDuplicateIds,
    byYear: groupCount(sourceEligible.map((row) => detailRow(row.card)), "releaseYear"),
    bySet: groupCount(sourceEligible.map((row) => detailRow(row.card)), "setCode"),
    byRarity: groupCount(sourceEligible.map((row) => detailRow(row.card)), "rarity"),
    records: missingAfterDetails,
    manualReview: { releaseYearUnknown: unknownYearRows },
    note: reproducible
      ? "保存済みのみんトレ全件スナップショットと公開カードをID・セット・番号・名称・レアリティ・仕様・言語で再照合。"
      : "みんトレ全件スナップショット未生成のため不足0枚を証明できません。次回取得後に再監査します。",
  };
  write(OUTPUT, result);
  console.log(JSON.stringify({ reproducible, sourceListedTotal: result.sourceListedTotal, releaseYearKnownTotal: result.releaseYearKnownTotal, releaseYearUnknownTotal: result.releaseYearUnknownTotal, targetRarityTotal: result.targetRarityTotal, eligibleSourceTotal: result.eligibleSourceTotal, matchedTotal: result.matchedTotal, missingBefore: result.missingBefore, addedThisRun: result.addedThisRun, missingAfter: result.missingAfter, exclusionCounts, duplicateIds: result.duplicateIds, sourceDuplicateIds }));
}

if (require.main === module) main();
module.exports = { cardNumber, inferredYear, language, rarity, releaseInfo, setCode };
