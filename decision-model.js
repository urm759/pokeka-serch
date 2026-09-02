(function attachDecisionModel(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PurchaseDecisionModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createDecisionModel() {
  const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

  function median(values) {
    const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function aggregatePrices(entries, options = {}) {
    const valid = entries
      .map((entry) => ({ ...entry, value: Number(entry.value) }))
      .filter((entry) => entry.value > 0 && Number.isFinite(entry.value));
    if (!valid.length) return { value: NaN, included: [], outliers: [] };

    const overallMedian = median(valid.map((entry) => entry.value));
    const minRatio = Number(options.minRatio ?? 0.55);
    const maxRatio = Number(options.maxRatio ?? 1.8);
    const clusterRatio = Math.max(1.01, Number(options.clusterRatio ?? 1.35));
    const sorted = [...valid].sort((left, right) => left.value - right.value);
    let bestCluster = [];
    for (let start = 0; start < sorted.length; start += 1) {
      const cluster = [];
      for (let end = start; end < sorted.length; end += 1) {
        if (sorted[end].value / sorted[start].value > clusterRatio) break;
        cluster.push(sorted[end]);
      }
      const spread = cluster.length > 1 ? cluster[cluster.length - 1].value / cluster[0].value : Infinity;
      const bestSpread = bestCluster.length > 1 ? bestCluster[bestCluster.length - 1].value / bestCluster[0].value : Infinity;
      if (cluster.length > bestCluster.length || (cluster.length === bestCluster.length && spread < bestSpread)) bestCluster = cluster;
    }

    // A close-price majority wins even when a single shop is far away.
    const hasMajorityCluster = bestCluster.length >= 2 && bestCluster.length > valid.length / 2;
    const anchor = hasMajorityCluster ? median(bestCluster.map((entry) => entry.value)) : overallMedian;
    const medianCandidates = valid.filter((entry) => entry.value / anchor >= minRatio && entry.value / anchor <= maxRatio);
    const hasEvenSplit = !hasMajorityCluster
      && valid.length > 1
      && medianCandidates.length <= valid.length / 2
      && valid.length - medianCandidates.length >= medianCandidates.length;
    const conflicted = hasEvenSplit
      || (valid.length === 2 && Math.max(...valid.map((entry) => entry.value)) / Math.min(...valid.map((entry) => entry.value)) > maxRatio);
    let included = conflicted
      ? valid
      : hasMajorityCluster
        ? bestCluster
        : medianCandidates;
    if (!included.length) included = valid;
    const outliers = conflicted ? [] : valid.filter((entry) => !included.includes(entry));
    return {
      value: included.length ? median(included.map((entry) => entry.value)) : NaN,
      included,
      outliers,
      anchor,
      conflicted,
      strategy: hasMajorityCluster ? "多数価格帯" : "全店舗中央値",
    };
  }

  function capitalPlan(settings) {
    const totalCapital = Math.max(0, Number(settings.totalCapital || 0));
    const lockedCapital = Math.max(0, Number(settings.lockedCapital || 0));
    const gradingReserve = Math.max(0, Number(settings.gradingReserve || 0));
    const submissionCount = Math.max(1, Math.floor(Number(settings.submissionCount || 1)));
    const fee = Math.max(0, Number(settings.fee || 0));
    const availableCapital = Math.max(0, totalCapital - lockedCapital - gradingReserve);
    const requiredReserve = fee * submissionCount;
    return {
      totalCapital,
      lockedCapital,
      gradingReserve,
      availableCapital,
      submissionCount,
      requiredReserve,
      reserveSufficient: gradingReserve >= requiredReserve,
      singleCardReserveSufficient: gradingReserve >= fee,
      perCardBatchCap: availableCapital / submissionCount,
    };
  }

  function gradeAssumptions(input) {
    const conditionFactor = input.condition === "scratch" ? 0.55 : 1;
    const officialRate = Number(input.officialRate);
    const hasOfficialRate = Number.isFinite(officialRate) && officialRate >= 0;
    const baseRate = hasOfficialRate ? officialRate / 100 : Number(input.fallbackRate || 0.7);
    const actualPsa9 = Number(input.psa9Price);
    const fallbackLowerGrade = Number(input.fallbackLowerGradePrice || 0);
    const lowerGradeBase = actualPsa9 > 0
      ? Math.min(actualPsa9, Number(input.forecastPrice || actualPsa9) * 0.95)
      : fallbackLowerGrade;
    return {
      hitRate: clamp(baseRate * conditionFactor, 0.01, 0.98),
      hitRateSource: hasOfficialRate ? "PSA公式取得率" : String(input.fallbackLabel || "設定取得率"),
      lowerGradePrice: Math.max(0, lowerGradeBase * (input.condition === "scratch" ? 0.8 : 1)),
      lowerGradeSource: actualPsa9 > 0 ? "PSA9市場価格" : "平均美品の75%推定",
    };
  }

  function expectedEconomics(input) {
    const purchasePrice = Math.max(0, Number(input.purchasePrice || 0));
    const fee = Math.max(0, Number(input.fee || 0));
    const saleMultiplier = Math.max(0, 1 - Number(input.saleFeeRate || 0) / 100);
    const saleExtraCost = Math.max(0, Number(input.saleExtraCost || 0));
    const riskMultiplier = Math.max(0, 1 - Number(input.riskBufferPct || 0) / 100);
    const psa10Net = Number(input.forecastPrice || 0) * saleMultiplier - saleExtraCost;
    const lowerGradeNet = Number(input.assumptions.lowerGradePrice || 0) * saleMultiplier - saleExtraCost;
    const expectedSaleBeforeRisk = input.assumptions.hitRate * psa10Net + (1 - input.assumptions.hitRate) * lowerGradeNet;
    const expectedSale = expectedSaleBeforeRisk * riskMultiplier;
    const expectedProfit = expectedSale - purchasePrice - fee;
    const investment = purchasePrice + fee;
    const expectedRoi = investment > 0 ? expectedProfit / investment * 100 : NaN;
    const annualEfficiency = investment > 0 && Number(input.lockDays) > 0 ? expectedRoi * 365 / Number(input.lockDays) : NaN;
    return { purchasePrice, psa10Net, lowerGradeNet, expectedSaleBeforeRisk, expectedSale, expectedProfit, expectedRoi, annualEfficiency };
  }

  function maxBuyPrice(input) {
    const zeroPurchase = expectedEconomics({ ...input, purchasePrice: 0 });
    const annualRequiredRoi = Number(input.lockDays) > 0 ? Number(input.minAnnualEfficiency || 0) * Number(input.lockDays) / 365 : 0;
    const requiredRoi = Math.max(0, Number(input.minExpectedRoi || 0), annualRequiredRoi) / 100;
    const roiCap = (zeroPurchase.expectedSale - Number(input.fee || 0) * (1 + requiredRoi)) / (1 + requiredRoi);
    const profitCap = zeroPurchase.expectedSale - Number(input.fee || 0) - Number(input.minExpectedProfit || 0);
    // This is the economic limit. Capital is evaluated separately so a shared
    // batch budget never makes every card display the same purchase ceiling.
    const rawMax = Math.min(roiCap, profitCap);
    const step = Math.max(1, Number(input.step || 500));
    return Math.max(0, Math.floor(rawMax / step) * step);
  }

  function targetProfitMaxBuyPrice(input, targetProfit = 0) {
    const zeroPurchase = expectedEconomics({ ...input, purchasePrice: 0, riskBufferPct: 0 });
    const rawMax = zeroPurchase.expectedSale - Math.max(0, Number(input.fee || 0)) - Math.max(0, Number(targetProfit || 0));
    const step = Math.max(1, Number(input.step || 500));
    return Math.max(0, Math.floor(rawMax / step) * step);
  }

  function downsideRoom(currentPrice, thresholdPrice) {
    const current = Number(currentPrice);
    const threshold = Number(thresholdPrice);
    if (!Number.isFinite(current) || current <= 0 || !Number.isFinite(threshold)) return { amount: null, rate: null };
    const amount = current - threshold;
    return { amount, rate: amount / current * 100 };
  }

  function resilienceMetrics(input) {
    const purchasePrice = Math.max(0, Number(input.purchasePrice || 0));
    const fee = Math.max(0, Number(input.fee || 0));
    const saleMultiplier = Math.max(0, 1 - Number(input.saleFeeRate || 0) / 100);
    const saleExtraCost = Math.max(0, Number(input.saleExtraCost || 0));
    const hitRate = clamp(Number(input.assumptions?.hitRate || 0), 0, 1);
    const lowerGradePrice = Math.max(0, Number(input.assumptions?.lowerGradePrice || 0));
    const currentPsa10Price = Math.max(0, Number(input.currentPsa10Price || 0));
    const bearishPsa10Price = Math.max(0, Number(input.bearishPsa10Price || 0));
    const targetProfit = Math.max(0, Number(input.targetProfit || 0));
    const denominator = hitRate * saleMultiplier;
    const lowerGradeContribution = (1 - hitRate) * lowerGradePrice * saleMultiplier;
    const psa10BreakEvenPrice = saleMultiplier > 0 ? (purchasePrice + fee + saleExtraCost) / saleMultiplier : null;
    const expectedBreakEvenPrice = denominator > 0
      ? (purchasePrice + fee + saleExtraCost - lowerGradeContribution) / denominator
      : null;
    const targetProfitBreakEvenPrice = denominator > 0
      ? (purchasePrice + fee + saleExtraCost + targetProfit - lowerGradeContribution) / denominator
      : null;
    const currentEconomics = expectedEconomics({ ...input, forecastPrice: currentPsa10Price, purchasePrice, riskBufferPct: 0 });
    const bearishEconomics = expectedEconomics({ ...input, forecastPrice: bearishPsa10Price, purchasePrice, riskBufferPct: 0 });
    const lowerGradeNet = lowerGradePrice * saleMultiplier - saleExtraCost;
    const psa9Profit = lowerGradeNet - purchasePrice - fee;
    const psa9NonLossMaxPrice = Math.max(0, lowerGradeNet - fee);
    return {
      psa10BreakEvenPrice: Number.isFinite(psa10BreakEvenPrice) ? psa10BreakEvenPrice : null,
      expectedBreakEvenPrice: Number.isFinite(expectedBreakEvenPrice) ? Math.max(0, expectedBreakEvenPrice) : null,
      targetProfitBreakEvenPrice: Number.isFinite(targetProfitBreakEvenPrice) ? Math.max(0, targetProfitBreakEvenPrice) : null,
      breakEvenRoom: downsideRoom(currentPsa10Price, expectedBreakEvenPrice),
      targetProfitRoom: downsideRoom(currentPsa10Price, targetProfitBreakEvenPrice),
      currentExpectedProfit: currentEconomics.expectedProfit,
      bearishExpectedProfit: bearishEconomics.expectedProfit,
      psa9Profit,
      psa9NonLossMaxPrice,
      currentPsa10Price,
      bearishPsa10Price,
      targetProfit,
    };
  }

  function capitalLimits(input) {
    const capital = input.capital || capitalPlan(input);
    const shareCap = Math.max(0, capital.totalCapital * Number(input.maxCapitalShare || 100) / 100);
    const capitalCap = Math.max(0, capital.availableCapital);
    return {
      perCardBatchCap: capital.perCardBatchCap,
      shareCap,
      capitalCap,
      practicalCap: Math.min(capitalCap, shareCap),
    };
  }

  function purchaseCaps(input) {
    const capital = input.capital || capitalPlan(input);
    const limits = capitalLimits({ capital, maxCapitalShare: input.maxCapitalShare });
    const economicMaxPrice = Math.max(0, Number(input.economicMaxPrice || 0));
    const requestedStressMaxPrice = Number(input.stressBreakEvenMaxPrice ?? input.stressMaxPrice);
    const stressBreakEvenMaxPrice = Number.isFinite(requestedStressMaxPrice)
      ? Math.max(0, requestedStressMaxPrice)
      : economicMaxPrice;
    const requestedUltraMaxPrice = Number(input.ultraLowRiskMaxPrice);
    const ultraLowRiskMaxPrice = Number.isFinite(requestedUltraMaxPrice)
      ? Math.max(0, requestedUltraMaxPrice)
      : stressBreakEvenMaxPrice;
    const lowRiskMode = input.lowRiskMode === true;
    const selectedRiskMaxPrice = lowRiskMode
      ? Math.min(stressBreakEvenMaxPrice, ultraLowRiskMaxPrice)
      : stressBreakEvenMaxPrice;
    const effectiveEconomicMaxPrice = Math.min(economicMaxPrice, selectedRiskMaxPrice);
    const capitalMaxPrice = capital.singleCardReserveSufficient ? limits.practicalCap : 0;
    const finalMaxPrice = Math.min(effectiveEconomicMaxPrice, capitalMaxPrice);
    const preStressFinalMaxPrice = Math.min(economicMaxPrice, capitalMaxPrice);
    const supplyRiskReflected = preStressFinalMaxPrice <= selectedRiskMaxPrice;
    const limitingFactor = finalMaxPrice <= 0
      ? "none"
      : capitalMaxPrice < effectiveEconomicMaxPrice
        ? "capital"
        : lowRiskMode && ultraLowRiskMaxPrice <= stressBreakEvenMaxPrice && ultraLowRiskMaxPrice < economicMaxPrice
          ? "ultra-low-risk"
          : stressBreakEvenMaxPrice < economicMaxPrice
            ? "stress-break-even"
          : "normal-economics";
    return {
      economicMaxPrice,
      normalMaxPrice: economicMaxPrice,
      stressMaxPrice: stressBreakEvenMaxPrice,
      stressBreakEvenMaxPrice,
      ultraLowRiskMaxPrice,
      selectedRiskMaxPrice,
      lowRiskMode,
      effectiveEconomicMaxPrice,
      capitalMaxPrice,
      finalMaxPrice,
      preStressFinalMaxPrice,
      limitingFactor,
      supplyRiskReflected,
      ...limits,
    };
  }

  function portfolioPlan(items, capitalInput) {
    const capital = capitalInput?.availableCapital != null ? capitalInput : capitalPlan(capitalInput || {});
    const normalized = (items || []).map((item) => ({
      price: Math.max(0, Number(item.price || 0)),
      quantity: Math.max(1, Math.floor(Number(item.quantity || 1))),
    }));
    const itemCount = normalized.length;
    const unitCount = normalized.reduce((total, item) => total + item.quantity, 0);
    const totalPurchase = normalized.reduce((total, item) => total + item.price * item.quantity, 0);
    return {
      itemCount,
      unitCount,
      totalPurchase,
      availableCapital: capital.availableCapital,
      remainingCapital: capital.availableCapital - totalPurchase,
      affordable: totalPurchase <= capital.availableCapital,
    };
  }

  function portfolioStress(items, declineRates = [10, 20, 30, 40, 50]) {
    const normalized = (items || []).map((item) => {
      const purchasePrice = Number(item.purchasePrice);
      const currentPsa10Price = Number(item.currentPsa10Price);
      const quantity = Number(item.quantity);
      const hitRate = Number(item.assumptions?.hitRate);
      const lowerGradePrice = Number(item.assumptions?.lowerGradePrice);
      return {
        ...item,
        quantity: Number.isFinite(quantity) ? Math.max(1, Math.floor(quantity)) : 1,
        purchasePrice: Number.isFinite(purchasePrice) ? Math.max(0, purchasePrice) : null,
        currentPsa10Price: Number.isFinite(currentPsa10Price) ? Math.max(0, currentPsa10Price) : null,
        assumptions: item.assumptions ? {
          ...item.assumptions,
          hitRate: Number.isFinite(hitRate) ? clamp(hitRate, 0, 1) : null,
          lowerGradePrice: Number.isFinite(lowerGradePrice) ? Math.max(0, lowerGradePrice) : null,
        } : null,
      };
    }).filter((item) => item.purchasePrice != null
      && item.currentPsa10Price > 0
      && item.assumptions?.hitRate != null
      && item.assumptions?.lowerGradePrice != null);
    return declineRates.map((rateValue) => {
      const declineRate = clamp(Number(rateValue || 0), 0, 100);
      let expectedProfit = 0;
      let lossTotal = 0;
      let lossCardCount = 0;
      let lossUnitCount = 0;
      for (const item of normalized) {
        const forecastPrice = item.currentPsa10Price * (1 - declineRate / 100);
        const economics = expectedEconomics({ ...item, forecastPrice, purchasePrice: item.purchasePrice, riskBufferPct: 0 });
        const itemProfit = economics.expectedProfit * item.quantity;
        expectedProfit += itemProfit;
        if (economics.expectedProfit < 0) {
          lossCardCount += 1;
          lossUnitCount += item.quantity;
          lossTotal += Math.abs(itemProfit);
        }
      }
      return {
        declineRate,
        expectedProfit,
        lossCardCount,
        lossUnitCount,
        lossTotal,
        requiredReserve: lossTotal,
        evaluatedCards: normalized.length,
      };
    });
  }

  function purchaseLimitMarketRatio(finalMaxPrice, marketPrice) {
    const limit = Number(finalMaxPrice);
    const market = Number(marketPrice);
    if (!Number.isFinite(limit) || !Number.isFinite(market) || market <= 0) return null;
    return Math.max(0, limit / market * 100);
  }

  function matchConfidenceLabel(score) {
    const value = Number(score);
    return Number.isFinite(value) && value >= 85 ? "high" : "low";
  }

  function isSuspectedCardMismatch(source) {
    if (!source) return false;
    if (source.cardMismatchSuspected === true
      || source.matchStatus === "mismatch"
      || source.linkStatus === "suspected-mismatch") return true;
    if (source.matchConfidence !== "low") return false;
    const score = Number(source.matchScore);
    return !Number.isFinite(score) || score < 85;
  }

  function purchaseDecision(input) {
    const reasons = [];
    const economics = input.economics;
    const capital = input.capital;
    const purchasePrice = Number(economics.purchasePrice || 0);
    const caps = purchaseCaps({
      capital,
      economicMaxPrice: input.economicMaxPrice ?? input.maxBuyPrice,
      stressBreakEvenMaxPrice: input.stressBreakEvenMaxPrice ?? input.stressMaxPrice,
      ultraLowRiskMaxPrice: input.ultraLowRiskMaxPrice,
      lowRiskMode: input.lowRiskMode,
      maxCapitalShare: input.maxCapitalShare,
    });
    const qualityScore = Number(input.qualityScore || 0);
    const riskReasons = Array.isArray(input.riskReasons) ? input.riskReasons.filter(Boolean) : [];
    const qualityEligible = qualityScore >= 60;
    const riskEligible = input.riskEligible !== false && riskReasons.length === 0;
    const targetProfitOnly = input.targetProfitOnly === true;
    const profitEligible = economics.expectedProfit >= Number(input.minExpectedProfit || 0)
      && (targetProfitOnly || economics.expectedRoi >= Number(input.minExpectedRoi || 0))
      && (targetProfitOnly || economics.annualEfficiency >= Number(input.minAnnualEfficiency || 0));
    const economicEligible = profitEligible && purchasePrice <= caps.effectiveEconomicMaxPrice;
    if (economics.expectedProfit < 0) reasons.push("現在価格では期待利益がマイナス");
    else if (economics.expectedProfit < Number(input.minExpectedProfit || 0)) reasons.push("最低期待利益を未達");
    if (!targetProfitOnly && economics.expectedRoi < Number(input.minExpectedRoi || 0)) reasons.push("最低期待利益率を未達");
    if (!targetProfitOnly && economics.annualEfficiency < Number(input.minAnnualEfficiency || 0)) reasons.push("最低年換算効率を未達");
    if (!qualityEligible) reasons.push(`銘柄品質60点未満（${Math.round(qualityScore)}/100）`);
    reasons.push(...riskReasons);
    if (purchasePrice > caps.capitalMaxPrice) reasons.push("1枚の価格が現在の資金上限を超過");
    if (!capital.singleCardReserveSufficient) reasons.push("1枚分の鑑定費予備資金が不足");
    const requiresManualReview = Boolean(input.requiresManualReview);
    const manualReviewReasons = Array.isArray(input.manualReviewReasons) ? input.manualReviewReasons.filter(Boolean) : [];
    const dataShortageReasons = Array.isArray(input.dataShortageReasons) ? input.dataShortageReasons.filter(Boolean) : [];
    if (requiresManualReview) reasons.push(...(manualReviewReasons.length ? manualReviewReasons : ["手動確認が必要"]));
    if (dataShortageReasons.length) reasons.push(`データ不足（${dataShortageReasons.join("・")}）`);

    let verdict;
    if (requiresManualReview) verdict = "要確認";
    else if (!qualityEligible || !riskEligible || caps.effectiveEconomicMaxPrice <= 0) verdict = "見送り";
    else if (economicEligible && purchasePrice > caps.capitalMaxPrice) verdict = "資金不足";
    else if (economicEligible && purchasePrice <= caps.finalMaxPrice) verdict = "GO";
    else if (caps.finalMaxPrice > 0) verdict = "価格次第";
    else verdict = profitEligible ? "資金不足" : "見送り";

    if (verdict === "価格次第") reasons.push(`¥${Math.floor(caps.finalMaxPrice).toLocaleString("ja-JP")}以下なら再判定`);
    if (caps.limitingFactor === "stress-break-even") reasons.push("弱気予測でも赤字にならない上限を反映");
    else if (caps.limitingFactor === "ultra-low-risk") reasons.push("低リスク設定：弱気予測でも目標利益を確保する上限を反映");
    else if (caps.supplyRiskReflected && Number.isFinite(Number(input.stressBreakEvenMaxPrice ?? input.stressMaxPrice))) reasons.push("弱気予測は価格側に反映済み（二重控除なし）");
    return {
      verdict,
      reasons: [...new Set(reasons)],
      singleCardSpend: purchasePrice,
      availableCapital: capital.availableCapital,
      ...caps,
    };
  }

  return { aggregatePrices, capitalLimits, capitalPlan, expectedEconomics, gradeAssumptions, isSuspectedCardMismatch, matchConfidenceLabel, maxBuyPrice, median, portfolioPlan, portfolioStress, purchaseCaps, purchaseDecision, purchaseLimitMarketRatio, resilienceMetrics, targetProfitMaxBuyPrice };
});
