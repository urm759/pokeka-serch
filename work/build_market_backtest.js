const fs = require("fs");
const path = require("path");
const marketModel = require("../market-analysis.js");
const backtestModel = require("../backtest-model.js");

const ROOT = path.join(__dirname, "..");
const HISTORY_PATH = path.join(__dirname, "market_backtest_history.json");
const SUMMARY_PATH = path.join(ROOT, "data", "market-backtest-summary.json");
const DAY_MS = 86400000;
const MAX_DAILY_CARDS = 2500;
const HISTORY_VERSION = 3;

function readJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return fallback; }
}

function dateOnly(value) {
  return String(value || "").match(/^\d{4}-\d{2}-\d{2}/)?.[0] || null;
}

function positive(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function daysBetween(left, right) {
  return Math.round((Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) / DAY_MS);
}

function findFuture(rows, index, days) {
  const start = backtestModel.decodeSnapshot(rows[index]).date;
  return rows.slice(index + 1).find((row) => daysBetween(start, backtestModel.decodeSnapshot(row).date) >= days) || null;
}

function buildDemand(card, buybackCard, buybackData) {
  const rows = Object.entries(buybackCard?.shops || {}).map(([shopId, shop]) => ({
    shopId,
    ...shop,
    ...marketModel.buybackMetrics({
      marketPrice: card.snkPsa10Price,
      buybackPrice: shop.price,
      priceDate: shop.priceDate,
      asOfDate: buybackData.updatedAt,
      cardMatched: shop.matchConfidence !== "low",
      dataQuarantined: shop.quarantined,
    }),
  }));
  return marketModel.evaluateStoreDemand({ rows, psaTx30: card.p10tv30 });
}

function standardSettings(services) {
  const plan = services?.plans?.find((entry) => entry.id === "regular" && entry.available !== false)
    || services?.plans?.find((entry) => entry.available !== false)
    || { price: 11980, calendarDays: 84 };
  const handlingFee = Number(services?.handlingFee ?? 1000);
  return {
    gradingFee: Math.max(0, Number(plan.price || 0) + handlingFee),
    lockDays: Math.max(1, Number(plan.calendarDays || 84) + 7),
    saleFeeRate: 0,
    saleExtraCost: 0,
  };
}

function buildSnapshotCandidate(card, floor, demand, official, settings, date) {
  const marketPrice = positive(card.snkPsa10Price);
  const purchasePrice = positive(card.price);
  if (!marketPrice || !purchasePrice) return null;
  const psaRate = Number.isFinite(Number(official?.rate)) ? Math.max(0.01, Math.min(0.98, Number(official.rate) / 100)) : 0.7;
  const lowerGradePrice = positive(card.snkPsa9Price) || Math.round(purchasePrice * 0.75 / 500) * 500;
  const forecast = backtestModel.standardForecast({
    marketPrice,
    purchasePrice,
    change30: card.chg30,
    floorScore: floor?.score,
    demandScore: demand?.score,
    psaRate,
    psaTx30: card.p10tv30,
  });
  if (!forecast) return null;
  const base = {
    date, marketPrice, purchasePrice, psaRate, lowerGradePrice,
    gradingFee: settings.gradingFee, saleFeeRate: settings.saleFeeRate, saleExtraCost: settings.saleExtraCost,
    forecastBearish: forecast.bearish, forecastCentral: forecast.central, forecastBullish: forecast.bullish,
    floorScore: Number.isFinite(floor?.score) ? floor.score : null,
    demandScore: Number.isFinite(demand?.score) ? demand.score : null,
    futureScore: forecast.futureScore, exitScore: forecast.exitScore, qualityScore: forecast.qualityScore,
    verdict: "非GO", supportConfirmed: Boolean(floor?.supportConfirmed),
    supportCloseLow: positive(floor?.supportClose?.low), supportCloseHigh: positive(floor?.supportClose?.high),
    supportInstantLow: positive(floor?.supportInstant?.low), supportInstantHigh: positive(floor?.supportInstant?.high),
    buybackRatio: positive(demand?.ratioMedian), lockDays: settings.lockDays,
    expectedProfit: null, expectedRoi: null, predictedDirection: forecast.predictedDirection,
    dataCompleteness: forecast.dataCompleteness,
  };
  const economics = backtestModel.expectedProfit(base, forecast.central);
  base.expectedProfit = economics?.expectedProfit ?? null;
  base.expectedRoi = economics?.expectedRoi ?? null;
  if (economics && economics.expectedProfit >= 10000 && economics.expectedRoi >= 30 && forecast.qualityScore >= 60 && floor?.state !== "下値割れ") base.verdict = "GO";
  const activity = Math.max(0, Number(card.tv30 || 0)) + Math.max(0, Number(card.p10tv30 || 0)) * 2 + Number(demand?.trustedCount || 0) * 5;
  return { card, floor, demand, snapshot: base, priority: activity + Math.max(-100, Number(economics?.expectedRoi || -100)) };
}

function aggregateByHorizon(outcomes, type) {
  const rows = outcomes.filter((row) => row.horizonType === type);
  return {
    ...backtestModel.aggregate(rows),
    byPriceBand: backtestModel.grouped(rows, "priceBand"),
    byDemandBand: backtestModel.grouped(rows, "demandBand"),
    byFloorBand: backtestModel.grouped(rows, "floorBand"),
  };
}

function main() {
  const cards = readJson(path.join(ROOT, "data", "pokemon-cards.json"), []);
  const meta = readJson(path.join(ROOT, "data", "pokemon-cards-meta.json"), {});
  const floorData = readJson(path.join(ROOT, "data", "market-stability-summary.json"), {});
  const buybackData = readJson(path.join(ROOT, "data", "shop-buyback-summary.json"), {});
  const officialData = readJson(path.join(ROOT, "data", "psa-population-summary.json"), {});
  const services = readJson(path.join(ROOT, "data", "psa-japan-services.json"), {});
  const settings = standardSettings(services);
  const updatedAt = dateOnly(meta.updatedAt || meta.generatedAt || floorData.updatedAt);
  if (!updatedAt) throw new Error("更新日を特定できません");

  let history = readJson(HISTORY_PATH, { version: HISTORY_VERSION, schema: backtestModel.SNAPSHOT_SCHEMA, cards: {} });
  if (history.version !== HISTORY_VERSION || !history.cards || typeof history.cards !== "object") history = { version: HISTORY_VERSION, schema: backtestModel.SNAPSHOT_SCHEMA, cards: {} };

  const demandCards = cards.map((card) => ({
    id: card.id, psa10: card.snkPsa10Price, source: card,
    buybackAnalysis: buildDemand(card, buybackData.cards?.[card.id], buybackData),
  }));
  marketModel.applyStoreDemandRelativeRanking(demandCards, { strongShare: 0.3 });
  const demandById = new Map(demandCards.map((entry) => [String(entry.id), entry.buybackAnalysis]));

  const candidates = cards.map((card) => buildSnapshotCandidate(
    card, floorData.cards?.[card.id], demandById.get(String(card.id)), officialData.cards?.[card.id], settings, updatedAt
  )).filter(Boolean)
    .filter((entry) => Number(entry.card.tv30 || 0) >= 3 || Number(entry.card.p10tv30 || 0) >= 3 || entry.demand.trustedCount > 0)
    .sort((left, right) => right.priority - left.priority)
    .slice(0, MAX_DAILY_CARDS);

  const retentionDays = Math.max(100, settings.lockDays + 35);
  const cutoff = Date.parse(`${updatedAt}T00:00:00Z`) - (retentionDays - 1) * DAY_MS;
  for (const entry of candidates) {
    const cardId = String(entry.card.id);
    const previous = Array.isArray(history.cards[cardId]) ? history.cards[cardId] : [];
    const retained = previous.filter((row) => Date.parse(`${backtestModel.decodeSnapshot(row).date}T00:00:00Z`) >= cutoff);
    if (!retained.some((row) => backtestModel.decodeSnapshot(row).date === updatedAt)) retained.push(backtestModel.encodeSnapshot(entry.snapshot));
    history.cards[cardId] = retained.sort((a, b) => String(backtestModel.decodeSnapshot(a).date).localeCompare(String(backtestModel.decodeSnapshot(b).date)));
  }

  const cardNames = new Map(cards.map((card) => [String(card.id), card.name || card.id]));
  const outcomes = [];
  for (const [cardId, rows] of Object.entries(history.cards)) {
    for (let index = 0; index < rows.length; index += 1) {
      const initial = backtestModel.decodeSnapshot(rows[index]);
      const horizons = [{ type: "days7", days: 7 }, { type: "days30", days: 30 }, { type: "exit", days: Number(initial.lockDays || 91) }];
      for (const horizon of horizons) {
        const future = findFuture(rows, index, horizon.days);
        const result = future ? backtestModel.buildOutcome(rows[index], future, horizon.days) : null;
        if (!result) continue;
        const { snapshot, ...publicResult } = result;
        outcomes.push({ cardId, cardName: cardNames.get(cardId) || cardId, horizonType: horizon.type, snapshot: backtestModel.encodeSnapshot(snapshot), ...publicResult });
      }
    }
  }
  outcomes.sort((a, b) => String(b.resultDate).localeCompare(String(a.resultDate)) || b.horizonDays - a.horizonDays);
  const latestSnapshots = Object.fromEntries(Object.entries(history.cards).map(([cardId, rows]) => [cardId, rows.at(-1)]));
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history), "utf8");
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify({
    version: HISTORY_VERSION, updatedAt,
    method: "サイト標準条件の変更不可スナップショット。7日・30日は再評価期待利益、資金ロック後は想定出口利益を検証",
    retentionDays, maxDailyCards: MAX_DAILY_CARDS, schema: backtestModel.SNAPSHOT_SCHEMA,
    cards: Object.keys(history.cards).length,
    snapshots: Object.values(history.cards).reduce((sum, rows) => sum + rows.length, 0),
    days7: aggregateByHorizon(outcomes, "days7"), days30: aggregateByHorizon(outcomes, "days30"), exit: aggregateByHorizon(outcomes, "exit"),
    latestSnapshots, outcomes: outcomes.slice(0, 500),
  }), "utf8");
  console.log(JSON.stringify({ updatedAt, candidates: candidates.length, snapshots: Object.values(history.cards).reduce((sum, rows) => sum + rows.length, 0), outcomes: outcomes.length, lockDays: settings.lockDays }));
}

main();
