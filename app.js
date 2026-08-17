const fmt = new Intl.NumberFormat("ja-JP");

const state = {
  cards: [],
  snkrUrlCache: Object.create(null),
  cardById: Object.create(null),
  snkrObserver: null,
  hiddenDecisions: {
    valuable: false,
    watch: false,
    avoid: false,
  },
  fee: 13000,
  guideMode: "70",
  minSaleTx: 30,
  maxSaleTx: null,
  minSaleTx7: 0,
  maxSaleTx7: null,
  minPsaTx: 0,
  maxPsaTx: null,
  minPsaTx7: 0,
  maxPsaTx7: null,
  minRoi: 40,
  minPsa10: 0,
  maxPsa10: 200000,
  minPrice: null,
  maxPrice: null,
  sort: "roi-desc",
  q: "",
};

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
  saleTxMinInput: document.getElementById("saleTxMinInput"),
  saleTxMaxInput: document.getElementById("saleTxMaxInput"),
  saleTx7MinInput: document.getElementById("saleTx7MinInput"),
  saleTx7MaxInput: document.getElementById("saleTx7MaxInput"),
  psaTxMinInput: document.getElementById("psaTxMinInput"),
  psaTxMaxInput: document.getElementById("psaTxMaxInput"),
  psaTx7MinInput: document.getElementById("psaTx7MinInput"),
  psaTx7MaxInput: document.getElementById("psaTx7MaxInput"),
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
  copyLinkBtn: document.getElementById("copyLinkBtn"),
  guidePanels: document.getElementById("guidePanels"),
  guideHitRateStat: document.getElementById("guideHitRateStat"),
  guidePsa9RateStat: document.getElementById("guidePsa9RateStat"),
  guideFeeStat: document.getElementById("guideFeeStat"),
  guideButtons: [...document.querySelectorAll("[data-guide-mode]")],
  decisionButtons: [...document.querySelectorAll("[data-hide-decision]")],
};

function showStatus(message, kind = "info") {
  els.grid.innerHTML = `
    <div class="card" style="padding:20px">
      <h3 style="margin:0 0 8px">${kind === "error" ? "読み込みできません" : "案内"}</h3>
      <p style="margin:0;color:var(--muted);white-space:pre-wrap">${message}</p>
    </div>
  `;
}

const sorters = {
  "roi-desc": (a, b) => b.roi - a.roi,
  "roi-asc": (a, b) => a.roi - b.roi,
  "profit-desc": (a, b) => b.profit - a.profit,
  "profit-asc": (a, b) => a.profit - b.profit,
  "tx-desc": (a, b) => b.saleTx30d - a.saleTx30d,
  "tx-asc": (a, b) => a.saleTx30d - b.saleTx30d,
  "tx7-desc": (a, b) => b.saleTx7d - a.saleTx7d,
  "tx7-asc": (a, b) => a.saleTx7d - b.saleTx7d,
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

function buildSnkrUrl(card) {
  const query = String(card.name || card.psaQuery || "")
    .split("[")[0]
    .trim();
  if (!query) return "https://snkrdunk.com/search/";
  return `https://snkrdunk.com/search?brandId=pokemon&categoryId=25&isUnderRetail=false&keywords=${encodeURIComponent(query)}`;
}

function buildTorecaCardUrl(card) {
  return card.pageUrl || `https://toreca-souba.com/cards/${card.id}`;
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
    /snkrdunk\.com\/(?:apparels|trading-cards|products)\/\d+(?:\/used\/\d+)?/gi,
    /https?:\/\/snkrdunk\.com\/(?:apparels|trading-cards|products)\/\d+(?:\/used\/\d+)?/gi,
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
  if (card.snkUrl) {
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
  link.textContent = /snkrdunk\.com\/(apparels|trading-cards|products)\/\d+/i.test(url) ? "スニダン商品" : "スニダンで探す";
}

function decisionFilterKey(card) {
  const decision = decisionLabel(card);
  if (decision === "出す価値あり") return "valuable";
  if (decision === "様子見") return "watch";
  return "avoid";
}

function syncDecisionButtons() {
  els.decisionButtons.forEach((btn) => {
    const key = btn.dataset.hideDecision;
    const hidden = !!state.hiddenDecisions[key];
    btn.classList.toggle("active", hidden);
    const baseLabel =
      key === "valuable" ? "出す価値あり" : key === "watch" ? "様子見" : "出さない";
    btn.textContent = hidden ? `${baseLabel}を表示` : `${baseLabel}を非表示`;
    btn.setAttribute("aria-pressed", hidden ? "true" : "false");
  });
}

function setDecisionHidden(key, hidden) {
  if (!(key in state.hiddenDecisions)) return;
  state.hiddenDecisions[key] = hidden;
  syncDecisionButtons();
  render();
  updateUrl();
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
  syncGuideButtons();
  renderGuide();
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

function calc(card) {
  const price = Number(card.price);
  const psa10 = Number(card.snkPsa10Price);
  const saleTx30d = Number(card.tv30 || 0);
  const saleTx7d = Number(card.tv7 || 0);
  const psaTx30d = Number(card.p10tv30 || 0);
  const psaTx7d = Number(card.p10tv7 || 0);
  if (!(price > 0) || !(psa10 > 0)) {
    return { ...card, price, psa10, profit: NaN, roi: NaN, saleTx30d, saleTx7d, psaTx30d, psaTx7d };
  }
  const profit = psa10 - price - state.fee;
  const roiBase = price + state.fee;
  const roi = roiBase > 0 ? (profit / roiBase) * 100 : NaN;
  return { ...card, price, psa10, profit, roi, saleTx30d, saleTx7d, psaTx30d, psaTx7d };
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
  const saleTx = parseOptionalNumber(url.searchParams.get("tx"));
  const saleTxMax = parseOptionalNumber(url.searchParams.get("txMax"));
  const saleTx7 = parseOptionalNumber(url.searchParams.get("tx7"));
  const saleTx7Max = parseOptionalNumber(url.searchParams.get("tx7Max"));
  const psaTx = parseOptionalNumber(url.searchParams.get("psaTx"));
  const psaTxMax = parseOptionalNumber(url.searchParams.get("psaTxMax"));
  const psaTx7 = parseOptionalNumber(url.searchParams.get("psaTx7"));
  const psaTx7Max = parseOptionalNumber(url.searchParams.get("psaTx7Max"));
  const roi = parseOptionalNumber(url.searchParams.get("roi"));
  const psaMin = parseOptionalNumber(url.searchParams.get("psaMin"));
  const psaMax = parseOptionalNumber(url.searchParams.get("psaMax"));
  const priceMin = parseOptionalNumber(url.searchParams.get("priceMin"));
  const priceMax = parseOptionalNumber(url.searchParams.get("priceMax"));
  const sort = url.searchParams.get("sort");
  const q = url.searchParams.get("q");
  const hide = String(url.searchParams.get("hide") || "");
  const hidden = new Set(hide.split(",").map((v) => v.trim()).filter(Boolean));
  if (guide && guideModes[guide]) {
    state.guideMode = guide;
  }
  syncGuideButtons();
  state.hiddenDecisions.valuable = hidden.has("valuable");
  state.hiddenDecisions.watch = hidden.has("watch");
  state.hiddenDecisions.avoid = hidden.has("avoid");
  syncDecisionButtons();
  if (fee != null && fee >= 0) els.feeInput.value = String(fee);
  if (saleTx != null && saleTx >= 0) els.saleTxMinInput.value = String(saleTx);
  if (saleTxMax != null && saleTxMax >= 0) els.saleTxMaxInput.value = String(saleTxMax);
  if (saleTx7 != null && saleTx7 >= 0) els.saleTx7MinInput.value = String(saleTx7);
  if (saleTx7Max != null && saleTx7Max >= 0) els.saleTx7MaxInput.value = String(saleTx7Max);
  if (psaTx != null && psaTx >= 0) els.psaTxMinInput.value = String(psaTx);
  if (psaTxMax != null && psaTxMax >= 0) els.psaTxMaxInput.value = String(psaTxMax);
  if (psaTx7 != null && psaTx7 >= 0) els.psaTx7MinInput.value = String(psaTx7);
  if (psaTx7Max != null && psaTx7Max >= 0) els.psaTx7MaxInput.value = String(psaTx7Max);
  if (roi != null && roi >= 0) els.roiInput.value = String(roi);
  if (psaMin != null && psaMin >= 0) els.psaMinInput.value = String(psaMin);
  if (psaMax != null && psaMax >= 0) els.psaMaxInput.value = String(psaMax);
  if (priceMin != null) els.priceMinInput.value = String(priceMin);
  if (priceMax != null) els.priceMaxInput.value = String(priceMax);
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
  url.searchParams.set("tx", String(state.minSaleTx));
  if (state.maxSaleTx == null) url.searchParams.delete("txMax"); else url.searchParams.set("txMax", String(state.maxSaleTx));
  url.searchParams.set("tx7", String(state.minSaleTx7));
  if (state.maxSaleTx7 == null) url.searchParams.delete("tx7Max"); else url.searchParams.set("tx7Max", String(state.maxSaleTx7));
  url.searchParams.set("psaTx", String(state.minPsaTx));
  if (state.maxPsaTx == null) url.searchParams.delete("psaTxMax"); else url.searchParams.set("psaTxMax", String(state.maxPsaTx));
  url.searchParams.set("psaTx7", String(state.minPsaTx7));
  if (state.maxPsaTx7 == null) url.searchParams.delete("psaTx7Max"); else url.searchParams.set("psaTx7Max", String(state.maxPsaTx7));
  url.searchParams.set("roi", String(state.minRoi));
  url.searchParams.set("psaMin", String(state.minPsa10));
  url.searchParams.set("psaMax", String(state.maxPsa10));
  url.searchParams.set("sort", state.sort);
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
  const hidden = Object.entries(state.hiddenDecisions)
    .filter(([, value]) => value)
    .map(([key]) => key);
  if (hidden.length) {
    url.searchParams.set("hide", hidden.join(","));
  } else {
    url.searchParams.delete("hide");
  }
  return url;
}

function render() {
  const normalizedQuery = normalize(state.q);
  const compactQuery = compactSearch(state.q);
  const enriched = state.cards
    .map(calc)
    .filter((card) => {
      const decision = decisionLabel(card);
      const decisionKey = decisionFilterKey(card);
      const haystack = normalize(`${card.name} ${card.model} ${card.rarity} ${card.id} ${card.psaQuery || ""} ${decision}`);
      const compactHaystack = compactSearch(`${card.name} ${card.model} ${card.rarity} ${card.id} ${card.psaQuery || ""} ${decision}`);
      if (card.saleTx30d < state.minSaleTx) return false;
      if (state.maxSaleTx != null && card.saleTx30d > state.maxSaleTx) return false;
      if (card.saleTx7d < state.minSaleTx7) return false;
      if (state.maxSaleTx7 != null && card.saleTx7d > state.maxSaleTx7) return false;
      if (card.psaTx30d < state.minPsaTx) return false;
      if (state.maxPsaTx != null && card.psaTx30d > state.maxPsaTx) return false;
      if (card.psaTx7d < state.minPsaTx7) return false;
      if (state.maxPsaTx7 != null && card.psaTx7d > state.maxPsaTx7) return false;
      if (!Number.isFinite(card.roi) || card.roi < state.minRoi) return false;
      if (card.psa10 < state.minPsa10) return false;
      if (card.psa10 > state.maxPsa10) return false;
      if (state.minPrice != null && card.price < state.minPrice) return false;
      if (state.maxPrice != null && card.price > state.maxPrice) return false;
      if (state.hiddenDecisions[decisionKey]) return false;
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
  renderGuide();

  state.cardById = Object.create(null);
  els.grid.innerHTML = enriched.map((card) => {
    state.cardById[card.id] = card;
    const roiClass = card.roi >= 120 ? "good" : card.roi >= 80 ? "sky" : "warn";
    const width = Math.max(8, Math.min(100, card.roi));
    const name = card.name.replace(/\s+/g, " ");
    const decision = decisionLabel(card);
    const psaQuery = card.psaQuery || "";
    const snkUrl = card.snkUrl || state.snkrUrlCache[card.id] || buildSnkrUrl(card);
    return `
      <article class="row card" data-card-id="${card.id}">
        <div class="thumb">
          <img src="${card.img}" alt="${name}" loading="lazy" />
          <div class="series">${card.rarity ? card.rarity : card.model}</div>
        </div>
        <div class="content">
          <div class="headline">
            <div>
              <h3>${name}</h3>
              <p>PSA10相場と美品価格の差から、鑑定費 ${fmt.format(state.fee)} 円を差し引いて判定しています。</p>
            </div>
            <a class="link-badge" href="https://toreca-souba.com/cards/${card.id}" target="_blank" rel="noreferrer">元ページを開く</a>
          </div>

          <div class="badges">
            <span class="badge sky">美品 直近30日 ${fmt.format(card.saleTx30d)}件</span>
            <span class="badge sky">美品 直近7日 ${fmt.format(card.saleTx7d)}件</span>
            <span class="badge sky">PSA10 直近30日 ${fmt.format(card.psaTx30d)}件</span>
            <span class="badge sky">PSA10 直近7日 ${fmt.format(card.psaTx7d)}件</span>
            <span class="badge warn">仕入れ判定 ${decision}</span>
            <span class="badge">PSA検索語 ${psaQuery || "未設定"}</span>
            <a class="link-badge" href="${snkUrl}" data-snk-link target="_blank" rel="noreferrer">スニダンで探す</a>
            <span class="badge">カテゴリ ポケモン</span>
            <span class="badge ${roiClass}">利益率 ${Number.isFinite(card.roi) ? Math.round(card.roi) : 0}%</span>
          </div>

          <div class="metrics">
            <div class="metric"><span>美品</span><strong>¥${fmt.format(card.price)}</strong></div>
            <div class="metric"><span>PSA10</span><strong>¥${fmt.format(card.psa10)}</strong></div>
            <div class="metric"><span>鑑定費</span><strong>¥${fmt.format(state.fee)}</strong></div>
            <div class="metric"><span>利益額</span><strong>¥${fmt.format(Math.round(card.profit))}</strong></div>
          </div>

          <div class="profit">
            <div class="profit-head">
              <div class="k">利益率</div>
              <div class="v">${Number.isFinite(card.roi) ? Math.round(card.roi) : 0}%</div>
            </div>
            <div class="bar"><span style="width:${width}%"></span></div>
            <div class="note">計算式: (PSA10相場 - 美品価格 - 鑑定費) ÷ (美品価格 + 鑑定費) × 100</div>
          </div>

        </div>
      </article>
    `;
  }).join("");

  const observer = ensureSnkrObserver();
  [...els.grid.querySelectorAll("[data-card-id]")].forEach((el) => observer.observe(el));
}

function decisionLabel(card) {
  if (!Number.isFinite(card.roi)) return "様子見";
  if (card.roi >= 40) return "出す価値あり";
  if (card.roi >= 0) return "様子見";
  return "出さない";
}

function syncFromUI() {
  state.fee = Number(els.feeInput.value || 0);
  state.minSaleTx = Number(els.saleTxMinInput.value || 0);
  state.maxSaleTx = parseOptionalNumber(els.saleTxMaxInput.value);
  state.minSaleTx7 = Number(els.saleTx7MinInput.value || 0);
  state.maxSaleTx7 = parseOptionalNumber(els.saleTx7MaxInput.value);
  state.minPsaTx = Number(els.psaTxMinInput.value || 0);
  state.maxPsaTx = parseOptionalNumber(els.psaTxMaxInput.value);
  state.minPsaTx7 = Number(els.psaTx7MinInput.value || 0);
  state.maxPsaTx7 = parseOptionalNumber(els.psaTx7MaxInput.value);
  state.minRoi = Number(els.roiInput.value || 0);
  state.minPsa10 = Number(els.psaMinInput.value || 0);
  state.maxPsa10 = Number(els.psaMaxInput.value || 0);
  state.minPrice = parseOptionalNumber(els.priceMinInput.value);
  state.maxPrice = parseOptionalNumber(els.priceMaxInput.value);
  state.sort = els.sortInput.value;
  state.q = els.qInput.value.trim();
  render();
  updateUrl();
}

async function init() {
  readUrl();
  try {
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
    syncFromUI();
  } catch (err) {
    console.error(err);
    showStatus(
      "カード一覧の読み込みに失敗しました。\n\nこのサイトは `data/pokemon-cards.json` と `data/pokemon-cards-meta.json` を読み込んでいます。`index.html` をファイル直開きすると、ブラウザの制限で JSON の読み込みが止まることがあります。\n\nおすすめ:\n1. GitHub Pages 上で開く\n2. ローカルなら簡易サーバー経由で開く\n   例: `python -m http.server 8000` のように同じフォルダを配信してから `http://localhost:8000/` を開く\n\nもし GitHub Pages に置いたのに出ない場合は、更新後の URL とコンソールエラーを見ます。",
      "error"
    );
  }
}

[els.qInput, els.feeInput, els.saleTxMinInput, els.saleTxMaxInput, els.saleTx7MinInput, els.saleTx7MaxInput, els.psaTxMinInput, els.psaTxMaxInput, els.psaTx7MinInput, els.psaTx7MaxInput, els.roiInput, els.psaMinInput, els.psaMaxInput, els.priceMinInput, els.priceMaxInput, els.sortInput].forEach((el) =>
  el.addEventListener("input", syncFromUI)
);

els.copyLinkBtn.addEventListener("click", async () => {
  const url = buildShareUrl();
  await navigator.clipboard.writeText(url.toString());
  els.copyLinkBtn.textContent = "条件URLをコピーしました";
  setTimeout(() => (els.copyLinkBtn.textContent = "この条件をURLに反映"), 1400);
});

init().catch((err) => {
  console.error(err);
  showStatus("予期しないエラーが発生しました。ブラウザの開発者ツールでコンソールを確認してください。", "error");
});

els.guideButtons.forEach((btn) => {
  btn.addEventListener("click", () => setGuideMode(btn.dataset.guideMode));
});

els.decisionButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.hideDecision;
    setDecisionHidden(key, !state.hiddenDecisions[key]);
  });
});
