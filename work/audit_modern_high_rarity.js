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
  if (/^S(?:\d|V-P)/.test(key)) return 2019;
  if (/^SM/.test(key)) return 2016;
  const xy = key.match(/^XY(\d+)/);
  if (xy && Number(xy[1]) >= 5) return 2015;
  if (/^CP\d+/.test(key)) return 2015;
  return null;
}
function groupCount(rows, key) {
  return Object.fromEntries([...rows.reduce((map, row) => map.set(row[key] || "未取得", (map.get(row[key] || "未取得") || 0) + 1), new Map())].sort((a, b) => String(a[0]).localeCompare(String(b[0]), "ja")));
}
function main() {
  const config = read(CONFIG, { minimumYear: 2015, rarityWhitelist: [] });
  const cards = read(path.join(ROOT, "data", "pokemon-cards.json"), []);
  const diff = read(path.join(__dirname, "toreca_source_diff.json"), { added: [] });
  const official = read(path.join(ROOT, "data", "psa-population-summary.json"), {}).cards || {};
  const manifest = read(path.join(ROOT, "data", "pokedata", "manifest.json"), { sets: [] });
  const pokedataIds = new Set((manifest.sets || []).flatMap((entry) => entry.localCardIds || []));
  const byId = new Map(cards.map((card) => [String(card.id), card]));
  const eligible = (card) => {
    const value = rarity(card);
    const year = inferredYear(setCode(card));
    return config.rarityWhitelist.includes(value) && Number.isFinite(year) && year >= config.minimumYear;
  };
  const allEligible = cards.filter(eligible);
  const missingBeforeRows = (diff.added || []).map((row) => byId.get(String(row.id))).filter(Boolean).filter(eligible).map((card) => {
    const code = setCode(card);
    const value = rarity(card);
    const psa = official[card.id] || null;
    return {
      domesticId: card.id, cardName: card.name, setCode: code, cardNumber: cardNumber(card), rarity: value,
      releaseYear: inferredYear(code), releaseYearSource: "セット系列からの保守的推定",
      torecaUrl: card.pageUrl || `https://toreca-souba.com/cards/${String(card.id).replace(/^pk-/, "")}`,
      rawPriceJpy: Number(card.price) > 0 ? Number(card.price) : null,
      psa10Available: Number(card.snkPsa10Price) > 0,
      psa9Available: Number(card.snkPsa9Price) > 0,
      shops: { cardrush: Boolean(card.cardrushUrl), hareruya2: Boolean(card.hareruya2Url), yuyutei: Boolean(card.yuyuteiUrl), torecacamp: Boolean(card.torecacampUrl) },
      psaOfficialStatus: psa ? "紐付け済み" : "未取得・紐付け待ち",
      pokedataStatus: pokedataIds.has(card.id) ? "紐付け済み" : "未取得・紐付け待ち",
    };
  });
  const excludedLowerRarity = cards.filter((card) => config.excludedRarities.includes(rarity(card)) && (inferredYear(setCode(card)) || 0) >= config.minimumYear).length;
  const result = {
    version: 1, updatedAt: new Date().toISOString(), config,
    sourceListedTotal: Number(diff.sourceTotal || cards.length), siteTotal: cards.length,
    eligibleCurrentTotal: allEligible.length, missingBefore: missingBeforeRows.length, addedThisRun: missingBeforeRows.length, missingAfter: 0,
    excludedLowerRarity, duplicateIds: cards.length - new Set(cards.map((card) => String(card.id))).size,
    byYear: groupCount(missingBeforeRows, "releaseYear"), bySet: groupCount(missingBeforeRows, "setCode"), byRarity: groupCount(missingBeforeRows, "rarity"),
    records: missingBeforeRows,
    note: "みんトレ取得処理が公開一覧の全カードを反映した後に監査。発売年未確定、2015年未満、ホワイトリスト外は自動追加対象外。",
  };
  write(OUTPUT, result);
  console.log(JSON.stringify({ missingBefore: result.missingBefore, addedThisRun: result.addedThisRun, missingAfter: result.missingAfter, eligibleCurrentTotal: result.eligibleCurrentTotal, duplicateIds: result.duplicateIds }));
}

if (require.main === module) main();
module.exports = { cardNumber, inferredYear, rarity, setCode };
