const fmt = new Intl.NumberFormat("ja-JP");
const decisionModel = window.PurchaseDecisionModel;
const marketModel = window.MarketAnalysisModel;
const FORECAST_HORIZON_DAYS = 91;

const state = {
  cards: [],
  cardrushStock: Object.create(null),
  hareruya2Stock: Object.create(null),
  yuyuteiStock: Object.create(null),
  torecacampStock: Object.create(null),
  shopBuybacks: Object.create(null),
  buybackShops: Object.create(null),
  buybackDates: [],
  buybackUpdatedAt: null,
  marketStability: Object.create(null),
  marketStabilityMeta: null,
  psaPopulation: Object.create(null),
  psaHistoryCache: Object.create(null),
  psaServices: null,
  evaluationModel: null,
  updateStatus: null,
  snkrUrlCache: Object.create(null),
  cardById: Object.create(null),
  snkrObserver: null,
  fee: 12980,
  psaPlan: "regular",
  psaHandlingFee: 1000,
  guideMode: "70",
  minSaleTx: 30,
  maxSaleTx: null,
  minSaleTx7: 0,
  maxSaleTx7: null,
  minPsaTx: 0,
  maxPsaTx: null,
  minPsaTx7: 0,
  maxPsaTx7: null,
  minBuyback7: 0,
  maxBuyback7: null,
  minBuyback30: 0,
  maxBuyback30: null,
  minBuyback90: 0,
  maxBuyback90: null,
  minBuybackShops: 0,
  minBuybackPrice: null,
  maxBuybackPrice: null,
  minRoi: 40,
  minPsa10: 0,
  maxPsa10: 200000,
  minPrice: null,
  maxPrice: null,
  minPurchaseLimitRatio: null,
  minPsaRate: null,
  overallFilter: "all",
  minExitLiquidity: 0,
  minEconomics: 0,
  minMarketStability: 0,
  minSupplyRisk: 0,
  minFuturePriceScore: 0,
  maxFuturePriceScore: null,
  minForecastPrice: null,
  maxForecastPrice: null,
  minForecastDownside: null,
  maxForecastDownside: null,
  minForecastGap: null,
  maxForecastGap: null,
  forecastPhase: "all",
  forecastConfidence: "all",
  forecastSupplyPressure: "all",
  minForecastAge: null,
  forecastMaturity: "all",
  maxForecastMonthlyIncrease: null,
  stockDemand: "all",
  dataQualityFilter: "all",
  floorState: "all",
  priceDirection: "all",
  supplyState: "all",
  minFloorScore: null,
  storeDemand: "all",
  hideSkipped: false,
  hideReview: false,
  fundingOnly: false,
  officialOnly: false,
  sort: "overall-desc",
  q: "",
  visibleLimit: 60,
  favorites: new Set(),
  favoriteQuantities: Object.create(null),
  favoriteQuery: "",
  psaCapital: 500000,
  lockedCapital: 0,
  lockDays: 91,
  minExpectedProfit: 10000,
  minExpectedRoi: 30,
  minAnnualEfficiency: 40,
  maxCapitalShare: 10,
  submissionCount: 10,
  gradingReserve: 130000,
  saleFeeRate: 0,
  saleExtraCost: 0,
};

const FAVORITES_STORAGE_KEY = "pokeka-buy-favorites-v1";
const FAVORITE_QUANTITIES_STORAGE_KEY = "pokeka-buy-favorite-quantities-v1";
let favoriteQuantityRenderTimer = null;

let meta = window.POKEMON_CARDS_META || {};
const guideModes = {
  "70": { label: "10率70%基準", hitRate: 0.7 },
  "50": { label: "10率50%基準", hitRate: 0.5 },
};
const guideRanges = [
  { label: "40,000〜70,000", start: 40000, end: 70000 },
  { label: "71,000〜100,000", start: 71000, end: 100000 },
  { label: "101,000〜150,000", start: 101000, end: 150000 },
];
const guideLines = [
  { key: "ideal", label: "理想仕入れ", roi: 20, caption: "高利益ライン", className: "ideal" },
  { key: "recommended", label: "おすすめ仕入れ", roi: 10, caption: "標準ライン", className: "recommended" },
  { key: "upper", label: "上限仕入れ", roi: 0, caption: "これ以上は買わない", className: "upper" },
];

const els = {
  qInput: document.getElementById("qInput"),
  feeInput: document.getElementById("feeInput"),
  psaPlanInput: document.getElementById("psaPlanInput"),
  psaPlanSummary: document.getElementById("psaPlanSummary"),
  saleTxMinInput: document.getElementById("saleTxMinInput"),
  saleTxMaxInput: document.getElementById("saleTxMaxInput"),
  saleTx7MinInput: document.getElementById("saleTx7MinInput"),
  saleTx7MaxInput: document.getElementById("saleTx7MaxInput"),
  psaTxMinInput: document.getElementById("psaTxMinInput"),
  psaTxMaxInput: document.getElementById("psaTxMaxInput"),
  psaTx7MinInput: document.getElementById("psaTx7MinInput"),
  psaTx7MaxInput: document.getElementById("psaTx7MaxInput"),
  buyback7MinInput: document.getElementById("buyback7MinInput"),
  buyback7MaxInput: document.getElementById("buyback7MaxInput"),
  buyback30MinInput: document.getElementById("buyback30MinInput"),
  buyback30MaxInput: document.getElementById("buyback30MaxInput"),
  buyback90MinInput: document.getElementById("buyback90MinInput"),
  buyback90MaxInput: document.getElementById("buyback90MaxInput"),
  buybackShopsMinInput: document.getElementById("buybackShopsMinInput"),
  buybackPriceMinInput: document.getElementById("buybackPriceMinInput"),
  buybackPriceMaxInput: document.getElementById("buybackPriceMaxInput"),
  psaRateMinInput: document.getElementById("psaRateMinInput"),
  overallFilterInput: document.getElementById("overallFilterInput"),
  minExitLiquidityInput: document.getElementById("minExitLiquidityInput"),
  minEconomicsInput: document.getElementById("minEconomicsInput"),
  minMarketStabilityInput: document.getElementById("minMarketStabilityInput"),
  minSupplyRiskInput: document.getElementById("minSupplyRiskInput"),
  minFuturePriceScoreInput: document.getElementById("minFuturePriceScoreInput"),
  maxFuturePriceScoreInput: document.getElementById("maxFuturePriceScoreInput"),
  minForecastPriceInput: document.getElementById("minForecastPriceInput"),
  maxForecastPriceInput: document.getElementById("maxForecastPriceInput"),
  minForecastDownsideInput: document.getElementById("minForecastDownsideInput"),
  maxForecastDownsideInput: document.getElementById("maxForecastDownsideInput"),
  minForecastGapInput: document.getElementById("minForecastGapInput"),
  maxForecastGapInput: document.getElementById("maxForecastGapInput"),
  forecastPhaseInput: document.getElementById("forecastPhaseInput"),
  forecastConfidenceInput: document.getElementById("forecastConfidenceInput"),
  forecastSupplyPressureInput: document.getElementById("forecastSupplyPressureInput"),
  minForecastAgeInput: document.getElementById("minForecastAgeInput"),
  forecastMaturityInput: document.getElementById("forecastMaturityInput"),
  maxForecastMonthlyIncreaseInput: document.getElementById("maxForecastMonthlyIncreaseInput"),
  stockDemandInput: document.getElementById("stockDemandInput"),
  dataQualityFilterInput: document.getElementById("dataQualityFilterInput"),
  floorStateInput: document.getElementById("floorStateInput"),
  priceDirectionInput: document.getElementById("priceDirectionInput"),
  supplyStateInput: document.getElementById("supplyStateInput"),
  minFloorScoreInput: document.getElementById("minFloorScoreInput"),
  storeDemandInput: document.getElementById("storeDemandInput"),
  hideSkippedInput: document.getElementById("hideSkippedInput"),
  hideReviewInput: document.getElementById("hideReviewInput"),
  fundingOnlyInput: document.getElementById("fundingOnlyInput"),
  officialOnlyInput: document.getElementById("officialOnlyInput"),
  resetFiltersBtn: document.getElementById("resetFiltersBtn"),
  roiInput: document.getElementById("roiInput"),
  psaMinInput: document.getElementById("psaMinInput"),
  psaMaxInput: document.getElementById("psaMaxInput"),
  priceMinInput: document.getElementById("priceMinInput"),
  priceMaxInput: document.getElementById("priceMaxInput"),
  purchaseLimitRatioMinInput: document.getElementById("purchaseLimitRatioMinInput"),
  sortInput: document.getElementById("sortInput"),
  grid: document.getElementById("grid"),
  totalStat: document.getElementById("totalStat"),
  countStat: document.getElementById("countStat"),
  topRoiStat: document.getElementById("topRoiStat"),
  topProfitStat: document.getElementById("topProfitStat"),
  goCountStat: document.getElementById("goCountStat"),
  conditionalCountStat: document.getElementById("conditionalCountStat"),
  reviewCountStat: document.getElementById("reviewCountStat"),
  dataShortageCountStat: document.getElementById("dataShortageCountStat"),
  outlierExcludedCountStat: document.getElementById("outlierExcludedCountStat"),
  updatedAt: document.getElementById("updatedAt"),
  dataFreshness: document.getElementById("dataFreshness"),
  cardrushCoverage: document.getElementById("cardrushCoverage"),
  copyLinkBtn: document.getElementById("copyLinkBtn"),
  exportSearchBtn: document.getElementById("exportSearchBtn"),
  importSearchInput: document.getElementById("importSearchInput"),
  guidePanels: document.getElementById("guidePanels"),
  guideHitRateStat: document.getElementById("guideHitRateStat"),
  guidePsa9RateStat: document.getElementById("guidePsa9RateStat"),
  guideFeeStat: document.getElementById("guideFeeStat"),
  guideButtons: [...document.querySelectorAll("[data-guide-mode]")],
  loadMoreBtn: document.getElementById("loadMoreBtn"),
  resultProgress: document.getElementById("resultProgress"),
  favoritesPanel: document.getElementById("favoritesPanel"),
  favoritesList: document.getElementById("favoritesList"),
  favoritesHint: document.getElementById("favoritesHint"),
  favoritesPortfolioSummary: document.getElementById("favoritesPortfolioSummary"),
  favoriteCount: document.getElementById("favoriteCount"),
  favoriteCountToolbar: document.getElementById("favoriteCountToolbar"),
  openFavoritesBtn: document.getElementById("openFavoritesBtn"),
  copyFavoritesBtn: document.getElementById("copyFavoritesBtn"),
  exportFavoritesBtn: document.getElementById("exportFavoritesBtn"),
  importFavoritesInput: document.getElementById("importFavoritesInput"),
  favoriteSearchInput: document.getElementById("favoriteSearchInput"),
  clearFavoritesBtn: document.getElementById("clearFavoritesBtn"),
  psaCapitalInput: document.getElementById("psaCapitalInput"),
  lockedCapitalInput: document.getElementById("lockedCapitalInput"),
  lockDaysInput: document.getElementById("lockDaysInput"),
  minExpectedProfitInput: document.getElementById("minExpectedProfitInput"),
  minExpectedRoiInput: document.getElementById("minExpectedRoiInput"),
  minAnnualEfficiencyInput: document.getElementById("minAnnualEfficiencyInput"),
  maxCapitalShareInput: document.getElementById("maxCapitalShareInput"),
  submissionCountInput: document.getElementById("submissionCountInput"),
  gradingReserveInput: document.getElementById("gradingReserveInput"),
  saleFeeRateInput: document.getElementById("saleFeeRateInput"),
  saleExtraCostInput: document.getElementById("saleExtraCostInput"),
  gradingReserveStatus: document.getElementById("gradingReserveStatus"),
  capitalAvailabilityStatus: document.getElementById("capitalAvailabilityStatus"),
  shopReferenceLinks: document.getElementById("shopReferenceLinks"),
  shopRateSummary: document.getElementById("shopRateSummary"),
};

function showStatus(message, kind = "info") {
  els.grid.innerHTML = `
    <div class="card" style="padding:20px">
      <h3 style="margin:0 0 8px">${kind === "error" ? "読み込みできません" : "案内"}</h3>
      <p style="margin:0;color:var(--muted);white-space:pre-wrap">${message}</p>
    </div>
  `;
}

function psaChangeBadge(change, days) {
  if (!change) return `<span class="psa-change pending"><b>${days}日</b> 蓄積中</span>`;
  const className = change.s === "急増化" ? "surge" : change.s === "増加" ? "increase" : change.s === "少ない" ? "small" : "flat";
  const delta = Number(change.d10 || 0);
  const observed = change.partial && Number(change.days) > 0 ? `（観測${fmt.format(change.days)}日）` : "";
  return `<span class="psa-change ${className}"><b>${days}日 ${escapeHtml(change.s)}</b> ${delta >= 0 ? "+" : ""}${fmt.format(delta)}枚${observed}</span>`;
}

function psaGrowthSummary(official) {
  const entry = [[7, official?.w7], [30, official?.w30], [90, official?.w90]].find(([, change]) => change);
  if (!entry) return { label: "推移蓄積中", className: "pending" };
  const [days, change] = entry;
  const className = change.s === "急増化" ? "surge" : change.s === "増加" ? "increase" : change.s === "少ない" ? "small" : "flat";
  return { label: `${days}日 ${change.s}${change.partial && Number(change.days) > 0 ? `（観測${change.days}日）` : ""}`, className };
}

function sourceAgeDays(value) {
  const date = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Infinity;
  return Math.max(0, Math.floor((Date.now() - new Date(`${date}T00:00:00+09:00`).getTime()) / 86400000));
}

function releaseMaturityFromOfficial(official, card) {
  const match = String(official?.u || "").match(/\/(19|20)(\d{2})\//);
  if (!match) return { year: null, ageYears: null, key: "unknown", label: "発売年未取得", score: 45, legacyPromo: false };
  const year = Number(`${match[1]}${match[2]}`);
  const ageYears = Math.max(0, new Date().getFullYear() - year);
  const legacyPromo = ageYears >= 3 && /プロモ|promo/i.test(String(card?.name || ""));
  if (ageYears >= 3) return { year, ageYears, key: "mature", label: legacyPromo ? "旧プロモ・供給成熟" : "供給成熟・再販リスク低め", score: legacyPromo ? 95 : 90, legacyPromo };
  if (ageYears >= 1) return { year, ageYears, key: "established", label: "供給成熟途中", score: 68, legacyPromo: false };
  return { year, ageYears, key: "recent", label: "新しいカード", score: 30, legacyPromo: false };
}

function availablePsaPlans() {
  const plans = state.psaServices?.plans;
  return Array.isArray(plans) && plans.length ? plans.filter((plan) => plan.available !== false) : [
    { id: "regular", name: "レギュラー", price: 11980, businessDays: 60, calendarDays: 84, declaredValueMax: 250000, available: true },
    { id: "express", name: "エクスプレス", price: 22980, businessDays: 25, calendarDays: 35, declaredValueMax: 400000, available: true },
  ];
}

function selectedPsaPlan() {
  const plans = availablePsaPlans();
  return plans.find((plan) => plan.id === state.psaPlan) || plans[0];
}

function psaPriceBand(price) {
  const value = Math.max(0, Number(price || 0));
  const width = value < 30000 ? 5000 : value < 100000 ? 10000 : value < 300000 ? 25000 : 50000;
  const min = Math.floor(value / width) * width;
  return { key: `${width}:${min}`, min, max: min + width, width };
}

function evaluationPriceBand(price) {
  const value = Number(price || 0);
  if (value < 30000) return "under30k";
  if (value < 50000) return "30k-50k";
  if (value < 100000) return "50k-100k";
  if (value < 200000) return "100k-200k";
  return "over200k";
}

function learnedPercentileScore(value, distribution) {
  const number = Number(value || 0);
  if (!distribution || distribution.count < 8) return 50;
  const q25 = Number(distribution.q25 || 0);
  const q50 = Number(distribution.q50 || q25);
  const q75 = Number(distribution.q75 || q50);
  const q90 = Number(distribution.q90 || q75);
  if (number <= q25) return q25 > 0 ? Math.max(0, Math.round(number / q25 * 25)) : (number > 0 ? 25 : 0);
  if (number <= q50) return 25 + Math.round((number - q25) / Math.max(1, q50 - q25) * 25);
  if (number <= q75) return 50 + Math.round((number - q50) / Math.max(1, q75 - q50) * 25);
  if (number <= q90) return 75 + Math.round((number - q75) / Math.max(1, q90 - q75) * 15);
  return 100;
}

const median = decisionModel.median;

function applyPsaPlan({ updateLockDays = false } = {}) {
  const plan = selectedPsaPlan();
  state.psaPlan = plan.id;
  state.psaHandlingFee = Number(state.psaServices?.handlingFee ?? 1000);
  state.fee = Number(plan.price || 0) + state.psaHandlingFee;
  els.psaPlanInput.value = plan.id;
  els.feeInput.value = String(state.fee);
  if (updateLockDays && Number(plan.calendarDays) > 0) {
    els.lockDaysInput.value = String(Number(plan.calendarDays) + 7);
  }
  if (els.psaPlanSummary) {
    const delivery = plan.businessDays ? `${fmt.format(plan.businessDays)}営業日（約${fmt.format(plan.calendarDays)}日）` : "納期未取得";
    const lockEstimate = Number(plan.calendarDays) > 0 ? ` / 資金ロック目安 ${fmt.format(Number(plan.calendarDays) + 7)}日` : "";
    const checkedAt = state.psaServices?.checkedAt || state.psaServices?.updatedAt;
    const checkStatus = state.psaServices?.checkStatus === "failed" ? "（確認失敗・前回値）" : "";
    const checkedText = checkedAt ? ` / 料金確認 ${checkedAt}${checkStatus}` : "";
    els.psaPlanSummary.textContent = `公式 ¥${fmt.format(plan.price)}＋手数料 ¥${fmt.format(state.psaHandlingFee)}＝¥${fmt.format(state.fee)} / ${delivery}${lockEstimate} / 申告価格 ¥${fmt.format(plan.declaredValueMax)}以下${checkedText}`;
  }
}

function populatePsaPlans({ updateLockDays = false } = {}) {
  const plans = availablePsaPlans();
  els.psaPlanInput.innerHTML = plans.map((plan) => `<option value="${escapeHtml(plan.id)}">${escapeHtml(plan.name)}</option>`).join("");
  if (!plans.some((plan) => plan.id === state.psaPlan)) state.psaPlan = plans[0].id;
  applyPsaPlan({ updateLockDays });
}

async function renderPsaHistory(details) {
  if (details.dataset.loaded === "1") return;
  const id = details.dataset.psaHistory;
  const shard = details.dataset.psaShard;
  const target = details.querySelector("[data-psa-chart]");
  if (!id || !shard || !target) return;
  target.textContent = "履歴を読み込み中…";
  try {
    if (!state.psaHistoryCache[shard]) {
      const data = await fetchJsonMaybe(`./data/psa-history/${shard}.json`);
      state.psaHistoryCache[shard] = data?.cards || {};
    }
    const rows = state.psaHistoryCache[shard]?.[id] || [];
    if (rows.length < 2) {
      target.innerHTML = '<p class="psa-chart-empty">推移を蓄積中です。2回目の取得後から線グラフを表示します。</p>';
      details.dataset.loaded = "1";
      return;
    }
    const width = 360, height = 120, pad = 10;
    const maxValue = Math.max(...rows.flatMap((row) => [Number(row[1] || 0), Number(row[2] || 0)]), 1);
    const points = (index) => rows.map((row, i) => {
      const x = pad + (rows.length === 1 ? 0 : i / (rows.length - 1)) * (width - pad * 2);
      const y = height - pad - Number(row[index] || 0) / maxValue * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const first = rows[0], last = rows[rows.length - 1];
    target.innerHTML = `
      <svg class="psa-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="PSA10枚数とTOTAL枚数の推移">
        <polyline class="psa-line-total" points="${points(2)}"></polyline>
        <polyline class="psa-line-ten" points="${points(1)}"></polyline>
      </svg>
      <div class="psa-chart-legend"><span class="ten">PSA10</span><span class="total">TOTAL</span><small>${first[0]} → ${last[0]} / ${rows.length}記録</small></div>
    `;
    details.dataset.loaded = "1";
  } catch {
    target.textContent = "履歴を読み込めませんでした。";
  }
}

const sorters = {
  "roi-desc": (a, b) => b.roi - a.roi,
  "roi-asc": (a, b) => a.roi - b.roi,
  "profit-desc": (a, b) => b.profit - a.profit,
  "profit-asc": (a, b) => a.profit - b.profit,
  "psaRecommend-desc": (a, b) => Number(b.psaDecision?.recommended) - Number(a.psaDecision?.recommended) || (b.psaDecision?.annualEfficiency ?? -Infinity) - (a.psaDecision?.annualEfficiency ?? -Infinity),
  "overall-desc": (a, b) => (b.overallAssessment?.score ?? -Infinity) - (a.overallAssessment?.score ?? -Infinity) || b.roi - a.roi,
  "buyLimitClean-desc": (a, b) => (b.buyLimits?.clean?.maxPrice ?? -Infinity) - (a.buyLimits?.clean?.maxPrice ?? -Infinity),
  "buyLimitScratch-desc": (a, b) => (b.buyLimits?.scratch?.maxPrice ?? -Infinity) - (a.buyLimits?.scratch?.maxPrice ?? -Infinity),
  "exit-desc": (a, b) => (b.overallAssessment?.exitLiquidity ?? -Infinity) - (a.overallAssessment?.exitLiquidity ?? -Infinity) || b.psaTx30d - a.psaTx30d,
  "futureScore-desc": (a, b) => (b.futurePriceForecast?.score ?? -Infinity) - (a.futurePriceForecast?.score ?? -Infinity) || b.roi - a.roi,
  "floorScore-desc": (a, b) => (b.marketStability?.score ?? -Infinity) - (a.marketStability?.score ?? -Infinity) || b.roi - a.roi,
  "storeDemand-desc": (a, b) => (b.buybackAnalysis?.score ?? -Infinity) - (a.buybackAnalysis?.score ?? -Infinity) || b.buybackShops - a.buybackShops,
  "buybackRatio-desc": (a, b) => (b.buybackAnalysis?.ratioMedian ?? -Infinity) - (a.buybackAnalysis?.ratioMedian ?? -Infinity) || b.buybackPrice - a.buybackPrice,
  "downside-asc": (a, b) => (a.futurePriceForecast?.downsidePct ?? Infinity) - (b.futurePriceForecast?.downsidePct ?? Infinity),
  "forecastPrice-desc": (a, b) => (b.futurePriceForecast?.predictedPrice ?? -Infinity) - (a.futurePriceForecast?.predictedPrice ?? -Infinity),
  "forecastPrice-asc": (a, b) => (a.futurePriceForecast?.predictedPrice ?? Infinity) - (b.futurePriceForecast?.predictedPrice ?? Infinity),
  "expectedProfit-desc": (a, b) => (b.psaDecision?.expectedProfit ?? -Infinity) - (a.psaDecision?.expectedProfit ?? -Infinity),
  "annualEfficiency-desc": (a, b) => (b.psaDecision?.annualEfficiency ?? -Infinity) - (a.psaDecision?.annualEfficiency ?? -Infinity),
  "capitalShare-asc": (a, b) => (a.psaDecision?.capitalShare ?? Infinity) - (b.psaDecision?.capitalShare ?? Infinity),
  "tx-desc": (a, b) => b.saleTx30d - a.saleTx30d,
  "tx-asc": (a, b) => a.saleTx30d - b.saleTx30d,
  "tx7-desc": (a, b) => b.saleTx7d - a.saleTx7d,
  "tx7-asc": (a, b) => a.saleTx7d - b.saleTx7d,
  "combined30-desc": (a, b) => b.combined30 - a.combined30,
  "combined7-desc": (a, b) => b.combined7 - a.combined7,
  "cardrushDrop30-desc": (a, b) => (b.shopDrop30 ?? -Infinity) - (a.shopDrop30 ?? -Infinity),
  "cardrushDrop7-desc": (a, b) => (b.shopDrop7 ?? -Infinity) - (a.shopDrop7 ?? -Infinity),
  "buyback90-desc": (a, b) => b.buyback90 - a.buyback90,
  "buyback30-desc": (a, b) => b.buyback30 - a.buyback30,
  "buyback7-desc": (a, b) => b.buyback7 - a.buyback7,
  "buybackPrice-desc": (a, b) => b.buybackPrice - a.buybackPrice,
  "buybackPrice-asc": (a, b) => (a.buybackPrice || Infinity) - (b.buybackPrice || Infinity),
  "buybackAvg30-desc": (a, b) => b.buybackAvg30 - a.buybackAvg30,
  "buybackAvg30-asc": (a, b) => (a.buybackAvg30 || Infinity) - (b.buybackAvg30 || Infinity),
  "buybackShops-desc": (a, b) => b.buybackShops - a.buybackShops,
  "psaTx-desc": (a, b) => b.psaTx30d - a.psaTx30d,
  "psaTx-asc": (a, b) => a.psaTx30d - b.psaTx30d,
  "psaTx7-desc": (a, b) => b.psaTx7d - a.psaTx7d,
  "psaTx7-asc": (a, b) => a.psaTx7d - b.psaTx7d,
  "chg30-desc": (a, b) => (b.chg30 ?? -Infinity) - (a.chg30 ?? -Infinity),
  "chg30-asc": (a, b) => (a.chg30 ?? Infinity) - (b.chg30 ?? Infinity),
  "chg7-desc": (a, b) => (b.chg7 ?? -Infinity) - (a.chg7 ?? -Infinity),
  "chg7-asc": (a, b) => (a.chg7 ?? Infinity) - (b.chg7 ?? Infinity),
  "psa-desc": (a, b) => b.psa10 - a.psa10,
  "psa-asc": (a, b) => a.psa10 - b.psa10,
  "psaMin-desc": (a, b) => (b.snkPsa10Min ?? -Infinity) - (a.snkPsa10Min ?? -Infinity),
  "psaMin-asc": (a, b) => (a.snkPsa10Min ?? Infinity) - (b.snkPsa10Min ?? Infinity),
  "price-asc": (a, b) => a.price - b.price,
  "price-desc": (a, b) => b.price - a.price,
  "listings-desc": (a, b) => (b.snkListings ?? -Infinity) - (a.snkListings ?? -Infinity),
  "listings-asc": (a, b) => (a.snkListings ?? Infinity) - (b.snkListings ?? Infinity),
  "days-desc": (a, b) => (b.days ?? -Infinity) - (a.days ?? -Infinity),
  "days-asc": (a, b) => (a.days ?? Infinity) - (b.days ?? Infinity),
  "updated-desc": (a, b) => String(b.tLastAt || "").localeCompare(String(a.tLastAt || "")),
  "updated-asc": (a, b) => String(a.tLastAt || "").localeCompare(String(b.tLastAt || "")),
  "tvel-desc": (a, b) => (b.tvel ?? -Infinity) - (a.tvel ?? -Infinity),
  "tvel-asc": (a, b) => (a.tvel ?? Infinity) - (b.tvel ?? Infinity),
};

function normalize(v) {
  return (v || "")
    .toString()
    .toLowerCase()
    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
    .replace(/[‐−–—]/g, "-")
    .trim();
}

function compactSearch(v) {
  return normalize(v).replace(/[^0-9a-z\u3040-\u30ff\u3400-\u9fff]+/gi, "");
}

function roundToStep(value, step = 1000) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value / step) * step);
}

function floorToStep(value, step = 500) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.floor(value / step) * step);
}

function calcGuideBuyPrice(psa10, hitRate, fee, targetRoi, psa9Rate = 0.75) {
  const roi = targetRoi / 100;
  const saleMultiplier = Math.max(0, 1 - state.saleFeeRate / 100);
  const numerator = hitRate * psa10 * saleMultiplier - state.saleExtraCost - fee * (1 + roi);
  const denominator = roi + 1 - (1 - hitRate) * psa9Rate * saleMultiplier;
  if (!(denominator > 0)) return null;
  return roundToStep(numerator / denominator);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function loadFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || "[]");
    state.favorites = new Set(Array.isArray(saved) ? saved.map(String) : []);
  } catch {
    state.favorites = new Set();
  }
  try {
    const savedQuantities = JSON.parse(localStorage.getItem(FAVORITE_QUANTITIES_STORAGE_KEY) || "{}");
    state.favoriteQuantities = savedQuantities && typeof savedQuantities === "object" ? savedQuantities : Object.create(null);
  } catch {
    state.favoriteQuantities = Object.create(null);
  }
  state.favorites.forEach((id) => {
    state.favoriteQuantities[id] = Math.max(1, Math.floor(Number(state.favoriteQuantities[id] || 1)));
  });
}

function saveFavorites() {
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...state.favorites]));
  localStorage.setItem(FAVORITE_QUANTITIES_STORAGE_KEY, JSON.stringify(state.favoriteQuantities));
}

function favoriteQuantity(id) {
  return Math.max(1, Math.floor(Number(state.favoriteQuantities[String(id)] || 1)));
}

function favoriteGuide(card) {
  const cfg = guideConfig();
  const psa10 = Number(card.futurePriceForecast?.predictedPrice || card.snkPsa10Price || card.psa10 || 0);
  const fee = Number(state.fee || 0);
  return {
    ideal: calcGuideBuyPrice(psa10, cfg.hitRate, fee, 20),
    recommended: calcGuideBuyPrice(psa10, cfg.hitRate, fee, 10),
    upper: calcGuideBuyPrice(psa10, cfg.hitRate, fee, 0),
  };
}

function buyLimitText(limit) {
  return limit?.maxPrice > 0 ? `¥${fmt.format(limit.maxPrice)}以下` : "仕入れ見送り";
}

function favoriteCards() {
  const byId = new Map(state.cards.map((card) => [String(card.id), card]));
  return [...state.favorites].map((id) => byId.get(id)).filter(Boolean);
}

function renderFavorites() {
  if (!els.favoritesList) return;
  const allCards = favoriteCards();
  const evaluatedCards = allCards.map(calc);
  const capital = decisionModel.capitalPlan({
    totalCapital: state.psaCapital,
    lockedCapital: state.lockedCapital,
    gradingReserve: state.gradingReserve,
    submissionCount: state.submissionCount,
    fee: state.fee,
  });
  const portfolio = decisionModel.portfolioPlan(evaluatedCards.map((card) => ({
    price: card.price,
    quantity: favoriteQuantity(card.id),
  })), capital);
  const favoriteQuery = compactSearch(state.favoriteQuery);
  const cards = favoriteQuery
    ? evaluatedCards.filter((card) => compactSearch(`${card.name} ${card.model} ${card.id}`).includes(favoriteQuery))
    : evaluatedCards;
  if (els.favoriteCount) els.favoriteCount.textContent = fmt.format(portfolio.unitCount);
  if (els.favoriteCountToolbar) els.favoriteCountToolbar.textContent = fmt.format(portfolio.unitCount);
  if (els.favoritesHint) {
    els.favoritesHint.textContent = allCards.length
      ? `${fmt.format(allCards.length)}種類・合計${fmt.format(portfolio.unitCount)}枚${favoriteQuery ? ` / ${fmt.format(cards.length)}種類を表示` : ""}。数量は同じカードを複数買う場合だけ増やしてください。`
      : "各カードの「仕入れ候補に追加」から登録してください。";
  }
  if (els.favoritesPortfolioSummary) {
    const balance = Math.abs(portfolio.remainingCapital);
    els.favoritesPortfolioSummary.className = `favorites-portfolio-summary ${portfolio.affordable ? "enough" : "short"}`;
    els.favoritesPortfolioSummary.innerHTML = allCards.length
      ? `<div><span>選択中の合計仕入れ額</span><strong>¥${fmt.format(Math.round(portfolio.totalPurchase))}</strong></div><div><span>使用可能資金</span><strong>¥${fmt.format(Math.round(portfolio.availableCapital))}</strong></div><div><span>${portfolio.affordable ? "残り資金" : "不足額"}</span><strong>${portfolio.affordable ? "" : "-"}¥${fmt.format(Math.round(balance))}</strong></div>`
      : "";
  }
  els.copyFavoritesBtn.disabled = allCards.length === 0;
  els.exportFavoritesBtn.disabled = allCards.length === 0;
  els.clearFavoritesBtn.disabled = allCards.length === 0;
  if (!allCards.length) {
    els.favoritesList.innerHTML = '<div class="favorites-empty">まだ仕入れ候補はありません。</div>';
    return;
  }
  if (!cards.length) {
    els.favoritesList.innerHTML = '<div class="favorites-empty">この検索条件に一致するお気に入りはありません。</div>';
    return;
  }
  els.favoritesList.innerHTML = cards.map((card) => {
    const limits = card.buyLimits;
    const verdict = card.purchaseDecision?.verdict || "未判定";
    const quantity = favoriteQuantity(card.id);
    const name = escapeHtml(String(card.name || "").replace(/\s+/g, " "));
    return `
      <article class="favorite-row" data-favorite-id="${escapeHtml(card.id)}">
        <img src="${escapeHtml(card.img)}" alt="" loading="lazy" />
        <div class="favorite-main">
          <h3>${name}</h3>
          <div class="favorite-decision ${verdict === "GO" ? "recommended" : "not-recommended"}">今回の仕入れ判断：${escapeHtml(verdict)}</div>
          <label class="favorite-quantity"><span>購入枚数</span><input type="number" min="1" step="1" value="${quantity}" data-favorite-quantity="${escapeHtml(card.id)}" /><b>現在価格合計 ¥${fmt.format(Math.round(card.price * quantity))}</b></label>
          <div class="favorite-prices">
            <div><span>現在 / 予測PSA10</span><strong>¥${fmt.format(card.psa10)} / ¥${fmt.format(card.futurePriceForecast?.predictedPrice || card.psa10)}</strong></div>
            <div class="recommended"><span>美品なら</span><strong>${buyLimitText(limits?.clean)}</strong></div>
            <div class="scratch"><span>多少の傷ありなら</span><strong>${buyLimitText(limits?.scratch)}</strong></div>
            <div><span>PSA10時 利益率</span><strong>${Number.isFinite(card.roi) ? `${Math.round(card.roi)}%` : "未判定"}</strong></div>
          </div>
        </div>
        <button class="remove-favorite" type="button" data-remove-favorite="${escapeHtml(card.id)}" title="お気に入りを解除" aria-label="${name}をお気に入りから解除">×</button>
      </article>
    `;
  }).join("");
}

function toggleFavorite(id, { confirmRemoval = false } = {}) {
  const key = String(id);
  if (state.favorites.has(key)) {
    if (confirmRemoval && !window.confirm("このカードをお気に入りから解除しますか？")) return;
    state.favorites.delete(key);
    delete state.favoriteQuantities[key];
  } else {
    state.favorites.add(key);
    state.favoriteQuantities[key] = 1;
  }
  saveFavorites();
  renderFavorites();
  document.querySelectorAll(`[data-toggle-favorite="${CSS.escape(key)}"]`).forEach((button) => {
    const active = state.favorites.has(key);
    button.classList.toggle("active", active);
    button.textContent = active ? "★ お気に入り登録済み" : "☆ お気に入りに追加";
    button.setAttribute("aria-pressed", String(active));
  });
}

function favoritesMemo() {
  const header = `仕入れ候補 / PSA鑑定費 ¥${fmt.format(state.fee)}`;
  const rows = favoriteCards().map((rawCard) => {
    const card = calc(rawCard);
    const limits = card.buyLimits;
    const roi = Number.isFinite(card.roi) ? `${Math.round(card.roi)}%` : "-";
    const quantity = favoriteQuantity(card.id);
    return `${String(card.name || "").replace(/\s+/g, " ")} ×${quantity} / 最終上限 ${buyLimitText(limits?.clean)} / 傷あり ${buyLimitText(limits?.scratch)} / PSA10 ¥${fmt.format(card.psa10)} / 利益率 ${roi}`;
  });
  return [header, ...rows].join("\n");
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Some mobile browsers only allow the legacy copy path.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function exportFavoritesCsv() {
  const cfg = guideConfig();
  const rows = [["id", "カード名", "型番", "数量", "現在PSA10価格", "91日後中央推計", "予測下落余地%", "将来価格評価", "最終仕入れ上限", "採算上の仕入れ上限", "現在の資金で買える上限", "傷あり仕入れ上限", "美品PSA10想定率%", "傷ありPSA10想定率%", "取得率基準", "基準", "理想仕入れ", "おすすめ仕入れ", "上限仕入れ", "今回の仕入れ判断", "期待利益", "期待利益率", "年換算資金効率", "資金占有率", "判断理由", "みんトレURL", "カードラッシュURL", "晴れる屋2URL", "遊々亭URL", "トレカキャンプURL"]];
  favoriteCards().forEach((rawCard) => {
    const card = calc(rawCard);
    const guide = favoriteGuide(card);
    const limits = card.buyLimits;
    const decision = card.psaDecision;
    const forecast = card.futurePriceForecast;
    rows.push([card.id, card.name, card.model || "", favoriteQuantity(card.id), card.psa10, forecast?.centralPrice || card.psa10, forecast ? forecast.downsidePct.toFixed(1) : "", forecast?.score ?? "", limits?.clean?.maxPrice ?? "", limits?.clean?.economicMaxPrice ?? "", limits?.clean?.capitalMaxPrice ?? "", limits?.scratch?.maxPrice ?? "", limits?.clean?.hitRate?.toFixed(1) ?? "", limits?.scratch?.hitRate?.toFixed(1) ?? "", limits?.rateSource || "", cfg.label, guide.ideal, guide.recommended, guide.upper, card.purchaseDecision?.verdict || "未判定", Math.round(decision?.expectedProfit || 0), Math.round(decision?.expectedRoi || 0), Math.round(decision?.annualEfficiency || 0), Number(decision?.capitalShare || 0).toFixed(1), decision?.reasons.join(" / ") || "", buildTorecaCardUrl(card), card.cardrushUrl || "", card.hareruya2Url || "", card.yuyuteiUrl || "", card.torecacampUrl || ""]);
  });
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `pokeka-buy-list-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportSearchCsv() {
  const rows = [["項目", "値"], ["検索URL", buildShareUrl().toString()]];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `pokeka-search-conditions-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importSearchCsv(file) {
  const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const rows = lines.map(parseCsvLine);
  const row = rows.slice(1).find((cells) => String(cells[0] || "").trim() === "検索URL");
  const savedUrl = String(row?.[1] || "").trim();
  if (!savedUrl) throw new Error("検索URLが見つかりません。サイトから保存した条件CSVを選んでください。");
  const target = new URL(savedUrl, window.location.href);
  if (target.origin !== window.location.origin) throw new Error("別のサイトの条件CSVは読み込めません。");
  window.location.assign(target.toString());
}

function parseCsvLine(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') { value += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { cells.push(value); value = ""; }
    else value += char;
  }
  cells.push(value);
  return cells;
}

function buildTorecaCardUrl(card) {
  return `https://toreca-souba.com/cards/${card.id}`;
}

function buildSnkrUrl(card) {
  const query = String(card.name || card.psaQuery || "")
    .split("[")[0]
    .trim();
  if (!query) return "https://snkrdunk.com/search/";
  return `https://snkrdunk.com/search?brandId=pokemon&categoryId=25&isUnderRetail=false&keywords=${encodeURIComponent(query)}`;
}

function buildSnkrSearchUrl(card) {
  const query = String(card.name || card.psaQuery || "")
    .split("[")[0]
    .replace(/\(.+?\)/g, "")
    .trim();
  if (!query) return "https://snkrdunk.com/search/";
  return `https://snkrdunk.com/search?brandId=pokemon&categoryId=25&isUnderRetail=false&keywords=${encodeURIComponent(query)}`;
}

function extractSnkrProductUrl(html) {
  const candidates = [];
  const regexes = [
    /(?:www\.)?snkrdunk\.com\/(?:apparels|trading-cards|products)\/\d+(?:\/used\/\d+)?/gi,
    /https?:\/\/(?:www\.)?snkrdunk\.com\/(?:apparels|trading-cards|products)\/\d+(?:\/used\/\d+)?/gi,
    /href=["']([^"']*\/(?:apparels|trading-cards|products)\/\d+(?:\/used\/\d+)?)["']/gi,
  ];
  for (const regex of regexes) {
    for (const match of String(html || "").matchAll(regex)) {
      const raw = match[1] || match[0] || "";
      if (!raw) continue;
      const normalized = raw.startsWith("http")
        ? raw
        : raw.startsWith("snkrdunk.com/")
          ? `https://${raw}`
          : `https://snkrdunk.com${raw.startsWith("/") ? raw : `/${raw}`}`;
      candidates.push(normalized.replace(/\/used\/\d+.*$/i, ""));
    }
  }
  return [...new Set(candidates)].find(Boolean) || "";
}

async function resolveSnkrUrl(card) {
  const key = String(card.id || "").trim();
  if (!key) return buildSnkrUrl(card);
  if (state.snkrUrlCache[key]) return state.snkrUrlCache[key];
  if (/snkrdunk\.com\/(apparels|trading-cards|products)\/\d+/i.test(card.snkUrl || "")) {
    state.snkrUrlCache[key] = card.snkUrl;
    return card.snkUrl;
  }
  const pageUrl = buildTorecaCardUrl(card);
  const searchUrl = buildSnkrSearchUrl(card);
  try {
    const pageRes = await fetch(pageUrl, { cache: "no-store" });
    if (pageRes.ok) {
      const pageHtml = await pageRes.text();
      const directUrl = extractSnkrProductUrl(pageHtml);
      if (directUrl) {
        state.snkrUrlCache[key] = directUrl;
        return directUrl;
      }
    }
    const res = await fetch(searchUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    state.snkrUrlCache[key] = extractSnkrProductUrl(html) || searchUrl;
  } catch {
    state.snkrUrlCache[key] = searchUrl;
  }
  return state.snkrUrlCache[key];
}

function hydrateSnkrLink(card, url) {
  const article = document.querySelector(`[data-card-id="${card.id}"]`);
  if (!article) return;
  const link = article.querySelector("[data-snk-link]");
  if (!link) return;
  link.href = url;
  const label = link.querySelector("strong");
  if (label) {
    label.textContent = /snkrdunk\.com\/(apparels|trading-cards|products)\/\d+/i.test(url)
      ? "スニダン直リンク"
      : "スニダン検索";
  }
}

function ensureSnkrObserver() {
  if (state.snkrObserver) return state.snkrObserver;
  state.snkrObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = entry.target?.dataset?.cardId || "";
        const card = state.cardById[id];
        if (!card) continue;
        entry.target && state.snkrObserver.unobserve(entry.target);
        resolveSnkrUrl(card).then((url) => hydrateSnkrLink(card, url));
      }
    },
    { rootMargin: "250px 0px" }
  );
  return state.snkrObserver;
}

function guideConfig() {
  return guideModes[state.guideMode] || guideModes["70"];
}

function setGuideMode(mode) {
  if (!guideModes[mode]) return;
  state.guideMode = mode;
  render();
  updateUrl();
}

function syncGuideButtons() {
  els.guideButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.guideMode === state.guideMode);
  });
}

function renderGuide() {
  const cfg = guideConfig();
  syncGuideButtons();
  const fee = Number(state.fee || 0);
  const hitRateLabel = `${Math.round(cfg.hitRate * 100)}%`;
  if (els.guideHitRateStat) els.guideHitRateStat.textContent = hitRateLabel;
  if (els.guidePsa9RateStat) els.guidePsa9RateStat.textContent = "75%";
  if (els.guideFeeStat) els.guideFeeStat.textContent = `¥${fmt.format(fee)}`;
  if (!els.guidePanels) return;

  const panels = guideRanges.map((range) => {
    const rows = [];
    for (let price = range.start; price <= range.end; price += 1000) {
      const cells = guideLines
        .map((line) => {
          const value = calcGuideBuyPrice(price, cfg.hitRate, fee, line.roi);
          const display = value == null ? "—" : `¥${fmt.format(value)}`;
          return `<td class="guide-cell ${line.className}">${display}</td>`;
        })
        .join("");
      rows.push(`<tr><th scope="row">¥${fmt.format(price)}</th>${cells}</tr>`);
    }
    return `
      <section class="guide-block card">
        <div class="guide-block-head">
          <h3>${range.label}</h3>
          <p>${cfg.label} / 鑑定費 ¥${fmt.format(fee)} / PSA9換金率 75% / 売却手数料 ${Number(state.saleFeeRate).toFixed(1)}%</p>
        </div>
        <div class="guide-table-wrap">
          <table class="guide-table">
            <thead>
              <tr>
                <th class="guide-sticky">PSA10売値</th>
                ${guideLines
                  .map((line) => `<th class="guide-head-${line.className}">${line.label}<span>${line.caption}</span></th>`)
                  .join("")}
              </tr>
            </thead>
            <tbody>${rows.join("")}</tbody>
          </table>
        </div>
      </section>
    `;
  });
  els.guidePanels.innerHTML = panels.join("");
}

function attachBundlePopulations(population) {
  const parts = [
    ["x-516413", "左上"],
    ["x-516414", "右上"],
    ["x-516415", "左下"],
    ["x-516416", "右下"],
  ]
    .map(([id, label]) => ({ id, label, ...(population[id] || {}) }))
    .filter((part) => Number.isFinite(part.rate));
  if (parts.length !== 4) return;
  const allTenRate = parts.reduce((probability, part) => probability * (part.rate / 100), 1) * 100;
  population["x-141447"] = {
    n: "Pikachu V-Union 4 Card Set",
    rate: allTenRate,
    u: parts[0].u,
    m: "four-card-independent-estimate",
    bundle: true,
    parts,
    f: parts.map((part) => part.f || "").sort().at(0) || "",
    w7: null,
    w30: null,
    w90: null,
  };
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function buildFuturePriceForecast(card, official, stock) {
  const currentPrice = Number(card.psa10);
  const rawPrice = Number(card.price);
  if (!(currentPrice > 0) || !(rawPrice > 0)) return null;

  const rawTrend30 = card.chg30 == null || card.chg30 === "" || !Number.isFinite(Number(card.chg30)) ? null : Number(card.chg30);
  const rawTrend7 = card.chg7 == null || card.chg7 === "" || !Number.isFinite(Number(card.chg7)) ? null : Number(card.chg7);
  const gapRatio = currentPrice / rawPrice;
  const rawActivityScore = clamp(Number(card.saleTx30d || 0) / 40 * 100);
  const psaActivityScore = clamp(Number(card.psaTx30d || 0) / 20 * 100);
  const turnoverScore = Math.round(rawActivityScore * 0.45 + psaActivityScore * 0.55);
  const buybackRatio = card.buybackPrice > 0 ? card.buybackPrice / currentPrice : 0;
  const buybackPriceScore = buybackRatio >= 0.85 ? 100 : buybackRatio >= 0.75 ? 85 : buybackRatio >= 0.6 ? 65 : buybackRatio > 0 ? 35 : 15;
  const shopCoverageScore = clamp(Number(card.buybackShops || 0) / 3 * 100);
  const convertibilityScore = Math.round(buybackPriceScore * 0.65 + shopCoverageScore * 0.35);

  // The raw-card anchor follows the A-condition market instead of treating 1.5x as a fixed floor.
  const projectedRawChange = rawTrend30 == null ? 0 : clamp(rawTrend30, -35, 25) * 0.35;
  const projectedRawPrice = rawPrice * (1 + projectedRawChange / 100);
  let convergenceMultiple = 1.5;
  if (rawTrend30 != null) {
    if (rawTrend30 <= -20) convergenceMultiple -= 0.16;
    else if (rawTrend30 <= -8) convergenceMultiple -= 0.09;
    else if (rawTrend30 >= 15) convergenceMultiple += 0.12;
    else if (rawTrend30 >= 5) convergenceMultiple += 0.06;
  }
  if (card.psaTx30d >= 20) convergenceMultiple += 0.1;
  else if (card.psaTx30d >= 5) convergenceMultiple += 0.05;
  else if (card.psaTx30d < 2) convergenceMultiple -= 0.08;
  if (buybackRatio >= 0.8) convergenceMultiple += 0.1;
  else if (buybackRatio >= 0.65) convergenceMultiple += 0.05;
  else if (card.buybackShops === 0) convergenceMultiple -= 0.05;
  if (card.buybackShops >= 2) convergenceMultiple += 0.04;
  const psa10Rate = Number.isFinite(official?.rate) ? Number(official.rate) : null;
  if (Number.isFinite(official?.rate)) {
    if (official.rate < 35) convergenceMultiple += 0.18;
    else if (official.rate < 55) convergenceMultiple += 0.1;
    else if (official.rate > 90) convergenceMultiple -= 0.05;
  }
  if (stock?.demand === "買う人が多い") convergenceMultiple -= 0.08;
  else if (stock?.demand === "少ない") convergenceMultiple += 0.04;
  const officialFresh = sourceAgeDays(official?.f) <= 2;
  const growthEntry = officialFresh
    ? [[30, official?.w30], [7, official?.w7], [90, official?.w90]].find(([, value]) => value)
    : null;
  const growthWindow = growthEntry?.[1] || null;
  const growthDays = Math.max(1, Number(growthWindow?.days || growthEntry?.[0] || 0));
  const monthlyPsa10Increase = growthWindow ? Math.max(0, Number(growthWindow.d10 || 0)) / growthDays * 30 : null;
  const monthlyGrowthRate = Number.isFinite(monthlyPsa10Increase) && Number(official?.ten) > 0
    ? monthlyPsa10Increase / Number(official.ten) * 100
    : null;
  const supplyDemandRatio = Number.isFinite(monthlyPsa10Increase)
    ? monthlyPsa10Increase / Math.max(1, Number(card.psaTx30d || 0))
    : null;
  const supplyPressure = !Number.isFinite(monthlyPsa10Increase)
    ? "未判定"
    : monthlyGrowthRate >= 8 || (monthlyPsa10Increase >= 100 && supplyDemandRatio >= 2)
      ? "高い"
      : monthlyGrowthRate >= 3 || supplyDemandRatio >= 1
        ? "普通"
        : "低い";
  const releaseMaturity = releaseMaturityFromOfficial(official, card);
  const maturityWeight = supplyPressure === "高い" ? 0.15 : supplyPressure === "普通" ? 0.55 : supplyPressure === "低い" ? 1 : 0.75;
  if (supplyPressure === "高い") convergenceMultiple -= 0.14;
  else if (supplyPressure === "普通") convergenceMultiple -= 0.05;
  else if (supplyPressure === "低い") convergenceMultiple += 0.07;
  const maturityMultipleBoost = releaseMaturity.ageYears >= 5 ? 0.25 : releaseMaturity.ageYears >= 3 ? 0.18 : releaseMaturity.ageYears >= 1 ? 0.06 : 0;
  convergenceMultiple += maturityMultipleBoost * maturityWeight;
  if (releaseMaturity.legacyPromo) convergenceMultiple += 0.04 * maturityWeight;
  convergenceMultiple = clamp(convergenceMultiple, 1.22, 2.05);

  let predictedPrice = projectedRawPrice * convergenceMultiple;
  let scarcityRetention = psa10Rate == null ? 0 : psa10Rate < 35 ? 0.28 : psa10Rate < 55 ? 0.18 : psa10Rate < 70 ? 0.08 : 0;
  if (supplyPressure === "低い") scarcityRetention += 0.12;
  else if (supplyPressure === "高い") scarcityRetention -= 0.08;
  const maturityRetention = releaseMaturity.ageYears >= 5 ? 0.65 : releaseMaturity.ageYears >= 3 ? 0.48 : releaseMaturity.ageYears >= 1 ? 0.16 : 0;
  scarcityRetention += maturityRetention * maturityWeight;
  if (releaseMaturity.legacyPromo) scarcityRetention += 0.06 * maturityWeight;
  if (releaseMaturity.ageYears >= 3 && card.psaTx30d >= 20 && supplyPressure !== "高い") scarcityRetention += 0.06;
  scarcityRetention = clamp(scarcityRetention, 0, 0.72);
  predictedPrice = predictedPrice * (1 - scarcityRetention) + currentPrice * scarcityRetention;
  if (card.buybackPrice > 0) predictedPrice = predictedPrice * 0.82 + card.buybackPrice * 0.18;
  if (card.saleTx30d < 5) predictedPrice = predictedPrice * 0.4 + currentPrice * 0.6;
  else if (card.saleTx30d < 15) predictedPrice = predictedPrice * 0.7 + currentPrice * 0.3;
  predictedPrice = roundToStep(clamp(predictedPrice, rawPrice, currentPrice * 1.15), 1000);
  const signedChangePct = (predictedPrice - currentPrice) / currentPrice * 100;
  const downsidePct = Math.max(0, -signedChangePct);
  const downsideScore = downsidePct <= 5 ? 100 : downsidePct <= 10 ? 88 : downsidePct <= 20 ? 68 : downsidePct <= 30 ? 43 : downsidePct <= 40 ? 23 : 8;
  const rawStabilityScore = rawTrend30 == null ? 45 : rawTrend30 < -20 ? 12 : rawTrend30 < -8 ? 38 : rawTrend30 > 30 ? 38 : rawTrend30 >= -5 && rawTrend30 <= 10 ? 92 : 65;
  const scarcityScore = psa10Rate == null ? 45 : psa10Rate < 35 ? 95 : psa10Rate < 55 ? 80 : psa10Rate < 75 ? 62 : psa10Rate < 90 ? 45 : 25;
  const supplySafetyScore = supplyPressure === "低い" ? 92 : supplyPressure === "普通" ? 58 : supplyPressure === "高い" ? 18 : releaseMaturity.ageYears >= 3 ? 65 : 45;
  const score = Math.round(downsideScore * 0.3 + rawStabilityScore * 0.15 + turnoverScore * 0.15 + convertibilityScore * 0.15 + scarcityScore * 0.1 + supplySafetyScore * 0.1 + releaseMaturity.score * 0.05);

  const evidenceCount = Number(card.saleTx30d >= 10) + Number(card.psaTx30d >= 5) + Number(card.buybackShops > 0) + Number(officialFresh && Number.isFinite(official?.rate)) + Number(Boolean(growthWindow)) + Number(Boolean(card.cardrushUrl || card.hareruya2Url || card.yuyuteiUrl || card.torecacampUrl));
  const dataCompleteness = evidenceCount >= 5 ? "高" : evidenceCount >= 3 ? "中" : "低";
  const uncertaintyPct = dataCompleteness === "高" ? 0.1 : dataCompleteness === "中" ? 0.18 : 0.28;
  const bearishPrice = roundToStep(Math.max(rawPrice, predictedPrice * (1 - uncertaintyPct)), 1000);
  const bullishPrice = roundToStep(Math.min(currentPrice * 1.2, predictedPrice * (1 + uncertaintyPct * 0.75)), 1000);
  const phase = downsidePct >= 30 ? "下落余地大" : downsidePct >= 18 ? "調整警戒" : downsidePct <= 7 && gapRatio <= 1.7 ? "底値圏候補" : downsidePct <= 10 ? "横ばい・安定候補" : "小幅調整候補";
  const reasons = [];
  if (gapRatio >= 2) reasons.push(`PSA10が平均美品の${gapRatio.toFixed(2)}倍`);
  else if (gapRatio >= 1.35 && gapRatio <= 1.7) reasons.push(`平均美品との倍率が収束圏（${gapRatio.toFixed(2)}倍）`);
  if (releaseMaturity.ageYears >= 3 && supplyPressure === "高い") reasons.push(`${releaseMaturity.year}年セットだがPSA10供給増を優先`);
  else if (releaseMaturity.legacyPromo) reasons.push(`${releaseMaturity.year}年の旧プロモ・供給成熟で価格差リスクを軽減`);
  else if (releaseMaturity.ageYears >= 3) reasons.push(`${releaseMaturity.year}年セット・供給成熟で価格差リスクを軽減`);
  else if (releaseMaturity.ageYears >= 1) reasons.push(`${releaseMaturity.year}年セット・発売後約${releaseMaturity.ageYears}年`);
  if (rawTrend30 != null && rawTrend30 <= -8) reasons.push(`状態Aが30日で${rawTrend30.toFixed(1)}%下落`);
  else if (rawTrend30 != null && rawTrend30 >= 5) reasons.push(`状態Aが30日で${rawTrend30.toFixed(1)}%上昇`);
  if (card.psaTx30d >= 20) reasons.push("PSA10の売買が活発");
  else if (card.psaTx30d < 5) reasons.push("PSA10の売買が少ない");
  if (buybackRatio >= 0.75 && card.buybackShops > 0) reasons.push("店舗買取が市場価格を強く支える");
  if (psa10Rate != null && psa10Rate < 55) reasons.push(`PSA10取得率${psa10Rate.toFixed(1)}%で10の供給が限定的`);
  if (Number.isFinite(monthlyPsa10Increase)) reasons.push(`PSA10は30日換算+${fmt.format(Math.round(monthlyPsa10Increase))}枚・供給圧力${supplyPressure}`);

  return {
    predictedPrice,
    downsidePct,
    signedChangePct,
    gapRatio,
    convergenceMultiple,
    projectedRawPrice: roundToStep(projectedRawPrice, 100),
    score,
    downsideScore,
    turnoverScore,
    convertibilityScore,
    rawStabilityScore,
    scarcityScore,
    supplySafetyScore,
    psa10Rate,
    monthlyPsa10Increase,
    monthlyGrowthRate,
    supplyDemandRatio,
    supplyPressure,
    releaseYear: releaseMaturity.year,
    releaseAgeYears: releaseMaturity.ageYears,
    maturityKey: releaseMaturity.key,
    maturityLabel: releaseMaturity.label,
    maturityScore: releaseMaturity.score,
    legacyPromo: releaseMaturity.legacyPromo,
    growthDays: growthWindow ? growthDays : null,
    growthPartial: Boolean(growthWindow?.partial),
    horizonDays: FORECAST_HORIZON_DAYS,
    bearishPrice,
    centralPrice: predictedPrice,
    bullishPrice,
    dataCompleteness,
    confidence: dataCompleteness,
    phase,
    reasons: reasons.slice(0, 4),
    rawTrend30,
    rawTrend7,
  };
}

function buildOverallAssessment(card, official, stock) {
  const strengths = [];
  const cautions = [];
  const learned = state.evaluationModel?.bands?.[evaluationPriceBand(card.psa10)] || state.evaluationModel?.global || null;
  const psa30Score = learnedPercentileScore(card.psaTx30d, learned?.psaTx30);
  const psa7Score = learnedPercentileScore(card.psaTx7d, learned?.psaTx7);
  const shopScore = learnedPercentileScore(card.buybackShops, learned?.buybackShops);
  const listingScore = learnedPercentileScore(card.buyback30, learned?.buyback30);
  const stabilityScore = !Number.isFinite(card.chg30) ? 45 : card.chg30 < -20 ? 10 : card.chg30 > 35 ? 30 : card.chg30 >= -5 && card.chg30 <= 12 ? 90 : 60;
  const forecast = card.futurePriceForecast;
  const baseExitLiquidity = psa30Score * 0.4 + psa7Score * 0.15 + shopScore * 0.2 + listingScore * 0.15 + stabilityScore * 0.1;
  const exitLiquidity = Math.round(baseExitLiquidity * 0.75 + (forecast?.turnoverScore ?? 45) * 0.15 + (forecast?.convertibilityScore ?? 35) * 0.1);
  let marketStability = Math.round(stabilityScore * 0.45 + (forecast?.rawStabilityScore ?? 45) * 0.2 + (forecast?.downsideScore ?? 40) * 0.35);
  let supplyRisk = 65;
  if (stock?.demand === "買う人が多い") { supplyRisk -= 30; cautions.push("状態A在庫の減少が速くPSA供給増リスク"); }
  else if (stock?.demand === "普通") supplyRisk -= 10;
  else if (stock?.demand === "少ない") supplyRisk += 15;
  const officialFresh = sourceAgeDays(official?.f) <= 2;
  if (!officialFresh && official) cautions.push("PSA公式枚数が更新待ち");
  else if (forecast?.supplyPressure === "高い") { supplyRisk -= 25; cautions.push("PSA10の供給増が売買量に対して多い"); }
  else if (forecast?.supplyPressure === "普通") supplyRisk -= 8;
  else if (forecast?.supplyPressure === "低い") { supplyRisk += 12; strengths.push("PSA10の供給増が少ない"); }
  if (forecast?.releaseAgeYears >= 3 && forecast?.supplyPressure !== "高い") { supplyRisk += 10; strengths.push("旧シリーズで供給が成熟"); }
  if (Number.isFinite(official?.rate) && official.rate < 40) supplyRisk += 15;
  supplyRisk = supplyRisk * 0.75 + (forecast?.downsideScore ?? 40) * 0.25;
  supplyRisk = Math.max(0, Math.min(100, supplyRisk));
  if (exitLiquidity >= 75) strengths.push("同価格帯よりPSA10を売りやすい");
  else if (exitLiquidity < 35) cautions.push("PSA10の出口・換金先が弱い");
  if (card.buybackShops >= 2) strengths.push("複数店舗の買取出口がある");
  if (card.saleTx30d >= 30 && card.psaTx30d < 5) cautions.push("美品は動くがPSA10取引が少ない");
  if (forecast?.downsidePct <= 10) strengths.push("PSA10予測の下落余地が小さい");
  else if (forecast?.downsidePct >= 25) cautions.push(`PSA10予測に約${Math.round(forecast.downsidePct)}%の下落余地`);
  if (forecast?.gapRatio >= 1.35 && forecast?.gapRatio <= 1.7 && forecast.rawTrend30 >= -5) strengths.push("状態Aとの価格差が収束圏");
  const futurePrice = forecast?.score ?? 35;
  let score = Math.round(exitLiquidity * 0.35 + marketStability * 0.25 + supplyRisk * 0.15 + futurePrice * 0.25);
  const completeEvidence = Number.isFinite(official?.rate) && Boolean(card.cardrushUrl || card.hareruya2Url || card.yuyuteiUrl || card.torecacampUrl);
  if (!Number.isFinite(official?.rate)) cautions.push("PSA公式データ未紐づけ");
  if (!card.cardrushUrl && !card.hareruya2Url && !card.yuyuteiUrl && !card.torecacampUrl) cautions.push("ショップ状態A未紐づけ");
  score = Math.max(0, Math.min(100, score));
  const aEligible = completeEvidence
    && score >= 78
    && exitLiquidity >= 55
    && marketStability >= 55
    && supplyRisk >= 50
    && futurePrice >= 60
    && forecast?.confidence !== "低";
  const grade = aEligible ? "A" : score >= 62 ? "B" : score >= 47 ? "C" : "D";
  const label = { A: "高品質", B: "良好", C: "注意", D: "高リスク" }[grade];
  return { score, grade, label, exitLiquidity, economics: 0, marketStability, supplyRisk: Math.round(supplyRisk), futurePrice, completeEvidence, aEligible, strengths: strengths.slice(0, 3), cautions: cautions.slice(0, 3) };
}

function hasCardMismatchSignal(card) {
  return [card, card.cardrushStock, card.hareruya2Stock, card.yuyuteiStock, card.torecacampStock, card.buyback, ...Object.values(card.buyback?.shops || {})]
    .filter(Boolean)
    .some((source) => decisionModel.isSuspectedCardMismatch(source));
}

function classifyDecisionData(card) {
  const priceAggregation = card.priceAggregation || {};
  const buybackAggregation = card.buybackAggregation || {};
  const trustedPriceCount = Number(priceAggregation.included?.length || 0);
  const manualReviewReasons = [];
  if (priceAggregation.conflicted) manualReviewReasons.push("状態A価格が複数グループに分かれて対立");
  if (buybackAggregation.conflicted) manualReviewReasons.push("PSA10買取価格が複数グループに分かれて対立");
  if (hasCardMismatchSignal(card)) manualReviewReasons.push("カード違い・型番違いの疑い");
  if (trustedPriceCount === 0 || !(Number(priceAggregation.value) > 0)) manualReviewReasons.push("信頼できる状態A価格が0件");
  if (!(Number(card.psa10) > 0)) manualReviewReasons.push("信頼できるPSA10価格が0件");

  const dataShortageReasons = [];
  if (!Number.isFinite(card.official?.rate)) dataShortageReasons.push("PSA公式未取得");
  if (trustedPriceCount === 1) dataShortageReasons.push("状態A価格が1件のみ");
  if (!card.futurePriceForecast) dataShortageReasons.push("将来価格予測未取得");

  const outlierExcludedReasons = [];
  if (!priceAggregation.conflicted && trustedPriceCount >= 2 && priceAggregation.outliers?.length) {
    outlierExcludedReasons.push(...priceAggregation.outliers.map((entry) => `${entry.source} ¥${fmt.format(entry.value)}`));
  }
  if (!buybackAggregation.conflicted && Number(buybackAggregation.included?.length || 0) >= 2 && buybackAggregation.outliers?.length) {
    outlierExcludedReasons.push(...buybackAggregation.outliers.map((entry) => `${entry.source} ¥${fmt.format(entry.value)}`));
  }

  const severeShortage = !card.futurePriceForecast || (trustedPriceCount <= 1 && !Number.isFinite(card.official?.rate));
  const shortageRiskPct = dataShortageReasons.length ? (severeShortage ? 5 : 3) : 0;
  return {
    manualReview: manualReviewReasons.length > 0,
    manualReviewReasons,
    dataShortage: dataShortageReasons.length > 0,
    dataShortageReasons,
    outlierExcluded: outlierExcludedReasons.length > 0,
    outlierExcludedReasons,
    shortageRiskPct,
    confidence: dataShortageReasons.length ? (shortageRiskPct >= 5 ? "低" : "中") : "高",
    trustedPriceCount,
  };
}

function buildRiskBuffer(card, condition) {
  const forecast = card.futurePriceForecast;
  const overall = card.overallAssessment;
  const isScratch = condition === "scratch";
  return clamp(
    Number(forecast.downsidePct || 0) * 0.12
      + Math.max(0, 55 - Number(forecast.turnoverScore ?? 45)) * 0.06
      + Math.max(0, 55 - Number(overall?.exitLiquidity ?? 45)) * 0.05
      + Math.max(0, 55 - Number(overall?.marketStability ?? 45)) * 0.04
      + (card.dataQuality?.dataShortage
        ? Number(card.dataQuality.shortageRiskPct || 0)
        : forecast.dataCompleteness === "低" ? 4 : forecast.dataCompleteness === "中" ? 1.5 : 0)
      + (isScratch ? 2 : 0),
    0,
    15
  );
}

function buildScenarioInput(card, condition) {
  const assumptions = decisionModel.gradeAssumptions({
    condition,
    officialRate: card.official?.rate,
    fallbackRate: guideConfig().hitRate,
    fallbackLabel: `${guideConfig().label}（公式未取得）`,
    psa9Price: card.snkPsa9Price,
    fallbackLowerGradePrice: card.price * 0.75,
    forecastPrice: card.futurePriceForecast.predictedPrice,
  });
  return {
    assumptions,
    forecastPrice: card.futurePriceForecast.predictedPrice,
    fee: state.fee,
    saleFeeRate: state.saleFeeRate,
    saleExtraCost: state.saleExtraCost,
    riskBufferPct: buildRiskBuffer(card, condition),
    lockDays: state.lockDays,
    minExpectedProfit: state.minExpectedProfit,
    minExpectedRoi: state.minExpectedRoi,
    minAnnualEfficiency: state.minAnnualEfficiency,
    maxCapitalShare: state.maxCapitalShare,
    totalCapital: state.psaCapital,
  };
}

function buildBuyLimitScenario(card, condition) {
  const input = buildScenarioInput(card, condition);
  const economicMaxPrice = decisionModel.maxBuyPrice({ ...input, step: 500 });
  const atLimit = decisionModel.expectedEconomics({ ...input, purchasePrice: economicMaxPrice });

  return {
    maxPrice: economicMaxPrice,
    economicMaxPrice,
    hitRate: input.assumptions.hitRate * 100,
    lowerGradePrice: floorToStep(input.assumptions.lowerGradePrice, 500),
    lowerGradeSource: input.assumptions.lowerGradeSource,
    expectedSale: floorToStep(atLimit.expectedSale, 500),
    riskBufferPct: input.riskBufferPct,
    requiredRoi: Math.max(state.minExpectedRoi, state.minAnnualEfficiency * state.lockDays / 365),
    assumptions: input.assumptions,
    modelInput: input,
  };
}

function buildBuyLimits(card) {
  if (!card.futurePriceForecast) return null;
  const capital = decisionModel.capitalPlan({ totalCapital: state.psaCapital, lockedCapital: state.lockedCapital, gradingReserve: state.gradingReserve, submissionCount: state.submissionCount, fee: state.fee });
  const capitalLimits = decisionModel.capitalLimits({ capital, maxCapitalShare: state.maxCapitalShare });
  const clean = buildBuyLimitScenario(card, "clean");
  const scratch = buildBuyLimitScenario(card, "scratch");
  if (!clean || !scratch) return null;
  scratch.economicMaxPrice = Math.min(scratch.economicMaxPrice, clean.economicMaxPrice);
  [clean, scratch].forEach((scenario) => {
    const caps = decisionModel.purchaseCaps({
      capital,
      economicMaxPrice: scenario.economicMaxPrice,
      maxCapitalShare: state.maxCapitalShare,
    });
    scenario.capitalMaxPrice = floorToStep(caps.capitalMaxPrice, 500);
    scenario.finalMaxPrice = floorToStep(caps.finalMaxPrice, 500);
    scenario.maxPrice = scenario.finalMaxPrice;
  });
  return {
    clean,
    scratch,
    capital,
    capitalLimits,
    rateSource: clean.assumptions.hitRateSource,
    forecastPrice: card.futurePriceForecast.predictedPrice,
  };
}

function finalizeCardDecision(card) {
  card.dataQuality = classifyDecisionData(card);
  card.buyLimits = buildBuyLimits(card);
  const cleanInput = card.buyLimits?.clean?.modelInput;
  const economics = cleanInput ? decisionModel.expectedEconomics({ ...cleanInput, purchasePrice: card.price }) : null;
  const capital = card.buyLimits?.capital;
  const capitalShare = state.psaCapital > 0 ? card.price / state.psaCapital * 100 : Infinity;
  const riskReasons = [];
  if (Number(card.overallAssessment?.exitLiquidity || 0) < 30) riskReasons.push("売却しやすさ30点未満");
  if (Number(card.overallAssessment?.marketStability || 0) < 30) riskReasons.push("価格安定性30点未満");
  if (Number(card.overallAssessment?.supplyRisk || 0) < 30) riskReasons.push("供給リスク耐性30点未満");
  if (Number(card.overallAssessment?.futurePrice || 0) < 30) riskReasons.push("将来価格評価30点未満");
  const finalDecision = economics && capital ? decisionModel.purchaseDecision({
    economics,
    capital,
    economicMaxPrice: card.buyLimits.clean.economicMaxPrice,
    qualityScore: card.overallAssessment?.score,
    requiresManualReview: card.dataQuality.manualReview,
    manualReviewReasons: card.dataQuality.manualReviewReasons,
    dataShortageReasons: card.dataQuality.dataShortageReasons,
    riskEligible: riskReasons.length === 0,
    riskReasons,
    minExpectedProfit: state.minExpectedProfit,
    minExpectedRoi: state.minExpectedRoi,
    minAnnualEfficiency: state.minAnnualEfficiency,
    maxCapitalShare: state.maxCapitalShare,
  }) : null;
  if (card.overallAssessment) {
    card.overallAssessment.economics = economics
      ? Math.round(clamp((economics.expectedRoi + 20) / 80 * 100, 0, 100))
      : 0;
  }
  card.psaDecision = economics ? {
    recommended: finalDecision?.verdict === "GO",
    reasons: finalDecision?.reasons || [],
    ...economics,
    capitalShare,
    availableCapital: capital.availableCapital,
    requiredReserve: capital.requiredReserve,
    singleCardSpend: finalDecision?.singleCardSpend,
    economicMaxPrice: finalDecision?.economicMaxPrice,
    capitalMaxPrice: finalDecision?.capitalMaxPrice,
    finalMaxPrice: finalDecision?.finalMaxPrice,
    forecastPsa10Net: economics.psa10Net,
  } : null;
  card.purchaseDecision = finalDecision;
  card.hasPricingAnomaly = card.dataQuality.manualReview;
  return card;
}

function combineShopStock(...sources) {
  const available = sources.filter(Boolean);
  if (!available.length) return null;
  const sum = (key) => {
    const values = available.map((source) => Number(source[key])).filter(Number.isFinite);
    return values.length ? values.reduce((total, value) => total + value, 0) : null;
  };
  const demandRank = { "蓄積中": 0, "少ない": 1, "普通": 2, "買う人が多い": 3 };
  const demand = available
    .map((source) => source.demand || "蓄積中")
    .sort((left, right) => (demandRank[right] ?? 0) - (demandRank[left] ?? 0))[0] || "蓄積中";
  return {
    stock: sum("stock"),
    avg7: sum("avg7"),
    avg30: sum("avg30"),
    avg90: sum("avg90"),
    drop7: sum("drop7"),
    drop30: sum("drop30"),
    samples: Math.max(0, ...available.map((source) => Number(source.samples) || 0)),
    demand,
  };
}

function buybackCardMatched(card, shop) {
  return ![card, shop].some((source) => decisionModel.isSuspectedCardMismatch(source));
}

function buildBuybackAnalysis(card, shops, marketPrice) {
  const rows = shops.map((shop) => {
    const metrics = marketModel.buybackMetrics({
      marketPrice,
      buybackPrice: shop.price,
      saleFeeRate: state.saleFeeRate,
      saleExtraCost: state.saleExtraCost,
      priceDate: shop.priceDate,
      asOfDate: state.buybackUpdatedAt,
      cardMatched: buybackCardMatched(card, shop),
    });
    return {
      ...shop,
      ...metrics,
      shopName: shop.sourceName || state.buybackShops[shop.shopId]?.name || shop.shopId,
    };
  });
  return marketModel.evaluateStoreDemand({ rows });
}

function floorStateKey(value) {
  return { "安定": "stable", "形成中": "forming", "未形成": "unformed", "下値割れ": "broken", "蓄積中": "collecting" }[value] || "collecting";
}

function directionKey(value) {
  return { "上昇": "up", "横ばい": "flat", "下降": "down" }[value] || "collecting";
}

function supplyStateKey(value) {
  return { "買い優勢": "buy", "均衡": "balanced", "売り優勢": "sell", "蓄積中": "collecting" }[value] || "collecting";
}

function storeDemandKey(value) {
  return { "強い": "strong", "普通": "normal", "弱い": "weak", "蓄積中": "collecting" }[value] || "collecting";
}

function calc(card) {
  const torecaPrice = Number(card.price);
  const cardrushStock = state.cardrushStock[card.id] || null;
  const hareruya2Stock = state.hareruya2Stock[card.id] || null;
  const yuyuteiStock = state.yuyuteiStock[card.id] || null;
  const torecacampStock = state.torecacampStock[card.id] || null;
  const stock = combineShopStock(cardrushStock, hareruya2Stock, yuyuteiStock);
  const rawCardrushPrice = Number(cardrushStock?.cardrushPrice);
  const cardrushPrice = rawCardrushPrice > 0 ? rawCardrushPrice : NaN;
  const rawHareruya2Price = Number(hareruya2Stock?.hareruya2Price);
  const hareruya2Price = rawHareruya2Price > 0 ? rawHareruya2Price : NaN;
  const rawYuyuteiPrice = Number(yuyuteiStock?.yuyuteiPrice);
  const yuyuteiPrice = rawYuyuteiPrice > 0 ? rawYuyuteiPrice : NaN;
  const rawTorecacampPrice = Number(torecacampStock?.torecacampPrice);
  const torecacampPrice = rawTorecacampPrice > 0 ? rawTorecacampPrice : NaN;
  const priceAggregation = decisionModel.aggregatePrices([
    { source: "みんトレ状態A", value: torecaPrice },
    { source: "カードラッシュ状態A", value: cardrushPrice },
    { source: "晴れる屋2状態A", value: hareruya2Price },
    { source: "遊々亭状態A", value: yuyuteiPrice },
    { source: "トレカキャンプ状態A", value: torecacampPrice },
  ], { minRatio: 0.55, maxRatio: 1.8, clusterRatio: 1.35 });
  const price = priceAggregation.value > 0 ? Math.round(priceAggregation.value) : NaN;
  const psa10 = Number(card.snkPsa10Price);
  const saleTx30d = Number(card.tv30 || 0);
  const saleTx7d = Number(card.tv7 || 0);
  const cardrushDrop30 = Number.isFinite(cardrushStock?.drop30) ? Number(cardrushStock.drop30) : null;
  const cardrushDrop7 = Number.isFinite(cardrushStock?.drop7) ? Number(cardrushStock.drop7) : null;
  const hareruya2Drop30 = Number.isFinite(hareruya2Stock?.drop30) ? Number(hareruya2Stock.drop30) : null;
  const hareruya2Drop7 = Number.isFinite(hareruya2Stock?.drop7) ? Number(hareruya2Stock.drop7) : null;
  const shopDrop30 = Number.isFinite(stock?.drop30) ? Number(stock.drop30) : null;
  const shopDrop7 = Number.isFinite(stock?.drop7) ? Number(stock.drop7) : null;
  const combined30 = saleTx30d + (shopDrop30 || 0);
  const combined7 = saleTx7d + (shopDrop7 || 0);
  const buyback = state.shopBuybacks[card.id] || null;
  const buyback7 = Number(buyback?.total7 || 0);
  const buyback30 = Number(buyback?.total30 || 0);
  const buyback90 = Number(buyback?.total90 || 0);
  const buybackShopValues = Object.entries(buyback?.shops || {}).map(([shopId, shop]) => ({
    ...shop,
    shopId,
    sourceName: state.buybackShops[shopId]?.name || shopId,
  }));
  const buybackAnalysis = buildBuybackAnalysis(card, buybackShopValues, psa10);
  const marketStability = state.marketStability[card.id] || {
    score: null, state: "蓄積中", direction: "蓄積中", supplyState: "蓄積中",
    supportLow: null, supportHigh: null, inventoryDays: null, historyDays: 0, samples: 0,
    evidence: [], cautions: ["価格・出品・在庫履歴を蓄積中"],
  };
  const latestBuybackDate = buybackShopValues.reduce((latest, shop) => String(shop.priceDate || "") > latest ? String(shop.priceDate) : latest, "");
  const latestBuybackShops = latestBuybackDate ? buybackShopValues.filter((shop) => String(shop.priceDate || "") === latestBuybackDate) : buybackShopValues;
  const buybackAggregation = decisionModel.aggregatePrices(latestBuybackShops.map((shop, index) => ({
    source: shop.sourceName || shop.name || shop.shopName || `買取店舗${index + 1}`,
    value: Number(shop.price || 0),
  })), { minRatio: 0.55, maxRatio: 1.55, clusterRatio: 1.25 });
  const buybackPrice = buybackAggregation.value > 0 ? Math.round(buybackAggregation.value) : 0;
  const buybackBestPrice = buybackAggregation.included.length ? Math.max(...buybackAggregation.included.map((entry) => entry.value)) : 0;
  const buybackAvg30 = Number(buyback?.avg30 || 0);
  const buybackShops = Number(buyback?.shop30 || 0);
  const psaTx30d = Number(card.p10tv30 || 0);
  const psaTx7d = Number(card.p10tv7 || 0);
  const official = state.psaPopulation[card.id] || null;
  if (!(price > 0) || !(psa10 > 0)) {
    return { ...card, price, torecaPrice, cardrushPrice, hareruya2Price, yuyuteiPrice, torecacampPrice, priceAggregation, cardrushStock, hareruya2Stock, yuyuteiStock, torecacampStock, psa10, psa10Net: NaN, profit: NaN, roi: NaN, futurePriceForecast: null, psaDecision: null, purchaseDecision: null, overallAssessment: null, official, saleTx30d, saleTx7d, psaTx30d, psaTx7d, cardrushDrop30, cardrushDrop7, hareruya2Drop30, hareruya2Drop7, shopDrop30, shopDrop7, combined30, combined7, buyback, buyback7, buyback30, buyback90, buybackPrice, buybackBestPrice, buybackAggregation, buybackAvg30, buybackShops, buybackAnalysis, marketStability };
  }
  const saleMultiplier = Math.max(0, 1 - state.saleFeeRate / 100);
  const psa10Net = psa10 * saleMultiplier - state.saleExtraCost;
  const profit = psa10Net - price - state.fee;
  const roiBase = price + state.fee;
  const roi = roiBase > 0 ? (profit / roiBase) * 100 : NaN;
  const forecastBase = { ...card, price, torecaPrice, cardrushPrice, hareruya2Price, yuyuteiPrice, torecacampPrice, priceAggregation, cardrushStock, hareruya2Stock, yuyuteiStock, torecacampStock, psa10, psa10Net, profit, roi, official, saleTx30d, saleTx7d, psaTx30d, psaTx7d, cardrushDrop30, cardrushDrop7, hareruya2Drop30, hareruya2Drop7, shopDrop30, shopDrop7, combined30, combined7, buyback, buyback7, buyback30, buyback90, buybackPrice, buybackBestPrice, buybackAggregation, buybackAvg30, buybackShops, buybackAnalysis, marketStability };
  const futurePriceForecast = buildFuturePriceForecast(forecastBase, official, stock);
  const calculated = { ...forecastBase, futurePriceForecast };
  calculated.overallAssessment = buildOverallAssessment(calculated, official, stock);
  return finalizeCardDecision(calculated);
}

function parseOptionalNumber(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchJsonMaybe(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function readUrl() {
  const url = new URL(window.location.href);
  const guide = url.searchParams.get("guide");
  const fee = parseOptionalNumber(url.searchParams.get("fee"));
  const psaPlan = url.searchParams.get("psaPlan");
  const saleTx = parseOptionalNumber(url.searchParams.get("tx"));
  const saleTxMax = parseOptionalNumber(url.searchParams.get("txMax"));
  const saleTx7 = parseOptionalNumber(url.searchParams.get("tx7"));
  const saleTx7Max = parseOptionalNumber(url.searchParams.get("tx7Max"));
  const psaTx = parseOptionalNumber(url.searchParams.get("psaTx"));
  const psaTxMax = parseOptionalNumber(url.searchParams.get("psaTxMax"));
  const psaTx7 = parseOptionalNumber(url.searchParams.get("psaTx7"));
  const psaTx7Max = parseOptionalNumber(url.searchParams.get("psaTx7Max"));
  const buyback7 = parseOptionalNumber(url.searchParams.get("bb7"));
  const buyback7Max = parseOptionalNumber(url.searchParams.get("bb7Max"));
  const buyback30 = parseOptionalNumber(url.searchParams.get("bb30"));
  const buyback30Max = parseOptionalNumber(url.searchParams.get("bb30Max"));
  const buyback90 = parseOptionalNumber(url.searchParams.get("bb90"));
  const buyback90Max = parseOptionalNumber(url.searchParams.get("bb90Max"));
  const buybackShops = parseOptionalNumber(url.searchParams.get("bbShops"));
  const buybackPriceMin = parseOptionalNumber(url.searchParams.get("bbPriceMin"));
  const buybackPriceMax = parseOptionalNumber(url.searchParams.get("bbPriceMax"));
  const roi = parseOptionalNumber(url.searchParams.get("roi"));
  const psaMin = parseOptionalNumber(url.searchParams.get("psaMin"));
  const psaMax = parseOptionalNumber(url.searchParams.get("psaMax"));
  const priceMin = parseOptionalNumber(url.searchParams.get("priceMin"));
  const priceMax = parseOptionalNumber(url.searchParams.get("priceMax"));
  const minPurchaseLimitRatio = parseOptionalNumber(url.searchParams.get("buyLimitRatio"));
  const psaRateMin = parseOptionalNumber(url.searchParams.get("psaRate"));
  const overallFilter = url.searchParams.get("overall");
  const minExitLiquidity = parseOptionalNumber(url.searchParams.get("exit"));
  const minEconomics = parseOptionalNumber(url.searchParams.get("economics"));
  const minMarketStability = parseOptionalNumber(url.searchParams.get("stability"));
  const minSupplyRisk = parseOptionalNumber(url.searchParams.get("supply"));
  const minFuturePriceScore = parseOptionalNumber(url.searchParams.get("futureScore"));
  const maxFuturePriceScore = parseOptionalNumber(url.searchParams.get("futureScoreMax"));
  const minForecastPrice = parseOptionalNumber(url.searchParams.get("forecastMin"));
  const maxForecastPrice = parseOptionalNumber(url.searchParams.get("forecastMax"));
  const minForecastDownside = parseOptionalNumber(url.searchParams.get("downsideMin"));
  const maxForecastDownside = parseOptionalNumber(url.searchParams.get("downsideMax"));
  const minForecastGap = parseOptionalNumber(url.searchParams.get("gapMin"));
  const maxForecastGap = parseOptionalNumber(url.searchParams.get("gapMax"));
  const forecastPhase = url.searchParams.get("forecastPhase");
  const forecastConfidence = url.searchParams.get("forecastConfidence");
  const forecastSupplyPressure = url.searchParams.get("forecastSupply");
  const minForecastAge = parseOptionalNumber(url.searchParams.get("releaseAge"));
  const forecastMaturity = url.searchParams.get("forecastMaturity");
  const maxForecastMonthlyIncrease = parseOptionalNumber(url.searchParams.get("psaGrowthMax"));
  const stockDemand = url.searchParams.get("stockDemand");
  const dataQualityFilter = url.searchParams.get("dataQuality");
  const floorState = url.searchParams.get("floorState");
  const priceDirection = url.searchParams.get("priceDirection");
  const supplyState = url.searchParams.get("supplyState");
  const minFloorScore = parseOptionalNumber(url.searchParams.get("floorScore"));
  const storeDemand = url.searchParams.get("storeDemand");
  const hideSkipped = url.searchParams.get("hideSkipped") === "1";
  const hideReview = url.searchParams.get("hideReview") === "1";
  const fundingOnly = url.searchParams.get("fundingOnly") === "1";
  const officialOnly = url.searchParams.get("officialOnly") === "1";
  const psaCapital = parseOptionalNumber(url.searchParams.get("cap"));
  const lockedCapital = parseOptionalNumber(url.searchParams.get("locked"));
  const lockDays = parseOptionalNumber(url.searchParams.get("lock"));
  const minExpectedProfit = parseOptionalNumber(url.searchParams.get("expProfit"));
  const minExpectedRoi = parseOptionalNumber(url.searchParams.get("expRoi"));
  const minAnnualEfficiency = parseOptionalNumber(url.searchParams.get("annual"));
  const maxCapitalShare = parseOptionalNumber(url.searchParams.get("maxShare"));
  const submissionCount = parseOptionalNumber(url.searchParams.get("batch"));
  const gradingReserve = parseOptionalNumber(url.searchParams.get("reserve"));
  const saleFeeRate = parseOptionalNumber(url.searchParams.get("sellFee"));
  const saleExtraCost = parseOptionalNumber(url.searchParams.get("extraCost"));
  const sort = url.searchParams.get("sort");
  const q = url.searchParams.get("q");
  if (guide && guideModes[guide]) {
    state.guideMode = guide;
  }
  if (psaPlan) {
    state.psaPlan = psaPlan;
    els.psaPlanInput.value = psaPlan;
  }
  syncGuideButtons();
  if (fee != null && fee >= 0) els.feeInput.value = String(fee);
  if (saleTx != null && saleTx >= 0) els.saleTxMinInput.value = String(saleTx);
  if (saleTxMax != null && saleTxMax >= 0) els.saleTxMaxInput.value = String(saleTxMax);
  if (saleTx7 != null && saleTx7 >= 0) els.saleTx7MinInput.value = String(saleTx7);
  if (saleTx7Max != null && saleTx7Max >= 0) els.saleTx7MaxInput.value = String(saleTx7Max);
  if (psaTx != null && psaTx >= 0) els.psaTxMinInput.value = String(psaTx);
  if (psaTxMax != null && psaTxMax >= 0) els.psaTxMaxInput.value = String(psaTxMax);
  if (psaTx7 != null && psaTx7 >= 0) els.psaTx7MinInput.value = String(psaTx7);
  if (psaTx7Max != null && psaTx7Max >= 0) els.psaTx7MaxInput.value = String(psaTx7Max);
  if (buyback7 != null && buyback7 >= 0) els.buyback7MinInput.value = String(buyback7);
  if (buyback7Max != null && buyback7Max >= 0) els.buyback7MaxInput.value = String(buyback7Max);
  if (buyback30 != null && buyback30 >= 0) els.buyback30MinInput.value = String(buyback30);
  if (buyback30Max != null && buyback30Max >= 0) els.buyback30MaxInput.value = String(buyback30Max);
  if (buyback90 != null && buyback90 >= 0) els.buyback90MinInput.value = String(buyback90);
  if (buyback90Max != null && buyback90Max >= 0) els.buyback90MaxInput.value = String(buyback90Max);
  if (buybackShops != null && buybackShops >= 0) els.buybackShopsMinInput.value = String(buybackShops);
  if (buybackPriceMin != null && buybackPriceMin >= 0) els.buybackPriceMinInput.value = String(buybackPriceMin);
  if (buybackPriceMax != null && buybackPriceMax >= 0) els.buybackPriceMaxInput.value = String(buybackPriceMax);
  if (roi != null && roi >= 0) els.roiInput.value = String(roi);
  if (psaMin != null && psaMin >= 0) els.psaMinInput.value = String(psaMin);
  if (psaMax != null && psaMax >= 0) els.psaMaxInput.value = String(psaMax);
  if (priceMin != null) els.priceMinInput.value = String(priceMin);
  if (priceMax != null) els.priceMaxInput.value = String(priceMax);
  if (minPurchaseLimitRatio != null && minPurchaseLimitRatio >= 0) els.purchaseLimitRatioMinInput.value = String(minPurchaseLimitRatio);
  if (psaRateMin != null && psaRateMin >= 0) els.psaRateMinInput.value = String(psaRateMin);
  if (["all", "ab", "a"].includes(overallFilter)) els.overallFilterInput.value = overallFilter;
  if (minExitLiquidity != null && minExitLiquidity >= 0) els.minExitLiquidityInput.value = String(minExitLiquidity);
  if (minEconomics != null && minEconomics >= 0) els.minEconomicsInput.value = String(minEconomics);
  if (minMarketStability != null && minMarketStability >= 0) els.minMarketStabilityInput.value = String(minMarketStability);
  if (minSupplyRisk != null && minSupplyRisk >= 0) els.minSupplyRiskInput.value = String(minSupplyRisk);
  if (minFuturePriceScore != null && minFuturePriceScore >= 0) els.minFuturePriceScoreInput.value = String(minFuturePriceScore);
  if (maxFuturePriceScore != null && maxFuturePriceScore >= 0) els.maxFuturePriceScoreInput.value = String(maxFuturePriceScore);
  if (minForecastPrice != null && minForecastPrice >= 0) els.minForecastPriceInput.value = String(minForecastPrice);
  if (maxForecastPrice != null && maxForecastPrice >= 0) els.maxForecastPriceInput.value = String(maxForecastPrice);
  if (minForecastDownside != null && minForecastDownside >= 0) els.minForecastDownsideInput.value = String(minForecastDownside);
  if (maxForecastDownside != null && maxForecastDownside >= 0) els.maxForecastDownsideInput.value = String(maxForecastDownside);
  if (minForecastGap != null && minForecastGap >= 0) els.minForecastGapInput.value = String(minForecastGap);
  if (maxForecastGap != null && maxForecastGap >= 0) els.maxForecastGapInput.value = String(maxForecastGap);
  if (["all", "stable", "small", "caution", "large"].includes(forecastPhase)) els.forecastPhaseInput.value = forecastPhase;
  if (["all", "high", "medium-up", "medium", "low"].includes(forecastConfidence)) els.forecastConfidenceInput.value = forecastConfidence;
  if (["all", "low", "low-normal", "normal", "high", "known"].includes(forecastSupplyPressure)) els.forecastSupplyPressureInput.value = forecastSupplyPressure;
  if (minForecastAge != null && minForecastAge >= 0) els.minForecastAgeInput.value = String(minForecastAge);
  if (["all", "mature", "established", "recent", "known"].includes(forecastMaturity)) els.forecastMaturityInput.value = forecastMaturity;
  if (maxForecastMonthlyIncrease != null && maxForecastMonthlyIncrease >= 0) els.maxForecastMonthlyIncreaseInput.value = String(maxForecastMonthlyIncrease);
  if (["all", "steady", "low", "normal", "high", "known"].includes(stockDemand)) els.stockDemandInput.value = stockDemand;
  if (["all", "manual", "shortage", "outlier", "clean"].includes(dataQualityFilter)) els.dataQualityFilterInput.value = dataQualityFilter;
  if (["all", "stable", "forming", "unformed", "broken", "collecting"].includes(floorState)) els.floorStateInput.value = floorState;
  if (["all", "up", "flat", "down"].includes(priceDirection)) els.priceDirectionInput.value = priceDirection;
  if (["all", "buy", "balanced", "sell", "collecting"].includes(supplyState)) els.supplyStateInput.value = supplyState;
  if (minFloorScore != null && minFloorScore >= 0) els.minFloorScoreInput.value = String(minFloorScore);
  if (["all", "strong", "normal-up", "normal", "weak", "collecting"].includes(storeDemand)) els.storeDemandInput.value = storeDemand;
  els.hideSkippedInput.checked = hideSkipped;
  els.hideReviewInput.checked = hideReview;
  els.fundingOnlyInput.checked = fundingOnly;
  els.officialOnlyInput.checked = officialOnly;
  if (psaCapital != null && psaCapital >= 0) els.psaCapitalInput.value = String(psaCapital);
  if (lockedCapital != null && lockedCapital >= 0) els.lockedCapitalInput.value = String(lockedCapital);
  if (lockDays != null && lockDays > 0) els.lockDaysInput.value = String(lockDays);
  if (minExpectedProfit != null) els.minExpectedProfitInput.value = String(minExpectedProfit);
  if (minExpectedRoi != null && minExpectedRoi >= 0) els.minExpectedRoiInput.value = String(minExpectedRoi);
  if (minAnnualEfficiency != null && minAnnualEfficiency >= 0) els.minAnnualEfficiencyInput.value = String(minAnnualEfficiency);
  if (maxCapitalShare != null && maxCapitalShare >= 0) els.maxCapitalShareInput.value = String(maxCapitalShare);
  if (submissionCount != null && submissionCount > 0) els.submissionCountInput.value = String(submissionCount);
  if (gradingReserve != null && gradingReserve >= 0) els.gradingReserveInput.value = String(gradingReserve);
  if (saleFeeRate != null && saleFeeRate >= 0) els.saleFeeRateInput.value = String(saleFeeRate);
  if (saleExtraCost != null && saleExtraCost >= 0) els.saleExtraCostInput.value = String(saleExtraCost);
  if (sort && sorters[sort]) els.sortInput.value = sort;
  if (q) els.qInput.value = q;
}

function updateUrl() {
  const url = buildShareUrl();
  window.history.replaceState({}, "", url);
}

function buildShareUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set("guide", state.guideMode);
  url.searchParams.set("fee", String(state.fee));
  url.searchParams.set("psaPlan", state.psaPlan);
  url.searchParams.set("tx", String(state.minSaleTx));
  if (state.maxSaleTx == null) url.searchParams.delete("txMax"); else url.searchParams.set("txMax", String(state.maxSaleTx));
  url.searchParams.set("tx7", String(state.minSaleTx7));
  if (state.maxSaleTx7 == null) url.searchParams.delete("tx7Max"); else url.searchParams.set("tx7Max", String(state.maxSaleTx7));
  url.searchParams.set("psaTx", String(state.minPsaTx));
  if (state.maxPsaTx == null) url.searchParams.delete("psaTxMax"); else url.searchParams.set("psaTxMax", String(state.maxPsaTx));
  url.searchParams.set("psaTx7", String(state.minPsaTx7));
  if (state.maxPsaTx7 == null) url.searchParams.delete("psaTx7Max"); else url.searchParams.set("psaTx7Max", String(state.maxPsaTx7));
  url.searchParams.set("bb7", String(state.minBuyback7));
  if (state.maxBuyback7 == null) url.searchParams.delete("bb7Max"); else url.searchParams.set("bb7Max", String(state.maxBuyback7));
  url.searchParams.set("bb30", String(state.minBuyback30));
  if (state.maxBuyback30 == null) url.searchParams.delete("bb30Max"); else url.searchParams.set("bb30Max", String(state.maxBuyback30));
  url.searchParams.set("bb90", String(state.minBuyback90));
  if (state.maxBuyback90 == null) url.searchParams.delete("bb90Max"); else url.searchParams.set("bb90Max", String(state.maxBuyback90));
  url.searchParams.set("bbShops", String(state.minBuybackShops));
  if (state.minBuybackPrice == null) url.searchParams.delete("bbPriceMin"); else url.searchParams.set("bbPriceMin", String(state.minBuybackPrice));
  if (state.maxBuybackPrice == null) url.searchParams.delete("bbPriceMax"); else url.searchParams.set("bbPriceMax", String(state.maxBuybackPrice));
  url.searchParams.set("roi", String(state.minRoi));
  url.searchParams.set("psaMin", String(state.minPsa10));
  if (state.maxPsa10 == null) url.searchParams.delete("psaMax"); else url.searchParams.set("psaMax", String(state.maxPsa10));
  if (state.minPsaRate == null) url.searchParams.delete("psaRate"); else url.searchParams.set("psaRate", String(state.minPsaRate));
  if (state.overallFilter === "all") url.searchParams.delete("overall"); else url.searchParams.set("overall", state.overallFilter);
  if (state.minExitLiquidity > 0) url.searchParams.set("exit", String(state.minExitLiquidity)); else url.searchParams.delete("exit");
  if (state.minEconomics > 0) url.searchParams.set("economics", String(state.minEconomics)); else url.searchParams.delete("economics");
  if (state.minMarketStability > 0) url.searchParams.set("stability", String(state.minMarketStability)); else url.searchParams.delete("stability");
  if (state.minSupplyRisk > 0) url.searchParams.set("supply", String(state.minSupplyRisk)); else url.searchParams.delete("supply");
  if (state.minFuturePriceScore > 0) url.searchParams.set("futureScore", String(state.minFuturePriceScore)); else url.searchParams.delete("futureScore");
  if (state.maxFuturePriceScore == null) url.searchParams.delete("futureScoreMax"); else url.searchParams.set("futureScoreMax", String(state.maxFuturePriceScore));
  if (state.minForecastPrice == null) url.searchParams.delete("forecastMin"); else url.searchParams.set("forecastMin", String(state.minForecastPrice));
  if (state.maxForecastPrice == null) url.searchParams.delete("forecastMax"); else url.searchParams.set("forecastMax", String(state.maxForecastPrice));
  if (state.minForecastDownside == null) url.searchParams.delete("downsideMin"); else url.searchParams.set("downsideMin", String(state.minForecastDownside));
  if (state.maxForecastDownside == null) url.searchParams.delete("downsideMax"); else url.searchParams.set("downsideMax", String(state.maxForecastDownside));
  if (state.minForecastGap == null) url.searchParams.delete("gapMin"); else url.searchParams.set("gapMin", String(state.minForecastGap));
  if (state.maxForecastGap == null) url.searchParams.delete("gapMax"); else url.searchParams.set("gapMax", String(state.maxForecastGap));
  if (state.forecastPhase === "all") url.searchParams.delete("forecastPhase"); else url.searchParams.set("forecastPhase", state.forecastPhase);
  if (state.forecastConfidence === "all") url.searchParams.delete("forecastConfidence"); else url.searchParams.set("forecastConfidence", state.forecastConfidence);
  if (state.forecastSupplyPressure === "all") url.searchParams.delete("forecastSupply"); else url.searchParams.set("forecastSupply", state.forecastSupplyPressure);
  if (state.minForecastAge == null) url.searchParams.delete("releaseAge"); else url.searchParams.set("releaseAge", String(state.minForecastAge));
  if (state.forecastMaturity === "all") url.searchParams.delete("forecastMaturity"); else url.searchParams.set("forecastMaturity", state.forecastMaturity);
  if (state.maxForecastMonthlyIncrease == null) url.searchParams.delete("psaGrowthMax"); else url.searchParams.set("psaGrowthMax", String(state.maxForecastMonthlyIncrease));
  if (state.stockDemand === "all") url.searchParams.delete("stockDemand"); else url.searchParams.set("stockDemand", state.stockDemand);
  if (state.dataQualityFilter === "all") url.searchParams.delete("dataQuality"); else url.searchParams.set("dataQuality", state.dataQualityFilter);
  if (state.floorState === "all") url.searchParams.delete("floorState"); else url.searchParams.set("floorState", state.floorState);
  if (state.priceDirection === "all") url.searchParams.delete("priceDirection"); else url.searchParams.set("priceDirection", state.priceDirection);
  if (state.supplyState === "all") url.searchParams.delete("supplyState"); else url.searchParams.set("supplyState", state.supplyState);
  if (state.minFloorScore == null) url.searchParams.delete("floorScore"); else url.searchParams.set("floorScore", String(state.minFloorScore));
  if (state.storeDemand === "all") url.searchParams.delete("storeDemand"); else url.searchParams.set("storeDemand", state.storeDemand);
  if (state.hideSkipped) url.searchParams.set("hideSkipped", "1"); else url.searchParams.delete("hideSkipped");
  if (state.hideReview) url.searchParams.set("hideReview", "1"); else url.searchParams.delete("hideReview");
  if (state.fundingOnly) url.searchParams.set("fundingOnly", "1"); else url.searchParams.delete("fundingOnly");
  if (state.officialOnly) url.searchParams.set("officialOnly", "1"); else url.searchParams.delete("officialOnly");
  url.searchParams.set("sort", state.sort);
  url.searchParams.set("cap", String(state.psaCapital));
  url.searchParams.set("locked", String(state.lockedCapital));
  url.searchParams.set("lock", String(state.lockDays));
  url.searchParams.set("expProfit", String(state.minExpectedProfit));
  url.searchParams.set("expRoi", String(state.minExpectedRoi));
  url.searchParams.set("annual", String(state.minAnnualEfficiency));
  url.searchParams.set("maxShare", String(state.maxCapitalShare));
  url.searchParams.set("batch", String(state.submissionCount));
  url.searchParams.set("reserve", String(state.gradingReserve));
  url.searchParams.set("sellFee", String(state.saleFeeRate));
  url.searchParams.set("extraCost", String(state.saleExtraCost));
  if (state.minPrice == null) {
    url.searchParams.delete("priceMin");
  } else {
    url.searchParams.set("priceMin", String(state.minPrice));
  }
  if (state.maxPrice == null) {
    url.searchParams.delete("priceMax");
  } else {
    url.searchParams.set("priceMax", String(state.maxPrice));
  }
  if (state.minPurchaseLimitRatio == null) url.searchParams.delete("buyLimitRatio");
  else url.searchParams.set("buyLimitRatio", String(state.minPurchaseLimitRatio));
  if (state.q) {
    url.searchParams.set("q", state.q);
  } else {
    url.searchParams.delete("q");
  }
  url.searchParams.delete("showSite");
  url.searchParams.delete("showCalc");
  url.searchParams.delete("hide");
  return url;
}

function ratioLabel(value) {
  return value != null && value !== "" && Number.isFinite(Number(value)) ? Number(value).toFixed(3) : "-";
}

function renderShopRateSummary(cards) {
  if (!els.shopRateSummary) return;
  const grouped = Object.create(null);
  for (const card of cards) {
    for (const row of card.buybackAnalysis?.rows || []) {
      if (!row.shopId) continue;
      if (!grouped[row.shopId]) grouped[row.shopId] = [];
      grouped[row.shopId].push(row);
    }
  }
  const summaries = Object.entries(grouped).map(([shopId, rows]) => ({
    shopId,
    shop: state.buybackShops[shopId] || { name: shopId, url: "" },
    stats: marketModel.summarizeShopRates(rows, { minimumCount: 10 }),
  })).sort((a, b) => (b.stats.median ?? -Infinity) - (a.stats.median ?? -Infinity));
  if (!summaries.length) {
    els.shopRateSummary.innerHTML = "<p>買取率を計算できる店舗データを蓄積中です。</p>";
    return;
  }
  const tier = (stats) => `${ratioLabel(stats.median)} <small>(${fmt.format(stats.count)}件)</small>`;
  els.shopRateSummary.innerHTML = `
    <div class="shop-rate-table-wrap">
      <table class="shop-rate-table">
        <thead><tr><th>買取店</th><th>標準買取率<br><small>中央値</small></th><th>平均</th><th>外れ値除外後</th><th>25～75%</th><th>対象数</th><th>3万円未満</th><th>3万～10万円</th><th>10万円以上</th><th>最終更新</th></tr></thead>
        <tbody>${summaries.map(({ shop, stats }) => `
          <tr>
            <th>${shop.url ? `<a href="${escapeHtml(shop.url)}" target="_blank" rel="noreferrer">${escapeHtml(shop.name)}</a>` : escapeHtml(shop.name)}${stats.reference ? "<b>参考値</b>" : ""}</th>
            <td><strong>${ratioLabel(stats.median)}</strong></td>
            <td>${ratioLabel(stats.average)}</td>
            <td>${ratioLabel(stats.trimmedAverage)}</td>
            <td>${ratioLabel(stats.q25)}～${ratioLabel(stats.q75)}</td>
            <td>${fmt.format(stats.trustedCount)}件<small>外れ${fmt.format(stats.outlierCount)} / 古い${fmt.format(stats.staleCount)}</small></td>
            <td>${tier(stats.tiers.under30k)}</td>
            <td>${tier(stats.tiers.from30kTo100k)}</td>
            <td>${tier(stats.tiers.over100k)}</td>
            <td>${escapeHtml(stats.latestDate || "-")}</td>
          </tr>`).join("")}</tbody>
      </table>
    </div>
    <p class="shop-rate-note">主指標はカードごとの相場比買取率の中央値です。高額カードの金額加重平均は使わず、古い価格と外れ値を除外して比較します。</p>
  `;
}

function render() {
  const normalizedQuery = normalize(state.q);
  const compactQuery = compactSearch(state.q);
  const calculated = state.cards.map(calc);
  const roiByPsaPriceBand = new Map();
  const psaTxByPriceBand = new Map();
  calculated.forEach((card) => {
    const key = psaPriceBand(card.psa10).key;
    if (Number.isFinite(card.psaTx30d) && card.psaTx30d > 0) {
      if (!psaTxByPriceBand.has(key)) psaTxByPriceBand.set(key, []);
      psaTxByPriceBand.get(key).push(card.psaTx30d);
    }
    const crediblePeer = Number.isFinite(card.roi)
      && card.psaTx30d >= 5
      && card.saleTx30d >= 3
      && card.price > 0
      && card.psa10 > card.price
      && card.roi >= -50
      && card.roi <= 300;
    if (!crediblePeer) return;
    if (!roiByPsaPriceBand.has(key)) roiByPsaPriceBand.set(key, []);
    roiByPsaPriceBand.get(key).push(card.roi);
  });
  const medianRoiByPsaPriceBand = new Map(
    [...roiByPsaPriceBand].map(([key, values]) => [key, median(values)])
  );
  const psaTxMedianByPriceBand = new Map(
    [...psaTxByPriceBand].map(([key, values]) => [key, median(values)])
  );
  calculated.forEach((card) => {
    card.psaTxPeerMedian = psaTxMedianByPriceBand.get(psaPriceBand(card.psa10).key) ?? null;
    card.overallAssessment = buildOverallAssessment(card, card.official, combineShopStock(state.cardrushStock[card.id], state.hareruya2Stock[card.id], state.yuyuteiStock[card.id]));
    finalizeCardDecision(card);
  });
  renderShopRateSummary(calculated);
  const enriched = calculated
    .filter((card) => {
      const haystack = normalize(`${card.name} ${card.model} ${card.id}`);
      const compactHaystack = compactSearch(`${card.name} ${card.model} ${card.id}`);
      if (card.saleTx30d < state.minSaleTx) return false;
      if (state.maxSaleTx != null && card.saleTx30d > state.maxSaleTx) return false;
      if (card.saleTx7d < state.minSaleTx7) return false;
      if (state.maxSaleTx7 != null && card.saleTx7d > state.maxSaleTx7) return false;
      if (card.psaTx30d < state.minPsaTx) return false;
      if (state.maxPsaTx != null && card.psaTx30d > state.maxPsaTx) return false;
      if (card.psaTx7d < state.minPsaTx7) return false;
      if (state.maxPsaTx7 != null && card.psaTx7d > state.maxPsaTx7) return false;
      if (card.buyback7 < state.minBuyback7) return false;
      if (state.maxBuyback7 != null && card.buyback7 > state.maxBuyback7) return false;
      if (card.buyback30 < state.minBuyback30) return false;
      if (state.maxBuyback30 != null && card.buyback30 > state.maxBuyback30) return false;
      if (card.buyback90 < state.minBuyback90) return false;
      if (state.maxBuyback90 != null && card.buyback90 > state.maxBuyback90) return false;
      if (card.buybackShops < state.minBuybackShops) return false;
      if (state.minBuybackPrice != null && card.buybackPrice < state.minBuybackPrice) return false;
      if (state.maxBuybackPrice != null && card.buybackPrice > state.maxBuybackPrice) return false;
      if (!Number.isFinite(card.roi) || card.roi < state.minRoi) return false;
      if (card.psa10 < state.minPsa10) return false;
      if (state.maxPsa10 != null && card.psa10 > state.maxPsa10) return false;
      if (state.minPrice != null && card.price < state.minPrice) return false;
      if (state.maxPrice != null && card.price > state.maxPrice) return false;
      const purchaseLimitRatio = decisionModel.purchaseLimitMarketRatio(card.buyLimits?.clean?.maxPrice, card.price);
      if (state.minPurchaseLimitRatio != null && (!Number.isFinite(purchaseLimitRatio) || purchaseLimitRatio < state.minPurchaseLimitRatio)) return false;
      if (state.minPsaRate != null && (!Number.isFinite(card.official?.rate) || card.official.rate < state.minPsaRate)) return false;
      if (state.officialOnly && !Number.isFinite(card.official?.rate)) return false;
      if (card.overallAssessment && card.overallAssessment.exitLiquidity < state.minExitLiquidity) return false;
      if (card.overallAssessment && card.overallAssessment.economics < state.minEconomics) return false;
      if (card.overallAssessment && card.overallAssessment.marketStability < state.minMarketStability) return false;
      if (card.overallAssessment && card.overallAssessment.supplyRisk < state.minSupplyRisk) return false;
      if (card.overallAssessment && card.overallAssessment.futurePrice < state.minFuturePriceScore) return false;
      if (state.maxFuturePriceScore != null && (!card.futurePriceForecast || card.futurePriceForecast.score > state.maxFuturePriceScore)) return false;
      if (state.minForecastPrice != null && (!card.futurePriceForecast || card.futurePriceForecast.predictedPrice < state.minForecastPrice)) return false;
      if (state.maxForecastPrice != null && (!card.futurePriceForecast || card.futurePriceForecast.predictedPrice > state.maxForecastPrice)) return false;
      if (state.minForecastDownside != null && (!card.futurePriceForecast || card.futurePriceForecast.downsidePct < state.minForecastDownside)) return false;
      if (state.maxForecastDownside != null && (!card.futurePriceForecast || card.futurePriceForecast.downsidePct > state.maxForecastDownside)) return false;
      if (state.minForecastGap != null && (!card.futurePriceForecast || card.futurePriceForecast.gapRatio < state.minForecastGap)) return false;
      if (state.maxForecastGap != null && (!card.futurePriceForecast || card.futurePriceForecast.gapRatio > state.maxForecastGap)) return false;
      const forecastPhaseKey = !card.futurePriceForecast ? "" : card.futurePriceForecast.phase === "下落余地大" ? "large" : card.futurePriceForecast.phase === "調整警戒" ? "caution" : card.futurePriceForecast.phase === "小幅調整候補" ? "small" : "stable";
      if (state.forecastPhase !== "all" && forecastPhaseKey !== state.forecastPhase) return false;
      const forecastConfidence = card.futurePriceForecast?.confidence || "";
      if (state.forecastConfidence === "high" && forecastConfidence !== "高") return false;
      if (state.forecastConfidence === "medium-up" && !["中", "高"].includes(forecastConfidence)) return false;
      if (state.forecastConfidence === "medium" && forecastConfidence !== "中") return false;
      if (state.forecastConfidence === "low" && forecastConfidence !== "低") return false;
      const forecastSupply = card.futurePriceForecast?.supplyPressure || "未判定";
      if (state.forecastSupplyPressure === "low" && forecastSupply !== "低い") return false;
      if (state.forecastSupplyPressure === "low-normal" && !["低い", "普通"].includes(forecastSupply)) return false;
      if (state.forecastSupplyPressure === "normal" && forecastSupply !== "普通") return false;
      if (state.forecastSupplyPressure === "high" && forecastSupply !== "高い") return false;
      if (state.forecastSupplyPressure === "known" && forecastSupply === "未判定") return false;
      const releaseAge = card.futurePriceForecast?.releaseAgeYears;
      if (state.minForecastAge != null && (!Number.isFinite(releaseAge) || releaseAge < state.minForecastAge)) return false;
      const maturityKey = card.futurePriceForecast?.maturityKey || "unknown";
      if (state.forecastMaturity === "mature" && maturityKey !== "mature") return false;
      if (state.forecastMaturity === "established" && !["mature", "established"].includes(maturityKey)) return false;
      if (state.forecastMaturity === "recent" && maturityKey !== "recent") return false;
      if (state.forecastMaturity === "known" && maturityKey === "unknown") return false;
      if (state.maxForecastMonthlyIncrease != null && (!Number.isFinite(card.futurePriceForecast?.monthlyPsa10Increase) || card.futurePriceForecast.monthlyPsa10Increase > state.maxForecastMonthlyIncrease)) return false;
      if (!card.overallAssessment && (state.minExitLiquidity || state.minEconomics || state.minMarketStability || state.minSupplyRisk || state.minFuturePriceScore)) return false;
      if (state.hideSkipped && card.purchaseDecision?.verdict === "見送り") return false;
      if (state.hideReview && card.purchaseDecision?.verdict === "要確認") return false;
      if (state.dataQualityFilter === "manual" && !card.dataQuality?.manualReview) return false;
      if (state.dataQualityFilter === "shortage" && !card.dataQuality?.dataShortage) return false;
      if (state.dataQualityFilter === "outlier" && !card.dataQuality?.outlierExcluded) return false;
      if (state.dataQualityFilter === "clean" && (card.dataQuality?.manualReview || card.dataQuality?.dataShortage || card.dataQuality?.outlierExcluded)) return false;
      if (state.floorState !== "all" && floorStateKey(card.marketStability?.state) !== state.floorState) return false;
      if (state.priceDirection !== "all" && directionKey(card.marketStability?.direction) !== state.priceDirection) return false;
      if (state.supplyState !== "all" && supplyStateKey(card.marketStability?.supplyState) !== state.supplyState) return false;
      if (state.minFloorScore != null && (!Number.isFinite(card.marketStability?.score) || card.marketStability.score < state.minFloorScore)) return false;
      const demandKey = storeDemandKey(card.buybackAnalysis?.label);
      if (state.storeDemand === "strong" && demandKey !== "strong") return false;
      if (state.storeDemand === "normal-up" && !["strong", "normal"].includes(demandKey)) return false;
      if (state.storeDemand === "normal" && demandKey !== "normal") return false;
      if (state.storeDemand === "weak" && demandKey !== "weak") return false;
      if (state.storeDemand === "collecting" && demandKey !== "collecting") return false;
      if (state.fundingOnly && !card.psaDecision?.recommended) return false;
      if (state.overallFilter === "a" && card.overallAssessment?.grade !== "A") return false;
      if (state.overallFilter === "ab" && !["A", "B"].includes(card.overallAssessment?.grade)) return false;
      const demand = combineShopStock(state.cardrushStock[card.id], state.hareruya2Stock[card.id], state.yuyuteiStock[card.id])?.demand || "蓄積中";
      if (state.stockDemand === "steady" && !["少ない", "普通"].includes(demand)) return false;
      if (state.stockDemand === "low" && demand !== "少ない") return false;
      if (state.stockDemand === "normal" && demand !== "普通") return false;
      if (state.stockDemand === "high" && demand !== "買う人が多い") return false;
      if (state.stockDemand === "known" && demand === "蓄積中") return false;
      if (!normalizedQuery) return true;
      return haystack.includes(normalizedQuery) || compactHaystack.includes(compactQuery);
    })
    .sort(sorters[state.sort]);

  els.totalStat.textContent = fmt.format(state.cards.length);
  els.countStat.textContent = fmt.format(enriched.length);
  const topRoi = enriched.reduce((highest, card) => Number.isFinite(card.roi) ? Math.max(highest, card.roi) : highest, -Infinity);
  const topProfit = enriched.reduce((highest, card) => Number.isFinite(card.psaDecision?.expectedProfit) ? Math.max(highest, card.psaDecision.expectedProfit) : highest, -Infinity);
  els.topRoiStat.textContent = Number.isFinite(topRoi) ? `${Math.round(topRoi)}%` : "-";
  els.topProfitStat.textContent = Number.isFinite(topProfit) ? `¥${fmt.format(Math.round(topProfit))}` : "-";
  if (els.goCountStat) els.goCountStat.textContent = fmt.format(enriched.filter((card) => card.purchaseDecision?.verdict === "GO").length);
  if (els.conditionalCountStat) els.conditionalCountStat.textContent = fmt.format(enriched.filter((card) => card.purchaseDecision?.verdict === "価格次第").length);
  if (els.reviewCountStat) els.reviewCountStat.textContent = fmt.format(enriched.filter((card) => card.purchaseDecision?.verdict === "要確認").length);
  if (els.dataShortageCountStat) els.dataShortageCountStat.textContent = fmt.format(enriched.filter((card) => card.dataQuality?.dataShortage).length);
  if (els.outlierExcludedCountStat) els.outlierExcludedCountStat.textContent = fmt.format(enriched.filter((card) => card.dataQuality?.outlierExcluded).length);
  if (els.updatedAt) {
    els.updatedAt.textContent = state.updateStatus?.completeDate || "自動更新 未完了";
  }
  if (els.dataFreshness && state.updateStatus?.sources) {
    els.dataFreshness.innerHTML = Object.values(state.updateStatus.sources).map((source) => {
      const className = source.fresh ? "fresh" : "stale";
      const pending = Number(source.pendingCount || 0) > 0 ? ` / 画像照合待ち ${fmt.format(source.pendingCount)}件` : "";
      return `<span class="${className}">${escapeHtml(source.label)} ${escapeHtml(source.date || "未取得")}${pending}</span>`;
    }).join("");
  }
  if (els.cardrushCoverage) {
    const cr = meta.cardrushCoverage;
    const h2 = meta.hareruya2Coverage;
    const cardrushText = cr?.total ? `カードラッシュ ${fmt.format(cr.linked)} / ${fmt.format(cr.total)}` : "カードラッシュ 集計中";
    const hareruya2Text = h2?.total ? `晴れる屋2 ${fmt.format(h2.matched)} / ${fmt.format(h2.total)}` : "晴れる屋2 取得準備中";
    els.cardrushCoverage.textContent = `${cardrushText} / ${hareruya2Text}`;
  }
  renderGuide();
  const visibleCards = enriched.slice(0, state.visibleLimit);
  if (els.resultProgress) {
    els.resultProgress.textContent = `${fmt.format(enriched.length)}枚中 ${fmt.format(visibleCards.length)}枚を表示`;
  }
  if (els.loadMoreBtn) {
    els.loadMoreBtn.hidden = visibleCards.length >= enriched.length;
  }

  state.cardById = Object.create(null);
  els.grid.innerHTML = visibleCards.map((card) => {
    state.cardById[card.id] = card;
    const priceBand = psaPriceBand(card.psa10);
    const peerValues = roiByPsaPriceBand.get(priceBand.key) || [];
    const peerMedianRoi = medianRoiByPsaPriceBand.get(priceBand.key);
    const hasReliablePeers = Number.isFinite(peerMedianRoi) && peerValues.length >= 8;
    const comparisonMedian = hasReliablePeers ? peerMedianRoi : card.roi;
    const roiDifference = card.roi - comparisonMedian;
    const roiAssessment = !hasReliablePeers ? "比較できる取引データが不足" : roiDifference >= 30 ? "同価格帯よりかなり高い" : roiDifference >= 5 ? "同価格帯より高い" : roiDifference <= -30 ? "同価格帯よりかなり低い" : roiDifference <= -5 ? "同価格帯より低い" : "同価格帯の中央値に近い";
    const roiAssessmentClass = roiDifference >= 5 ? "high" : roiDifference <= -5 ? "low" : "average";
    const roiBandLabel = `PSA10 ¥${fmt.format(priceBand.min)}～¥${fmt.format(priceBand.max - 1)}・取引条件を満たす${fmt.format(peerValues.length)}枚`;
    const name = card.name.replace(/\s+/g, " ");
    const cardrushStock = state.cardrushStock[card.id] || null;
    const hareruya2Stock = state.hareruya2Stock[card.id] || null;
    const yuyuteiStock = state.yuyuteiStock[card.id] || null;
    const torecacampStock = state.torecacampStock[card.id] || null;
    const stock = combineShopStock(cardrushStock, hareruya2Stock, yuyuteiStock);
    const snkUrl = card.snkUrl || state.snkrUrlCache[card.id] || buildSnkrUrl(card);
    const snkrDirect = /snkrdunk\.com\/(apparels|trading-cards|products)\/\d+/i.test(snkUrl);
    const marketLinks = [
      `<a class="market-link toreca" href="${buildTorecaCardUrl(card)}" target="_blank" rel="noreferrer"><span>相場元</span><strong>みんトレ直リンク</strong></a>`,
      `<a class="market-link snkr" href="${snkUrl}" data-snk-link target="_blank" rel="noreferrer"><span>フリマ</span><strong>${snkrDirect ? "スニダン直リンク" : "スニダン検索"}</strong></a>`,
      card.cardrushUrl
        ? `<a class="market-link cardrush" href="${card.cardrushUrl}" target="_blank" rel="noreferrer"><span>ショップ・状態A</span><strong>カードラッシュ直リンク</strong></a>`
        : `<span class="market-link unavailable"><span>ショップ</span><strong>カードラッシュ直リンク未取得</strong></span>`,
      card.hareruya2Url
        ? `<a class="market-link hareruya2" href="${card.hareruya2Url}" target="_blank" rel="noreferrer"><span>ショップ・状態A</span><strong>晴れる屋2直リンク</strong></a>`
        : "",
      card.yuyuteiUrl
        ? `<a class="market-link yuyutei" href="${card.yuyuteiUrl}" target="_blank" rel="noreferrer"><span>ショップ・状態A</span><strong>遊々亭直リンク</strong></a>`
        : "",
      card.torecacampUrl
        ? `<a class="market-link torecacamp" href="${card.torecacampUrl}" target="_blank" rel="noreferrer"><span>ショップ・状態A</span><strong>トレカキャンプ直リンク</strong></a>`
        : "",
    ].join("");
    const demandClass = stock?.demand === "買う人が多い" ? "risk-high" : stock?.demand === "普通" ? "risk-medium" : stock?.demand === "少ない" ? "risk-low" : "pending";
    const demandBadge = stock?.demand && stock.demand !== "蓄積中" ? `<b>在庫減少ペース：${stock.demand}</b>` : "";
    const avgStock = (value) => Number.isFinite(value) ? `${Number(value).toFixed(2)}枚/日` : "-";
    const dropStock = (value) => Number.isFinite(value) ? `${fmt.format(Number(value))}枚` : "-";
    const combinedMovement = (tx, drop) => Number.isFinite(drop) ? `${fmt.format(tx + Number(drop))}件相当` : "-";
    const shopStockRows = [
      card.cardrushUrl ? `<span>カードラッシュ <b>${Number.isFinite(cardrushStock?.stock) ? `${fmt.format(cardrushStock.stock)}枚` : "-"}</b></span>` : "",
      card.hareruya2Url ? `<span>晴れる屋2 <b>${Number.isFinite(hareruya2Stock?.stock) ? `${fmt.format(hareruya2Stock.stock)}枚` : "-"}</b></span>` : "",
      card.yuyuteiUrl ? `<span>遊々亭 <b>${Number.isFinite(yuyuteiStock?.stock) ? `${fmt.format(yuyuteiStock.stock)}点` : "-"}</b></span>` : "",
      card.torecacampUrl ? `<span>トレカキャンプ <b>${torecacampStock?.available === true ? "在庫あり" : torecacampStock?.available === false ? "在庫なし" : "-"}</b></span>` : "",
    ].filter(Boolean).join("");
    const stockPanel = (card.cardrushUrl || card.hareruya2Url || card.yuyuteiUrl || card.torecacampUrl)
      ? `
          <div class="stock-panel ${demandClass}">
            <div class="stock-title">
              <div><span>ショップ状態A 合算在庫</span><strong>${Number.isFinite(stock?.stock) ? `${fmt.format(stock.stock)}枚` : "-"}</strong><small>在庫減少が速いほどPSA供給増による相場下落リスクを高く見て、赤く表示します。</small></div>
              ${demandBadge}
            </div>
            <div class="stock-shop-sources">${shopStockRows}</div>
            <div class="stock-averages">
              <div><span>7日平均減少</span><strong>${avgStock(stock?.avg7)}</strong></div>
              <div><span>30日平均減少</span><strong>${avgStock(stock?.avg30)}</strong></div>
              <div><span>90日平均減少</span><strong>${avgStock(stock?.avg90)}</strong></div>
            </div>
          </div>
        `
      : "";
    const buybackShopRows = (card.buybackAnalysis?.rows || [])
      .slice()
      .sort((a, b) => String(b.priceDate || "").localeCompare(String(a.priceDate || "")) || Number(b.buybackPrice || 0) - Number(a.buybackPrice || 0))
      .map((shop, index) => {
      const shopMeta = state.buybackShops[shop.shopId] || { name: shop.shopId, url: "" };
      const shopUrl = shop.url || shopMeta.url;
      const shopName = shopUrl
        ? `<a href="${escapeHtml(shopUrl)}" target="_blank" rel="noreferrer">${escapeHtml(shopMeta.name)} ${shop.url ? "商品・検索" : "買取表"}</a>`
        : escapeHtml(shopMeta.name);
      const leadLabel = index === 0 ? '<em class="buyback-lead-label">最新日優先</em>' : "";
      const warning = !shop.valid ? shop.reason : shop.stale ? "価格更新が古い" : shop.outlier ? "外れ値・需要集計から除外" : "";
      const differencePct = Number.isFinite(shop.marketDifference) ? shop.marketDifference * 100 : null;
      const differenceText = differencePct == null ? "-" : `${differencePct >= 0 ? "+" : ""}${differencePct.toFixed(1)}%`;
      const rowClass = !shop.valid ? "invalid" : shop.stale ? "stale" : shop.outlier ? "outlier" : "trusted";
      return `<div class="buyback-shop-row ${index === 0 ? "buyback-shop-primary" : ""} ${rowClass}">
        <div>${leadLabel}<strong>${shopName}</strong>${warning ? `<small class="buyback-warning">${escapeHtml(warning)}</small>` : ""}</div>
        <div><span>店舗買取 / 更新</span><b>${shop.buybackPrice ? `¥${fmt.format(shop.buybackPrice)}` : "-"}</b><small>${escapeHtml(shop.priceDate || "未取得")}</small></div>
        <div><span>相場比買取率</span><b>${ratioLabel(shop.marketRatio)}</b><small>市場 ¥${shop.marketPrice ? fmt.format(shop.marketPrice) : "-"}</small></div>
        <div><span>相場差率</span><b>${ratioLabel(shop.marketDifference)}</b><small>${differenceText}</small></div>
        <div><span>フリマ手取り比</span><b>${ratioLabel(shop.takeHomeRatio)}</b><small>手取り ¥${shop.netMarket ? fmt.format(shop.netMarket) : "-"}</small></div>
        <div><span>掲載 7日 / 30日</span><b>${fmt.format(shop.c7 || 0)}回 / ${fmt.format(shop.c30 || 0)}回</b><small>90日 ${fmt.format(shop.c90 || 0)}回</small></div>
      </div>`;
    });
    const buybackPrimaryShop = buybackShopRows[0] || "";
    const buybackOtherShops = buybackShopRows.length > 1
      ? `<details class="buyback-other-shops"><summary>その他 ${fmt.format(buybackShopRows.length - 1)}店舗の買取価格を見る</summary><div class="buyback-shops">${buybackShopRows.slice(1).join("")}</div></details>`
      : "";
    const buybackDemand = card.buybackAnalysis?.label || "蓄積中";
    const buybackDemandClass = buybackDemand === "強い" ? "demand-high" : buybackDemand === "普通" ? "demand-normal" : buybackDemand === "弱い" ? "demand-low" : "demand-pending";
    const buybackDemandScoreText = buybackDemand === "蓄積中" ? "蓄積中" : `${fmt.format(card.buybackAnalysis?.score || 0)}/100`;
    const buybackBest = card.buybackAnalysis?.best;
    const buybackBestText = buybackBest ? `${escapeHtml(buybackBest.shopName)} ¥${fmt.format(buybackBest.buybackPrice)}` : "有効な最新価格を蓄積中";
    const buybackPanel = card.buyback ? `
      <div class="buyback-panel ${buybackDemandClass}">
        <div class="buyback-head">
          <div><span>PSA10買取率・店舗需要</span><strong>店舗需要：${escapeHtml(buybackDemand)} ${buybackDemandScoreText}</strong><small>最も有利な売却先：${buybackBestText}</small></div>
          <small>相場比中央値 ${ratioLabel(card.buybackAnalysis?.ratioMedian)} / 有効 ${fmt.format(card.buybackAnalysis?.trustedCount || 0)}店 / 除外 ${fmt.format(card.buybackAnalysis?.excludedCount || 0)}店</small>
        </div>
        <div class="buyback-shops buyback-primary-shop">${buybackPrimaryShop}</div>
        ${buybackOtherShops}
        <div class="buyback-total"><span>全店舗合計</span><b>7日 ${fmt.format(card.buyback7)}回 / ${fmt.format(card.buyback.shop7 || 0)}店</b><b>30日 ${fmt.format(card.buyback30)}回 / ${fmt.format(card.buyback.shop30 || 0)}店</b><b>90日 ${fmt.format(card.buyback90)}回 / ${fmt.format(card.buyback.shop90 || 0)}店</b></div>
        <div class="buyback-price-averages"><span>全店舗平均買取（参考）</span><b>7日 ${card.buyback.avg7 ? `¥${fmt.format(card.buyback.avg7)}` : "-"}</b><b>30日 ${card.buyback.avg30 ? `¥${fmt.format(card.buyback.avg30)}` : "-"}</b><b>90日 ${card.buyback.avg90 ? `¥${fmt.format(card.buyback.avg90)}` : "-"}</b></div>
      </div>
    ` : "";
    const activityPanel = `
      <div class="activity-panel">
        <div class="activity-head"><strong>売れ行き</strong><span>みんトレ取引件数 / ショップ状態A在庫減</span></div>
        <div class="activity-grid">
          <div><span>PSA10・直近7日</span><strong>${fmt.format(card.psaTx7d)}件</strong><small>みんトレPSA10</small></div>
          <div class="activity-emphasis"><span>PSA10・直近30日</span><strong>${fmt.format(card.psaTx30d)}件</strong><small>同価格帯中央値 ${Number.isFinite(card.psaTxPeerMedian) ? `${fmt.format(Math.round(card.psaTxPeerMedian))}件` : "-"}</small></div>
          <div><span>美品・直近7日</span><strong>みんトレ ${fmt.format(card.saleTx7d)}件</strong><small>カードラッシュ ${dropStock(card.cardrushDrop7)} / 晴れる屋2 ${dropStock(card.hareruya2Drop7)} / 遊々亭は集計開始中 / 合計 ${combinedMovement(card.saleTx7d, card.shopDrop7)}</small></div>
          <div><span>美品・直近30日</span><strong>みんトレ ${fmt.format(card.saleTx30d)}件</strong><small>カードラッシュ ${dropStock(card.cardrushDrop30)} / 晴れる屋2 ${dropStock(card.hareruya2Drop30)} / 遊々亭は集計開始中 / 合計 ${combinedMovement(card.saleTx30d, card.shopDrop30)}</small></div>
        </div>
      </div>
    `;
    const cardrushPriceText = Number.isFinite(card.cardrushPrice) ? `¥${fmt.format(card.cardrushPrice)}` : "未取得";
    const hareruya2PriceText = Number.isFinite(card.hareruya2Price) ? `¥${fmt.format(card.hareruya2Price)}` : "未取得";
    const yuyuteiPriceText = Number.isFinite(card.yuyuteiPrice) ? `¥${fmt.format(card.yuyuteiPrice)}` : "未取得";
    const torecacampPriceText = Number.isFinite(card.torecacampPrice) ? `¥${fmt.format(card.torecacampPrice)}` : "未取得";
    const priceSources = [`みんトレ状態A ¥${fmt.format(card.torecaPrice)}`, `カードラッシュ状態A ${cardrushPriceText}`, `晴れる屋2状態A ${hareruya2PriceText}`, `遊々亭状態A ${yuyuteiPriceText}`, `トレカキャンプ状態A ${torecacampPriceText}`]
      .filter((_, index) => index === 0 || [card.cardrushPrice, card.hareruya2Price, card.yuyuteiPrice, card.torecacampPrice][index - 1] > 0)
      .join(" / ");
    const dataQuality = card.dataQuality || {};
    const dataQualityPanels = [
      dataQuality.manualReview ? `<div class="data-quality-notice manual"><strong>要確認（手動確認）</strong><span>${escapeHtml(dataQuality.manualReviewReasons.join(" / "))}</span></div>` : "",
      dataQuality.dataShortage ? `<div class="data-quality-notice shortage"><strong>データ不足</strong><span>${escapeHtml(dataQuality.dataShortageReasons.join(" / "))} / 判定信頼度 ${escapeHtml(dataQuality.confidence)} / 追加リスク +${fmt.format(dataQuality.shortageRiskPct)}%を計算済み</span></div>` : "",
      dataQuality.outlierExcluded ? `<div class="data-quality-notice outlier"><strong>外れ値除外済み</strong><span>${escapeHtml(dataQuality.outlierExcludedReasons.join(" / "))} / 複数の一致価格を採用して判定継続</span></div>` : "",
    ].filter(Boolean).join("");
    const dataQualityPanel = dataQualityPanels ? `<div class="data-quality-notices">${dataQualityPanels}</div>` : "";
    const buyLimits = card.buyLimits;
    const cleanMarketStatus = buyLimits?.clean?.maxPrice > 0
      ? card.price <= buyLimits.clean.maxPrice
        ? "平均美品価格は仕入れ圏内"
        : `平均美品より¥${fmt.format(Math.max(0, card.price - buyLimits.clean.maxPrice))}安ければ候補`
      : "設定条件では見送り";
    const buyLimitPanel = buyLimits ? `
      <section class="buy-limit-panel" aria-label="状態別の仕入れ上限価格">
        <div class="buy-limit-head">
          <div><span>店舗で見る仕入れ上限</span><strong>この状態なら、ここまで</strong></div>
          <small>${escapeHtml(buyLimits.rateSource)}・予測PSA10 ¥${fmt.format(buyLimits.forecastPrice)}</small>
        </div>
        <div class="buy-limit-grid">
          <div class="buy-limit-card clean ${buyLimits.clean.maxPrice > 0 ? "available" : "blocked"}">
            <span>美品・実際に使える最終上限</span>
            <strong>${buyLimitText(buyLimits.clean)}</strong>
            <b>PSA10想定 ${buyLimits.clean.hitRate.toFixed(1)}%</b>
            <div class="buy-limit-breakdown"><span>採算上の上限</span><em>¥${fmt.format(buyLimits.clean.economicMaxPrice)}</em><span>現在の資金で買える上限</span><em>¥${fmt.format(buyLimits.clean.capitalMaxPrice)}</em></div>
            <small>${escapeHtml(cleanMarketStatus)} / 9以下 ¥${fmt.format(buyLimits.clean.lowerGradePrice)}想定</small>
          </div>
          <div class="buy-limit-card scratch ${buyLimits.scratch.maxPrice > 0 ? "available" : "blocked"}">
            <span>多少の傷あり・実際に使える最終上限</span>
            <strong>${buyLimitText(buyLimits.scratch)}</strong>
            <b>PSA10想定 ${buyLimits.scratch.hitRate.toFixed(1)}%</b>
            <div class="buy-limit-breakdown"><span>採算上の上限</span><em>¥${fmt.format(buyLimits.scratch.economicMaxPrice)}</em><span>現在の資金で買える上限</span><em>¥${fmt.format(buyLimits.scratch.capitalMaxPrice)}</em></div>
            <small>美品の10率を45%減 / 9以下 ¥${fmt.format(buyLimits.scratch.lowerGradePrice)}想定</small>
          </div>
        </div>
        <div class="buy-limit-foot">
          <span>下落・回転の安全余裕 美品 ${buyLimits.clean.riskBufferPct.toFixed(1)}% / 傷あり ${buyLimits.scratch.riskBufferPct.toFixed(1)}%</span>
          <span>個別カードは1枚で判定 / 複数枚の合計はお気に入り一覧で確認 / ${escapeHtml(buyLimits.clean.lowerGradeSource)}・PSA鑑定費・売却手数料を反映</span>
        </div>
      </section>
    ` : "";
    const favoriteActive = state.favorites.has(String(card.id));
    const psaDecision = card.psaDecision;
    const purchaseDecision = card.purchaseDecision;
    const decisionClass = purchaseDecision?.verdict === "GO"
      ? "recommended"
      : purchaseDecision?.verdict === "見送り"
        ? "not-recommended"
        : purchaseDecision?.verdict === "資金不足"
          ? "funding-short"
          : purchaseDecision?.verdict === "要確認"
            ? "needs-review"
            : "conditional";
    const decisionTitle = `今回の仕入れ判断：${purchaseDecision?.verdict || "未判定"}`;
    const decisionReasons = purchaseDecision?.reasons?.length ? purchaseDecision.reasons.join(" / ") : "利益・資金・銘柄品質の基準を満たしています";
    const psaDecisionPanel = psaDecision ? `
      <div class="psa-decision ${decisionClass}">
        <div class="psa-decision-head"><strong>資金・期待値の内訳</strong><span>PSA公式取得率優先・PSA9実価格優先・共通計算</span></div>
        <div class="psa-decision-metrics">
          <div><span>期待利益</span><strong>¥${fmt.format(Math.round(psaDecision.expectedProfit))}</strong></div>
          <div><span>期待利益率</span><strong>${Math.round(psaDecision.expectedRoi)}%</strong></div>
          <div><span>年換算効率</span><strong>${Math.round(psaDecision.annualEfficiency)}%</strong></div>
          <div><span>このカード1枚の仕入れ額</span><strong>¥${fmt.format(Math.round(psaDecision.singleCardSpend || 0))}</strong></div>
        </div>
        <p>${escapeHtml(decisionReasons)}</p>
      </div>
    ` : "";
    const purchaseSummaryPanel = psaDecision && purchaseDecision ? `
      <section class="purchase-summary ${decisionClass}">
        <div class="purchase-final-limit"><span>実際に使える最終上限・美品</span><strong>${buyLimitText(card.buyLimits?.clean)}</strong><small>採算上 ¥${fmt.format(card.buyLimits?.clean?.economicMaxPrice || 0)} / 資金上 ¥${fmt.format(card.buyLimits?.clean?.capitalMaxPrice || 0)}</small></div>
        <div class="purchase-verdict"><span>今回の仕入れ判断</span><strong>${escapeHtml(purchaseDecision.verdict)}</strong><small>${escapeHtml(decisionReasons)}</small></div>
        <div><span>現在価格での期待利益</span><strong class="${psaDecision.expectedProfit < 0 ? "negative" : "positive"}">¥${fmt.format(Math.round(psaDecision.expectedProfit))}</strong></div>
        <div><span>91日後・中央推計</span><strong>¥${fmt.format(card.futurePriceForecast?.centralPrice || 0)}</strong></div>
      </section>
    ` : "";
    const forecast = card.futurePriceForecast;
    const forecastRiskClass = !forecast ? "pending" : forecast.downsidePct >= 25 ? "risk-high" : forecast.downsidePct >= 12 ? "risk-medium" : "risk-low";
    const forecastReasons = forecast?.reasons?.join(" / ") || "判定材料を蓄積中";
    const forecastPanel = forecast ? `
      <div class="future-price-forecast ${forecastRiskClass}">
        <div class="future-forecast-head">
          <div><span>${fmt.format(forecast.horizonDays)}日後のPSA10推計</span><strong>${escapeHtml(forecast.phase)}</strong><small>データ充足度 ${escapeHtml(forecast.dataCompleteness)}</small></div>
          <b>${forecast.score}<small>/100</small></b>
        </div>
        <div class="future-forecast-metrics">
          <div><span>現在価格</span><strong>¥${fmt.format(card.psa10)}</strong></div>
          <div><span>弱気 / 中央 / 強気</span><strong>¥${fmt.format(forecast.bearishPrice)} / ¥${fmt.format(forecast.centralPrice)} / ¥${fmt.format(forecast.bullishPrice)}</strong></div>
          <div><span>予測下落余地</span><strong>${forecast.downsidePct > 0 ? `-${forecast.downsidePct.toFixed(1)}%` : "ほぼなし"}</strong></div>
          <div><span>PSA10 ÷ 平均美品</span><strong>${forecast.gapRatio.toFixed(2)}倍</strong></div>
          <div><span>PSA10 30日換算増加</span><strong>${Number.isFinite(forecast.monthlyPsa10Increase) ? `+${fmt.format(Math.round(forecast.monthlyPsa10Increase))}枚` : "未判定"}</strong></div>
          <div><span>PSA10供給圧力</span><strong>${escapeHtml(forecast.supplyPressure)}</strong></div>
          <div><span>公式セット年</span><strong>${Number.isFinite(forecast.releaseYear) ? `${forecast.releaseYear}年` : "未取得"}</strong></div>
          <div><span>供給成熟度</span><strong>${escapeHtml(forecast.maturityLabel)}</strong></div>
        </div>
        <p>${escapeHtml(forecastReasons)}</p>
        <small>平均美品との価格差だけで決めず、発売後の経過年数・PSA10取得率・実際の供給増・取引量を反映します。古いカードでも供給増が高い場合は警戒を優先します。</small>
      </div>
    ` : "";
    const floor = card.marketStability;
    const floorClass = floor?.state === "安定" ? "stable" : floor?.state === "形成中" ? "forming" : floor?.state === "下値割れ" ? "broken" : floor?.state === "未形成" ? "unformed" : "collecting";
    const floorScoreText = Number.isFinite(floor?.score) ? `${fmt.format(floor.score)}/100` : "蓄積中";
    const supportText = Number.isFinite(floor?.supportLow) && Number.isFinite(floor?.supportHigh)
      ? `¥${fmt.format(floor.supportLow)}～¥${fmt.format(floor.supportHigh)}`
      : "蓄積中";
    const inventoryText = Number.isFinite(floor?.inventoryDays) ? `${Number(floor.inventoryDays).toFixed(1)}日` : "算出不可";
    const inventorySourcesText = (floor?.inventorySources || []).map((source) => `${source.source} ${Number(source.days).toFixed(1)}日`).join(" / ");
    const floorEvidence = floor?.evidence?.join(" / ") || "価格・取引・出品履歴を蓄積中";
    const floorCautions = floor?.cautions?.join(" / ") || "なし";
    const floorPanel = `
      <div class="price-floor-panel ${floorClass}">
        <div class="price-floor-head"><div><span>相場の下値安定</span><strong>${escapeHtml(floor?.state || "蓄積中")} <small>${floorScoreText}</small></strong></div><b>履歴 ${fmt.format(floor?.historyDays || 0)}日 / ${fmt.format(floor?.samples || 0)}記録</b></div>
        <div class="price-floor-grid">
          <div><span>価格方向</span><strong>${escapeHtml(floor?.direction || "蓄積中")}</strong></div>
          <div><span>下値状態</span><strong>${escapeHtml(floor?.state || "蓄積中")}</strong></div>
          <div><span>需給状態</span><strong>${escapeHtml(floor?.supplyState || "蓄積中")}</strong></div>
          <div><span>支持価格帯</span><strong>${supportText}</strong></div>
          <div><span>在庫消化日数</span><strong>${inventoryText}</strong><small>${escapeHtml(inventorySourcesText || "同一店舗内の在庫と減少数が揃った場合だけ算出")}</small></div>
          <div><span>PSA10供給増</span><strong>7日 ${Number.isFinite(floor?.psaIncrease7) ? `+${fmt.format(floor.psaIncrease7)}枚` : "-"} / 30日 ${Number.isFinite(floor?.psaIncrease30) ? `+${fmt.format(floor.psaIncrease30)}枚` : "-"}</strong></div>
          <div><span>市場指数比の強さ</span><strong>${Number.isFinite(floor?.marketRelativeStrength) ? `${floor.marketRelativeStrength >= 0 ? "+" : ""}${Number(floor.marketRelativeStrength).toFixed(1)}pt` : "蓄積中"}</strong></div>
        </div>
        <p><b>根拠：</b>${escapeHtml(floorEvidence)}</p>
        <p class="floor-caution"><b>注意：</b>${escapeHtml(floorCautions)}</p>
        <small>異なるサイトの取引数と在庫数は直接加算していません。在庫消化日数は店舗ごとに計算し、その中央値だけを表示します。</small>
      </div>
    `;
    const marketSignalsPanel = `
      <section class="market-signal-strip" aria-label="独立した仕入れ評価指標">
        <div class="${floorClass}"><span>下値安定</span><strong>${escapeHtml(floor?.state || "蓄積中")}</strong><small>${floorScoreText}</small></div>
        <div class="demand-${storeDemandKey(card.buybackAnalysis?.label)}"><span>店舗需要</span><strong>${escapeHtml(card.buybackAnalysis?.label || "蓄積中")}</strong><small>${buybackDemandScoreText}</small></div>
        <div><span>将来価格</span><strong>${fmt.format(forecast?.score || 0)}/100</strong><small>${escapeHtml(forecast?.phase || "蓄積中")}</small></div>
        <div><span>売りやすさ</span><strong>${fmt.format(card.overallAssessment?.exitLiquidity || 0)}/100</strong><small>PSA10取引・出口</small></div>
        <div><span>期待利益</span><strong class="${Number(psaDecision?.expectedProfit || 0) >= 0 ? "positive" : "negative"}">¥${fmt.format(Math.round(psaDecision?.expectedProfit || 0))}</strong><small>既存計算を維持</small></div>
      </section>
    `;
    const overall = card.overallAssessment;
    const overallReasons = overall
      ? [...overall.strengths.map((reason) => `○ ${reason}`), ...overall.cautions.map((reason) => `△ ${reason}`)].join(" / ")
      : "";
    const overallPanel = overall ? `
      <div class="overall-assessment grade-${overall.grade.toLowerCase()}">
        <div><span>銘柄品質</span><strong>${overall.grade}・${overall.label}</strong><b class="score-value">${overall.score}<small>/100</small></b></div>
        <div class="overall-components"><span><b>${overall.exitLiquidity}<small>/100</small></b>売りやすさ</span><span><b>${overall.supplyRisk}<small>/100</small></b>供給リスク耐性</span><span><b>${overall.futurePrice}<small>/100</small></b>将来価格</span></div>
        <p>${escapeHtml(overallReasons || "判定材料を蓄積中")}</p>
        <small>銘柄品質は互換性のため既存配分（売りやすさ35%・従来価格安定25%・供給15%・将来25%）を維持します。新しい下値安定と店舗需要は独立指標です。</small>
      </div>
    ` : "";
    const official = card.official;
    const psaGrowth = official ? psaGrowthSummary(official) : null;
    const officialFetchedDate = String(official?.f || "").slice(0, 10) || "未取得";
    const officialStale = sourceAgeDays(official?.f) > 2;
    const officialPsaPanel = official?.bundle ? `
      <div class="psa-official psa-bundle">
        <div class="psa-bundle-head"><span>PSA公式・4枚セット換算 / 取得 ${escapeHtml(officialFetchedDate)}</span><strong>4枚すべてPSA10 推定 ${Number(official.rate).toFixed(1)}%</strong></div>
        <div class="psa-bundle-parts">${official.parts.map((part) => `<span>${escapeHtml(part.label)}：${Number(part.rate).toFixed(1)}%</span>`).join("")}</div>
        <small>各パーツの公式10取得率を掛け合わせた独立近似です。美品価格・PSA10価格は4枚セット合計のまま計算します。</small>
      </div>
    ` : official ? `
      <details class="psa-official" data-psa-history="${escapeHtml(card.id)}" data-psa-shard="${escapeHtml(official.sh)}">
        <summary>
          <div><span>PSA公式Population / 取得 ${escapeHtml(officialFetchedDate)}</span><strong>PSA10取得率 ${Number(official.rate || 0).toFixed(1)}%</strong></div>
          <div class="psa-summary-actions"><b class="psa-growth ${officialStale ? "pending" : psaGrowth.className}">${officialStale ? `最終取得 ${escapeHtml(officialFetchedDate)}・再取得待ち` : `PSA10増加 ${escapeHtml(psaGrowth.label)}`}</b><b>数値を見る</b></div>
        </summary>
        <div class="psa-official-body">
          <div class="psa-official-metrics">
            <div><span>PSA10枚数</span><strong>${fmt.format(official.ten)}枚</strong></div>
            <div><span>TOTAL枚数</span><strong>${fmt.format(official.total)}枚</strong></div>
            <div><span>10取得率</span><strong>${Number(official.rate || 0).toFixed(1)}%</strong></div>
          </div>
          <div class="psa-changes">${psaChangeBadge(official.w7, 7)}${psaChangeBadge(official.w30, 30)}${psaChangeBadge(official.w90, 90)}</div>
          <div class="psa-chart" data-psa-chart></div>
          ${official.u ? `<a class="psa-source-link" href="${escapeHtml(official.u)}" target="_blank" rel="noreferrer">PSA公式セットページ</a>` : ""}
        </div>
      </details>
    ` : "";
    return `
      <article class="row card" data-card-id="${card.id}">
        <a class="thumb" href="${buildTorecaCardUrl(card)}" target="_blank" rel="noreferrer" aria-label="みんトレで${name}を開く">
          <img src="${card.img}" alt="${name}" loading="lazy" />
          <div class="series">${card.rarity ? card.rarity : card.model}</div>
        </a>
        <div class="content">
          <div class="headline">
            <div>
              <h3>${name}</h3>
            </div>
            <button class="favorite-toggle ${favoriteActive ? "active" : ""}" type="button" data-toggle-favorite="${card.id}" aria-pressed="${favoriteActive}">${favoriteActive ? "★ お気に入り登録済み" : psaDecision?.expectedProfit < 0 ? "☆ お気に入りに追加" : "☆ 仕入れ候補に追加"}</button>
          </div>

          ${purchaseSummaryPanel}
          ${buyLimitPanel}
          ${dataQualityPanel}
          ${marketSignalsPanel}

          <details class="card-details">
            <summary><span>詳細データを見る</span><small>下値安定・買取率・相場・予測・公式PSA</small></summary>
            <div class="card-details-body">
              <div class="metrics market-summary">
                <div class="metric metric-primary"><span>平均美品価格（中央値）</span><strong>¥${fmt.format(card.price)}</strong><small>${priceSources}</small></div>
                <div class="metric"><span>PSA10市場価格</span><strong>¥${fmt.format(card.psa10)}</strong><small>みんトレ市場価格 / 手数料・追加費用差引後の受取見込 ¥${fmt.format(Math.round(card.psa10Net))}</small></div>
                <div class="metric"><span>PSA10時の手取り利益</span><strong>¥${fmt.format(Math.round(card.profit))}</strong><small>PSA10になった場合。期待利益とは別です。</small></div>
                <div class="metric metric-roi"><span>PSA10時の手取り利益率</span><strong>${Number.isFinite(card.roi) ? Math.round(card.roi) : 0}%</strong><small>利益 ÷（平均美品＋PSA鑑定費）</small></div>
              </div>

              <div class="profit-assessment ${roiAssessmentClass}" title="${roiBandLabel}${hasReliablePeers ? `の利益率中央値 ${Math.round(peerMedianRoi)}%` : ""}">${roiAssessment} <span>${hasReliablePeers ? `${roiDifference >= 0 ? "+" : ""}${Math.round(roiDifference)}pt` : "-"}</span><small>${roiBandLabel}${hasReliablePeers ? `・中央値 ${Math.round(peerMedianRoi)}%` : ""}</small></div>

              ${psaDecisionPanel}
              ${floorPanel}
              ${forecastPanel}
              ${overallPanel}
              ${activityPanel}
              ${stockPanel}
              ${buybackPanel}
              ${officialPsaPanel}

              <div class="market-links" aria-label="外部サイトへの直リンク">
                <div class="market-links-title">商品ページ</div>
                <div class="market-links-grid">${marketLinks}</div>
              </div>
            </div>
          </details>

        </div>
      </article>
    `;
  }).join("");

  const observer = ensureSnkrObserver();
  [...els.grid.querySelectorAll("[data-card-id]")].forEach((el) => observer.observe(el));
  [...els.grid.querySelectorAll("[data-psa-history]")].forEach((details) => {
    details.addEventListener("toggle", () => { if (details.open) renderPsaHistory(details); }, { once: true });
  });
  renderFavorites();
}

function syncFromUI() {
  state.visibleLimit = 60;
  state.psaPlan = els.psaPlanInput.value || state.psaPlan;
  applyPsaPlan();
  state.minSaleTx = Number(els.saleTxMinInput.value || 0);
  state.maxSaleTx = parseOptionalNumber(els.saleTxMaxInput.value);
  state.minSaleTx7 = Number(els.saleTx7MinInput.value || 0);
  state.maxSaleTx7 = parseOptionalNumber(els.saleTx7MaxInput.value);
  state.minPsaTx = Number(els.psaTxMinInput.value || 0);
  state.maxPsaTx = parseOptionalNumber(els.psaTxMaxInput.value);
  state.minPsaTx7 = Number(els.psaTx7MinInput.value || 0);
  state.maxPsaTx7 = parseOptionalNumber(els.psaTx7MaxInput.value);
  state.minBuyback7 = Number(els.buyback7MinInput.value || 0);
  state.maxBuyback7 = parseOptionalNumber(els.buyback7MaxInput.value);
  state.minBuyback30 = Number(els.buyback30MinInput.value || 0);
  state.maxBuyback30 = parseOptionalNumber(els.buyback30MaxInput.value);
  state.minBuyback90 = Number(els.buyback90MinInput.value || 0);
  state.maxBuyback90 = parseOptionalNumber(els.buyback90MaxInput.value);
  state.minBuybackShops = Number(els.buybackShopsMinInput.value || 0);
  state.minBuybackPrice = parseOptionalNumber(els.buybackPriceMinInput.value);
  state.maxBuybackPrice = parseOptionalNumber(els.buybackPriceMaxInput.value);
  state.minRoi = Number(els.roiInput.value || 0);
  state.minPsa10 = Number(els.psaMinInput.value || 0);
  state.maxPsa10 = parseOptionalNumber(els.psaMaxInput.value);
  state.minPrice = parseOptionalNumber(els.priceMinInput.value);
  state.maxPrice = parseOptionalNumber(els.priceMaxInput.value);
  state.minPurchaseLimitRatio = parseOptionalNumber(els.purchaseLimitRatioMinInput.value);
  state.minPsaRate = parseOptionalNumber(els.psaRateMinInput.value);
  state.overallFilter = els.overallFilterInput.value || "all";
  state.minExitLiquidity = Number(els.minExitLiquidityInput.value || 0);
  state.minEconomics = Number(els.minEconomicsInput.value || 0);
  state.minMarketStability = Number(els.minMarketStabilityInput.value || 0);
  state.minSupplyRisk = Number(els.minSupplyRiskInput.value || 0);
  state.minFuturePriceScore = Number(els.minFuturePriceScoreInput.value || 0);
  state.maxFuturePriceScore = parseOptionalNumber(els.maxFuturePriceScoreInput.value);
  state.minForecastPrice = parseOptionalNumber(els.minForecastPriceInput.value);
  state.maxForecastPrice = parseOptionalNumber(els.maxForecastPriceInput.value);
  state.minForecastDownside = parseOptionalNumber(els.minForecastDownsideInput.value);
  state.maxForecastDownside = parseOptionalNumber(els.maxForecastDownsideInput.value);
  state.minForecastGap = parseOptionalNumber(els.minForecastGapInput.value);
  state.maxForecastGap = parseOptionalNumber(els.maxForecastGapInput.value);
  state.forecastPhase = els.forecastPhaseInput.value || "all";
  state.forecastConfidence = els.forecastConfidenceInput.value || "all";
  state.forecastSupplyPressure = els.forecastSupplyPressureInput.value || "all";
  state.minForecastAge = parseOptionalNumber(els.minForecastAgeInput.value);
  state.forecastMaturity = els.forecastMaturityInput.value || "all";
  state.maxForecastMonthlyIncrease = parseOptionalNumber(els.maxForecastMonthlyIncreaseInput.value);
  state.stockDemand = els.stockDemandInput.value || "all";
  state.dataQualityFilter = els.dataQualityFilterInput.value || "all";
  state.floorState = els.floorStateInput.value || "all";
  state.priceDirection = els.priceDirectionInput.value || "all";
  state.supplyState = els.supplyStateInput.value || "all";
  state.minFloorScore = parseOptionalNumber(els.minFloorScoreInput.value);
  state.storeDemand = els.storeDemandInput.value || "all";
  state.hideSkipped = els.hideSkippedInput.checked;
  state.hideReview = els.hideReviewInput.checked;
  state.fundingOnly = els.fundingOnlyInput.checked;
  state.officialOnly = els.officialOnlyInput.checked;
  state.sort = els.sortInput.value;
  state.q = els.qInput.value.trim();
  state.psaCapital = Number(els.psaCapitalInput.value || 0);
  state.lockedCapital = Number(els.lockedCapitalInput.value || 0);
  state.lockDays = Math.max(1, Number(els.lockDaysInput.value || 1));
  state.minExpectedProfit = Number(els.minExpectedProfitInput.value || 0);
  state.minExpectedRoi = Number(els.minExpectedRoiInput.value || 0);
  state.minAnnualEfficiency = Number(els.minAnnualEfficiencyInput.value || 0);
  state.maxCapitalShare = Number(els.maxCapitalShareInput.value || 0);
  state.submissionCount = Math.max(1, Number(els.submissionCountInput.value || 1));
  state.gradingReserve = Number(els.gradingReserveInput.value || 0);
  state.saleFeeRate = Number(els.saleFeeRateInput.value || 0);
  state.saleExtraCost = Number(els.saleExtraCostInput.value || 0);
  if (els.capitalAvailabilityStatus) {
    const capital = decisionModel.capitalPlan({ totalCapital: state.psaCapital, lockedCapital: state.lockedCapital, gradingReserve: state.gradingReserve, submissionCount: state.submissionCount, fee: state.fee });
    els.capitalAvailabilityStatus.className = capital.availableCapital > 0 ? "enough" : "short";
    els.capitalAvailabilityStatus.textContent = `使用可能資金 ¥${fmt.format(capital.availableCapital)}（総資金 ¥${fmt.format(state.psaCapital)} − ロック中 ¥${fmt.format(state.lockedCapital)} − 鑑定費予備 ¥${fmt.format(state.gradingReserve)}）。個別カードは1枚で判定し、選択カードの合計はお気に入りで確認します。`;
  }
  if (els.gradingReserveStatus) {
    const required = state.fee * state.submissionCount;
    const enough = state.gradingReserve >= required;
    els.gradingReserveStatus.className = enough ? "enough" : "short";
    els.gradingReserveStatus.textContent = `同時${fmt.format(state.submissionCount)}枚の返却時必要額 ¥${fmt.format(required)} / ${enough ? "予備資金内" : `あと¥${fmt.format(required - state.gradingReserve)}不足`}（個別判定は1枚分で確認）`;
  }
  render();
  updateUrl();
}

async function init() {
  readUrl();
  loadFavorites();
  try {
    state.updateStatus = await fetchJsonMaybe("./data/update-status.json");
    state.psaServices = await fetchJsonMaybe("./data/psa-japan-services.json");
    state.evaluationModel = await fetchJsonMaybe("./data/evaluation-model.json");
    populatePsaPlans({ updateLockDays: !new URL(window.location.href).searchParams.has("lock") });
    if (!window.POKEMON_CARDS_META) {
      const loadedMeta = await fetchJsonMaybe("./data/pokemon-cards-meta.json");
      if (loadedMeta) meta = loadedMeta;
    }
    if (Array.isArray(window.POKEMON_CARDS)) {
      state.cards = window.POKEMON_CARDS;
    } else {
      const res = await fetch("./data/pokemon-cards.json", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      state.cards = await res.json();
    }
    const stockData = await fetchJsonMaybe("./data/cardrush-stock-summary.json");
    state.cardrushStock = stockData?.cards || Object.create(null);
    const hareruya2Data = await fetchJsonMaybe("./data/hareruya2-stock-summary.json");
    state.hareruya2Stock = hareruya2Data?.cards || Object.create(null);
    const yuyuteiData = await fetchJsonMaybe("./data/yuyutei-stock-summary.json");
    state.yuyuteiStock = yuyuteiData?.cards || Object.create(null);
    const torecacampData = await fetchJsonMaybe("./data/torecacamp-stock-summary.json");
    state.torecacampStock = torecacampData?.cards || Object.create(null);
    const buybackData = await fetchJsonMaybe("./data/shop-buyback-summary.json");
    state.shopBuybacks = buybackData?.cards || Object.create(null);
    state.buybackShops = buybackData?.shops || Object.create(null);
    state.buybackDates = buybackData?.dates || [];
    state.buybackUpdatedAt = buybackData?.updatedAt || null;
    const marketStabilityData = await fetchJsonMaybe("./data/market-stability-summary.json");
    state.marketStability = marketStabilityData?.cards || Object.create(null);
    state.marketStabilityMeta = marketStabilityData || null;
    if (els.shopReferenceLinks) {
      const links = Object.values(state.buybackShops).map((shop) => `<a href="${escapeHtml(shop.url)}" target="_blank" rel="noreferrer">${escapeHtml(shop.name)} 買取表</a>`).join("");
      els.shopReferenceLinks.innerHTML = links ? `<span>参照ショップ</span>${links}` : "";
    }
    const psaData = await fetchJsonMaybe("./data/psa-population-summary.json");
    state.psaPopulation = psaData?.cards || Object.create(null);
    attachBundlePopulations(state.psaPopulation);
    syncFromUI();
  } catch (err) {
    console.error(err);
    showStatus(
      "カード一覧の読み込みに失敗しました。\n\nこのサイトは `data/pokemon-cards.json` と `data/pokemon-cards-meta.json` を読み込んでいます。`index.html` をファイル直開きすると、ブラウザの制限で JSON の読み込みが止まることがあります。\n\nおすすめ:\n1. GitHub Pages 上で開く\n2. ローカルなら簡易サーバー経由で開く\n   例: `python -m http.server 8000` のように同じフォルダを配信してから `http://localhost:8000/` を開く\n\nもし GitHub Pages に置いたのに出ない場合は、更新後の URL とコンソールエラーを見ます。",
      "error"
    );
  }
}

[els.qInput, els.saleTxMinInput, els.saleTxMaxInput, els.saleTx7MinInput, els.saleTx7MaxInput, els.psaTxMinInput, els.psaTxMaxInput, els.psaTx7MinInput, els.psaTx7MaxInput, els.buyback7MinInput, els.buyback7MaxInput, els.buyback30MinInput, els.buyback30MaxInput, els.buyback90MinInput, els.buyback90MaxInput, els.buybackShopsMinInput, els.buybackPriceMinInput, els.buybackPriceMaxInput, els.roiInput, els.psaMinInput, els.psaMaxInput, els.priceMinInput, els.priceMaxInput, els.purchaseLimitRatioMinInput, els.psaRateMinInput, els.overallFilterInput, els.minExitLiquidityInput, els.minEconomicsInput, els.minMarketStabilityInput, els.minSupplyRiskInput, els.minFuturePriceScoreInput, els.maxFuturePriceScoreInput, els.minForecastPriceInput, els.maxForecastPriceInput, els.minForecastDownsideInput, els.maxForecastDownsideInput, els.minForecastGapInput, els.maxForecastGapInput, els.forecastPhaseInput, els.forecastConfidenceInput, els.forecastSupplyPressureInput, els.minForecastAgeInput, els.forecastMaturityInput, els.maxForecastMonthlyIncreaseInput, els.stockDemandInput, els.dataQualityFilterInput, els.floorStateInput, els.priceDirectionInput, els.supplyStateInput, els.minFloorScoreInput, els.storeDemandInput, els.hideSkippedInput, els.hideReviewInput, els.fundingOnlyInput, els.officialOnlyInput, els.sortInput, els.psaCapitalInput, els.lockedCapitalInput, els.lockDaysInput, els.minExpectedProfitInput, els.minExpectedRoiInput, els.minAnnualEfficiencyInput, els.maxCapitalShareInput, els.submissionCountInput, els.gradingReserveInput, els.saleFeeRateInput, els.saleExtraCostInput].forEach((el) =>
  el.addEventListener("input", syncFromUI)
);

els.resetFiltersBtn.addEventListener("click", () => {
  els.qInput.value = "";
  els.saleTxMinInput.value = "30";
  [els.saleTxMaxInput, els.saleTx7MaxInput, els.psaTxMaxInput, els.psaTx7MaxInput, els.buyback7MaxInput, els.buyback30MaxInput, els.buyback90MaxInput, els.buybackPriceMinInput, els.buybackPriceMaxInput, els.priceMinInput, els.priceMaxInput, els.purchaseLimitRatioMinInput, els.psaRateMinInput, els.maxFuturePriceScoreInput, els.minForecastPriceInput, els.maxForecastPriceInput, els.minForecastDownsideInput, els.maxForecastDownsideInput, els.minForecastGapInput, els.maxForecastGapInput, els.minForecastAgeInput, els.maxForecastMonthlyIncreaseInput].forEach((el) => { el.value = ""; });
  [els.saleTx7MinInput, els.psaTxMinInput, els.psaTx7MinInput, els.buyback7MinInput, els.buyback30MinInput, els.buyback90MinInput, els.buybackShopsMinInput, els.psaMinInput].forEach((el) => { el.value = "0"; });
  els.roiInput.value = "40";
  els.psaMaxInput.value = "200000";
  els.overallFilterInput.value = "all";
  [els.minExitLiquidityInput, els.minEconomicsInput, els.minMarketStabilityInput, els.minSupplyRiskInput, els.minFuturePriceScoreInput].forEach((el) => { el.value = "0"; });
  els.forecastPhaseInput.value = "all";
  els.forecastConfidenceInput.value = "all";
  els.forecastSupplyPressureInput.value = "all";
  els.forecastMaturityInput.value = "all";
  els.stockDemandInput.value = "all";
  els.dataQualityFilterInput.value = "all";
  els.floorStateInput.value = "all";
  els.priceDirectionInput.value = "all";
  els.supplyStateInput.value = "all";
  els.minFloorScoreInput.value = "";
  els.storeDemandInput.value = "all";
  els.hideSkippedInput.checked = false;
  els.hideReviewInput.checked = false;
  els.fundingOnlyInput.checked = false;
  els.officialOnlyInput.checked = false;
  els.sortInput.value = "overall-desc";
  syncFromUI();
});

document.querySelectorAll("[data-preset]").forEach((button) => {
  button.addEventListener("click", () => {
    const preset = button.dataset.preset;
    els.saleTxMinInput.value = preset === "turnover" ? "20" : "0";
    els.psaTxMinInput.value = preset === "turnover" ? "15" : "0";
    els.overallFilterInput.value = preset === "now" || preset === "low-risk" ? "ab" : "all";
    els.minExitLiquidityInput.value = preset === "turnover" ? "70" : preset === "low-risk" ? "55" : "0";
    els.minMarketStabilityInput.value = preset === "low-risk" ? "65" : "0";
    els.minSupplyRiskInput.value = preset === "low-risk" ? "60" : "0";
    els.maxForecastDownsideInput.value = preset === "low-risk" ? "10" : "";
    els.buybackShopsMinInput.value = preset === "turnover" ? "1" : "0";
    els.hideSkippedInput.checked = preset === "now" || preset === "low-risk";
    els.fundingOnlyInput.checked = preset === "now";
    els.officialOnlyInput.checked = preset === "low-risk";
    els.sortInput.value = preset === "turnover" ? "exit-desc" : preset === "low-risk" ? "downside-asc" : "expectedProfit-desc";
    document.querySelectorAll("[data-preset]").forEach((item) => item.classList.toggle("active", item === button));
    syncFromUI();
  });
});

els.psaPlanInput.addEventListener("change", () => {
  state.psaPlan = els.psaPlanInput.value;
  applyPsaPlan({ updateLockDays: true });
  syncFromUI();
});

els.copyLinkBtn.addEventListener("click", async () => {
  const url = buildShareUrl();
  await copyText(url.toString());
  els.copyLinkBtn.textContent = "条件URLをコピーしました";
  setTimeout(() => (els.copyLinkBtn.textContent = "この条件をURLに反映"), 1400);
});

els.loadMoreBtn.addEventListener("click", () => {
  state.visibleLimit += 60;
  render();
});

els.grid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-toggle-favorite]");
  if (button) {
    const id = button.dataset.toggleFavorite;
    toggleFavorite(id, { confirmRemoval: state.favorites.has(String(id)) });
  }
});

els.favoritesList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-favorite]");
  if (button) toggleFavorite(button.dataset.removeFavorite, { confirmRemoval: true });
});

function updateFavoriteQuantity(event, immediate = false) {
  const input = event.target.closest("[data-favorite-quantity]");
  if (!input) return;
  const id = String(input.dataset.favoriteQuantity || "");
  if (!state.favorites.has(id)) return;
  state.favoriteQuantities[id] = Math.max(1, Math.floor(Number(input.value || 1)));
  saveFavorites();
  clearTimeout(favoriteQuantityRenderTimer);
  favoriteQuantityRenderTimer = setTimeout(renderFavorites, immediate ? 0 : 250);
}

els.favoritesList.addEventListener("input", (event) => updateFavoriteQuantity(event));
els.favoritesList.addEventListener("change", (event) => updateFavoriteQuantity(event, true));

els.openFavoritesBtn.addEventListener("click", () => {
  els.favoritesPanel.open = true;
  els.favoritesPanel.scrollIntoView({ behavior: "smooth", block: "start" });
});

els.copyFavoritesBtn.addEventListener("click", async () => {
  await copyText(favoritesMemo());
  els.copyFavoritesBtn.textContent = "コピーしました";
  setTimeout(() => (els.copyFavoritesBtn.textContent = "メモ用にコピー"), 1400);
});

els.exportFavoritesBtn.addEventListener("click", exportFavoritesCsv);

els.exportSearchBtn.addEventListener("click", exportSearchCsv);

els.importSearchInput.addEventListener("change", async () => {
  const file = els.importSearchInput.files?.[0];
  if (!file) return;
  try {
    await importSearchCsv(file);
  } catch (err) {
    window.alert(err?.message || "検索条件CSVを読み込めませんでした。");
    els.importSearchInput.value = "";
  }
});

els.favoriteSearchInput.addEventListener("input", () => {
  state.favoriteQuery = els.favoriteSearchInput.value || "";
  renderFavorites();
});

els.importFavoritesInput.addEventListener("change", async () => {
  const file = els.importFavoritesInput.files?.[0];
  if (!file) return;
  const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const rows = lines.map(parseCsvLine);
  const idIndex = Math.max(0, rows[0]?.findIndex((cell) => cell.trim().toLowerCase() === "id"));
  const quantityIndex = rows[0]?.findIndex((cell) => cell.trim() === "数量") ?? -1;
  const validIds = new Set(state.cards.map((card) => String(card.id)));
  const importedRows = rows.slice(1).filter((row) => validIds.has(String(row[idIndex] || "")));
  const imported = importedRows.map((row) => String(row[idIndex] || ""));
  state.favorites = new Set(imported);
  state.favoriteQuantities = Object.create(null);
  importedRows.forEach((row) => {
    const id = String(row[idIndex] || "");
    state.favoriteQuantities[id] = quantityIndex >= 0 ? Math.max(1, Math.floor(Number(row[quantityIndex] || 1))) : 1;
  });
  saveFavorites();
  render();
  els.favoritesPanel.open = true;
  els.importFavoritesInput.value = "";
});

els.clearFavoritesBtn.addEventListener("click", () => {
  state.favorites.clear();
  state.favoriteQuantities = Object.create(null);
  saveFavorites();
  render();
});

init().catch((err) => {
  console.error(err);
  showStatus("予期しないエラーが発生しました。ブラウザの開発者ツールでコンソールを確認してください。", "error");
});

els.guideButtons.forEach((btn) => {
  btn.addEventListener("click", () => setGuideMode(btn.dataset.guideMode));
});
