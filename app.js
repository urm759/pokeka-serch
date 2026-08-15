const fmt = new Intl.NumberFormat("ja-JP");

const state = {
  cards: [],
  fee: 13000,
  minTx: 30,
  minRoi: 40,
  maxPsa10: 200000,
  sort: "roi-desc",
  q: "",
};

const els = {
  qInput: document.getElementById("qInput"),
  feeInput: document.getElementById("feeInput"),
  txInput: document.getElementById("txInput"),
  roiInput: document.getElementById("roiInput"),
  psaMaxInput: document.getElementById("psaMaxInput"),
  sortInput: document.getElementById("sortInput"),
  grid: document.getElementById("grid"),
  totalStat: document.getElementById("totalStat"),
  countStat: document.getElementById("countStat"),
  topRoiStat: document.getElementById("topRoiStat"),
  topProfitStat: document.getElementById("topProfitStat"),
  copyLinkBtn: document.getElementById("copyLinkBtn"),
};

const sorters = {
  "roi-desc": (a, b) => b.roi - a.roi,
  "profit-desc": (a, b) => b.profit - a.profit,
  "tx-desc": (a, b) => b.tx30d - a.tx30d,
  "price-asc": (a, b) => a.price - b.price,
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
  if (!(price > 0) || !(psa10 > 0)) {
    return { ...card, price, psa10, profit: NaN, roi: NaN, tx30d: Number(card.tv30 || card.p10tv30 || 0) };
  }
  const profit = psa10 - price - state.fee;
  const roi = (profit / price) * 100;
  return { ...card, price, psa10, profit, roi, tx30d: Number(card.tv30 || card.p10tv30 || 0) };
}

function readUrl() {
  const url = new URL(window.location.href);
  const fee = Number(url.searchParams.get("fee"));
  const tx = Number(url.searchParams.get("tx"));
  const roi = Number(url.searchParams.get("roi"));
  const psaMax = Number(url.searchParams.get("psaMax"));
  const sort = url.searchParams.get("sort");
  const q = url.searchParams.get("q");
  if (!Number.isNaN(fee) && fee >= 0) els.feeInput.value = String(fee);
  if (!Number.isNaN(tx) && tx >= 0) els.txInput.value = String(tx);
  if (!Number.isNaN(roi) && roi >= 0) els.roiInput.value = String(roi);
  if (!Number.isNaN(psaMax) && psaMax >= 0) els.psaMaxInput.value = String(psaMax);
  if (sort && sorters[sort]) els.sortInput.value = sort;
  if (q) els.qInput.value = q;
}

function updateUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set("fee", String(state.fee));
  url.searchParams.set("tx", String(state.minTx));
  url.searchParams.set("roi", String(state.minRoi));
  url.searchParams.set("psaMax", String(state.maxPsa10));
  url.searchParams.set("sort", state.sort);
  if (state.q) {
    url.searchParams.set("q", state.q);
  } else {
    url.searchParams.delete("q");
  }
  window.history.replaceState({}, "", url);
}

function render() {
  const normalizedQuery = normalize(state.q);
  const enriched = state.cards
    .map(calc)
    .filter((card) => {
      if (card.tx30d < state.minTx) return false;
      if (!Number.isFinite(card.roi) || card.roi < state.minRoi) return false;
      if (card.psa10 > state.maxPsa10) return false;
      if (!normalizedQuery) return true;
      const haystack = normalize(`${card.name} ${card.model} ${card.rarity} ${card.id}`);
      return haystack.includes(normalizedQuery);
    })
    .sort(sorters[state.sort]);

  els.totalStat.textContent = fmt.format(state.cards.length);
  els.countStat.textContent = fmt.format(enriched.length);
  els.topRoiStat.textContent = enriched.length ? `${Math.round(enriched[0].roi)}%` : "-";
  els.topProfitStat.textContent = enriched.length ? `¥${fmt.format(Math.round(enriched[0].profit))}` : "-";

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
            <div class="note">計算式: (PSA10相場 - 美品価格 - 鑑定費) ÷ 美品価格</div>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function syncFromUI() {
  state.fee = Number(els.feeInput.value || 0);
  state.minTx = Number(els.txInput.value || 0);
  state.minRoi = Number(els.roiInput.value || 0);
  state.maxPsa10 = Number(els.psaMaxInput.value || 0);
  state.sort = els.sortInput.value;
  state.q = els.qInput.value.trim();
  render();
  updateUrl();
}

async function init() {
  readUrl();
  const res = await fetch("./data/pokemon-cards.json", { cache: "no-store" });
  state.cards = await res.json();
  syncFromUI();
}

[els.qInput, els.feeInput, els.txInput, els.roiInput, els.psaMaxInput, els.sortInput].forEach((el) =>
  el.addEventListener("input", syncFromUI)
);

els.copyLinkBtn.addEventListener("click", async () => {
  const url = new URL(window.location.href);
  url.searchParams.set("fee", String(state.fee));
  url.searchParams.set("tx", String(state.minTx));
  url.searchParams.set("roi", String(state.minRoi));
  url.searchParams.set("psaMax", String(state.maxPsa10));
  url.searchParams.set("sort", state.sort);
  if (state.q) {
    url.searchParams.set("q", state.q);
  }
  await navigator.clipboard.writeText(url.toString());
  els.copyLinkBtn.textContent = "条件URLをコピーしました";
  setTimeout(() => (els.copyLinkBtn.textContent = "この条件をURLに反映"), 1400);
});

init().catch((err) => {
  console.error(err);
  els.grid.innerHTML = `<div class="card" style="padding:20px">データの読み込みに失敗しました。</div>`;
});
