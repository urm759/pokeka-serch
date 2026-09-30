const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (name, fallback) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, name), "utf8")); } catch { return fallback; }
};
const monthsBetween = (start, end) => {
  const a = Date.parse(`${start}T00:00:00Z`), b = Date.parse(`${end}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.floor((b - a) / (86400000 * 30.44)) : null;
};

function build(cards, index, stability, buyback, backtest, date) {
  const releaseById = new Map((index.cards || []).map((row) => [String(row.id), row.releaseDate]));
  const eligible = [], control = [];
  for (const card of cards) {
    const ageMonths = monthsBetween(releaseById.get(String(card.id)), date);
    const shops = Object.values(buyback.cards?.[card.id]?.shops || {})
      .filter((row) => Number(row.c30 || 0) > 0 && row.quarantined !== true).length;
    const psaTrades30 = Number(card.p10tv30 || 0);
    const rawTrades30 = Number(card.tv30 || 0);
    const demandObserved = psaTrades30 >= 10 || shops >= 2 || rawTrades30 >= 30;
    if (!demandObserved || ageMonths == null) continue;
    const market = stability.cards?.[card.id] || {};
    const supplyWarning = market.supportBroken === true || market.supplyState === "売り優勢"
      || Number(market.listingTrendPct || 0) > 10
      || Number.isFinite(Number(market.psaIncrease7)) && Number(market.psaIncrease7) > Math.max(0, Number(card.p10tv7 || 0)) * 2;
    const row = { id: card.id, name: card.name, releaseDate: releaseById.get(String(card.id)), ageMonths,
      rawTrades30, psaTrades30, buybackShops30: shops,
      supplyWarning, supplyReason: supplyWarning ? "POP・出品・支持帯など既存の供給警戒あり" : "供給制約は未証明",
      outOfPrintStatus: "公式の販売終了・再販停止は未確認", limitImpact: "なし" };
    if (ageMonths >= 18) eligible.push(row);
    else control.push(row);
  }
  eligible.sort((a, b) => b.psaTrades30 - a.psaTrades30 || b.buybackShops30 - a.buybackShops30);
  const candidateIds = new Set(eligible.map((row) => String(row.id)));
  const controlIds = new Set(control.map((row) => String(row.id)));
  const exitRows = (backtest.outcomes || []).filter((row) => row.horizonType === "exit"
    && typeof row.reevaluatedExpectedProfit === "number" && Number.isFinite(row.reevaluatedExpectedProfit));
  const group = (ids) => {
    const rows = exitRows.filter((row) => ids.has(String(row.cardId)));
    return { evaluated: rows.length, positiveExpectedProfit: rows.filter((row) => Number(row.reevaluatedExpectedProfit) >= 0).length,
      meaning: "返却時の国内PSA10相場による再評価期待利益。実鑑定結果がない限り実現利益ではない" };
  };
  const candidateResult = group(candidateIds), controlResult = group(controlIds);
  const ready = candidateResult.evaluated >= 30 && controlResult.evaluated >= 30;
  return { version: 1, asOfDate: date, referenceOnly: true,
    decisionImpact: "仕入れ上限・GO判定・供給ペナルティへ反映しない（二重減点なし）",
    hypothesis: "発売から時間が経ち、国内取引または買取掲載があるカードは返却時にも換金しやすいかを検証。発売年だけで絶版と認定しない",
    criteria: { elapsedMonths: 18, psaTrades30: 10, rawTrades30: 30, buybackShops30: 2, demandOperator: "いずれか" },
    counts: { hypothesis: eligible.length, comparison: control.length, supplyWarningAmongHypothesis: eligible.filter((row) => row.supplyWarning).length },
    returnDateBacktest: { status: ready ? "暫定検証可能・本番未適用" : "蓄積中・本番未適用",
      nextEligibleDate: backtest.exitReadiness?.nextEligibleDate || null,
      source: "国内相場による返却時バックテスト", hypothesis: candidateResult, comparison: controlResult,
      minimumOutcomesPerGroup: 30, caveat: "市場局面と再販情報が未検証。利益の因果を絶版や需要と断定しない" },
    cards: Object.fromEntries(eligible.map((row) => [row.id, {
      ageMonths: row.ageMonths, rawTrades30: row.rawTrades30, psaTrades30: row.psaTrades30,
      buybackShops30: row.buybackShops30, supplyWarning: row.supplyWarning,
    }])),
    examples: eligible.slice(0, 20) };
}

if (require.main === module) {
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const result = build(read("data/pokemon-cards.json", []), read("data/card-catalog/index.json", { cards: [] }),
    read("data/market-stability-summary.json", { cards: {} }), read("data/shop-buyback-summary.json", { cards: {} }),
    read("data/market-backtest-summary.json", {}), date);
  const output = path.join(ROOT, "data", "supply-maturity-hypothesis.json");
  const previous = read("data/supply-maturity-hypothesis.json", null);
  if (previous && JSON.stringify({ ...previous, asOfDate: null }) === JSON.stringify({ ...result, asOfDate: null })) {
    console.log(JSON.stringify({ hypothesis: result.counts.hypothesis, unchanged: true, returnBacktest: result.returnDateBacktest.status }));
    process.exit(0);
  }
  const temporary = `${output}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(result), "utf8");
  fs.renameSync(temporary, output);
  console.log(JSON.stringify({ hypothesis: result.counts.hypothesis, control: result.counts.comparison,
    supplyWarning: result.counts.supplyWarningAmongHypothesis, returnBacktest: result.returnDateBacktest.status }));
}
module.exports = { build, monthsBetween };
