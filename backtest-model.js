(function attachBacktestModel(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BacktestModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createBacktestModel() {
  const SNAPSHOT_SCHEMA = [
    "date", "marketPrice", "purchasePrice", "psaRate", "lowerGradePrice", "gradingFee",
    "saleFeeRate", "saleExtraCost", "forecastBearish", "forecastCentral", "forecastBullish",
    "floorScore", "demandScore", "futureScore", "exitScore", "qualityScore", "verdict",
    "supportConfirmed", "supportCloseLow", "supportCloseHigh", "supportInstantLow", "supportInstantHigh",
    "buybackRatio", "lockDays", "expectedProfit", "expectedRoi", "predictedDirection", "dataCompleteness",
  ];

  function finite(value) {
    if (value == null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function positive(value) {
    const number = finite(value);
    return number != null && number > 0 ? number : null;
  }

  function safeDivide(top, bottom) {
    const numerator = finite(top);
    const denominator = finite(bottom);
    if (numerator == null || denominator == null || denominator <= 0) return null;
    const result = numerator / denominator;
    return Number.isFinite(result) ? result : null;
  }

  function clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, value));
  }

  function round(value, digits = 1) {
    const number = finite(value);
    if (number == null) return null;
    const scale = 10 ** digits;
    return Math.round(number * scale) / scale;
  }

  function median(values) {
    const valid = (values || []).map(finite).filter((value) => value != null).sort((a, b) => a - b);
    if (!valid.length) return null;
    const middle = Math.floor(valid.length / 2);
    return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2;
  }

  function encodeSnapshot(snapshot) {
    return SNAPSHOT_SCHEMA.map((key) => snapshot[key] ?? null);
  }

  function decodeSnapshot(row) {
    if (!Array.isArray(row)) return row || {};
    return Object.fromEntries(SNAPSHOT_SCHEMA.map((key, index) => [key, row[index] ?? null]));
  }

  function expectedProfit(snapshot, marketPrice = snapshot.marketPrice) {
    const price = positive(marketPrice);
    const purchase = positive(snapshot.purchasePrice);
    const hitRate = finite(snapshot.psaRate);
    const lower = positive(snapshot.lowerGradePrice);
    const gradingFee = finite(snapshot.gradingFee);
    const saleFeeRate = finite(snapshot.saleFeeRate);
    const saleExtraCost = finite(snapshot.saleExtraCost);
    if ([price, purchase, hitRate, lower, gradingFee, saleFeeRate, saleExtraCost].some((value) => value == null)) return null;
    const multiplier = Math.max(0, 1 - saleFeeRate / 100);
    const psa10Net = price * multiplier - saleExtraCost;
    const lowerNet = lower * multiplier - saleExtraCost;
    const expectedSale = hitRate * psa10Net + (1 - hitRate) * lowerNet;
    const profit = expectedSale - purchase - gradingFee;
    const roi = safeDivide(profit, purchase + gradingFee);
    return { expectedSale: round(expectedSale, 0), expectedProfit: round(profit, 0), expectedRoi: roi == null ? null : round(roi * 100, 1) };
  }

  function direction(first, last) {
    const ratio = safeDivide(last, first);
    if (ratio == null) return null;
    const change = (ratio - 1) * 100;
    return change > 3 ? "上昇" : change < -3 ? "下降" : "横ばい";
  }

  function standardForecast(input = {}) {
    const current = positive(input.marketPrice);
    const raw = positive(input.purchasePrice);
    if (!(current && raw)) return null;
    const trend30 = finite(input.change30);
    const floorScore = finite(input.floorScore);
    const demandScore = finite(input.demandScore);
    const psaRate = finite(input.psaRate);
    const liquidity = Math.max(0, finite(input.psaTx30) || 0);
    let change = trend30 == null ? 0 : clamp(trend30, -35, 25) * 0.38;
    if (floorScore != null) change += (floorScore - 50) * 0.08;
    if (demandScore != null) change += (demandScore - 50) * 0.06;
    if (psaRate != null && psaRate < 0.55) change += 3;
    if (liquidity >= 20) change += 2;
    else if (liquidity < 3) change -= 3;
    const central = Math.max(raw, Math.round(current * (1 + clamp(change, -40, 15) / 100) / 1000) * 1000);
    const completenessCount = [floorScore, demandScore, psaRate, trend30].filter((value) => value != null).length + Number(liquidity > 0);
    const dataCompleteness = completenessCount >= 5 ? "高" : completenessCount >= 3 ? "中" : "低";
    const uncertainty = dataCompleteness === "高" ? 0.1 : dataCompleteness === "中" ? 0.18 : 0.28;
    const bearish = Math.max(raw, Math.round(central * (1 - uncertainty) / 1000) * 1000);
    const bullish = Math.round(Math.min(current * 1.2, central * (1 + uncertainty * 0.75)) / 1000) * 1000;
    const futureScore = Math.round(clamp(50 + change * 1.2 + (floorScore == null ? 0 : (floorScore - 50) * 0.2) + (demandScore == null ? 0 : (demandScore - 50) * 0.15)));
    const exitScore = Math.round(clamp(liquidity / 20 * 70 + (demandScore ?? 40) * 0.3));
    const qualityScore = Math.round(clamp((floorScore ?? 40) * 0.3 + (demandScore ?? 40) * 0.25 + futureScore * 0.25 + exitScore * 0.2));
    return { bearish, central, bullish, futureScore, exitScore, qualityScore, dataCompleteness, predictedDirection: direction(current, central) };
  }

  function goConfidence(input = {}) {
    if (input.verdict !== "GO") return null;
    const directionLabel = String(input.direction || "");
    if (directionLabel.includes("下降") || input.floorState === "下値割れ" || input.demandLabel === "弱い") return "GO・高リスク";
    const confirmed = Number.isFinite(Number(input.floorScore)) && Number(input.floorScore) >= 60
      && Number.isFinite(Number(input.demandScore)) && Number(input.demandScore) >= 70
      && input.floorState !== "蓄積中" && input.demandLabel !== "蓄積中"
      && !input.dataShortage && !input.manualReview;
    return confirmed ? "GO・確認済み" : "暫定GO";
  }

  function buildOutcome(initialRow, futureRow, horizonDays) {
    const initial = decodeSnapshot(initialRow);
    const future = decodeSnapshot(futureRow);
    const actualPrice = positive(future.marketPrice);
    const basePrice = positive(initial.marketPrice);
    if (!actualPrice || !basePrice) return null;
    const reevaluated = expectedProfit(initial, actualPrice);
    const central = positive(initial.forecastCentral);
    const bearish = positive(initial.forecastBearish);
    const bullish = positive(initial.forecastBullish);
    const predictionError = central ? Math.abs(actualPrice / central - 1) * 100 : null;
    const baselineError = Math.abs(actualPrice / basePrice - 1) * 100;
    const predictedDirection = initial.predictedDirection || direction(basePrice, central);
    const actualDirection = direction(basePrice, actualPrice);
    return {
      horizonDays,
      baseDate: initial.date,
      resultDate: future.date,
      verdict: initial.verdict,
      basePsaPrice: basePrice,
      resultPsaPrice: actualPrice,
      forecastBearish: bearish,
      forecastCentral: central,
      forecastBullish: bullish,
      predictionErrorPct: round(predictionError, 1),
      baselineErrorPct: round(baselineError, 1),
      directionMatched: predictedDirection && actualDirection ? predictedDirection === actualDirection : null,
      rangeHit: bearish && bullish ? actualPrice >= bearish && actualPrice <= bullish : null,
      supportBroken: initial.supportConfirmed ? actualPrice < Number(initial.supportCloseLow || 0) * 0.98 : null,
      buybackMaintained: positive(initial.buybackRatio) && positive(future.buybackRatio) ? future.buybackRatio >= initial.buybackRatio * 0.95 : null,
      reevaluatedExpectedProfit: reevaluated?.expectedProfit ?? null,
      reevaluatedExpectedRoi: reevaluated?.expectedRoi ?? null,
      goProfitPositive: initial.verdict === "GO" && reevaluated ? reevaluated.expectedProfit > 0 : null,
      priceBand: priceBand(basePrice),
      demandBand: scoreBand(initial.demandScore),
      floorBand: scoreBand(initial.floorScore),
      snapshot: initial,
    };
  }

  function priceBand(price) {
    const value = positive(price);
    if (value == null) return "未取得";
    if (value < 30000) return "3万円未満";
    if (value < 100000) return "3万～10万円";
    if (value < 200000) return "10万～20万円";
    return "20万円以上";
  }

  function scoreBand(score) {
    const value = finite(score);
    if (value == null) return "蓄積中";
    if (value < 45) return "0～44点";
    if (value < 60) return "45～59点";
    if (value < 75) return "60～74点";
    return "75～100点";
  }

  function aggregate(rows) {
    const valid = (rows || []).filter(Boolean);
    const count = (key) => valid.filter((row) => row[key] != null).length;
    const trueCount = (key) => valid.filter((row) => row[key] === true).length;
    const go = valid.filter((row) => row.verdict === "GO" && row.goProfitPositive != null);
    return {
      evaluated: valid.length,
      predictionErrorMedian: round(median(valid.map((row) => row.predictionErrorPct)), 1),
      baselineErrorMedian: round(median(valid.map((row) => row.baselineErrorPct)), 1),
      directionMatches: trueCount("directionMatched"), directionEvaluated: count("directionMatched"),
      rangeHits: trueCount("rangeHit"), rangeEvaluated: count("rangeHit"),
      supportBreaks: valid.filter((row) => row.supportBroken === true).length, supportEvaluated: count("supportBroken"),
      buybackMaintained: trueCount("buybackMaintained"), buybackEvaluated: count("buybackMaintained"),
      goProfitable: go.filter((row) => row.goProfitPositive).length, goEvaluated: go.length,
      reevaluatedProfitMedian: round(median(valid.map((row) => row.reevaluatedExpectedProfit)), 0),
    };
  }

  function grouped(rows, key) {
    const groups = {};
    for (const row of rows || []) {
      const label = row?.[key] || "未取得";
      if (!groups[label]) groups[label] = [];
      groups[label].push(row);
    }
    return Object.fromEntries(Object.entries(groups).map(([label, items]) => [label, aggregate(items)]));
  }

  function actualProfit(result, snapshotRow) {
    const snapshot = decodeSnapshot(snapshotRow);
    const salePrice = positive(result?.salePrice);
    const grade = String(result?.grade || "").trim();
    if (!salePrice || !grade) return null;
    const feeRate = finite(result.saleFeeRate) ?? finite(snapshot.saleFeeRate);
    const extraCost = finite(result.saleExtraCost) ?? finite(snapshot.saleExtraCost);
    const gradingFee = finite(result.gradingFee) ?? finite(snapshot.gradingFee);
    const purchase = positive(snapshot.purchasePrice);
    if ([feeRate, extraCost, gradingFee, purchase].some((value) => value == null)) return null;
    return {
      grade,
      netSale: round(salePrice * Math.max(0, 1 - feeRate / 100) - extraCost, 0),
      realizedProfit: round(salePrice * Math.max(0, 1 - feeRate / 100) - extraCost - purchase - gradingFee, 0),
    };
  }

  return { SNAPSHOT_SCHEMA, actualProfit, aggregate, buildOutcome, decodeSnapshot, encodeSnapshot, expectedProfit, goConfidence, grouped, priceBand, scoreBand, standardForecast };
});
