(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PurchaseRatioModel = api;
})(typeof window === "object" ? window : globalThis, function () {
  const number = (v) => v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
  function evaluate(input = {}) {
    const price = number(input.purchasePrice), psa9 = number(input.psa9?.value);
    const kind = input.psa9?.measurementType || "missing";
    const age = input.psa9?.updatedAt && input.asOf ? (Date.parse(input.asOf) - Date.parse(input.psa9.updatedAt)) / 86400000 : null;
    const reference = input.purchaseKind === "market" || kind !== "actual";
    const reasons = [];
    if (!["actual", "aggregate", "estimate"].includes(kind)) reasons.push("国内PSA9の価格種別未確認");
    if (price == null || price < 0) reasons.push("仕入れ値未取得");
    if (psa9 == null || psa9 <= 0) reasons.push("国内PSA9未取得");
    if (input.conflicted || input.identityMismatch) reasons.push("価格対立・仕様確認待ち");
    if (input.psa9?.currency && input.psa9.currency !== "JPY" || input.psa9?.country && input.psa9.country !== "jp") reasons.push("国内円建てではない");
    if (kind === "actual" && !(input.psa9?.country === "jp" && input.psa9.currency === "JPY" && input.psa9.identityConfirmed === true)) reasons.push("国内実成約・同一仕様の根拠不足");
    if (age != null && (!Number.isFinite(age) || age < 0 || age > 30)) reasons.push("国内PSA9の価格更新が古い");
    if (kind === "actual" && (!input.psa9.updatedAt || Number(input.psa9.count || 0) < 3)) reasons.push("実成約の日時・件数不足");
    const rawRatio = reasons.length ? null : price / psa9 * 100;
    const ratio = Number.isFinite(rawRatio) ? rawRatio : null;
    const fee = number(input.fee), rate = number(input.saleFeeRate), extra = number(input.extraCost);
    const rawCap = ratio == null || fee == null || fee < 0 || rate == null || rate < 0 || rate >= 100 || extra == null || extra < 0 ? null
      : psa9 * (1 - rate / 100) - extra - fee;
    const nonLossCap = Number.isFinite(rawCap) ? rawCap : null;
    const circularEstimate = kind === "estimate" && (input.psa9?.derivedFromRaw === true || /美品|素体|raw|75%/i.test(input.psa9?.source || ""));
    return { ratio, purchasePrice: price, purchaseKind: input.purchaseKind || "market", psa9Price: psa9,
      measurementType: kind, reference, updatedAt: input.psa9?.updatedAt || null, count: input.psa9?.count ?? null,
      nonLossCap, nonLossStatus: nonLossCap == null ? "unavailable" : nonLossCap < 0 ? "impossible" : nonLossCap === 0 ? "zero" : "available",
      circularEstimate, reasons, note: reference ? "参考比率（集計・推定または相場買値）" : "実買値／国内PSA9実成約" };
  }
  function eligibility(row, options = {}) {
    if (row?.ratio == null || !Number.isFinite(row.ratio)) return "data-missing";
    if (row.circularEstimate) return "circular-estimate";
    const flags = typeof options === "boolean" ? { aggregate:options, estimate:options, market:options } : options;
    if (row.measurementType === "aggregate" && !flags.aggregate || row.measurementType === "estimate" && !flags.estimate || row.purchaseKind === "market" && !flags.market) return "reference-disabled";
    return "eligible";
  }
  function matches(row, min, max, options = {}) {
    min = number(min); max = number(max);
    if (min == null && max == null) return true;
    return eligibility(row, options) === "eligible"
      && (min == null || row.ratio >= min) && (max == null || row.ratio <= max);
  }
  function roiOnly(settings) { return { ...settings, minExpectedProfit: 0 }; }
  function capLabel(row, format = String) {
    if (!Number.isFinite(row?.nonLossCap) || row.nonLossStatus === "unavailable") return "算出不可";
    if (row.nonLossStatus === "impossible") return "赤字回避できる仕入れ値なし";
    return `¥${format(Math.floor(row.nonLossCap))}${row.nonLossStatus === "zero" ? "（0円仕入れで損益0円）" : ""}`;
  }
  return { evaluate, matches, eligibility, capLabel, roiOnly };
});
