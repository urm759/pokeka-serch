const fs = require("fs");
const path = require("path");
const { analyzeSales } = require("./pokedata_analysis.js");
const { loadSetState, writeSetState } = require("./pokedata_storage.js");

const ROOT = path.join(__dirname, "..");
const CAPTURE = path.join(__dirname, "pokedata_browser_capture_lillie.json");
const LINK_MAP = path.join(__dirname, "pokedata-link-map.json");
const OUTPUT = path.join(ROOT, "data", "pokedata-summary.json");
const SALES_DIR = path.join(ROOT, "data", "pokedata-sales");

function readJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")); } catch { return fallback; }
}

async function getJson(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "pokeka-sourcing-audit/1.0" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw lastError;
}

function sourceAverage(stats, source) {
  const row = stats.find((item) => Number(item.source) === source);
  return Number.isFinite(Number(row?.avg)) ? Number(row.avg) : null;
}

function compare(overseasJpy, domesticJpy) {
  if (!(overseasJpy > 0) || !(domesticJpy > 0)) return { differenceJpy: null, ratio: null };
  return { differenceJpy: Math.round(overseasJpy - domesticJpy), ratio: Math.round(overseasJpy / domesticJpy * 1000) / 1000 };
}

async function main() {
  const capture = readJson(CAPTURE, null);
  if (!capture || !Array.isArray(capture.sales) || capture.sales.length !== 305) {
    throw new Error("Authenticated browser capture with 305 transactions is required.");
  }
  const linkMap = readJson(LINK_MAP, { version: 1, aliases: [] });
  const alias = linkMap.aliases.find((entry) => entry.pokedataCardId === capture.card.pokedataCardId && entry.status === "confirmed");
  if (!alias) throw new Error("Confirmed PokeDATA-to-domestic alias is missing.");
  const cards = readJson(path.join(ROOT, "data", "pokemon-cards.json"), []);
  const domestic = cards.find((card) => card.id === alias.localCardId);
  if (!domestic) throw new Error(`Domestic card ${alias.localCardId} was not found.`);

  const [stats, fx] = await Promise.all([
    getJson(`https://www.pokedata.io/api/cards/stats?id=${capture.card.pokedataCardId}`),
    getJson("https://api.frankfurter.app/latest?from=USD&to=JPY"),
  ]);
  const fxRate = Number(fx?.rates?.JPY);
  if (!(fxRate > 0)) throw new Error("USD/JPY rate was unavailable.");
  const identity = {
    number: capture.card.number,
    setAliases: [capture.card.setName, capture.card.setCode, "Battle Partners", "SV9"],
    nameTokens: ["lillie", "clefairy", "ex"],
  };
  const analysis = analyzeSales(capture.sales, identity, fxRate);
  const rawEbayApiJpy = sourceAverage(stats, 12) * fxRate;
  const rawTcgplayerApiJpy = sourceAverage(stats, 0) * fxRate;
  const psa10ApiJpy = sourceAverage(stats, 10) * fxRate;
  const psa9ApiJpy = sourceAverage(stats, 9) * fxRate;
  const capturedAt = capture.capturedAt;
  const cardSummary = {
    localCardId: alias.localCardId,
    linkStatus: "manual-confirmed",
    sourceUrl: capture.sourceUrl,
    pokedata: capture.card,
    capturedAt,
    fx: { pair: "USD/JPY", rate: fxRate, source: "Frankfurter / ECB reference rates", sourceUrl: "https://api.frankfurter.app/latest?from=USD&to=JPY", rateDate: fx.date, fetchedAt: new Date().toISOString() },
    markets: {
      ebayRaw: { pageDisplayJpy: capture.display.rawEbayJpy, apiAverageUsd: sourceAverage(stats, 12), apiAverageJpy: Math.round(rawEbayApiJpy), ...analysis.summaries.raw, individualSalesStatus: "認証済み個別成約をクリーニング済み", usableIndividualMedian: true, comparisonToDomestic: compare(analysis.summaries.raw.medianJpy, domestic.price) },
      tcgplayerRaw: { pageDisplayJpy: capture.display.rawTcgplayerJpy, apiAverageUsd: sourceAverage(stats, 0), apiAverageJpy: Math.round(rawTcgplayerApiJpy), transactionCount: null, transactionCountStatus: "取得不能", comparisonToDomestic: compare(rawTcgplayerApiJpy, domestic.price) },
      ebayPsa10: { pageDisplayJpy: capture.display.psa10EbayJpy, apiAverageUsd: sourceAverage(stats, 10), apiAverageJpy: Math.round(psa10ApiJpy), ...analysis.summaries.psa10, individualSalesStatus: "認証済み個別成約をクリーニング済み", usableIndividualMedian: true, comparisonToDomestic: compare(analysis.summaries.psa10.medianJpy, domestic.snkPsa10Price) },
      ebayPsa9: { pageDisplayJpy: capture.display.psa9EbayJpy, apiAverageUsd: sourceAverage(stats, 9), apiAverageJpy: Math.round(psa9ApiJpy), ...analysis.summaries.psa9, individualSalesStatus: "認証済み個別成約をクリーニング済み", usableIndividualMedian: true, comparisonToDomestic: compare(analysis.summaries.psa9.medianJpy, domestic.snkPsa9Price || domestic.price) },
    },
    population: { ...capture.display.population, source: "PokeDATA authenticated card page", capturedAt },
    domestic: { rawJpy: domestic.price || null, psa10Jpy: domestic.snkPsa10Price || null, psa9Jpy: domestic.snkPsa9Price || null },
    trend: { domestic: Number(domestic.chg30) > 3 ? "上昇" : Number(domestic.chg30) < -3 ? "下降" : "横ばい", overseas: analysis.summaries.psa10.trend.direction, status: "海外相場は参考指標・仕入れ上限へ未反映" },
    confidence: analysis.summaries.raw.confidence === "高" && analysis.summaries.psa10.confidence === "高" ? "高" : "中",
    referenceOnly: true,
    limitImpact: "仕入れ上限へ未反映",
  };

  fs.mkdirSync(SALES_DIR, { recursive: true });
  fs.writeFileSync(path.join(SALES_DIR, `${alias.localCardId}.json`), JSON.stringify({
    version: 1,
    capturedAt,
    sourceUrl: capture.sourceUrl,
    localCardId: alias.localCardId,
    totalRows: analysis.classified.length,
    summaries: analysis.summaries,
    rows: analysis.classified,
  }), "utf8");
  const payload = readJson(OUTPUT, { version: 2, coverage: {}, linkage: { records: [] } });
  const stored = loadSetState(ROOT, "Battle Partners", payload);
  stored.cards[alias.localCardId] = cardSummary;
  payload.version = 2;
  payload.updatedAt = new Date().toISOString();
  payload.source = "PokeDATA authenticated Chrome capture + public card stats API";
  writeSetState(ROOT, payload, {
    setName: "Battle Partners", setCode: "SV9", cards: stored.cards,
    records: stored.records, sourceCount: Number(payload.coverage?.sourceSetTotal || stored.records.length),
    updatedAt: payload.updatedAt,
  });
  console.log(JSON.stringify({ localCardId: alias.localCardId, capturedSales: analysis.classified.length, summaries: analysis.summaries, fx: cardSummary.fx, coverage: payload.coverage }));
}

main().catch((error) => { console.error(error); process.exit(1); });
