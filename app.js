const fmt = new Intl.NumberFormat("ja-JP");

const state = {
  cards: [],
  cardrushStock: Object.create(null),
  shopBuybacks: Object.create(null),
  buybackShops: Object.create(null),
  buybackDates: [],
  psaPopulation: Object.create(null),
  psaHistoryCache: Object.create(null),
  psaServices: null,
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
  minPsaRate: null,
  overallFilter: "all",
  stockDemand: "all",
  fundingOnly: false,
  officialOnly: false,
  sort: "roi-desc",
  q: "",
  visibleLimit: 60,
  favorites: new Set(),
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
  stockDemandInput: document.getElementById("stockDemandInput"),
  fundingOnlyInput: document.getElementById("fundingOnlyInput"),
  officialOnlyInput: document.getElementById("officialOnlyInput"),
  resetFiltersBtn: document.getElementById("resetFiltersBtn"),
  roiInput: document.getElementById("roiInput"),
  psaMinInput: document.getElementById("psaMinInput"),
  psaMaxInput: document.getElementById("psaMaxInput"),
  priceMinInput: document.getElementById("priceMinInput"),
  priceMaxInput: document.getElementById("priceMaxInput"),
  sortInput: document.getElementById("sortInput"),
  grid: document.getElementById("grid"),
  totalStat: document.getElementById("totalStat"),
  countStat: document.getElementById("countStat"),
  topRoiStat: document.getElementById("topRoiStat"),
  topProfitStat: document.getElementById("topProfitStat"),
  updatedAt: document.getElementById("updatedAt"),
  cardrushCoverage: document.getElementById("cardrushCoverage"),
  copyLinkBtn: document.getElementById("copyLinkBtn"),
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
  favoriteCount: document.getElementById("favoriteCount"),
  favoriteCountToolbar: document.getElementById("favoriteCountToolbar"),
  openFavoritesBtn: document.getElementById("openFavoritesBtn"),
  copyFavoritesBtn: document.getElementById("copyFavoritesBtn"),
  exportFavoritesBtn: document.getElementById("exportFavoritesBtn"),
  importFavoritesInput: document.getElementById("importFavoritesInput"),
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
  return `<span class="psa-change ${className}"><b>${days}日 ${escapeHtml(change.s)}</b> ${delta >= 0 ? "+" : ""}${fmt.format(delta)}枚</span>`;
}

function psaGrowthSummary(official) {
  const entry = [[7, official?.w7], [30, official?.w30], [90, official?.w90]].find(([, change]) => change);
  if (!entry) return { label: "推移蓄積中", className: "pending" };
  const [days, change] = entry;
  const className = change.s === "急増化" ? "surge" : change.s === "増加" ? "increase" : change.s === "少ない" ? "small" : "flat";
  return { label: `${days}日 ${change.s}`, className };
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

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

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
    const checkedAt = state.psaServices?.updatedAt ? ` / 料金確認 ${state.psaServices.updatedAt}` : "";
    els.psaPlanSummary.textContent = `公式 ¥${fmt.format(plan.price)}＋手数料 ¥${fmt.format(state.psaHandlingFee)}＝¥${fmt.format(state.fee)} / ${delivery}${lockEstimate} / 申告価格 ¥${fmt.format(plan.declaredValueMax)}以下${checkedAt}`;
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
  "expectedProfit-desc": (a, b) => (b.psaDecision?.expectedProfit ?? -Infinity) - (a.psaDecision?.expectedProfit ?? -Infinity),
  "annualEfficiency-desc": (a, b) => (b.psaDecision?.annualEfficiency ?? -Infinity) - (a.psaDecision?.annualEfficiency ?? -Infinity),
  "capitalShare-asc": (a, b) => (a.psaDecision?.capitalShare ?? Infinity) - (b.psaDecision?.capitalShare ?? Infinity),
  "tx-desc": (a, b) => b.saleTx30d - a.saleTx30d,
  "tx-asc": (a, b) => a.saleTx30d - b.saleTx30d,
  "tx7-desc": (a, b) => b.saleTx7d - a.saleTx7d,
  "tx7-asc": (a, b) => a.saleTx7d - b.saleTx7d,
  "combined30-desc": (a, b) => b.combined30 - a.combined30,
  "combined7-desc": (a, b) => b.combined7 - a.combined7,
  "cardrushDrop30-desc": (a, b) => (b.cardrushDrop30 ?? -Infinity) - (a.cardrushDrop30 ?? -Infinity),
  "cardrushDrop7-desc": (a, b) => (b.cardrushDrop7 ?? -Infinity) - (a.cardrushDrop7 ?? -Infinity),
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

function calcGuideBuyPrice(psa10, hitRate, fee, targetRoi, psa9Rate = 0.75) {
  const roi = targetRoi / 100;
  const numerator = hitRate * psa10 - fee * (1 + roi);
  const denominator = roi + 1 - (1 - hitRate) * psa9Rate;
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
}

function saveFavorites() {
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...state.favorites]));
}

function favoriteGuide(card) {
  const cfg = guideConfig();
  const psa10 = Number(card.snkPsa10Price || card.psa10 || 0);
  const fee = Number(state.fee || 0);
  return {
    ideal: calcGuideBuyPrice(psa10, cfg.hitRate, fee, 20),
    recommended: calcGuideBuyPrice(psa10, cfg.hitRate, fee, 10),
    upper: calcGuideBuyPrice(psa10, cfg.hitRate, fee, 0),
  };
}

function favoriteCards() {
  const byId = new Map(state.cards.map((card) => [String(card.id), card]));
  return [...state.favorites].map((id) => byId.get(id)).filter(Boolean);
}

function renderFavorites() {
  if (!els.favoritesList) return;
  const cards = favoriteCards();
  const cfg = guideConfig();
  if (els.favoriteCount) els.favoriteCount.textContent = fmt.format(cards.length);
  if (els.favoriteCountToolbar) els.favoriteCountToolbar.textContent = fmt.format(cards.length);
  if (els.favoritesHint) {
    els.favoritesHint.textContent = cards.length
      ? `${cfg.label} / PSA鑑定費 ¥${fmt.format(state.fee)}で計算中`
      : "各カードの「仕入れ候補に追加」から登録してください。";
  }
  els.copyFavoritesBtn.disabled = cards.length === 0;
  els.exportFavoritesBtn.disabled = cards.length === 0;
  els.clearFavoritesBtn.disabled = cards.length === 0;
  if (!cards.length) {
    els.favoritesList.innerHTML = '<div class="favorites-empty">まだ仕入れ候補はありません。</div>';
    return;
  }
  els.favoritesList.innerHTML = cards.map((rawCard) => {
    const card = calc(rawCard);
    const guide = favoriteGuide(card);
    const decision = card.psaDecision;
    const name = escapeHtml(String(card.name || "").replace(/\s+/g, " "));
    return `
      <article class="favorite-row" data-favorite-id="${escapeHtml(card.id)}">
        <img src="${escapeHtml(card.img)}" alt="" loading="lazy" />
        <div class="favorite-main">
          <h3>${name}</h3>
          <div class="favorite-decision ${decision?.recommended ? "recommended" : "not-recommended"}">${decision?.recommended ? "PSA提出おすすめ" : "PSA提出おすすめしない"}</div>
          <div class="favorite-prices">
            <div><span>PSA10</span><strong>¥${fmt.format(card.psa10)}</strong></div>
            <div class="recommended"><span>おすすめ以下</span><strong>¥${fmt.format(guide.recommended)}</strong></div>
            <div><span>理想</span><strong>¥${fmt.format(guide.ideal)}</strong></div>
            <div><span>上限</span><strong>¥${fmt.format(guide.upper)}</strong></div>
          </div>
        </div>
        <button class="remove-favorite" type="button" data-remove-favorite="${escapeHtml(card.id)}">解除</button>
      </article>
    `;
  }).join("");
}

function toggleFavorite(id) {
  const key = String(id);
  if (state.favorites.has(key)) state.favorites.delete(key);
  else state.favorites.add(key);
  saveFavorites();
  renderFavorites();
  document.querySelectorAll(`[data-toggle-favorite="${CSS.escape(key)}"]`).forEach((button) => {
    const active = state.favorites.has(key);
    button.classList.toggle("active", active);
    button.textContent = active ? "★ 仕入れ候補に登録済み" : "☆ 仕入れ候補に追加";
    button.setAttribute("aria-pressed", String(active));
  });
}

function favoritesMemo() {
  const cfg = guideConfig();
  const header = `仕入れ候補（${cfg.label}・PSA鑑定費 ¥${fmt.format(state.fee)}）`;
  const rows = favoriteCards().map((rawCard) => {
    const card = calc(rawCard);
    const guide = favoriteGuide(card);
    const decision = card.psaDecision;
    const decisionText = decision?.recommended ? "PSA提出おすすめ" : `PSA提出おすすめしない：${decision?.reasons.join(" / ") || "計算不可"}`;
    return `${String(card.name || "").replace(/\s+/g, " ")}\nおすすめ ¥${fmt.format(guide.recommended)}以下（理想 ¥${fmt.format(guide.ideal)} / 上限 ¥${fmt.format(guide.upper)} / PSA10 ¥${fmt.format(card.psa10)}）\n${decisionText} / 期待利益 ¥${fmt.format(Math.round(decision?.expectedProfit || 0))} / 年換算効率 ${Math.round(decision?.annualEfficiency || 0)}%`;
  });
  return [header, ...rows].join("\n\n");
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
  const rows = [["id", "カード名", "型番", "PSA10価格", "基準", "理想仕入れ", "おすすめ仕入れ", "上限仕入れ", "PSA提出判断", "期待利益", "期待利益率", "年換算資金効率", "資金占有率", "判断理由", "みんトレURL", "カードラッシュURL"]];
  favoriteCards().forEach((rawCard) => {
    const card = calc(rawCard);
    const guide = favoriteGuide(card);
    const decision = card.psaDecision;
    rows.push([card.id, card.name, card.model || "", card.psa10, cfg.label, guide.ideal, guide.recommended, guide.upper, decision?.recommended ? "おすすめ" : "おすすめしない", Math.round(decision?.expectedProfit || 0), Math.round(decision?.expectedRoi || 0), Math.round(decision?.annualEfficiency || 0), Number(decision?.capitalShare || 0).toFixed(1), decision?.reasons.join(" / ") || "", buildTorecaCardUrl(card), card.cardrushUrl || ""]);
  });
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `pokeka-buy-list-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
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
          <p>${cfg.label} / 鑑定費 ¥${fmt.format(fee)} / PSA9換金率 75%</p>
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
    w7: null,
    w30: null,
    w90: null,
  };
}

function buildOverallAssessment(card, official, stock, psaDecision) {
  let score = 50;
  const strengths = [];
  const cautions = [];
  if (card.roi >= 80) { score += 15; strengths.push("利益率が高い"); }
  else if (card.roi >= 40) { score += 10; strengths.push("利益率40%以上"); }
  else if (card.roi < 0) { score -= 20; cautions.push("利益率がマイナス"); }

  if (card.psaTx30d >= 30) { score += 12; strengths.push("PSA10の30日取引が多い"); }
  else if (card.psaTx30d >= 10) { score += 6; strengths.push("PSA10の取引が確認できる"); }
  else if (card.psaTx30d < 3) { score -= 10; cautions.push("PSA10の売れ行きが弱い"); }

  if (card.saleTx30d >= 30 && card.psaTx30d < 5) { score -= 8; cautions.push("美品は動くがPSA10取引が少ない"); }
  else if (card.saleTx30d > 0 && card.psaTx30d / card.saleTx30d >= 0.5) { score += 5; strengths.push("美品取引に対してPSA10需要が強い"); }

  if (Number.isFinite(card.chg30)) {
    if (card.chg30 <= -15) { score -= 6; cautions.push("30日価格が大きく下落"); }
    else if (card.chg30 > 30) { score -= 3; cautions.push("30日価格が急騰し高値追いに注意"); }
    else if (card.chg30 >= -5 && card.chg30 <= 10) { score += 2; strengths.push("30日価格が比較的安定"); }
  }

  if (card.buybackShops >= 3) { score += 8; strengths.push("買取店舗が複数あり換金先が多い"); }
  else if (card.buybackShops >= 1) { score += 3; strengths.push("店舗買取が確認できる"); }
  else { score -= 4; cautions.push("店舗買取データが少ない"); }

  if (stock?.demand === "買う人が多い") { score -= 12; cautions.push("状態A在庫の減少が速くPSA供給増リスク"); }
  else if (stock?.demand === "普通") { score -= 4; cautions.push("状態A在庫が一定ペースで減少"); }
  else if (stock?.demand === "少ない") { score += 4; strengths.push("状態A在庫の減少が緩やか"); }

  const growth = official?.w30?.s;
  if (growth === "急増化") { score -= 10; cautions.push("PSA10枚数が30日で急増"); }
  else if (growth === "増加") { score -= 5; cautions.push("PSA10枚数が30日で増加"); }
  else if (growth === "横ばい") { score += 4; strengths.push("PSA10枚数が30日で横ばい"); }

  if (Number.isFinite(official?.rate)) {
    if (official.rate < 40) { score -= 10; cautions.push("PSA10取得率が40%未満"); }
    else if (official.rate < 60) { score -= 5; cautions.push("PSA10取得率が低め"); }
    else if (official.rate >= 80) { score += 3; strengths.push("PSA10取得率が80%以上"); }

    const hitRate = official.rate / 100;
    const saleMultiplier = Math.max(0, 1 - state.saleFeeRate / 100);
    const officialExpectedSale = hitRate * (card.psa10 * saleMultiplier - state.saleExtraCost)
      + (1 - hitRate) * (card.price * 0.75 * saleMultiplier - state.saleExtraCost);
    const officialExpectedProfit = officialExpectedSale - card.price - state.fee;
    if (officialExpectedProfit >= 20000) { score += 8; strengths.push("公式10率でも期待利益2万円以上"); }
    else if (officialExpectedProfit >= 10000) { score += 4; strengths.push("公式10率でも期待利益1万円以上"); }
    else if (officialExpectedProfit < 0) { score -= 15; cautions.push("公式10率での期待利益がマイナス"); }
  } else {
    cautions.push("PSA公式取得率は未取得");
  }

  if (psaDecision?.recommended) score += 5;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade = score >= 75 ? "A" : score >= 60 ? "B" : score >= 45 ? "C" : "D";
  const label = { A: "積極候補", B: "候補", C: "慎重", D: "見送り" }[grade];
  return { score, grade, label, strengths: strengths.slice(0, 3), cautions: cautions.slice(0, 3) };
}

function calc(card) {
  const torecaPrice = Number(card.price);
  const stock = state.cardrushStock[card.id] || null;
  const rawCardrushPrice = Number(stock?.cardrushPrice);
  const cardrushPrice = rawCardrushPrice > 0 ? rawCardrushPrice : NaN;
  const sourcePrices = [torecaPrice, cardrushPrice].filter((value) => Number.isFinite(value) && value > 0);
  const price = sourcePrices.length
    ? Math.round(sourcePrices.reduce((sum, value) => sum + value, 0) / sourcePrices.length)
    : NaN;
  const psa10 = Number(card.snkPsa10Price);
  const saleTx30d = Number(card.tv30 || 0);
  const saleTx7d = Number(card.tv7 || 0);
  const cardrushDrop30 = Number.isFinite(stock?.drop30) ? Number(stock.drop30) : null;
  const cardrushDrop7 = Number.isFinite(stock?.drop7) ? Number(stock.drop7) : null;
  const combined30 = saleTx30d + (cardrushDrop30 || 0);
  const combined7 = saleTx7d + (cardrushDrop7 || 0);
  const buyback = state.shopBuybacks[card.id] || null;
  const buyback7 = Number(buyback?.total7 || 0);
  const buyback30 = Number(buyback?.total30 || 0);
  const buyback90 = Number(buyback?.total90 || 0);
  const buybackShopValues = Object.values(buyback?.shops || {});
  const latestBuybackDate = buybackShopValues.reduce((latest, shop) => String(shop.priceDate || "") > latest ? String(shop.priceDate) : latest, "");
  const latestBuybackShops = latestBuybackDate ? buybackShopValues.filter((shop) => String(shop.priceDate || "") === latestBuybackDate) : buybackShopValues;
  const buybackPrice = Math.max(0, ...latestBuybackShops.map((shop) => Number(shop.price || 0)));
  const buybackAvg30 = Number(buyback?.avg30 || 0);
  const buybackShops = Number(buyback?.shop30 || 0);
  const psaTx30d = Number(card.p10tv30 || 0);
  const psaTx7d = Number(card.p10tv7 || 0);
  const official = state.psaPopulation[card.id] || null;
  if (!(price > 0) || !(psa10 > 0)) {
    return { ...card, price, torecaPrice, cardrushPrice, psa10, profit: NaN, roi: NaN, psaDecision: null, overallAssessment: null, official, saleTx30d, saleTx7d, psaTx30d, psaTx7d, cardrushDrop30, cardrushDrop7, combined30, combined7, buyback, buyback7, buyback30, buyback90, buybackPrice, buybackAvg30, buybackShops };
  }
  const profit = psa10 - price - state.fee;
  const roiBase = price + state.fee;
  const roi = roiBase > 0 ? (profit / roiBase) * 100 : NaN;
  const hitRate = guideConfig().hitRate;
  const saleMultiplier = Math.max(0, 1 - state.saleFeeRate / 100);
  const psa10Net = psa10 * saleMultiplier - state.saleExtraCost;
  const lowerGradeNet = price * 0.75 * saleMultiplier - state.saleExtraCost;
  const expectedSale = hitRate * psa10Net + (1 - hitRate) * lowerGradeNet;
  const expectedProfit = expectedSale - price - state.fee;
  const expectedRoi = price > 0 ? expectedProfit / price * 100 : NaN;
  const annualEfficiency = price > 0 && state.lockDays > 0 ? expectedRoi * 365 / state.lockDays : NaN;
  const capitalShare = state.psaCapital > 0 ? price / state.psaCapital * 100 : Infinity;
  const availableCapital = Math.max(state.psaCapital - state.lockedCapital, 0);
  const requiredReserve = state.fee * state.submissionCount;
  const reasons = [];
  if (expectedProfit < state.minExpectedProfit) reasons.push(`期待利益が¥${fmt.format(state.minExpectedProfit)}未満`);
  if (expectedRoi < state.minExpectedRoi) reasons.push(`期待利益率が${fmt.format(state.minExpectedRoi)}%未満`);
  if (annualEfficiency < state.minAnnualEfficiency) reasons.push(`年換算効率が${fmt.format(state.minAnnualEfficiency)}%未満`);
  if (capitalShare > state.maxCapitalShare) reasons.push(`資金占有率が${fmt.format(state.maxCapitalShare)}%超`);
  if (price > availableCapital) reasons.push(`現在使える仕入れ資金¥${fmt.format(availableCapital)}を超過`);
  if (state.gradingReserve < requiredReserve) reasons.push("返却時の鑑定費予備資金が不足");
  const psaDecision = { recommended: reasons.length === 0, reasons, expectedSale, expectedProfit, expectedRoi, annualEfficiency, capitalShare, availableCapital, requiredReserve };
  const calculated = { ...card, price, torecaPrice, cardrushPrice, psa10, profit, roi, psaDecision, official, saleTx30d, saleTx7d, psaTx30d, psaTx7d, cardrushDrop30, cardrushDrop7, combined30, combined7, buyback, buyback7, buyback30, buyback90, buybackPrice, buybackAvg30, buybackShops };
  calculated.overallAssessment = buildOverallAssessment(calculated, official, stock, psaDecision);
  return calculated;
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
  const psaRateMin = parseOptionalNumber(url.searchParams.get("psaRate"));
  const overallFilter = url.searchParams.get("overall");
  const stockDemand = url.searchParams.get("stockDemand");
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
  if (psaRateMin != null && psaRateMin >= 0) els.psaRateMinInput.value = String(psaRateMin);
  if (["all", "ab", "a"].includes(overallFilter)) els.overallFilterInput.value = overallFilter;
  if (["all", "steady", "low", "normal", "high", "known"].includes(stockDemand)) els.stockDemandInput.value = stockDemand;
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
  if (state.stockDemand === "all") url.searchParams.delete("stockDemand"); else url.searchParams.set("stockDemand", state.stockDemand);
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

function render() {
  const normalizedQuery = normalize(state.q);
  const compactQuery = compactSearch(state.q);
  const calculated = state.cards.map(calc);
  const roiByPsaPriceBand = new Map();
  calculated.forEach((card) => {
    if (!Number.isFinite(card.roi)) return;
    const key = psaPriceBand(card.psa10).key;
    if (!roiByPsaPriceBand.has(key)) roiByPsaPriceBand.set(key, []);
    roiByPsaPriceBand.get(key).push(card.roi);
  });
  const medianRoiByPsaPriceBand = new Map(
    [...roiByPsaPriceBand].map(([key, values]) => [key, median(values)])
  );
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
      if (state.minPsaRate != null && (!Number.isFinite(card.official?.rate) || card.official.rate < state.minPsaRate)) return false;
      if (state.officialOnly && !Number.isFinite(card.official?.rate)) return false;
      if (state.fundingOnly && !card.psaDecision?.recommended) return false;
      if (state.overallFilter === "a" && card.overallAssessment?.grade !== "A") return false;
      if (state.overallFilter === "ab" && !["A", "B"].includes(card.overallAssessment?.grade)) return false;
      const demand = state.cardrushStock[card.id]?.demand || "蓄積中";
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
  els.topRoiStat.textContent = enriched.length ? `${Math.round(enriched[0].roi)}%` : "-";
  els.topProfitStat.textContent = enriched.length ? `¥${fmt.format(Math.round(enriched[0].profit))}` : "-";
  if (els.updatedAt) {
    els.updatedAt.textContent = meta.updatedAt ? String(meta.updatedAt) : "未設定";
  }
  if (els.cardrushCoverage) {
    const cr = meta.cardrushCoverage;
    els.cardrushCoverage.textContent = cr?.total
      ? `${fmt.format(cr.linked)} / ${fmt.format(cr.total)}（${Number(cr.rate || 0).toFixed(1)}%）`
      : "集計中";
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
    const roiClass = card.roi >= 120 ? "good" : card.roi >= 80 ? "sky" : "warn";
    const priceBand = psaPriceBand(card.psa10);
    const peerMedianRoi = medianRoiByPsaPriceBand.get(priceBand.key) ?? card.roi;
    const roiDifference = card.roi - peerMedianRoi;
    const roiAssessment = roiDifference >= 30 ? "同価格帯よりかなり高い" : roiDifference >= 5 ? "同価格帯より高い" : roiDifference <= -30 ? "同価格帯よりかなり低い" : roiDifference <= -5 ? "同価格帯より低い" : "同価格帯の中央値に近い";
    const roiAssessmentClass = roiDifference >= 5 ? "high" : roiDifference <= -5 ? "low" : "average";
    const roiBandLabel = `PSA10 ¥${fmt.format(priceBand.min)}～¥${fmt.format(priceBand.max - 1)}`;
    const name = card.name.replace(/\s+/g, " ");
    const stock = state.cardrushStock[card.id] || null;
    const snkUrl = card.snkUrl || state.snkrUrlCache[card.id] || buildSnkrUrl(card);
    const snkrDirect = /snkrdunk\.com\/(apparels|trading-cards|products)\/\d+/i.test(snkUrl);
    const detailChips = [
      `<span class="badge sky">PSA10 直近30日 ${fmt.format(card.psaTx30d)}件</span>`,
      `<span class="badge sky">PSA10 直近7日 ${fmt.format(card.psaTx7d)}件</span>`,
      `<span class="badge ${roiClass}">利益率 ${Number.isFinite(card.roi) ? Math.round(card.roi) : 0}%</span>`,
    ].join("");
    const marketLinks = [
      `<a class="market-link toreca" href="${buildTorecaCardUrl(card)}" target="_blank" rel="noreferrer"><span>相場元</span><strong>みんトレ直リンク</strong></a>`,
      `<a class="market-link snkr" href="${snkUrl}" data-snk-link target="_blank" rel="noreferrer"><span>フリマ</span><strong>${snkrDirect ? "スニダン直リンク" : "スニダン検索"}</strong></a>`,
      card.cardrushUrl
        ? `<a class="market-link cardrush" href="${card.cardrushUrl}" target="_blank" rel="noreferrer"><span>ショップ・状態A</span><strong>カードラッシュ直リンク</strong></a>`
        : `<span class="market-link unavailable"><span>ショップ</span><strong>カードラッシュ直リンク未取得</strong></span>`,
    ].join("");
    const demandClass = stock?.demand === "買う人が多い" ? "risk-high" : stock?.demand === "普通" ? "risk-medium" : stock?.demand === "少ない" ? "risk-low" : "pending";
    const demandBadge = stock?.demand && stock.demand !== "蓄積中" ? `<b>在庫減少ペース：${stock.demand}</b>` : "";
    const avgStock = (value) => Number.isFinite(value) ? `${Number(value).toFixed(2)}枚/日` : "-";
    const dropStock = (value) => Number.isFinite(value) ? `${fmt.format(Number(value))}枚` : "-";
    const combinedMovement = (tx, drop) => Number.isFinite(drop) ? `${fmt.format(tx + Number(drop))}件相当` : "-";
    const stockPanel = card.cardrushUrl
      ? `
          <div class="stock-panel ${demandClass}">
            <div class="stock-title">
              <div><span>カードラッシュ状態A 在庫</span><strong>${Number.isFinite(stock?.stock) ? `${fmt.format(stock.stock)}枚` : "-"}</strong><small>在庫減少ペースです。速いほどPSA供給増による相場下落リスクを高く見て、赤く表示します。</small></div>
              ${demandBadge}
            </div>
            <div class="stock-averages">
              <div><span>7日平均減少</span><strong>${avgStock(stock?.avg7)}</strong></div>
              <div><span>30日平均減少</span><strong>${avgStock(stock?.avg30)}</strong></div>
              <div><span>90日平均減少</span><strong>${avgStock(stock?.avg90)}</strong></div>
            </div>
          </div>
        `
      : "";
    const buybackShopRows = Object.entries(card.buyback?.shops || {})
      .sort(([, a], [, b]) => String(b.priceDate || "").localeCompare(String(a.priceDate || "")) || Number(b.price || 0) - Number(a.price || 0) || Number(b.avg30 || 0) - Number(a.avg30 || 0))
      .map(([shopId, shop], index) => {
      const shopMeta = state.buybackShops[shopId] || { name: shopId, url: "" };
      const comparisonClass = shop.comparison === "他店より高い" ? "high" : shop.comparison === "他店より安い" ? "low" : shop.comparison === "他店平均くらい" ? "average" : "pending";
      const comparisonText = shop.diffPct == null ? shop.comparison : `${shop.comparison}（${shop.diffPct >= 0 ? "+" : ""}${fmt.format(shop.diffPct)}%）`;
      const priceDateLabel = shop.priceDate ? `(${escapeHtml(shop.priceDate.slice(5).replace("-", "/"))})` : "";
      const shopUrl = shop.url || shopMeta.url;
      const shopName = shopUrl
        ? `<a href="${escapeHtml(shopUrl)}" target="_blank" rel="noreferrer">${escapeHtml(shopMeta.name)} ${shop.url ? "商品・検索" : "買取表"}</a>`
        : escapeHtml(shopMeta.name);
      const leadLabel = index === 0 ? `<em class="buyback-lead-label">${shop.price ? "最新日優先" : "掲載店舗"}</em>` : "";
      return `<div class="buyback-shop-row ${index === 0 ? "buyback-shop-primary" : ""}"><div>${leadLabel}<strong>${shopName}</strong></div><div><span>7日</span><b>${fmt.format(shop.c7)}回</b></div><div><span>30日</span><b>${fmt.format(shop.c30)}回</b></div><div><span>90日</span><b>${fmt.format(shop.c90)}回</b></div><div><span>最新${priceDateLabel} / 30日平均</span><b>${shop.price ? `¥${fmt.format(shop.price)}` : "-"} / ${shop.avg30 ? `¥${fmt.format(shop.avg30)}` : "-"}</b><small class="buyback-comparison ${comparisonClass}">${escapeHtml(comparisonText || "比較店舗蓄積中")}</small></div></div>`;
    });
    const buybackPrimaryShop = buybackShopRows[0] || "";
    const buybackOtherShops = buybackShopRows.length > 1
      ? `<details class="buyback-other-shops"><summary>その他 ${fmt.format(buybackShopRows.length - 1)}店舗の買取価格を見る</summary><div class="buyback-shops">${buybackShopRows.slice(1).join("")}</div></details>`
      : "";
    const buybackPanel = card.buyback ? `
      <div class="buyback-panel">
        <div class="buyback-head">
          <div><span>ショップPSA10買取表</span><strong>${escapeHtml(card.buyback.demand || "蓄積中")}</strong></div>
          <small>${fmt.format(state.buybackDates.length)}日分を蓄積 / 店舗別と合計</small>
        </div>
        <div class="buyback-shops buyback-primary-shop">${buybackPrimaryShop}</div>
        ${buybackOtherShops}
        <div class="buyback-total"><span>全店舗合計</span><b>7日 ${fmt.format(card.buyback7)}回 / ${fmt.format(card.buyback.shop7 || 0)}店</b><b>30日 ${fmt.format(card.buyback30)}回 / ${fmt.format(card.buyback.shop30 || 0)}店</b><b>90日 ${fmt.format(card.buyback90)}回 / ${fmt.format(card.buyback.shop90 || 0)}店</b></div>
        <div class="buyback-price-averages"><span>全店舗平均買取</span><b>7日 ${card.buyback.avg7 ? `¥${fmt.format(card.buyback.avg7)}` : "-"}</b><b>30日 ${card.buyback.avg30 ? `¥${fmt.format(card.buyback.avg30)}` : "-"}</b><b>90日 ${card.buyback.avg90 ? `¥${fmt.format(card.buyback.avg90)}` : "-"}</b></div>
      </div>
    ` : "";
    const activityPanel = `
      <div class="activity-panel">
        <div class="activity-head"><strong>美品の動き</strong><span>取引件数 / 確認できた在庫減</span></div>
        <div class="activity-grid">
          <div><span>直近7日</span><strong>みんトレ ${fmt.format(card.saleTx7d)}件</strong><small>カードラッシュ ${dropStock(stock?.drop7)} / 参考合計 ${combinedMovement(card.saleTx7d, stock?.drop7)}</small></div>
          <div><span>直近30日</span><strong>みんトレ ${fmt.format(card.saleTx30d)}件</strong><small>カードラッシュ ${dropStock(stock?.drop30)} / 参考合計 ${combinedMovement(card.saleTx30d, stock?.drop30)}</small></div>
        </div>
      </div>
    `;
    const cardrushPriceText = Number.isFinite(card.cardrushPrice) ? `¥${fmt.format(card.cardrushPrice)}` : "未取得";
    const favoriteActive = state.favorites.has(String(card.id));
    const psaDecision = card.psaDecision;
    const decisionClass = psaDecision?.recommended ? "recommended" : "not-recommended";
    const decisionTitle = psaDecision?.recommended ? "資金面：提出候補" : "資金面：見送り";
    const decisionReasons = psaDecision?.recommended ? "設定した利益・資金効率の基準をすべて満たしています" : (psaDecision?.reasons || []).join(" / ");
    const psaDecisionPanel = psaDecision ? `
      <div class="psa-decision ${decisionClass}">
        <div class="psa-decision-head"><strong>${decisionTitle}</strong><span>設定資金・${guideConfig().label}・ロック${fmt.format(state.lockDays)}日</span></div>
        <div class="psa-decision-metrics">
          <div><span>期待利益</span><strong>¥${fmt.format(Math.round(psaDecision.expectedProfit))}</strong></div>
          <div><span>期待利益率</span><strong>${Math.round(psaDecision.expectedRoi)}%</strong></div>
          <div><span>年換算効率</span><strong>${Math.round(psaDecision.annualEfficiency)}%</strong></div>
          <div><span>資金占有率</span><strong>${Number.isFinite(psaDecision.capitalShare) ? psaDecision.capitalShare.toFixed(1) : "-"}%</strong></div>
        </div>
        <p>${escapeHtml(decisionReasons)}</p>
      </div>
    ` : "";
    const overall = card.overallAssessment;
    const overallReasons = overall
      ? [...overall.strengths.map((reason) => `○ ${reason}`), ...overall.cautions.map((reason) => `△ ${reason}`)].join(" / ")
      : "";
    const overallPanel = overall ? `
      <div class="overall-assessment grade-${overall.grade.toLowerCase()}">
        <div><span>総合評価</span><strong>${overall.grade}・${overall.label}</strong><b>${overall.score}点</b></div>
        <p>${escapeHtml(overallReasons || "判定材料を蓄積中")}</p>
        <small>利益・PSA10売れ行き・状態A在庫減・PSA増加・店舗買取を総合。絶版状況と出品者集中は未反映です。</small>
      </div>
    ` : "";
    const official = card.official;
    const psaGrowth = official ? psaGrowthSummary(official) : null;
    const officialPsaPanel = official?.bundle ? `
      <div class="psa-official psa-bundle">
        <div class="psa-bundle-head"><span>PSA公式・4枚セット換算</span><strong>4枚すべてPSA10 推定 ${Number(official.rate).toFixed(1)}%</strong></div>
        <div class="psa-bundle-parts">${official.parts.map((part) => `<span>${escapeHtml(part.label)}：${Number(part.rate).toFixed(1)}%</span>`).join("")}</div>
        <small>各パーツの公式10取得率を掛け合わせた独立近似です。美品価格・PSA10価格は4枚セット合計のまま計算します。</small>
      </div>
    ` : official ? `
      <details class="psa-official" data-psa-history="${escapeHtml(card.id)}" data-psa-shard="${escapeHtml(official.sh)}">
        <summary>
          <div><span>PSA公式Population</span><strong>PSA10取得率 ${Number(official.rate || 0).toFixed(1)}%</strong></div>
          <div class="psa-summary-actions"><b class="psa-growth ${psaGrowth.className}">PSA10増加 ${escapeHtml(psaGrowth.label)}</b><b>数値を見る</b></div>
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
            <button class="favorite-toggle ${favoriteActive ? "active" : ""}" type="button" data-toggle-favorite="${card.id}" aria-pressed="${favoriteActive}">${favoriteActive ? "★ 仕入れ候補に登録済み" : "☆ 仕入れ候補に追加"}</button>
          </div>

          <div class="badges">
            ${detailChips}
          </div>

          <div class="metrics market-summary">
            <div class="metric metric-primary"><span>平均美品価格</span><strong>¥${fmt.format(card.price)}</strong><small>みんトレ状態A ¥${fmt.format(card.torecaPrice)} / カードラッシュ状態A ${cardrushPriceText}</small></div>
            <div class="metric"><span>PSA10相場</span><strong>¥${fmt.format(card.psa10)}</strong><small>みんトレPSA10</small></div>
            <div class="metric"><span>PSA鑑定費</span><strong>¥${fmt.format(state.fee)}</strong></div>
            <div class="metric"><span>利益額</span><strong>¥${fmt.format(Math.round(card.profit))}</strong></div>
          </div>

          ${stockPanel}
          ${buybackPanel}
          ${activityPanel}
          ${overallPanel}
          ${psaDecisionPanel}
          ${officialPsaPanel}

          <div class="market-links" aria-label="外部サイトへの直リンク">
            <div class="market-links-title">商品ページ</div>
            <div class="market-links-grid">${marketLinks}</div>
          </div>

          <div class="profit">
            <div class="profit-head">
              <div class="k">利益率</div>
              <div class="v">${Number.isFinite(card.roi) ? Math.round(card.roi) : 0}%</div>
            </div>
            <div class="profit-assessment ${roiAssessmentClass}" title="${roiBandLabel}の利益率中央値 ${Math.round(peerMedianRoi)}% と比較">${roiAssessment} <span>${roiDifference >= 0 ? "+" : ""}${Math.round(roiDifference)}pt</span><small>${roiBandLabel}・中央値 ${Math.round(peerMedianRoi)}%</small></div>
          </div>

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
  state.minPsaRate = parseOptionalNumber(els.psaRateMinInput.value);
  state.overallFilter = els.overallFilterInput.value || "all";
  state.stockDemand = els.stockDemandInput.value || "all";
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
    const available = Math.max(state.psaCapital - state.lockedCapital, 0);
    els.capitalAvailabilityStatus.className = available > 0 ? "enough" : "short";
    els.capitalAvailabilityStatus.textContent = `現在使える仕入れ資金 ¥${fmt.format(available)}（運用予算 ¥${fmt.format(state.psaCapital)} − 仕入れ・鑑定中 ¥${fmt.format(state.lockedCapital)}）`;
  }
  if (els.gradingReserveStatus) {
    const required = state.fee * state.submissionCount;
    const enough = state.gradingReserve >= required;
    els.gradingReserveStatus.className = enough ? "enough" : "short";
    els.gradingReserveStatus.textContent = `返却時必要額 ¥${fmt.format(required)} / ${enough ? "予備資金内" : `あと¥${fmt.format(required - state.gradingReserve)}不足`}`;
  }
  render();
  updateUrl();
}

async function init() {
  readUrl();
  loadFavorites();
  try {
    state.psaServices = await fetchJsonMaybe("./data/psa-japan-services.json");
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
    const buybackData = await fetchJsonMaybe("./data/shop-buyback-summary.json");
    state.shopBuybacks = buybackData?.cards || Object.create(null);
    state.buybackShops = buybackData?.shops || Object.create(null);
    state.buybackDates = buybackData?.dates || [];
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

[els.qInput, els.saleTxMinInput, els.saleTxMaxInput, els.saleTx7MinInput, els.saleTx7MaxInput, els.psaTxMinInput, els.psaTxMaxInput, els.psaTx7MinInput, els.psaTx7MaxInput, els.buyback7MinInput, els.buyback7MaxInput, els.buyback30MinInput, els.buyback30MaxInput, els.buyback90MinInput, els.buyback90MaxInput, els.buybackShopsMinInput, els.buybackPriceMinInput, els.buybackPriceMaxInput, els.roiInput, els.psaMinInput, els.psaMaxInput, els.priceMinInput, els.priceMaxInput, els.psaRateMinInput, els.overallFilterInput, els.stockDemandInput, els.fundingOnlyInput, els.officialOnlyInput, els.sortInput, els.psaCapitalInput, els.lockedCapitalInput, els.lockDaysInput, els.minExpectedProfitInput, els.minExpectedRoiInput, els.minAnnualEfficiencyInput, els.maxCapitalShareInput, els.submissionCountInput, els.gradingReserveInput, els.saleFeeRateInput, els.saleExtraCostInput].forEach((el) =>
  el.addEventListener("input", syncFromUI)
);

els.resetFiltersBtn.addEventListener("click", () => {
  els.qInput.value = "";
  els.saleTxMinInput.value = "30";
  [els.saleTxMaxInput, els.saleTx7MaxInput, els.psaTxMaxInput, els.psaTx7MaxInput, els.buyback7MaxInput, els.buyback30MaxInput, els.buyback90MaxInput, els.buybackPriceMinInput, els.buybackPriceMaxInput, els.priceMinInput, els.priceMaxInput, els.psaRateMinInput].forEach((el) => { el.value = ""; });
  [els.saleTx7MinInput, els.psaTxMinInput, els.psaTx7MinInput, els.buyback7MinInput, els.buyback30MinInput, els.buyback90MinInput, els.buybackShopsMinInput, els.psaMinInput].forEach((el) => { el.value = "0"; });
  els.roiInput.value = "40";
  els.psaMaxInput.value = "200000";
  els.overallFilterInput.value = "all";
  els.stockDemandInput.value = "all";
  els.fundingOnlyInput.checked = false;
  els.officialOnlyInput.checked = false;
  els.sortInput.value = "roi-desc";
  syncFromUI();
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
  if (button) toggleFavorite(button.dataset.toggleFavorite);
});

els.favoritesList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-favorite]");
  if (button) toggleFavorite(button.dataset.removeFavorite);
});

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

els.importFavoritesInput.addEventListener("change", async () => {
  const file = els.importFavoritesInput.files?.[0];
  if (!file) return;
  const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const rows = lines.map(parseCsvLine);
  const idIndex = Math.max(0, rows[0]?.findIndex((cell) => cell.trim().toLowerCase() === "id"));
  const validIds = new Set(state.cards.map((card) => String(card.id)));
  const imported = rows.slice(1).map((row) => String(row[idIndex] || "")).filter((id) => validIds.has(id));
  state.favorites = new Set(imported);
  saveFavorites();
  render();
  els.favoritesPanel.open = true;
  els.importFavoritesInput.value = "";
});

els.clearFavoritesBtn.addEventListener("click", () => {
  state.favorites.clear();
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
