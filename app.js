const fmt = new Intl.NumberFormat("ja-JP");

const state = {
  cards: [],
  fee: 13000,
  minTx: 30,
  minTx7: 0,
  minRoi: 40,
  minPsa10: 0,
  maxPsa10: 200000,
  minPrice: null,
  maxPrice: null,
  sort: "roi-desc",
  q: "",
};

const meta = window.POKEMON_CARDS_META || {};

const els = {
  qInput: document.getElementById("qInput"),
  feeInput: document.getElementById("feeInput"),
  txInput: document.getElementById("txInput"),
  tx7Input: document.getElementById("tx7Input"),
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
  "tx-desc": (a, b) => b.tx30d - a.tx30d,
  "tx-asc": (a, b) => a.tx30d - b.tx30d,
  "tx7-desc": (a, b) => b.tx7d - a.tx7d,
  "tx7-asc": (a, b) => a.tx7d - b.tx7d,
  "psa-desc": (a, b) => b.psa10 - a.psa10,
  "psa-asc": (a, b) => a.psa10 - b.psa10,
  "price-asc": (a, b) => a.price - b.price,
  "price-desc": (a, b) => b.price - a.price,
};

function normalize(v) {
  return (v || "")
    .toString()
    .toLowerCase()
    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
    .replace(/[‐−–—]/g, "-")
    .trim();
}

function calc(card) {
  const price = Number(card.price);
  const psa10 = Number(card.snkPsa10Price);
  const tx30d = Number(card.tv30 || card.p10tv30 || 0);
  const tx7d = Number(card.tv7 || card.p10tv7 || 0);
  if (!(price > 0) || !(psa10 > 0)) {
    return { ...card, price, psa10, profit: NaN, roi: NaN, tx30d, tx7d };
  }
  const profit = psa10 - price - state.fee;
  const roiBase = price + state.fee;
  const roi = roiBase > 0 ? (profit / roiBase) * 100 : NaN;
  return { ...card, price, psa10, profit, roi, tx30d, tx7d };
}

function parseOptionalNumber(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function readUrl() {
  const url = new URL(window.location.href);
  const fee = parseOptionalNumber(url.searchParams.get("fee"));
  const tx = parseOptionalNumber(url.searchParams.get("tx"));
  const tx7 = parseOptionalNumber(url.searchParams.get("tx7"));
  const roi = parseOptionalNumber(url.searchParams.get("roi"));
  const psaMin = parseOptionalNumber(url.searchParams.get("psaMin"));
  const psaMax = parseOptionalNumber(url.searchParams.get("psaMax"));
  const priceMin = parseOptionalNumber(url.searchParams.get("priceMin"));
  const priceMax = parseOptionalNumber(url.searchParams.get("priceMax"));
  const sort = url.searchParams.get("sort");
  const q = url.searchParams.get("q");
  if (fee != null && fee >= 0) els.feeInput.value = String(fee);
  if (tx != null && tx >= 0) els.txInput.value = String(tx);
  if (tx7 != null && tx7 >= 0) els.tx7Input.value = String(tx7);
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
  url.searchParams.set("fee", String(state.fee));
  url.searchParams.set("tx", String(state.minTx));
  url.searchParams.set("tx7", String(state.minTx7));
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
  return url;
}

function render() {
  const normalizedQuery = normalize(state.q);
  const enriched = state.cards
    .map(calc)
    .filter((card) => {
      if (card.tx30d < state.minTx) return false;
      if (card.tx7d < state.minTx7) return false;
      if (!Number.isFinite(card.roi) || card.roi < state.minRoi) return false;
      if (card.psa10 < state.minPsa10) return false;
      if (card.psa10 > state.maxPsa10) return false;
      if (state.minPrice != null && card.price < state.minPrice) return false;
      if (state.maxPrice != null && card.price > state.maxPrice) return false;
      if (!normalizedQuery) return true;
      const haystack = normalize(`${card.name} ${card.model} ${card.rarity} ${card.id}`);
      return haystack.includes(normalizedQuery);
    })
    .sort(sorters[state.sort]);

  els.totalStat.textContent = fmt.format(state.cards.length);
  els.countStat.textContent = fmt.format(enriched.length);
  els.topRoiStat.textContent = enriched.length ? `${Math.round(enriched[0].roi)}%` : "-";
  els.topProfitStat.textContent = enriched.length ? `¥${fmt.format(Math.round(enriched[0].profit))}` : "-";
  if (els.updatedAt) {
    els.updatedAt.textContent = meta.updatedAt ? String(meta.updatedAt) : "未設定";
  }

  els.grid.innerHTML = enriched.map((card) => {
    const roiClass = card.roi >= 120 ? "good" : card.roi >= 80 ? "sky" : "warn";
    const width = Math.max(8, Math.min(100, card.roi));
    const name = card.name.replace(/\s+/g, " ");
    return `
      <article class="row card">
        <div class="thumb" data-rank="#${card.rank || ""}">
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
            <span class="badge sky">直近30日 ${fmt.format(card.tx30d)}件</span>
            <span class="badge sky">直近7日 ${fmt.format(card.tx7d)}件</span>
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
            <div class="note">計算式: (PSA10相場 - 美品価格 - 鑑定費) ÷ (美品価格 + 鑑定費)</div>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function syncFromUI() {
  state.fee = Number(els.feeInput.value || 0);
  state.minTx = Number(els.txInput.value || 0);
  state.minTx7 = Number(els.tx7Input.value || 0);
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
      "カード一覧の読み込みに失敗しました。\n\nこのサイトは `data/pokemon-cards.json` と `data/pokemon-cards-meta.js` を読み込んでいます。`index.html` をファイル直開きすると、ブラウザの制限で JSON の読み込みが止まることがあります。\n\nおすすめ:\n1. GitHub Pages 上で開く\n2. ローカルなら簡易サーバー経由で開く\n   例: `python -m http.server 8000` のように同じフォルダを配信してから `http://localhost:8000/` を開く\n\nもし GitHub Pages に置いたのに出ない場合は、更新後の URL とコンソールエラーを見ます。",
      "error"
    );
  }
}

[els.qInput, els.feeInput, els.txInput, els.tx7Input, els.roiInput, els.psaMinInput, els.psaMaxInput, els.priceMinInput, els.priceMaxInput, els.sortInput].forEach((el) =>
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
