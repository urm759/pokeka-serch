const fs = require("fs");
const path = require("path");
const marketModel = require("../market-analysis.js");

const ROOT = path.join(__dirname, "..");
const HISTORY_PATH = path.join(__dirname, "market_backtest_history.json");
const SUMMARY_PATH = path.join(ROOT, "data", "market-backtest-summary.json");
const RETENTION_DAYS = 40;
const GRADING_FEE = 12980;
const DAY_MS = 86400000;

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

function round(value, digits = 1) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function daysBetween(left, right) {
  return Math.round((Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) / DAY_MS);
}

function currentBuybackRatio(card, buybackCard, shopMeta, asOfDate) {
  const rows = Object.entries(buybackCard?.shops || {}).map(([shopId, shop]) => ({
    shopId,
    ...shop,
    ...marketModel.buybackMetrics({
      marketPrice: card.snkPsa10Price,
      buybackPrice: shop.price,
      priceDate: shop.priceDate,
      asOfDate,
      cardMatched: true,
    }),
    observed30: shop.observed30 ?? shopMeta?.[shopId]?.observed30,
  }));
  return marketModel.evaluateStoreDemand({ rows, psaTx30: card.p10tv30 }).ratioMedian;
}

function baselineVerdict(card, floor) {
  const rawPrice = positive(card.price);
  const psaPrice = positive(card.snkPsa10Price);
  if (!(rawPrice && psaPrice) || !Number.isFinite(floor?.score)) return "蓄積中";
  const profit = psaPrice - rawPrice - GRADING_FEE;
  const roi = profit / (rawPrice + GRADING_FEE) * 100;
  return profit >= 10000 && roi >= 30 && floor.score >= 60 && floor.state !== "下値割れ" ? "GO" : "非GO";
}

function findFuture(rows, index, days) {
  const startDate = rows[index][0];
  return rows.slice(index + 1).find((row) => daysBetween(startDate, row[0]) >= days) || null;
}

function outcome(cardId, cardName, initial, future, horizonDays) {
  if (!future) return null;
  const futurePrice = positive(future[1]);
  const rawPrice = positive(initial[7]);
  const initialRatio = positive(initial[4]);
  const futureRatio = positive(future[4]);
  const supportLow = positive(initial[2]);
  const profit = initial[5] === "GO" && futurePrice && rawPrice ? futurePrice - rawPrice - GRADING_FEE : null;
  return {
    cardId,
    cardName,
    baseDate: initial[0],
    resultDate: future[0],
    horizonDays,
    verdict: initial[5],
    basePsaPrice: positive(initial[1]),
    resultPsaPrice: futurePrice,
    priceChangePct: initial[1] && futurePrice ? round((futurePrice / initial[1] - 1) * 100) : null,
    supportBroken: supportLow && futurePrice ? futurePrice < supportLow : null,
    buybackMaintained: initialRatio && futureRatio ? futureRatio >= initialRatio * 0.95 : null,
    baseBuybackRatio: initialRatio,
    resultBuybackRatio: futureRatio,
    goProfit: round(profit, 0),
  };
}

function aggregate(rows, horizonDays) {
  const selected = rows.filter((row) => row.horizonDays === horizonDays);
  const go = selected.filter((row) => row.verdict === "GO" && Number.isFinite(row.goProfit));
  const maintained = selected.filter((row) => row.buybackMaintained != null);
  const support = selected.filter((row) => row.supportBroken != null);
  return {
    evaluated: selected.length,
    goEvaluated: go.length,
    goProfitable: go.filter((row) => row.goProfit > 0).length,
    goProfitMedian: round(marketModel.median(go.map((row) => row.goProfit)), 0),
    supportBreaks: support.filter((row) => row.supportBroken).length,
    supportEvaluated: support.length,
    buybackMaintained: maintained.filter((row) => row.buybackMaintained).length,
    buybackEvaluated: maintained.length,
  };
}

function main() {
  const cards = readJson(path.join(ROOT, "data", "pokemon-cards.json"), []);
  const meta = readJson(path.join(ROOT, "data", "pokemon-cards-meta.json"), {});
  const floorData = readJson(path.join(ROOT, "data", "market-stability-summary.json"), {});
  const buybackData = readJson(path.join(ROOT, "data", "shop-buyback-summary.json"), {});
  const history = readJson(HISTORY_PATH, { cards: {} });
  if (!history.cards || typeof history.cards !== "object") history.cards = {};
  const updatedAt = dateOnly(meta.updatedAt || meta.generatedAt || floorData.updatedAt);
  if (!updatedAt) throw new Error("更新日を特定できません");
  const cutoff = Date.parse(`${updatedAt}T00:00:00Z`) - (RETENTION_DAYS - 1) * DAY_MS;

  for (const card of cards) {
    const psaPrice = positive(card.snkPsa10Price);
    const rawPrice = positive(card.price);
    if (!card.id || !psaPrice || !rawPrice) continue;
    const floor = floorData.cards?.[card.id] || null;
    const ratio = currentBuybackRatio(card, buybackData.cards?.[card.id], buybackData.shops, updatedAt);
    const expectedProfit = psaPrice - rawPrice - GRADING_FEE;
    const snapshot = [updatedAt, psaPrice, positive(floor?.supportLow), positive(floor?.supportHigh), positive(ratio), baselineVerdict(card, floor), Math.round(expectedProfit), rawPrice];
    const previous = Array.isArray(history.cards[card.id]) ? history.cards[card.id] : [];
    history.cards[card.id] = [...previous.filter((row) => row?.[0] !== updatedAt && Date.parse(`${row?.[0]}T00:00:00Z`) >= cutoff), snapshot]
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  }

  const cardNames = new Map(cards.map((card) => [String(card.id), card.name || card.id]));
  const outcomes = [];
  for (const [cardId, rows] of Object.entries(history.cards)) {
    for (let index = 0; index < rows.length; index += 1) {
      for (const horizon of [7, 30]) {
        const result = outcome(cardId, cardNames.get(String(cardId)) || cardId, rows[index], findFuture(rows, index, horizon), horizon);
        if (result) outcomes.push(result);
      }
    }
  }
  outcomes.sort((a, b) => String(b.resultDate).localeCompare(String(a.resultDate)) || b.horizonDays - a.horizonDays);
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history), "utf8");
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify({
    updatedAt,
    method: "標準条件（鑑定費12,980円・利益1万円以上・ROI30%以上・下値安定60点以上）",
    retentionDays: RETENTION_DAYS,
    snapshots: Object.values(history.cards).reduce((sum, rows) => sum + rows.length, 0),
    cards: Object.keys(history.cards).length,
    days7: aggregate(outcomes, 7),
    days30: aggregate(outcomes, 30),
    outcomes: outcomes.slice(0, 300),
  }), "utf8");
  console.log(JSON.stringify({ updatedAt, cards: Object.keys(history.cards).length, outcomes: outcomes.length }));
}

main();
