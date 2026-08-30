const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUTPUT = path.join(ROOT, "data", "update-status.json");

function read(relativePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
  } catch {
    return fallback;
  }
}

function jstDate(value = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(value));
}

function validDate(value) {
  if (!value) return null;
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

const today = jstDate();
const previous = read("data/update-status.json", {});
const meta = read("data/pokemon-cards-meta.json");
const stock = read("data/cardrush-stock-summary.json");
const hareruya2 = read("data/hareruya2-stock-summary.json");
const buyback = read("data/shop-buyback-summary.json");
const psa = read("data/psa-official-populations.json");
const services = read("data/psa-japan-services.json");
const psaRowDates = (psa.rows || []).map((row) => validDate(row.fetchedAt)).filter(Boolean);
const psaDateCounts = {};
for (const date of psaRowDates) psaDateCounts[date] = (psaDateCounts[date] || 0) + 1;
const dominantPsaDate = Object.entries(psaDateCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

const sources = {
  toreca: { label: "みんトレ", date: validDate(meta.updatedAt || meta.generatedAt), automatic: true },
  cardrush: { label: "カードラッシュ", date: validDate(stock.updatedAt), automatic: true },
  hareruya2: { label: "晴れる屋2", date: validDate(hareruya2.updatedAt), automatic: true },
  shopBuyback: { label: "Web買取表", date: validDate(buyback.updatedAt), automatic: true },
  psaOfficial: { label: "PSA公式枚数", date: dominantPsaDate, automatic: false, note: "ログイン済みPCで取得", coverageRows: psaDateCounts[dominantPsaDate] || 0 },
  psaJapan: { label: "PSA Japan料金", date: validDate(services.checkedAt || services.updatedAt), automatic: true, status: services.checkStatus || "unknown" },
};

for (const source of Object.values(sources)) {
  source.fresh = source.date === today && source.status !== "failed";
}
// Login-dependent PSA data remains visible with its own date. A completed
// daily refresh means every source that GitHub Actions can update is current.
const automaticSources = Object.values(sources).filter((source) => source.automatic);
const complete = automaticSources.length > 0 && automaticSources.every((source) => source.fresh);
const manualPending = Object.entries(sources)
  .filter(([, source]) => !source.automatic && !source.fresh)
  .map(([key]) => key);
const payload = {
  checkedAt: new Date().toISOString(),
  complete,
  completeDate: complete ? today : previous.completeDate || null,
  manualPending,
  sources,
};
fs.writeFileSync(OUTPUT, JSON.stringify(payload), "utf8");
console.log(JSON.stringify({ complete, completeDate: payload.completeDate, sources }));
