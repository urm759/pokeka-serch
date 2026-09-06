const MEDIAN_POLICY = Object.freeze({
  minimumAdoptedCount: 3,
  targetPeriod: "全取得期間（直近90日を加重）",
  insufficientLabel: "参考値（仕入れ判断へ不使用）",
});

const SUM_FIELDS = Object.freeze([
  "linkedCards", "browserValidatedCards", "browserPricedCards", "browserUnavailableCards", "browserCapturedRows",
  "browserPricedRows", "pageReportedTransactions", "publicApiPricePresent", "publicApiMaskedRows",
  "titleUnavailableRows", "sourcePriceMissingRows", "formatParseFailureRows", "adoptedRawRows",
  "adoptedPsa10Rows", "adoptedPsa9Rows", "usableRawMedianCards", "usablePsa10MedianCards",
  "usablePsa9MedianCards", "allGradesSufficientCards",
]);

function percent(numerator, denominator) {
  return denominator > 0 ? Math.round(numerator / denominator * 10000) / 100 : null;
}

function acquisitionRates(acquisition) {
  const linked = Number(acquisition.linkedCards || 0);
  return {
    browserValidationPct: percent(Number(acquisition.browserValidatedCards || 0), linked),
    pricedCardPct: percent(Number(acquisition.browserPricedCards || 0), linked),
    usableRawMedianPct: percent(Number(acquisition.usableRawMedianCards || 0), linked),
    usablePsa10MedianPct: percent(Number(acquisition.usablePsa10MedianCards || 0), linked),
    usablePsa9MedianPct: percent(Number(acquisition.usablePsa9MedianCards || 0), linked),
    allGradesSufficientPct: percent(Number(acquisition.allGradesSufficientCards || 0), linked),
  };
}

function fromCardDetails(details, updatedAt = new Date().toISOString()) {
  const rows = Array.isArray(details) ? details : Object.values(details || {});
  const acquisition = {
    linkedCards: rows.length,
    browserValidatedCards: rows.filter((detail) => detail.acquisitionAudit?.method === "authenticated-browser-dom").length,
    browserPricedCards: rows.filter((detail) => Number(detail.acquisitionAudit?.browserPricedRows || 0) > 0).length,
    browserUnavailableCards: rows.filter((detail) => detail.acquisitionAudit?.method === "authenticated-browser-unavailable").length,
    browserCapturedRows: rows.reduce((sum, detail) => sum + Number(detail.acquisitionAudit?.browserRowsCaptured || 0), 0),
    browserPricedRows: rows.reduce((sum, detail) => sum + Number(detail.acquisitionAudit?.browserPricedRows || 0), 0),
    pageReportedTransactions: rows.reduce((sum, detail) => sum + Number(detail.acquisitionAudit?.pageReportedTransactions || 0), 0),
    publicApiPricePresent: rows.reduce((sum, detail) => sum + Number(detail.acquisitionAudit?.publicApiPricePresent || 0), 0),
    publicApiMaskedRows: rows.reduce((sum, detail) => sum + Number(detail.acquisitionAudit?.publicApiPriceMissing || 0), 0),
    titleUnavailableRows: rows.reduce((sum, detail) => sum + Number(detail.acquisitionAudit?.missingCauseCounts?.["商品名確認不能"] || 0), 0),
    sourcePriceMissingRows: rows.reduce((sum, detail) => sum + Number(detail.acquisitionAudit?.missingCauseCounts?.["元データ価格欠損"] || 0), 0),
    formatParseFailureRows: rows.reduce((sum, detail) => sum + Number(detail.acquisitionAudit?.missingCauseCounts?.["価格形式解析失敗"] || 0), 0),
    adoptedRawRows: rows.reduce((sum, detail) => sum + Number(detail.markets?.ebayRaw?.adoptedCount || 0), 0),
    adoptedPsa10Rows: rows.reduce((sum, detail) => sum + Number(detail.markets?.ebayPsa10?.adoptedCount || 0), 0),
    adoptedPsa9Rows: rows.reduce((sum, detail) => sum + Number(detail.markets?.ebayPsa9?.adoptedCount || 0), 0),
    classificationCounts: rows.reduce((totals, detail) => {
      Object.entries(detail.acquisitionAudit?.classificationCounts || {}).forEach(([key, count]) => {
        totals[key] = (totals[key] || 0) + Number(count || 0);
      });
      return totals;
    }, { "auto-matched": 0, ambiguous: 0, "out-of-scope": 0, unverifiable: 0 }),
    usableRawMedianCards: rows.filter((detail) => detail.markets?.ebayRaw?.usableIndividualMedian).length,
    usablePsa10MedianCards: rows.filter((detail) => detail.markets?.ebayPsa10?.usableIndividualMedian).length,
    usablePsa9MedianCards: rows.filter((detail) => detail.markets?.ebayPsa9?.usableIndividualMedian).length,
    allGradesSufficientCards: rows.filter((detail) => ["ebayRaw", "ebayPsa10", "ebayPsa9"]
      .every((key) => detail.markets?.[key]?.usableIndividualMedian)).length,
    medianPolicy: MEDIAN_POLICY,
    updatedAt,
  };
  return { ...acquisition, ...acquisitionRates(acquisition) };
}

function fromSetEntries(entries, updatedAt = new Date().toISOString()) {
  const sets = Array.isArray(entries) ? entries : [];
  const acquisition = Object.fromEntries(SUM_FIELDS.map((field) => [field, 0]));
  acquisition.classificationCounts = { "auto-matched": 0, ambiguous: 0, "out-of-scope": 0, unverifiable: 0 };
  for (const entry of sets) {
    const current = entry.acquisition || {};
    for (const field of SUM_FIELDS) acquisition[field] += Number(current[field] || 0);
    Object.entries(current.classificationCounts || {}).forEach(([key, count]) => {
      acquisition.classificationCounts[key] = (acquisition.classificationCounts[key] || 0) + Number(count || 0);
    });
  }
  acquisition.medianPolicy = MEDIAN_POLICY;
  acquisition.updatedAt = updatedAt;
  return { ...acquisition, ...acquisitionRates(acquisition) };
}

module.exports = { MEDIAN_POLICY, SUM_FIELDS, acquisitionRates, fromCardDetails, fromSetEntries, percent };
