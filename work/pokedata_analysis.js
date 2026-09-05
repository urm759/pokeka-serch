function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalize(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
}

function parseJpy(value) {
  const number = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function quantile(values, ratio) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function weightedMedian(rows) {
  const sorted = rows.filter((row) => Number.isFinite(row.priceJpy) && row.weight > 0).sort((a, b) => a.priceJpy - b.priceJpy);
  const total = sorted.reduce((sum, row) => sum + row.weight, 0);
  if (!total) return null;
  let running = 0;
  for (const row of sorted) {
    running += row.weight;
    if (running >= total / 2) return row.priceJpy;
  }
  return sorted.at(-1)?.priceJpy ?? null;
}

function detectGrader(title) {
  if (/\bpsa\b/i.test(title)) return "PSA";
  if (/\b(?:bgs|beckett)\b/i.test(title)) return "BGS";
  if (/\bcgc\b/i.test(title)) return "CGC";
  if (/\btag\b/i.test(title)) return "TAG";
  if (/\bace\b/i.test(title)) return "ACE";
  if (/\bsgc\b/i.test(title)) return "SGC";
  return null;
}

function detectTitleGrade(title, grader) {
  if (!grader) return null;
  const match = title.match(new RegExp(`\\b${grader}\\s*(10|9|8|7|6)\\b`, "i"));
  return match ? Number(match[1]) : null;
}

function classifySale(input, identity) {
  const title = normalize(input.title);
  const titleAvailable = Boolean(title && title !== "none" && title !== "unavailable");
  const displayGrade = String(input.psa_grade || "").trim();
  const priceJpy = parseJpy(input.sold_price);
  const grader = titleAvailable ? detectGrader(title) : null;
  const titleGrade = titleAvailable ? detectTitleGrade(title, grader) : null;
  const reasons = [];
  const warnings = [];

  if (!priceJpy) reasons.push(input.priceParseFailed ? "価格形式解析失敗" : "価格欠損");
  if (!titleAvailable) reasons.push("商品名Unavailable");
  if (titleAvailable && /\b(?:korean|korea|kr)\b|한국/i.test(title)) reasons.push("日本版以外");
  if (titleAvailable && /\b(?:english|eng)\b/i.test(title) && !/japanese|jpn|\bjp\b/i.test(title)) reasons.push("日本版以外");
  if (titleAvailable && /\b(?:booster\s*(?:box|pack)|sealed|unopened|factory\s*sealed)\b/i.test(title)) reasons.push("未開封品");

  if (titleAvailable) {
    const cardNumber = String(identity.number || "").replace(/^0+/, "");
    const hasNumber = new RegExp(`(?:#|\\b)0*${cardNumber}(?:\\s*\\/\\s*\\d+)?\\b`, "i").test(title);
    const hasSet = identity.setAliases.some((alias) => title.includes(normalize(alias)));
    const hasName = identity.nameTokens.every((token) => title.includes(normalize(token)));
    const titleSetCodes = title.match(/\b(?:sv|sm|s)\s*\d+[a-z+\-]*\b/gi) || [];
    const normalizedAliases = identity.setAliases.map(normalize);
    const hasConflictingSet = titleSetCodes.length > 0
      && !titleSetCodes.some((code) => normalizedAliases.some((alias) => alias.includes(normalize(code)) || normalize(code).includes(alias)));
    if (!hasNumber) reasons.push("カード番号不一致");
    if (hasConflictingSet) reasons.push("セット不一致");
    if (!hasName) reasons.push("カード名不一致");
    if (!hasSet && !hasConflictingSet) warnings.push("セット表記省略・ページのセット情報で照合");
  }

  if (titleAvailable && /\b(?:lot of|playset|bundle|pair|set of|x\s*[2-9]|[2-9]\s*x|[2-9]\s*cards?)\b/i.test(title)) reasons.push("複数枚セット");
  if (grader && grader !== "PSA") reasons.push(`PSA以外の鑑定品:${grader}`);

  let marketGrade = displayGrade === "Raw" ? "Raw" : /^\d+$/.test(displayGrade) ? `PSA${displayGrade}` : "Unknown";
  if (grader === "PSA" && titleGrade) {
    marketGrade = `PSA${titleGrade}`;
    if (displayGrade === "Raw" || Number(displayGrade) !== titleGrade) warnings.push("表示グレードをタイトルから再分類");
  } else if (titleAvailable && /^\d+$/.test(displayGrade) && !grader) {
    reasons.push("PSA表記をタイトルで確認不可");
  }

  if (grader && grader !== "PSA") marketGrade = `${grader}${titleGrade || ""}`;
  const unavailable = reasons.includes("商品名Unavailable");
  const outOfScope = reasons.some((reason) => /^(?:日本版以外|複数枚セット|未開封品|PSA以外の鑑定品)/.test(reason));
  const identityConflict = reasons.some((reason) => /^(?:カード番号不一致|セット不一致|カード名不一致)$/.test(reason));
  const reviewClass = unavailable ? "unverifiable"
    : outOfScope ? "out-of-scope"
      : identityConflict ? "ambiguous"
        : reasons.length ? "unverifiable" : "auto-matched";
  const status = reviewClass === "auto-matched" ? "candidate" : reviewClass === "unverifiable" ? "unverified" : "excluded";
  return {
    rowId: String(input.rowId || ""),
    listingId: String(input.ebay_item_id || "").replace(/^eBay:\s*/i, "") || null,
    listingUrl: input.listingUrl || null,
    date: String(input.date_sold || "").slice(0, 10) || null,
    title: titleAvailable ? String(input.title).trim() : null,
    titleAvailable,
    displayedGrade: displayGrade || null,
    classifiedGrade: marketGrade,
    grader: grader || (displayGrade === "Raw" ? "RAW" : "UNVERIFIED"),
    priceJpy,
    displayCurrency: input.displayCurrency || null,
    marketplace: input.marketplace || null,
    seller: input.seller || null,
    observedAt: input.observedAt || null,
    status,
    reviewClass,
    reasons,
    warnings,
  };
}

function addOutlierFlags(rows) {
  const values = rows.map((row) => row.priceJpy).filter(Number.isFinite);
  if (values.length < 8) return rows.map((row) => ({ ...row, outlier: false }));
  const q1 = quantile(values, 0.25);
  const q3 = quantile(values, 0.75);
  const iqr = q3 - q1;
  const low = Math.max(0, q1 - 1.5 * iqr);
  const high = q3 + 1.5 * iqr;
  return rows.map((row) => ({ ...row, outlier: row.priceJpy < low || row.priceJpy > high, outlierBounds: { low, high } }));
}

function summarizeGrade(allRows, grade, fxRate) {
  const displayLabel = grade === "Raw" ? "Raw" : grade.replace("PSA", "");
  const original = allRows.filter((row) => row.displayedGrade === displayLabel);
  const verifiedCandidates = allRows.filter((row) => row.classifiedGrade === grade && row.status === "candidate");
  const checked = addOutlierFlags(verifiedCandidates);
  const adopted = checked.filter((row) => !row.outlier);
  const adoptedIds = new Set(adopted.map((row) => row.rowId));
  const excluded = original.filter((row) => !adoptedIds.has(row.rowId));
  const outliers = checked.filter((row) => row.outlier);
  const outlierIds = new Set(outliers.map((row) => row.rowId));
  const reasonCounts = {};
  for (const row of excluded) {
    const reasons = outlierIds.has(row.rowId) ? ["外れ値"] : row.reasons.length ? row.reasons : ["表示グレードをタイトルから再分類"];
    for (const reason of reasons) reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
  }
  const latestTime = Math.max(...adopted.map((row) => Date.parse(row.date)).filter(Number.isFinite), 0);
  const weighted = adopted.map((row) => {
    const days = latestTime ? Math.max(0, (latestTime - Date.parse(row.date)) / 86400000) : 999;
    return { ...row, weight: days <= 30 ? 3 : days <= 90 ? 2 : 1 };
  });
  const prices = adopted.map((row) => row.priceJpy);
  const confidence = adopted.length >= 20 ? "高" : adopted.length >= 8 ? "中" : adopted.length >= 3 ? "低" : "参考値";
  const medianJpy = median(prices);
  const latestDate = adopted.map((row) => row.date).filter(Boolean).sort().at(-1) || null;
  const earliestDate = adopted.map((row) => row.date).filter(Boolean).sort().at(0) || null;
  const latestTimeForPeriod = latestDate ? Date.parse(latestDate) : null;
  const periodRows = (fromDay, toDay) => adopted.filter((row) => {
    if (!latestTimeForPeriod || !row.date) return false;
    const days = (latestTimeForPeriod - Date.parse(row.date)) / 86400000;
    return days >= fromDay && days <= toDay;
  });
  const recent30 = periodRows(0, 29);
  const prior30 = periodRows(30, 59);
  const recentMedian = median(recent30.map((row) => row.priceJpy));
  const priorMedian = median(prior30.map((row) => row.priceJpy));
  const trendChangePct = recentMedian && priorMedian ? (recentMedian / priorMedian - 1) * 100 : null;
  const trendDirection = !Number.isFinite(trendChangePct) ? "蓄積中" : trendChangePct > 3 ? "上昇" : trendChangePct < -3 ? "下降" : "横ばい";
  return {
    grade,
    originalCount: original.length,
    verifiedCandidateCount: verifiedCandidates.length,
    adoptedCount: adopted.length,
    excludedCount: excluded.length,
    reclassifiedInCount: adopted.filter((row) => row.displayedGrade !== displayLabel).length,
    reclassifiedOutCount: original.filter((row) => row.classifiedGrade !== grade).length,
    unavailableTitleCount: excluded.filter((row) => row.reasons.includes("商品名Unavailable")).length,
    outlierCount: outliers.length,
    excludedReasons: reasonCounts,
    reviewClassCounts: allRows.reduce((counts, row) => {
      counts[row.reviewClass] = (counts[row.reviewClass] || 0) + 1;
      return counts;
    }, {}),
    medianJpy,
    medianUsd: medianJpy && fxRate ? medianJpy / fxRate : null,
    weightedMedianJpy: weightedMedian(weighted),
    minJpy: prices.length ? Math.min(...prices) : null,
    maxJpy: prices.length ? Math.max(...prices) : null,
    lastSaleDate: latestDate,
    firstSaleDate: earliestDate,
    targetPeriod: earliestDate && latestDate ? `${earliestDate}～${latestDate}` : null,
    periodCounts: { days30: recent30.length, days90: periodRows(0, 89).length, all: adopted.length },
    trend: { direction: trendDirection, latest30MedianJpy: recentMedian, previous30MedianJpy: priorMedian, changePct: trendChangePct },
    confidence,
  };
}

function analyzeSales(sales, identity, fxRate) {
  const classified = sales.map((sale) => classifySale(sale, identity));
  const summaries = {
    raw: summarizeGrade(classified, "Raw", fxRate),
    psa10: summarizeGrade(classified, "PSA10", fxRate),
    psa9: summarizeGrade(classified, "PSA9", fxRate),
  };
  return { classified, summaries };
}

module.exports = { analyzeSales, classifySale, median, normalize, parseJpy, quantile, weightedMedian, finite };
