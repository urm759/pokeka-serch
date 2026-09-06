const fs = require("fs");
const path = require("path");
const { median } = require("./pokedata_analysis.js");

const ROOT = path.join(__dirname, "..");
const CONFIG_PATH = path.join(__dirname, "market-research-config.json");
const LEAD_HISTORY_PATH = path.join(__dirname, "overseas_lead_history.json");
const SEASON_HISTORY_PATH = path.join(__dirname, "seasonality_history.json");
const OUTPUT = path.join(ROOT, "data", "market-research-summary.json");
const DAY_MS = 86400000;

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")); } catch { return fallback; }
}
function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value), "utf8");
  fs.renameSync(temporary, file);
}
function jstDate() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
function round(value, digits = 2) {
  return Number.isFinite(value) ? Math.round(value * (10 ** digits)) / (10 ** digits) : null;
}
function periodComparison(market, domestic, minimum) {
  const build = (period) => {
    const count = Number(period?.count || 0);
    const overseas = positive(period?.medianJpy);
    const comparable = count >= minimum && overseas && domestic;
    const ratio = comparable ? overseas / domestic : null;
    return {
      count, overseasMedianJpy: overseas, domesticMedianJpy: domestic,
      differenceJpy: comparable ? Math.round(overseas - domestic) : null,
      differenceRatePct: comparable ? round((ratio - 1) * 100) : null,
      level: !comparable ? "参考値・件数不足" : ratio < 0.9 ? "国内が高い" : ratio > 1.1 ? "国内が安い" : "同水準",
      comparable: Boolean(comparable), lastSaleDate: period?.lastSaleDate || null,
    };
  };
  return {
    days30: build(market?.periods?.days30), days90: build(market?.periods?.days90), all: build(market?.periods?.all),
  };
}
function loadPokedata() {
  const manifest = read(path.join(ROOT, "data", "pokedata", "manifest.json"), { sets: [] });
  const details = {};
  for (const entry of manifest.sets || []) {
    const shard = read(path.join(ROOT, ...String(entry.file).split("/")), { cards: {} });
    Object.assign(details, shard.cards || {});
  }
  return { manifest, details };
}
function appendDaily(history, date, rows) {
  history.version ||= 1;
  history.dates = [...new Set([...(history.dates || []), date])].sort();
  history.cards ||= {};
  for (const [cardId, row] of Object.entries(rows)) {
    const previous = (history.cards[cardId] || []).filter((entry) => entry[0] !== date);
    previous.push(row);
    history.cards[cardId] = previous.sort((a, b) => a[0].localeCompare(b[0])).slice(-730);
  }
  history.updatedAt = new Date().toISOString();
}
function groupMetrics(cards, buybackCards, predicate) {
  const selected = cards.filter(predicate);
  const rawPrices = selected.map((card) => positive(card.price)).filter(Boolean);
  const psaPrices = selected.map((card) => positive(card.snkPsa10Price)).filter(Boolean);
  const buybackPrices = selected.flatMap((card) => Object.values(buybackCards[card.id]?.shops || {}).map((shop) => positive(shop.price)).filter(Boolean));
  return {
    cardCount: selected.length,
    domesticRawMedianJpy: median(rawPrices), domesticPsa10MedianJpy: median(psaPrices),
    transactionCount30: selected.reduce((sum, card) => sum + Math.max(0, Number(card.tv30 || 0)) + Math.max(0, Number(card.p10tv30 || 0)), 0),
    buybackListedCards: selected.filter((card) => Object.keys(buybackCards[card.id]?.shops || {}).length > 0).length,
    buybackPriceMedianJpy: median(buybackPrices),
    buybackRateMedian: median(selected.flatMap((card) => Object.values(buybackCards[card.id]?.shops || {}).map((shop) => {
      const market = positive(card.snkPsa10Price); const price = positive(shop.price);
      return market && price ? price / market : null;
    }).filter(Number.isFinite))),
    goCandidateCount: null, highTurnoverCount: selected.filter((card) => Number(card.p10tv30 || 0) >= 30).length,
  };
}
function eventPhase(date, period) {
  const value = Date.parse(`${date}T00:00:00Z`);
  const start = Date.parse(`${period.start}T00:00:00Z`);
  const end = Date.parse(`${period.end}T00:00:00Z`);
  if (value >= start && value <= end) return "during";
  if (value >= start - 30 * DAY_MS && value < start) return "before";
  if (value > end && value <= end + 30 * DAY_MS) return "after";
  return null;
}
function main() {
  const config = read(CONFIG_PATH, { minimumComparisonSales: 3, seasonalEvents: [], referenceOnly: true });
  const cards = read(path.join(ROOT, "data", "pokemon-cards.json"), []);
  const buybacks = read(path.join(ROOT, "data", "shop-buyback-summary.json"), {}).cards || {};
  const { manifest, details } = loadPokedata();
  const date = jstDate();
  const comparisons = {};
  const leadRows = {};
  let latestFx = null;
  for (const [cardId, detail] of Object.entries(details)) {
    const local = cards.find((card) => String(card.id) === String(cardId));
    if (!local) continue;
    const raw = detail.markets?.ebayRaw;
    const psa10 = detail.markets?.ebayPsa10;
    const psa9 = detail.markets?.ebayPsa9;
    comparisons[cardId] = {
      raw: periodComparison(raw, positive(local.price), config.minimumComparisonSales),
      psa10: periodComparison(psa10, positive(local.snkPsa10Price), config.minimumComparisonSales),
      psa9: periodComparison(psa9, positive(local.snkPsa9Price), config.minimumComparisonSales),
    };
    const fx = positive(detail.fx?.rate);
    if (fx && (!latestFx || String(detail.fx?.fetchedAt || "") > String(latestFx.fetchedAt || ""))) latestFx = detail.fx;
    leadRows[cardId] = [date, positive(local.price), positive(raw?.periods?.days30?.medianJpy), positive(local.snkPsa10Price), positive(psa10?.periods?.days30?.medianJpy), positive(local.snkPsa9Price), positive(psa9?.periods?.days30?.medianJpy), fx, Number(raw?.periods?.days30?.count || 0), Number(psa10?.periods?.days30?.count || 0), Number(psa9?.periods?.days30?.count || 0), new Date().toISOString()];
  }
  const leadHistory = read(LEAD_HISTORY_PATH, { version: 1, dates: [], cards: {} });
  appendDaily(leadHistory, date, leadRows);
  write(LEAD_HISTORY_PATH, leadHistory);

  const listed = (card) => Object.keys(buybacks[card.id]?.shops || {}).length > 0;
  const groups = {
    market: groupMetrics(cards, buybacks, () => true),
    buybackListed: groupMetrics(cards, buybacks, listed),
    nonListed: groupMetrics(cards, buybacks, (card) => !listed(card)),
  };
  const seasonHistory = read(SEASON_HISTORY_PATH, { version: 1, dates: [], snapshots: [] });
  const previous = seasonHistory.snapshots?.[0]?.groups || groups;
  for (const key of Object.keys(groups)) {
    groups[key].rawIndex = previous[key]?.domesticRawMedianJpy && groups[key].domesticRawMedianJpy ? round(groups[key].domesticRawMedianJpy / previous[key].domesticRawMedianJpy * 100) : 100;
    groups[key].psa10Index = previous[key]?.domesticPsa10MedianJpy && groups[key].domesticPsa10MedianJpy ? round(groups[key].domesticPsa10MedianJpy / previous[key].domesticPsa10MedianJpy * 100) : 100;
  }
  const activeEvents = config.seasonalEvents.flatMap((event) => event.periods.map((period) => ({ key: event.key, label: event.label, ...period, phase: eventPhase(date, period) }))).filter((event) => event.phase);
  seasonHistory.snapshots = [...(seasonHistory.snapshots || []).filter((row) => row.date !== date), { date, capturedAt: new Date().toISOString(), groups, activeEvents }].sort((a, b) => a.date.localeCompare(b.date)).slice(-1095);
  seasonHistory.dates = seasonHistory.snapshots.map((row) => row.date);
  seasonHistory.updatedAt = new Date().toISOString();
  write(SEASON_HISTORY_PATH, seasonHistory);
  const fxAgeDays = latestFx?.rateDate ? Math.floor((Date.now() - Date.parse(`${latestFx.rateDate}T00:00:00Z`)) / DAY_MS) : null;
  const summary = {
    version: 1, updatedAt: new Date().toISOString(), referenceOnly: true,
    decisionImpact: "仕入れ上限・GO判定・将来価格へ未反映",
    pokedata: { setCount: manifest.sets?.length || 0, cardCount: Object.keys(details).length, comparisonCardCount: Object.values(comparisons).filter((item) => Object.values(item).some((grade) => grade.days30.comparable || grade.days90.comparable || grade.all.comparable)).length },
    fx: latestFx ? { ...latestFx, latestOrPrevious: fxAgeDays != null && fxAgeDays <= config.fxMaxAgeDays ? "最新取得" : "前回値", stale: fxAgeDays == null || fxAgeDays > config.fxMaxAgeDays, status: fxAgeDays == null || fxAgeDays > config.fxMaxAgeDays ? "為替更新待ち" : "利用可" } : { rate: null, status: "為替更新待ち", stale: true },
    overseasLead: { savedCardCount: Object.keys(leadRows).length, savedDateCount: leadHistory.dates.length, horizons: [7, 30, 90], status: leadHistory.dates.length < 8 ? "仮説・蓄積中" : "検証中", metrics: ["海外上昇後の国内上昇率", "海外下落後の国内下落率", "国内外価格差の収束方向", "収束日数"] },
    seasonality: { status: seasonHistory.dates.length < 120 ? "仮説・蓄積中" : "検証中", savedDateCount: seasonHistory.dates.length, activeEvents, configuredEvents: config.seasonalEvents, groups, minimumValidation: "複数年または複数回のイベント検証" },
    comparisons,
  };
  write(OUTPUT, summary);
  console.log(JSON.stringify({ pokedataCards: summary.pokedata.cardCount, comparableCards: summary.pokedata.comparisonCardCount, leadSnapshots: summary.overseasLead.savedCardCount, seasonDates: summary.seasonality.savedDateCount, fx: summary.fx }));
}

if (require.main === module) main();
module.exports = { eventPhase, periodComparison };
