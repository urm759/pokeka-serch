(function attachMarketAnalysis(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MarketAnalysisModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createMarketAnalysis() {
  const DAY_MS = 86400000;
  const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

  function finite(value) {
    if (value == null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function positive(value) {
    const number = finite(value);
    return number != null && number > 0 ? number : null;
  }

  function safeDivide(numerator, denominator) {
    const top = finite(numerator);
    const bottom = finite(denominator);
    if (top == null || bottom == null || bottom <= 0) return null;
    const value = top / bottom;
    return Number.isFinite(value) ? value : null;
  }

  function sortedNumbers(values) {
    return (values || []).map(finite).filter((value) => value != null).sort((a, b) => a - b);
  }

  function median(values) {
    const sorted = sortedNumbers(values);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function mean(values) {
    const valid = sortedNumbers(values);
    return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
  }

  function quantile(values, ratio) {
    const sorted = sortedNumbers(values);
    if (!sorted.length) return null;
    const position = clamp(Number(ratio || 0), 0, 1) * (sorted.length - 1);
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  }

  function round(value, digits = 3) {
    const number = finite(value);
    if (number == null) return null;
    const scale = 10 ** digits;
    return Math.round(number * scale) / scale;
  }

  function dateValue(value) {
    const match = String(value || "").match(/^\d{4}-\d{2}-\d{2}/);
    if (!match) return null;
    const timestamp = Date.parse(`${match[0]}T00:00:00Z`);
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  function ageDays(date, asOfDate) {
    const start = dateValue(date);
    const end = dateValue(asOfDate) ?? Date.now();
    if (start == null || end < start) return null;
    return Math.floor((end - start) / DAY_MS);
  }

  function pctChange(first, last) {
    const ratio = safeDivide(last, first);
    return ratio == null ? null : (ratio - 1) * 100;
  }

  function normalizeHistory(rows) {
    const byDate = new Map();
    for (const raw of rows || []) {
      const row = Array.isArray(raw)
        ? {
            date: raw[0], rawPrice: raw[1], psaPrice: raw[2], listings: raw[3],
            rawTx7: raw[4], rawTx30: raw[5], psaTx7: raw[6], psaTx30: raw[7],
          }
        : raw || {};
      const timestamp = dateValue(row.date);
      if (timestamp == null) continue;
      byDate.set(String(row.date).slice(0, 10), {
        date: String(row.date).slice(0, 10),
        timestamp,
        rawPrice: positive(row.rawPrice),
        psaPrice: positive(row.psaPrice),
        listings: finite(row.listings),
        rawTx7: finite(row.rawTx7),
        rawTx30: finite(row.rawTx30),
        psaTx7: finite(row.psaTx7),
        psaTx30: finite(row.psaTx30),
      });
    }
    return [...byDate.values()].sort((a, b) => a.timestamp - b.timestamp);
  }

  function windowRows(rows, days) {
    if (!rows.length) return [];
    const latest = rows[rows.length - 1].timestamp;
    return rows.filter((row) => latest - row.timestamp <= days * DAY_MS);
  }

  function priceWindowStats(rows, key, days) {
    const selected = windowRows(rows, days).filter((row) => positive(row[key]) != null);
    const prices = selected.map((row) => row[key]);
    if (!prices.length) return { days, samples: 0, spanDays: 0, changePct: null, widthPct: null, newLowCount: null };
    const spanDays = Math.round((selected.at(-1).timestamp - selected[0].timestamp) / DAY_MS);
    let floor = prices[0];
    let newLowCount = 0;
    for (const price of prices.slice(1)) {
      if (price < floor * 0.995) {
        newLowCount += 1;
        floor = price;
      }
    }
    const center = median(prices);
    const widthPct = center > 0 ? (Math.max(...prices) - Math.min(...prices)) / center * 100 : null;
    return {
      days,
      samples: prices.length,
      spanDays,
      changePct: pctChange(prices[0], prices.at(-1)),
      widthPct,
      newLowCount,
      min: Math.min(...prices),
      max: Math.max(...prices),
      median: center,
    };
  }

  function supportBand(rows) {
    const prices = rows.map((row) => positive(row.psaPrice)).filter((value) => value != null);
    if (prices.length < 4) return { low: null, high: null, broken: false };
    const previous = prices.slice(0, -1);
    const anchor = quantile(previous, 0.25);
    if (!(anchor > 0)) return { low: null, high: null, broken: false };
    let low = anchor * 0.975;
    let high = anchor * 1.025;
    const latest = prices.at(-1);
    const broken = latest < low * 0.98;
    if (broken) {
      const lowerCluster = prices.filter((price) => price <= latest * 1.05);
      const nextAnchor = median(lowerCluster) || latest;
      low = nextAnchor * 0.975;
      high = nextAnchor * 1.025;
    }
    return { low: Math.round(low / 100) * 100, high: Math.round(high / 100) * 100, broken };
  }

  function inventoryDaysBySource(sources) {
    return (sources || []).map((source) => {
      const stock = finite(source.stock);
      const dailySales = positive(source.dailySales);
      return {
        source: source.source || "在庫元",
        stock,
        dailySales,
        days: stock != null && stock >= 0 && dailySales != null ? round(stock / dailySales, 1) : null,
      };
    });
  }

  function directionFromChanges(rawStats, psaStats, fallbackRawChange) {
    const changes = [rawStats.changePct, psaStats.changePct].filter((value) => value != null);
    const fallback = finite(fallbackRawChange);
    const value = changes.length ? median(changes) : fallback;
    if (value == null) return "蓄積中";
    if (value > 3) return "上昇";
    if (value < -3) return "下降";
    return "横ばい";
  }

  function evaluatePriceFloor(input = {}) {
    const rows = normalizeHistory(input.history);
    const historyDays = rows.length > 1 ? Math.round((rows.at(-1).timestamp - rows[0].timestamp) / DAY_MS) : 0;
    const stats14 = priceWindowStats(rows, "psaPrice", 14);
    const stats30 = priceWindowStats(rows, "psaPrice", 30);
    const stats90 = priceWindowStats(rows, "psaPrice", 90);
    const raw30 = priceWindowStats(rows, "rawPrice", 30);
    const direction = directionFromChanges(raw30, stats30, input.fallbackRawChange30);
    const support = supportBand(rows);
    const inventorySources = inventoryDaysBySource(input.inventorySources);
    const inventoryDays = median(inventorySources.map((source) => source.days));
    const psaTx30 = Math.max(0, finite(input.psaTx30) || 0);
    const rawTx30 = Math.max(0, finite(input.rawTx30) || 0);
    const psaIncrease7 = finite(input.psaIncrease7);
    const psaIncrease30 = finite(input.psaIncrease30);
    const monthlyPsaIncrease = finite(input.monthlyPsaIncrease)
      ?? (psaIncrease30 != null ? Math.max(0, psaIncrease30) : psaIncrease7 != null ? Math.max(0, psaIncrease7) / 7 * 30 : null);
    const supplyAbsorption = monthlyPsaIncrease != null ? safeDivide(monthlyPsaIncrease, Math.max(1, psaTx30)) : null;
    const listingRows = windowRows(rows, 30).filter((row) => row.listings != null && row.listings >= 0);
    const listingTrendPct = listingRows.length >= 2 ? pctChange(Math.max(1, listingRows[0].listings), Math.max(1, listingRows.at(-1).listings)) : null;
    const releaseAgeDays = finite(input.releaseAgeDays);
    const marketRelativeStrength = finite(input.marketRelativeStrength);
    const storeAgreement = clamp(finite(input.storeAgreement) ?? 50);
    const enoughHistory = rows.length >= 4 && historyDays >= 14 && stats14.samples >= 2;
    const enoughTransactions = psaTx30 >= 3 || rawTx30 >= 10;
    const evidence = [];
    const cautions = [];

    if (stats14.newLowCount === 0 && stats14.samples >= 2) evidence.push("14日間新安値なし");
    else if (stats14.newLowCount > 0) cautions.push(`14日で新安値${stats14.newLowCount}回`);
    if (stats14.widthPct != null && stats14.widthPct <= 10) evidence.push("14日価格変動がおおむね±5%以内");
    else if (stats14.widthPct != null && stats14.widthPct > 20) cautions.push("価格変動幅が大きい");
    if (stats30.spanDays >= 20 && stats30.newLowCount === 0) evidence.push("30日新安値なし");
    else if (stats30.spanDays >= 20 && stats30.newLowCount > 1) cautions.push(`30日で新安値${stats30.newLowCount}回`);
    if (stats90.spanDays >= 60 && stats90.newLowCount === 0) evidence.push("90日新安値なし");
    else if (stats90.spanDays >= 60 && stats90.newLowCount > 2) cautions.push(`90日で新安値${stats90.newLowCount}回`);
    if (enoughTransactions) evidence.push("30日取引十分");
    else cautions.push("取引が少なく価格停止を安定と判定しない");
    if (listingTrendPct != null && listingTrendPct > 10) cautions.push("出品数が増加");
    else if (listingTrendPct != null) evidence.push("出品数は増え続けていない");
    if (supplyAbsorption != null && supplyAbsorption <= 1) evidence.push("PSA供給増を取引で吸収");
    else if (supplyAbsorption != null && supplyAbsorption > 2) cautions.push("PSA供給増が取引数を上回る");
    if (releaseAgeDays != null && releaseAgeDays <= 90) cautions.push("発売90日以内");
    if (storeAgreement >= 80) evidence.push("店舗間価格が一致");
    else if (storeAgreement <= 35) cautions.push("店舗間価格のばらつきが大きい");
    if (input.reprintActive) cautions.push("再販中");
    if (support.broken) cautions.push("過去の支持価格帯を割れたため下値候補を再計算");
    if (!enoughHistory) cautions.push("14日以上の価格履歴を蓄積中");

    let score = 50;
    if (stats14.newLowCount === 0 && stats14.samples >= 2) score += 15;
    else score -= Math.min(20, Number(stats14.newLowCount || 0) * 7);
    if (stats14.widthPct != null) score += stats14.widthPct <= 10 ? 15 : stats14.widthPct <= 15 ? 7 : stats14.widthPct > 25 ? -15 : 0;
    if (stats30.spanDays >= 20 && stats30.widthPct != null) score += stats30.widthPct <= 15 ? 6 : stats30.widthPct > 30 ? -8 : 0;
    if (stats90.spanDays >= 60 && stats90.widthPct != null) score += stats90.newLowCount === 0 && stats90.widthPct <= 20 ? 6 : stats90.newLowCount > 2 ? -8 : 0;
    score += psaTx30 >= 15 ? 12 : psaTx30 >= 5 ? 7 : psaTx30 >= 3 ? 2 : -18;
    score += rawTx30 >= 30 ? 7 : rawTx30 >= 10 ? 3 : rawTx30 === 0 ? -8 : 0;
    if (listingTrendPct != null) score += listingTrendPct <= 0 ? 7 : listingTrendPct <= 10 ? 2 : -12;
    if (supplyAbsorption != null) score += supplyAbsorption <= 0.75 ? 10 : supplyAbsorption <= 1.5 ? 2 : supplyAbsorption > 2 ? -15 : -5;
    if (releaseAgeDays != null && releaseAgeDays <= 90) score -= 12;
    if (input.reprintActive) score -= 10;
    score += (storeAgreement - 50) * 0.16;
    if (marketRelativeStrength != null) score += clamp(marketRelativeStrength, -15, 15) * 0.6;
    if (support.broken) score -= 18;
    score = Math.round(clamp(score));
    if (historyDays < 30) score = Math.min(score, 75);
    else if (historyDays < 90) score = Math.min(score, 90);
    if (!enoughTransactions) score = Math.min(score, 55);

    let floorState = "蓄積中";
    if (enoughHistory) {
      if (support.broken) floorState = "下値割れ";
      else if (score >= 82 && historyDays >= 30 && enoughTransactions && stats14.newLowCount === 0) floorState = "安定";
      else if (score >= 58) floorState = "形成中";
      else floorState = "未形成";
    }

    let supplyState = "蓄積中";
    if (psaTx30 > 0 || inventoryDays != null || supplyAbsorption != null) {
      if ((inventoryDays != null && inventoryDays <= 14) && (supplyAbsorption == null || supplyAbsorption <= 1.2)) supplyState = "買い優勢";
      else if ((inventoryDays != null && inventoryDays >= 45) || (supplyAbsorption != null && supplyAbsorption > 2) || (listingTrendPct != null && listingTrendPct > 15)) supplyState = "売り優勢";
      else supplyState = "均衡";
    }

    return {
      score: enoughHistory ? score : null,
      state: floorState,
      direction,
      supplyState,
      supportLow: support.low,
      supportHigh: support.high,
      supportBroken: support.broken,
      inventoryDays: round(inventoryDays, 1),
      inventorySources,
      historyDays,
      samples: rows.length,
      stats14,
      stats30,
      stats90,
      raw30,
      listingTrendPct: round(listingTrendPct, 1),
      supplyAbsorption: round(supplyAbsorption, 2),
      psaIncrease7,
      psaIncrease30,
      marketRelativeStrength: round(marketRelativeStrength, 1),
      evidence: evidence.slice(0, 4),
      cautions: cautions.slice(0, 4),
    };
  }

  function buybackMetrics(input = {}) {
    const marketPrice = positive(input.marketPrice);
    const buybackPrice = positive(input.buybackPrice);
    const cardMatched = input.cardMatched !== false;
    const updatedAgeDays = ageDays(input.priceDate, input.asOfDate);
    const stale = updatedAgeDays != null && updatedAgeDays > Number(input.staleAfterDays ?? 7);
    if (!cardMatched) return { valid: false, reason: "カード取り違え疑い", stale, updatedAgeDays };
    if (marketPrice == null || buybackPrice == null) return { valid: false, reason: "価格未取得", stale, updatedAgeDays };
    const feeRate = clamp(finite(input.saleFeeRate) || 0, 0, 100) / 100;
    const netMarket = Math.max(0, marketPrice * (1 - feeRate) - Math.max(0, finite(input.saleExtraCost) || 0));
    const marketRatio = safeDivide(buybackPrice, marketPrice);
    const takeHomeRatio = safeDivide(buybackPrice, netMarket);
    return {
      valid: marketRatio != null && takeHomeRatio != null,
      marketPrice,
      buybackPrice,
      marketRatio: round(marketRatio),
      marketDifference: round(marketRatio == null ? null : marketRatio - 1),
      netMarket: Math.round(netMarket),
      takeHomeRatio: round(takeHomeRatio),
      priceDate: input.priceDate || null,
      updatedAgeDays,
      stale,
      reason: stale ? "価格更新が古い" : "",
    };
  }

  function markRatioOutliers(rows) {
    const valid = (rows || []).filter((row) => row?.valid && !row.stale && positive(row.marketRatio) != null);
    if (valid.length < 3) return (rows || []).map((row) => ({ ...row, outlier: false }));
    const ratios = valid.map((row) => row.marketRatio);
    const q1 = quantile(ratios, 0.25);
    const q3 = quantile(ratios, 0.75);
    const iqr = Math.max(0.01, q3 - q1);
    const center = median(ratios);
    const low = Math.max(q1 - iqr * 1.5, center * 0.65);
    const high = Math.min(q3 + iqr * 1.5, center * 1.35);
    return (rows || []).map((row) => ({ ...row, outlier: Boolean(row?.valid && !row.stale && (row.marketRatio < low || row.marketRatio > high)) }));
  }

  function evaluateStoreDemand(input = {}) {
    const rows = markRatioOutliers(input.rows || []);
    const trusted = rows.filter((row) => row.valid && !row.stale && !row.outlier);
    const ratios = trusted.map((row) => row.marketRatio);
    const ratioMedian = median(ratios);
    const activeStores = new Set(trusted.map((row) => row.shopId).filter(Boolean)).size;
    const continuity7 = mean(trusted.map((row) => finite(row.c7) || 0));
    const continuity30 = mean(trusted.map((row) => finite(row.c30) || 0));
    const priceTrendPct = median(trusted.map((row) => pctChange(row.avg30, row.buybackPrice)).filter((value) => value != null));
    const spread = ratioMedian != null && ratios.length > 1 ? (Math.max(...ratios) - Math.min(...ratios)) / ratioMedian : null;
    let score = 35;
    if (ratioMedian != null) score += ratioMedian >= 0.9 ? 30 : ratioMedian >= 0.78 ? 22 : ratioMedian >= 0.65 ? 10 : -10;
    score += activeStores >= 4 ? 20 : activeStores >= 2 ? 12 : activeStores === 1 ? 0 : -20;
    score += continuity30 >= 8 ? 10 : continuity30 >= 3 ? 6 : continuity30 >= 1 ? 2 : -5;
    if (priceTrendPct != null) score += priceTrendPct >= 5 ? 8 : priceTrendPct <= -8 ? -10 : 2;
    if (spread != null) score += spread <= 0.12 ? 7 : spread > 0.3 ? -8 : 0;
    score = Math.round(clamp(score));
    let label = "蓄積中";
    if (trusted.length) {
      if (activeStores >= 2 && score >= 72) label = "強い";
      else if (score < 45) label = "弱い";
      else label = "普通";
    }
    const best = trusted.slice().sort((a, b) => b.buybackPrice - a.buybackPrice)[0] || null;
    return {
      label,
      score,
      ratioMedian: round(ratioMedian),
      activeStores,
      continuity7: round(continuity7, 1),
      continuity30: round(continuity30, 1),
      priceTrendPct: round(priceTrendPct, 1),
      agreement: spread == null ? null : round(Math.max(0, 1 - spread), 3),
      best,
      rows,
      trustedCount: trusted.length,
      excludedCount: rows.filter((row) => row.stale || row.outlier || !row.valid).length,
    };
  }

  function summarizeShopRates(rows, options = {}) {
    const marked = markRatioOutliers(rows || []);
    const allValid = marked.filter((row) => row.valid && !row.stale);
    const trusted = allValid.filter((row) => !row.outlier);
    const summarize = (items) => {
      const ratios = items.map((row) => row.marketRatio);
      return {
        count: ratios.length,
        median: round(median(ratios)),
        average: round(mean(ratios)),
        q25: round(quantile(ratios, 0.25)),
        q75: round(quantile(ratios, 0.75)),
      };
    };
    const tiers = {
      under30k: summarize(trusted.filter((row) => row.marketPrice < 30000)),
      from30kTo100k: summarize(trusted.filter((row) => row.marketPrice >= 30000 && row.marketPrice < 100000)),
      over100k: summarize(trusted.filter((row) => row.marketPrice >= 100000)),
    };
    const latestDate = marked.map((row) => String(row.priceDate || "")).sort().at(-1) || null;
    return {
      ...summarize(allValid),
      trimmedAverage: round(mean(trusted.map((row) => row.marketRatio))),
      trustedCount: trusted.length,
      outlierCount: marked.filter((row) => row.outlier).length,
      staleCount: marked.filter((row) => row.stale).length,
      latestDate,
      reference: trusted.length < Number(options.minimumCount || 10),
      tiers,
    };
  }

  return {
    ageDays,
    buybackMetrics,
    evaluatePriceFloor,
    evaluateStoreDemand,
    inventoryDaysBySource,
    markRatioOutliers,
    mean,
    median,
    quantile,
    round,
    safeDivide,
    summarizeShopRates,
  };
});
