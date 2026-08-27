const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function readJson(relativePath, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8")); } catch { return fallback; }
}

function quantile(values, ratio) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * ratio;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function stats(values) {
  const clean = values.map(Number).filter(Number.isFinite);
  return {
    count: clean.length,
    q25: quantile(clean, 0.25),
    q50: quantile(clean, 0.5),
    q75: quantile(clean, 0.75),
    q90: quantile(clean, 0.9),
  };
}

function bandFor(price) {
  if (price < 30000) return "under30k";
  if (price < 50000) return "30k-50k";
  if (price < 100000) return "50k-100k";
  if (price < 200000) return "100k-200k";
  return "over200k";
}

function buildBand(rows) {
  return {
    sampleSize: rows.length,
    psaTx7: stats(rows.map((row) => row.psaTx7)),
    psaTx30: stats(rows.map((row) => row.psaTx30)),
    rawTx30: stats(rows.map((row) => row.rawTx30)),
    buyback30: stats(rows.map((row) => row.buyback30)),
    buybackShops: stats(rows.map((row) => row.buybackShops)),
    roi: stats(rows.map((row) => row.roi).filter((value) => value >= -50 && value <= 300)),
  };
}

function main() {
  const cards = readJson("data/pokemon-cards.json", []);
  const buybacks = readJson("data/shop-buyback-summary.json", { cards: {} }).cards || {};
  const official = readJson("data/psa-population-summary.json", { cards: {} }).cards || {};
  const bundleOfficialIds = new Set(
    ["x-516413", "x-516414", "x-516415", "x-516416"].every((id) => Number.isFinite(official[id]?.rate))
      ? ["x-141447"]
      : []
  );
  const fee = 12980;
  const rows = cards.map((card) => {
    const raw = Number(card.price || 0);
    const psa10 = Number(card.snkPsa10Price || 0);
    const profit = psa10 - raw - fee;
    const roi = raw + fee > 0 ? profit / (raw + fee) * 100 : null;
    return {
      id: String(card.id),
      psa10,
      psaTx7: Number(card.p10tv7 || 0),
      psaTx30: Number(card.p10tv30 || 0),
      rawTx30: Number(card.tv30 || 0),
      buyback30: Number(buybacks[card.id]?.total30 || 0),
      buybackShops: Number(buybacks[card.id]?.shop30 || 0),
      roi,
      hasOfficial: Number.isFinite(official[card.id]?.rate) || bundleOfficialIds.has(String(card.id)),
      hasCardrush: Boolean(card.cardrushUrl),
    };
  }).filter((row) => row.psa10 > 0);

  const bands = {};
  for (const key of ["under30k", "30k-50k", "50k-100k", "100k-200k", "over200k"]) {
    bands[key] = buildBand(rows.filter((row) => bandFor(row.psa10) === key));
  }
  const eligible = rows.filter((row) => row.roi >= 40 && row.psaTx30 >= 3)
    .sort((a, b) => b.psaTx30 - a.psaTx30 || b.roi - a.roi)
    .slice(0, 100);
  const coverage = {
    targetCount: eligible.length,
    officialLinked: eligible.filter((row) => row.hasOfficial).length,
    cardrushLinked: eligible.filter((row) => row.hasCardrush).length,
    officialRate: eligible.length ? eligible.filter((row) => row.hasOfficial).length / eligible.length * 100 : 0,
    cardrushRate: eligible.length ? eligible.filter((row) => row.hasCardrush).length / eligible.length * 100 : 0,
    missingOfficialIds: eligible.filter((row) => !row.hasOfficial).map((row) => row.id),
    missingCardrushIds: eligible.filter((row) => !row.hasCardrush).map((row) => row.id),
  };
  const output = {
    version: 1,
    generatedAt: new Date().toISOString(),
    generatedDateJst: new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()),
    method: "price-band-quantile-v1",
    weights: { exitLiquidity: 45, economics: 25, stability: 15, supplyRisk: 15 },
    sampleSize: rows.length,
    global: buildBand(rows),
    bands,
    topCandidateCoverage: coverage,
  };
  fs.writeFileSync(path.join(ROOT, "data", "evaluation-model.json"), JSON.stringify(output), "utf8");
  console.log(`evaluation model: samples=${rows.length}, top official=${coverage.officialLinked}/${coverage.targetCount}, cardrush=${coverage.cardrushLinked}/${coverage.targetCount}`);
}

main();
