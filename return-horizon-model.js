(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ReturnHorizonModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DAYS = [42, 91, 119, 147], VERSION = "domestic-exact-horizon-v1";
  const positive = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;
  const band = (v) => v < 30000 ? "under30k" : v < 100000 ? "30to100k" : "over100k";
  function quantile(values, p) {
    const a = values.filter(Number.isFinite).sort((x, y) => x - y);
    if (!a.length) return null;
    const x = (a.length - 1) * p, i = Math.floor(x);
    return a[i] + (a[Math.ceil(x)] - a[i]) * (x - i);
  }
  function calibrate(history, asOfDate) {
    const out = { version: VERSION, asOfDate, source: "みんトレ国内PSA10集計値の日次観測・個別実成約とは別", productionApproved: false, horizons: {} };
    for (const days of DAYS) {
      const groups = { all: [], under30k: [], "30to100k": [], over100k: [] };
      for (const [id, raw] of Object.entries(history.cards || {})) {
        const daily = new Map(raw.filter(r => r[0] <= asOfDate && positive(r[2])).map(r => [r[0], r]));
        for (const [date, row] of daily) {
          const end = new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
          const future = daily.get(end);
          if (!future) continue;
          const pair = { id, date, end, ratio: future[2] / row[2] };
          groups.all.push(pair); groups[band(row[2])].push(pair);
        }
      }
      out.horizons[days] = Object.fromEntries(Object.entries(groups).map(([key, rows]) => {
        // Each card receives one vote; many snapshots of one card are not independent evidence.
        const perCard = new Map();
        for (const r of rows) { if (!perCard.has(r.id)) perCard.set(r.id, []); perCard.get(r.id).push(r.ratio); }
        const ratios = [...perCard.values()].map(a => quantile(a, .5));
        const origins = new Set(rows.map(r => r.date));
        return [key, { pairs: rows.length, cards: ratios.length, originDates: origins.size,
          centralRatio: quantile(ratios, .5), bearishRatio: quantile(ratios, .1), bullishRatio: quantile(ratios, .9),
          enoughIndependentEvidence: ratios.length >= 30 && origins.size >= 3,
          firstOrigin: rows.map(r => r.date).sort()[0] || null, lastOutcome: rows.map(r => r.end).sort().at(-1) || null }];
      }));
    }
    return out;
  }
  function resolve({ currentPrice, days, calibration }) {
    const row = calibration?.horizons?.[days]?.[band(currentPrice)];
    const available = positive(currentPrice) && row?.cards >= 3 && positive(row.centralRatio);
    const approved = available && row.enoughIndependentEvidence && calibration.productionApproved === true;
    return { horizonDays: Number(days), version: VERSION, available, approved, status: approved ? "検証済み" : available ? "参考値・期間検証不足" : "算出不可・期間履歴不足",
      centralPrice: available ? currentPrice * row.centralRatio : null,
      bearishPrice: available && positive(row.bearishRatio) ? currentPrice * Math.min(row.centralRatio, row.bearishRatio) : null,
      bullishPrice: available && positive(row.bullishRatio) ? currentPrice * Math.max(row.centralRatio, row.bullishRatio) : null,
      evidence: row || null, referenceOnly: !approved,
      reason: available ? `同期間の国内観測${row.cards}カード・開始${row.originDates}日。独立した開始日3日以上と将来期間検証が必要。仕入れ判定へ未適用` : "同期間の国内観測なし。91日予測の比例延長・価格推定で補完しない" };
  }
  return { DAYS, VERSION, calibrate, resolve, quantile };
});
