(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GradeCalibrationModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function wilsonInterval(successes, count) {
    if (!(count > 0)) return null;
    const z = 1.96;
    const p = successes / count;
    const denominator = 1 + z * z / count;
    const center = (p + z * z / (2 * count)) / denominator;
    const margin = z * Math.sqrt(p * (1 - p) / count + z * z / (4 * count * count)) / denominator;
    return { low: Math.max(0, (center - margin) * 100), high: Math.min(100, (center + margin) * 100) };
  }

  function summarize(records, filter = {}) {
    const rows = (Array.isArray(records) ? records : [])
      .filter((row) => row && ["PSA10", "PSA9", "PSA8以下"].includes(row.grade))
      .filter((row) => filter.cardId == null || String(row.cardId) === String(filter.cardId))
      .filter((row) => filter.releaseYear == null || Number(row.releaseYear) === Number(filter.releaseYear));
    const psa10 = rows.filter((row) => row.grade === "PSA10").length;
    const psa9 = rows.filter((row) => row.grade === "PSA9").length;
    const below9 = rows.length - psa10 - psa9;
    return {
      count: rows.length,
      psa10,
      psa9,
      below9,
      rate: rows.length ? psa10 / rows.length * 100 : null,
      interval95: wilsonInterval(psa10, rows.length),
      distinctCards: new Set(rows.map((row) => String(row.cardId))).size,
      inspections: Object.fromEntries(["高", "標準", "低", "未記録"].map((label) => [label, rows.filter((row) => (row.inspection || "未記録") === label).length])),
    };
  }

  function assess(input = {}) {
    const officialRate = input.officialRate == null || input.officialRate === "" ? null : Number(input.officialRate);
    const officialValid = Number.isFinite(officialRate) && officialRate >= 0 && officialRate <= 100;
    const card = summarize(input.records, { cardId: input.cardId });
    const year = input.releaseYear != null && input.releaseYear !== "" && Number.isFinite(Number(input.releaseYear))
      ? summarize(input.records, { releaseYear: input.releaseYear })
      : summarize([]);
    const enoughCard = card.count >= 30 && card.interval95 && card.interval95.high - card.interval95.low <= 25;
    const enoughYear = year.count >= 100 && year.distinctCards >= 10 && year.interval95
      && year.interval95.high - year.interval95.low <= 20;
    const evidence = enoughCard ? card : enoughYear ? year : null;
    // A strong official prior and a capped adjustment prevent small positive streaks from lifting limits.
    const priorCount = enoughCard ? 100 : 200;
    const combined = officialValid && evidence
      ? (officialRate * priorCount + evidence.psa10 * 100) / (priorCount + evidence.count)
      : null;
    const suggestedRate = combined == null ? null : Math.max(officialRate - 10, Math.min(officialRate + 5, combined));
    return {
      officialRate: officialValid ? officialRate : null,
      card,
      year,
      eligibleForSharedReview: Boolean(officialValid && evidence),
      basis: enoughCard ? "カード別" : enoughYear ? "年代別" : "件数・精度不足",
      suggestedRate,
      productionApplied: false,
      reason: !officialValid ? "公式取得率が未取得" : evidence ? "共有・検証前の参考補正値" : "実績の件数または95%区間が不足",
    };
  }

  return { wilsonInterval, summarize, assess };
});
