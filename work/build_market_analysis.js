const fs = require("fs");
const path = require("path");
const marketModel = require("../market-analysis.js");

const ROOT = path.join(__dirname, "..");
const HISTORY_PATH = path.join(__dirname, "market_stability_history.json");
const SUMMARY_PATH = path.join(ROOT, "data", "market-stability-summary.json");
const HISTORY_DAYS = 91;
const DAY_MS = 86400000;

function readJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return fallback; }
}

function validDate(value) {
  return String(value || "").match(/^\d{4}-\d{2}-\d{2}/)?.[0] || null;
}

function jstDate() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function finite(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compactRow(date, card, sameDayPrevious = null) {
  const rawPrice = positive(card.price);
  const psaPrice = positive(card.snkPsa10Price ?? card.psa10Price);
  const rawInstantLow = Math.min(...[rawPrice, positive(sameDayPrevious?.[8]), positive(sameDayPrevious?.[1])].filter(Boolean));
  const psaInstantLow = Math.min(...[psaPrice, positive(sameDayPrevious?.[9]), positive(sameDayPrevious?.[2])].filter(Boolean));
  return [
    date,
    rawPrice,
    psaPrice,
    finite(card.snkListings),
    finite(card.tv7 ?? card.saleTx7),
    finite(card.tv30 ?? card.saleTx30),
    finite(card.p10tv7 ?? card.psaTx7),
    finite(card.p10tv30 ?? card.psaTx30),
    Number.isFinite(rawInstantLow) ? rawInstantLow : null,
    Number.isFinite(psaInstantLow) ? psaInstantLow : null,
  ];
}

function seedHistory(history) {
  if (Object.keys(history.cards || {}).length) return;
  const historyDir = path.join(ROOT, "data", "history");
  const files = fs.existsSync(historyDir)
    ? fs.readdirSync(historyDir).filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort()
    : [];
  for (const file of files) {
    const snapshot = readJson(path.join(historyDir, file), null);
    const date = validDate(snapshot?.date || file);
    if (!date || !Array.isArray(snapshot?.cards)) continue;
    for (const card of snapshot.cards) {
      if (!card?.id || !(positive(card.price) && positive(card.psa10Price))) continue;
      if (!history.cards[card.id]) history.cards[card.id] = [];
      history.cards[card.id].push(compactRow(date, card));
    }
  }
}

function appendCurrent(history, cards, date) {
  const cutoff = Date.parse(`${date}T00:00:00Z`) - (HISTORY_DAYS - 1) * DAY_MS;
  for (const card of cards) {
    if (!card?.id || !(positive(card.price) && positive(card.snkPsa10Price))) continue;
    const previous = Array.isArray(history.cards[card.id]) ? history.cards[card.id] : [];
    const sameDayPrevious = previous.find((row) => String(row?.[0] || "").slice(0, 10) === date) || null;
    const rows = previous.filter((row) => {
      const timestamp = Date.parse(`${String(row?.[0] || "").slice(0, 10)}T00:00:00Z`);
      return Number.isFinite(timestamp) && timestamp >= cutoff && String(row[0]).slice(0, 10) !== date;
    });
    rows.push(compactRow(date, card, sameDayPrevious));
    history.cards[card.id] = rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  }
  history.dates = [...new Set(Object.values(history.cards).flatMap((rows) => rows.map((row) => row[0])))].sort();
}

function windowChange(rows, days) {
  if (!Array.isArray(rows) || rows.length < 2) return null;
  const latestTimestamp = Date.parse(`${rows.at(-1)[0]}T00:00:00Z`);
  const selected = rows.filter((row) => latestTimestamp - Date.parse(`${row[0]}T00:00:00Z`) <= days * DAY_MS && positive(row[2]));
  if (selected.length < 2) return null;
  const first = positive(selected[0][2]);
  const last = positive(selected.at(-1)[2]);
  return first && last ? (last / first - 1) * 100 : null;
}

function agreementScore(values) {
  const valid = values.map(positive).filter(Boolean);
  if (valid.length < 2) return 50;
  const center = marketModel.median(valid);
  const spread = center > 0 ? (Math.max(...valid) - Math.min(...valid)) / center : 1;
  if (spread <= 0.1) return 100;
  if (spread <= 0.2) return 78;
  if (spread <= 0.35) return 52;
  return 18;
}

function releaseAgeDays(official, asOfDate) {
  const year = Number(String(official?.u || "").match(/\/(19|20)(\d{2})\//)?.[0]?.replaceAll("/", ""));
  if (!Number.isFinite(year)) return null;
  const released = Date.parse(`${year}-01-01T00:00:00Z`);
  const current = Date.parse(`${asOfDate}T00:00:00Z`);
  return Math.max(0, Math.floor((current - released) / DAY_MS));
}

function monthlyPsaIncrease(official) {
  const window = [official?.w30, official?.w90, official?.w7].find((entry) => entry && !entry.partial);
  if (!window) return null;
  const days = Number(window?.days || (official?.w30 ? 30 : official?.w90 ? 90 : official?.w7 ? 7 : 0));
  const increase = Number(window?.d10);
  return Number.isFinite(increase) && days > 0 ? Math.max(0, increase) / days * 30 : null;
}

function psaWindowIncrease(official, key) {
  const window = official?.[key];
  if (!window || window.partial || finite(window.d10) == null) return null;
  return Math.max(0, finite(window.d10));
}

function main() {
  const cards = readJson(path.join(ROOT, "data", "pokemon-cards.json"), []);
  const meta = readJson(path.join(ROOT, "data", "pokemon-cards-meta.json"), {});
  const cardrush = readJson(path.join(ROOT, "data", "cardrush-stock-summary.json"), {}).cards || {};
  const hareruya2 = readJson(path.join(ROOT, "data", "hareruya2-stock-summary.json"), {}).cards || {};
  const yuyutei = readJson(path.join(ROOT, "data", "yuyutei-stock-summary.json"), {}).cards || {};
  const official = readJson(path.join(ROOT, "data", "psa-population-summary.json"), {}).cards || {};
  const history = readJson(HISTORY_PATH, { dates: [], cards: {} });
  if (!history.cards || typeof history.cards !== "object") history.cards = {};
  seedHistory(history);
  const updatedAt = validDate(meta.updatedAt || meta.generatedAt) || jstDate();
  appendCurrent(history, cards, updatedAt);

  const changes30 = Object.values(history.cards).map((rows) => windowChange(rows, 30)).filter(Number.isFinite);
  const marketChange30 = marketModel.median(changes30);
  const summaries = {};
  for (const card of cards) {
    if (!(positive(card.price) && positive(card.snkPsa10Price))) continue;
    const cr = cardrush[card.id] || null;
    const h2 = hareruya2[card.id] || null;
    const yy = yuyutei[card.id] || null;
    const individualChange30 = windowChange(history.cards[card.id], 30);
    const inventorySources = [
      cr ? { source: "カードラッシュ", stock: cr.stock, dailySales: cr.avg30 } : null,
      h2 ? { source: "晴れる屋2", stock: h2.stock, dailySales: h2.avg30 } : null,
      yy ? { source: "遊々亭", stock: yy.stock, dailySales: yy.avg30 } : null,
    ].filter(Boolean);
    const evaluated = marketModel.evaluatePriceFloor({
      history: history.cards[card.id] || [],
      fallbackRawChange30: card.chg30,
      rawTx30: card.tv30,
      psaTx30: card.p10tv30,
      monthlyPsaIncrease: monthlyPsaIncrease(official[card.id]),
      psaIncrease7: psaWindowIncrease(official[card.id], "w7"),
      psaIncrease30: psaWindowIncrease(official[card.id], "w30"),
      releaseAgeDays: releaseAgeDays(official[card.id], updatedAt),
      reprintActive: false,
      inventorySources,
      storeAgreement: agreementScore([card.price, cr?.cardrushPrice, h2?.hareruya2Price, yy?.yuyuteiPrice]),
      marketRelativeStrength: Number.isFinite(individualChange30) && Number.isFinite(marketChange30) ? individualChange30 - marketChange30 : null,
    });
    summaries[card.id] = {
      score: evaluated.score,
      state: evaluated.state,
      direction: evaluated.direction,
      supplyState: evaluated.supplyState,
      supportLow: evaluated.supportLow,
      supportHigh: evaluated.supportHigh,
      supportBroken: evaluated.supportBroken,
      supportConfirmed: evaluated.supportConfirmed,
      supportClose: evaluated.supportClose,
      supportInstant: evaluated.supportInstant,
      inventoryDays: evaluated.inventoryDays,
      inventorySources: evaluated.inventorySources.filter((source) => source.days != null),
      historyDays: evaluated.historyDays,
      samples: evaluated.samples,
      listingTrendPct: evaluated.listingTrendPct,
      supplyAbsorption: evaluated.supplyAbsorption,
      psaIncrease7: evaluated.psaIncrease7,
      psaIncrease30: evaluated.psaIncrease30,
      marketRelativeStrength: evaluated.marketRelativeStrength,
      evidence: evaluated.evidence,
      cautions: evaluated.cautions,
      // [samples, spanDays, ready] for 14/30/90 days. Compact because this repeats for every card.
      windowStatus: [evaluated.stats14, evaluated.stats30, evaluated.stats90]
        .map((stats) => [stats.samples, stats.spanDays, stats.ready ? 1 : 0]),
    };
  }

  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history), "utf8");
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify({
    updatedAt,
    historyDays: history.dates.length > 1
      ? Math.round((Date.parse(`${history.dates.at(-1)}T00:00:00Z`) - Date.parse(`${history.dates[0]}T00:00:00Z`)) / DAY_MS)
      : 0,
    recordedDates: history.dates.length,
    marketPsaChange30: marketModel.round(marketChange30, 1),
    historyRequirements: marketModel.HISTORY_REQUIREMENTS,
    cards: summaries,
  }), "utf8");
  console.log(JSON.stringify({ updatedAt, historyDates: history.dates.length, cards: Object.keys(summaries).length }));
}

main();
