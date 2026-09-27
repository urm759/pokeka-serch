const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = (file, fallback = null) => {
  const target = path.join(root, file);
  return fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, "utf8")) : fallback;
};
const write = (file, value) => fs.writeFileSync(path.join(root, file), JSON.stringify(value), "utf8");
const model = require("../decision-model.js");
const meta = read("data/pokemon-cards-meta.json", {});
const window = {
  PurchaseDecisionModel: model,
  MarketAnalysisModel: require("../market-analysis.js"),
  BacktestModel: require("../backtest-model.js"),
  CardSearchIndexModel: require("../search-index-model.js"),
  SnkrRawFlipModel: require("../snkr-raw-flip-model.js"),
  POKEMON_CARDS_META: meta,
};
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
const marker = "// Browser event bindings start here; the audit runner evaluates the same model above this line.";
if (source.split(marker).length !== 2) throw new Error("Browser binding marker missing or duplicated");
const context = vm.createContext({
  window,
  document: { getElementById: () => null, querySelectorAll: () => [] },
  console,
  URL,
  URLSearchParams,
  setTimeout,
  clearTimeout,
});
vm.runInContext(`${source.split(marker)[0]}\nglobalThis.auditApi = { state, prepareCalculatedCards, buildLimitModelAudit, operationalSettings };`, context, { filename: "app.js", timeout: 30000 });
const { state, prepareCalculatedCards, buildLimitModelAudit, operationalSettings } = context.auditApi;
const loadCards = (file) => read(file, { cards: {} });
const sourceFiles = {
  cardrush: loadCards("data/cardrush-stock-summary.json"),
  hareruya2: loadCards("data/hareruya2-stock-summary.json"),
  yuyutei: loadCards("data/yuyutei-stock-summary.json"),
  torecacamp: loadCards("data/torecacamp-stock-summary.json"),
  buyback: loadCards("data/shop-buyback-summary.json"),
  marketStability: loadCards("data/market-stability-summary.json"),
  snkrListing: loadCards("data/snkr-listing-summary.json"),
  snkrRaw: loadCards("data/snkr-raw-flip-summary.json"),
  psa: loadCards("data/psa-population-summary.json"),
};
state.cards = read("data/pokemon-cards.json", []);
state.catalogCompletion = read("data/card-catalog-completion.json", { cards: {} });
state.cardrushStock = sourceFiles.cardrush.cards || {};
state.hareruya2Stock = sourceFiles.hareruya2.cards || {};
state.yuyuteiStock = sourceFiles.yuyutei.cards || {};
state.torecacampStock = sourceFiles.torecacamp.cards || {};
state.shopBuybacks = sourceFiles.buyback.cards || {};
state.buybackShops = sourceFiles.buyback.shops || {};
state.buybackDates = sourceFiles.buyback.dates || [];
state.buybackUpdatedAt = sourceFiles.buyback.updatedAt || null;
state.marketStability = sourceFiles.marketStability.cards || {};
state.marketStabilityMeta = sourceFiles.marketStability;
state.snkrListingSummary = sourceFiles.snkrListing.cards || {};
state.snkrRawFlipSummary = sourceFiles.snkrRaw.cards || {};
state.snkrRawFlipMeta = sourceFiles.snkrRaw;
state.psaPopulation = sourceFiles.psa.cards || {};
state.marketResearch = read("data/market-research-summary.json");
state.regulationPolicy = read("data/regulation-policy.json");
state.evaluationModel = read("data/evaluation-model.json");
state.evaluationGovernance = read("data/evaluation-governance.json");
state.psaServices = read("data/psa-japan-services.json");
state.sourceUpdates = {
  toreca: meta.updatedAt || meta.generatedAt || null,
  cardrush: sourceFiles.cardrush.updatedAt || null,
  hareruya2: sourceFiles.hareruya2.updatedAt || null,
  yuyutei: sourceFiles.yuyutei.updatedAt || null,
  torecacamp: sourceFiles.torecacamp.updatedAt || null,
};
state.fee = 12980;
state.lockDays = 119;
state.gradingReserve = 129800;
const previous = read("data/operational-limit-history.json", null);
const asOfDate = String(process.env.AUDIT_DATE || new Date().toISOString()).slice(0, 10);
state.operationalLimitHistory = previous && previous.modelVersion === model.MODEL_VERSION
  ? { ...previous, currentDataDate: asOfDate }
  : { modelVersion: model.MODEL_VERSION, currentDataDate: asOfDate, settings: operationalSettings(), cards: {} };
const startedAt = Date.now();
const calculated = prepareCalculatedCards(state.cards);
const audit = buildLimitModelAudit(calculated);
audit.catalogCards = calculated.length;
audit.notAnalyzable = calculated.length - audit.analyzedCards;
audit.inputDate = asOfDate;
audit.durationMs = Date.now() - startedAt;
const previousCards = state.operationalLimitHistory.cards || {};
const historyCards = {};
for (const card of calculated) {
  if (card.catalogCompletion?.s !== "分析可能" || !card.buyLimits) continue;
  const conditions = {};
  for (const condition of ["clean", "scratch"]) {
    const scenario = card.buyLimits[condition];
    if (!scenario) continue;
    const oldRows = Array.isArray(previousCards[card.id]?.[condition])
      ? previousCards[card.id][condition].filter((row) => String(row.date) < asOfDate).slice(-29)
      : [];
    conditions[condition] = [...oldRows, {
      date: asOfDate,
      theoretical: scenario.theoreticalFinalMaxPrice,
      operational: scenario.finalMaxPrice,
      calculationVersion: model.MODEL_VERSION,
      signals: scenario.operationalSignals,
    }];
  }
  historyCards[card.id] = conditions;
}
const history = {
  version: 1,
  modelVersion: model.MODEL_VERSION,
  updatedAt: new Date().toISOString(),
  currentDataDate: asOfDate,
  settings: operationalSettings(),
  cards: historyCards,
};
if (process.argv.includes("--verify")) {
  const publishedAudit = read("data/purchase-limit-model-audit.json");
  const publishedHistory = read("data/operational-limit-history.json");
  if (JSON.stringify(publishedAudit?.rows) !== JSON.stringify(audit.rows)
    || JSON.stringify(publishedHistory?.cards) !== JSON.stringify(history.cards)
    || publishedAudit?.modelVersion !== model.MODEL_VERSION) {
    throw new Error("Purchase-limit audit is stale or differs from the current model/data");
  }
} else {
  write("data/purchase-limit-model-audit.json", audit);
  write("data/operational-limit-history.json", history);
}
console.log(JSON.stringify({ catalogCards: audit.catalogCards, analyzedCards: audit.analyzedCards, changedLimits: audit.changedLimits, changedVerdicts: audit.changedVerdicts, historyCards: Object.keys(historyCards).length, durationMs: audit.durationMs }));
