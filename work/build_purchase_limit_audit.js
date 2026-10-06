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
const candidateDailyAudit = require("../candidate-daily-audit.js");
const candidateAvailabilityAudit = require("../candidate-availability-audit.js");
const meta = read("data/pokemon-cards-meta.json", {});
const window = {
  PurchaseDecisionModel: model,
  PriceIntegrity: require("../price-integrity.js"),
  MarketAnalysisModel: require("../market-analysis.js"),
  ReturnHorizonModel: require("../return-horizon-model.js"),
  PriceReferenceModel: require("../price-reference-model.js"),
  BacktestModel: require("../backtest-model.js"),
  CardSearchIndexModel: require("../search-index-model.js"),
  SnkrRawFlipModel: require("../snkr-raw-flip-model.js"),
  CurrentMarketModel: require("../current-market-model.js"),
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
vm.runInContext(`${source.split(marker)[0]}\nglobalThis.auditApi = { state, prepareCalculatedCards, buildLimitModelAudit, operationalSettings, presetQualifications, currentMarketView };`, context, { filename: "app.js", timeout: 30000 });
const { state, prepareCalculatedCards, buildLimitModelAudit, operationalSettings, presetQualifications, currentMarketView } = context.auditApi;
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
state.updateStatus = read("data/update-status.json", {});
state.catalogCompletion = read("data/card-catalog-completion.json", { cards: {} });
state.priceEvidence = read("data/state-a-price-evidence.json", { cards: {} });
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
state.returnCalibration = read("data/return-horizon-calibration.json");
state.fixedPriceReference = read("data/fixed-price-reference-index.json");
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
const asOfDate = String(process.env.AUDIT_DATE || meta.updatedAt || meta.generatedAt || new Date().toISOString()).slice(0, 10);
state.operationalLimitHistory = previous && previous.modelVersion === model.MODEL_VERSION
  ? { ...previous, currentDataDate: asOfDate }
  : { modelVersion: model.MODEL_VERSION, currentDataDate: asOfDate, settings: operationalSettings(), cards: {} };
const startedAt = Date.now();
if (process.env.SHOP_EFFECT_AUDIT_REF) {
  const { execFileSync } = require("child_process");
  const ref = process.env.SHOP_EFFECT_AUDIT_REF;
  const gitRead = (file) => JSON.parse(execFileSync("git", ["show", `${ref}:${file}`], { cwd: root, encoding: "utf8", maxBuffer: 30000000 }));
  const actual = { psa: state.psaPopulation, cardrush: state.cardrushStock, hareruya2: state.hareruya2Stock };
  state.psaPopulation = gitRead("data/psa-population-summary.json").cards;
  for (const id of ["cardrush", "hareruya2"]) {
    const old = gitRead(`data/${id}-stock-summary.json`).cards;
    const catalog = gitRead(`work/${id}_catalog.json`);
    const byUrl = new Map(catalog.map((entry) => [entry.detailUrl, entry]));
    const byId = new Map(catalog.map((entry) => [entry.cardId, entry]));
    for (const card of state.cards) if (old[card.id]) old[card.id].updatedAt = (byId.get(card.id) || byUrl.get(card[`${id}Url`]))?.observedAt || null;
    state[`${id}Stock`] = old;
  }
  const before = candidateAvailabilityAudit.snapshot(prepareCalculatedCards(state.cards), presetQualifications, asOfDate, new Date().toISOString(), model.MODEL_VERSION);
  state.cardrushStock = actual.cardrush; state.hareruya2Stock = actual.hareruya2;
  const after = candidateAvailabilityAudit.snapshot(prepareCalculatedCards(state.cards), presetQualifications, asOfDate, new Date().toISOString(), model.MODEL_VERSION);
  const comparison = candidateAvailabilityAudit.compare(before, after);
  const effect = { referenceCommit: ref, baselineAt: read("work/acquisition-audit-baseline.json", {}).at || null,
    generatedAt: new Date().toISOString(), modelVersion: model.MODEL_VERSION, settings: operationalSettings(),
    fixedPsa: true, fixedMarketHistory: true, correctedIndividualPriceDates: true, before: before.counts, after: after.counts, comparison,
    rows: Object.keys(before.rows).map((id) => ({ id, before: before.rows[id], after: after.rows[id] || null })) };
  write("data/shop-refresh-isolated-effect.json", effect);
  console.log(JSON.stringify({ before: effect.before, after: effect.after, promoted: comparison.promoted, ref }));
  process.exit(0);
}
const calculated = prepareCalculatedCards(state.cards);
const priceTargets = {};
for (const card of calculated) {
  const combined = presetQualifications(card).combined;
  const current = currentMarketView(card);
  const currentCandidate = current.eligible && current.capState === 'available';
  if (!combined && !currentCandidate) continue;
  priceTargets[card.id] = { name: card.name, combined, currentMarket: currentCandidate,
    purchasePriceMissing: !card.currentStoreOffer, priceRefreshReady: currentCandidate && !card.currentStoreOffer,
    offerPrice: card.currentStoreOffer?.value ?? null, offerSource:card.currentStoreOffer?.source || null,
    reason: currentCandidate ? '現相場採算の非負上限探索・購入価格再確認' : '安定重視の価格待ち',
    purchaseState: card.purchasePriceStatus?.code || null };
}
const freshPriceAudit = { generatedAt: new Date().toISOString(), comparisonType: '価格更新優先キュー・判断条件変更なし',
  catalog: calculated.length, currentMarketCandidates: Object.values(priceTargets).filter(r => r.currentMarket).length,
  readyByPurchaseRefresh: Object.values(priceTargets).filter(r => r.priceRefreshReady).length,
  referenceFreshness: Object.fromEntries(['recent','stale','unknown'].map(field => [field, calculated.reduce((sum, card) => sum + model.referenceFreshness(card.priceAggregation)[field], 0)])),
  freshVsOld: calculated.flatMap(card => { const audit = model.referenceFreshness(card.priceAggregation); return audit.freshVsOldSources.length ? [{id:card.id,name:card.name, sources:audit.freshVsOldSources, referenceMedian:card.priceAggregation.value, warning:audit.warning, purchasePrice:card.currentStoreOffer?.value ?? null}] : []; }),
  purchaseStates: Object.fromEntries(['available','expired','out-of-stock','stopped','unacquired'].map(code => [code,calculated.filter(card => card.purchasePriceStatus?.code === code).length])) };
const candidateHistory = read("work/candidate-daily-history.json", { version: 1, days: [] });
const availabilityHistory = read("work/candidate-availability-history.json", { version: 1, runs: [] });
const candidateSettings = {
  modelVersion: model.MODEL_VERSION,
  ...operationalSettings(),
  minRawTrades30: 30,
  minRoi: 40,
  maxPsa10: 200000,
  preset: "おまかせ総合",
};
const candidateSnapshot = candidateDailyAudit.snapshot(calculated, presetQualifications, state.catalogCompletion, candidateSettings, asOfDate);
const earlier = candidateHistory.days.filter((row) => row.date < asOfDate).at(-1) || null;
const candidateComparison = candidateDailyAudit.compare(earlier, candidateSnapshot);
const candidateSummary = { version: 1, generatedAt: new Date().toISOString(), profile: candidateSettings,
  current: { date: asOfDate, cardCount: candidateSnapshot.cardCount, candidates: candidateSnapshot.candidates, purchasable: candidateSnapshot.purchasable, exclusion: candidateSnapshot.reasons },
  comparison: candidateComparison };
const generatedAvailabilitySnapshot = candidateAvailabilityAudit.snapshot(calculated, presetQualifications, asOfDate,
  candidateSummary.generatedAt, model.MODEL_VERSION);
const priorAvailability = availabilityHistory.runs.at(-1);
const availabilitySnapshot = priorAvailability?.date === asOfDate
  && JSON.stringify(priorAvailability.rows) === JSON.stringify(generatedAvailabilitySnapshot.rows)
  ? priorAvailability : generatedAvailabilitySnapshot;
const availabilityComparison = availabilitySnapshot === priorAvailability
  ? read("data/candidate-availability-audit.json", {})?.comparison || candidateAvailabilityAudit.compare(null, availabilitySnapshot)
  : candidateAvailabilityAudit.compare(priorAvailability, availabilitySnapshot);
const waitingWithShopLink = calculated.filter((card) => availabilitySnapshot.rows[card.id]?.status === "価格待ち"
  && (card.cardrushUrl || card.hareruya2Url));
const missingOfferPriority = waitingWithShopLink.filter((card) => !availabilitySnapshot.rows[card.id].offerPrice)
  .sort((left, right) => Number(right.psaTx30d || 0) - Number(left.psaTx30d || 0)).slice(0, 20);
const nearLimitPriority = waitingWithShopLink.filter((card) => availabilitySnapshot.rows[card.id].offerPrice)
  .sort((left, right) => {
    const leftRow = availabilitySnapshot.rows[left.id];
    const rightRow = availabilitySnapshot.rows[right.id];
    return leftRow.gap / Math.max(1, leftRow.limit) - rightRow.gap / Math.max(1, rightRow.limit);
  }).slice(0, 20);
const priority = [...missingOfferPriority, ...nearLimitPriority].map((card) => card.id);
const availabilitySummary = { version: 1, generatedAt: availabilitySnapshot.generatedAt,
  note: "仕入れ基準は変更しません。価格待ちから購入先確認済みへの移行だけを追跡します。",
  current: { date: asOfDate, ...availabilitySnapshot.counts }, comparison: availabilityComparison,
  priorityCount: priority.length, priorityBreakdown: { missingOffer: missingOfferPriority.length, nearLimit: nearLimitPriority.length },
  priorityIds: priority };
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
  const publishedAvailability = read("data/candidate-availability-audit.json");
  if (JSON.stringify(publishedAvailability?.current) !== JSON.stringify(availabilitySummary.current)) {
    throw new Error("Candidate availability audit is stale or differs from the current model/data");
  }
} else {
  write('work/purchase-price-targets.json', { generatedAt:freshPriceAudit.generatedAt, profile:'公開監査の既定費用・売却先（ユーザー設定は変更しない）', rows:priceTargets });
  write('data/purchase-price-freshness-audit.json', freshPriceAudit);
  write('work/purchase-price-observation-snapshot.json', { at:freshPriceAudit.generatedAt,
    analyzed:calculated.filter(card => card.catalogCompletion?.s === '分析可能').length,
    rows:Object.fromEntries(calculated.map(card => [card.id,{status:card.purchasePriceStatus?.code,price:card.currentStoreOffer?.value ?? null,source:card.currentStoreOffer?.source || null,at:card.currentStoreOffer?.updatedAt || null}])) });
  const cohortBaseline = read("work/acquisition-audit-baseline.json", null);
  const cohortIds = new Set(Object.keys(cohortBaseline?.availability?.rows || {}));
  if (cohortIds.size) {
    const rows = {};
    for (const card of calculated.filter((item) => cohortIds.has(item.id))) {
      const flags = presetQualifications(card);
      rows[card.id] = { name: card.name, status: flags.now ? "購入先確認済み" : "価格待ち", eligible: flags.combined,
        limit: Number(card.buyLimits?.clean?.finalMaxPrice) || null, offerPrice: card.currentStoreOffer?.value ?? null,
        store: card.currentStoreOffer?.source || null, storeUpdatedAt: card.currentStoreOffer?.updatedAt || null,
        verdict: card.purchaseDecision?.verdict || null, reasons: card.purchaseDecision?.reasons || [],
        currentReferencePrice: Number(card.price) || null, priceConfidence: card.priceAggregation?.confidence || null,
        manualReview: Boolean(card.dataQuality?.manualReview), dataAnomaly: Boolean(card.dataQuality?.dataAnomaly) };
    }
    write("work/candidate-cohort-current.json", { settings: candidateSettings, modelVersion: model.MODEL_VERSION, rows });
  }
  write("data/purchase-limit-model-audit.json", audit);
  write("data/operational-limit-history.json", history);
  write("data/candidate-daily-audit.json", candidateSummary);
  write("data/candidate-availability-audit.json", availabilitySummary);
  write("work/candidate-daily-history.json", { version: 1, days: [...candidateHistory.days.filter((row) => row.date < asOfDate), candidateSnapshot].slice(-14) });
  const recordedRuns = availabilityHistory.runs.filter((row, index, rows) => index === 0
    || row.date !== rows[index - 1].date || JSON.stringify(row.rows) !== JSON.stringify(rows[index - 1].rows));
  write("work/candidate-availability-history.json", { version: 1,
    runs: [...recordedRuns, ...(availabilitySnapshot === priorAvailability ? [] : [availabilitySnapshot])].slice(-28) });
}
console.log(JSON.stringify({ catalogCards: audit.catalogCards, analyzedCards: audit.analyzedCards, changedLimits: audit.changedLimits, changedVerdicts: audit.changedVerdicts, historyCards: Object.keys(historyCards).length, candidateAudit: candidateSummary.current, candidateComparison: candidateComparison.status, availability: availabilitySummary.current, promoted: availabilityComparison.promoted, durationMs: audit.durationMs }));
