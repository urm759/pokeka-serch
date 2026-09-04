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

  function weightedMedian(entries) {
    const valid = entries
      .map((entry) => ({ value: Number(entry.value), weight: Math.max(0.25, Number(entry.weight || 1)) }))
      .filter((entry) => Number.isFinite(entry.value) && entry.value > 0);
    if (!valid.length) return NaN;
    const weights = valid.map((entry) => entry.weight);
    if (weights.every((weight) => Math.abs(weight - weights[0]) < 0.001)) return median(valid.map((entry) => entry.value));
    const expanded = valid.flatMap((entry) => Array.from({ length: Math.max(1, Math.min(20, Math.round(entry.weight * 4))) }, () => entry.value));
    return median(expanded);
  }

  function dateOnly(value) {
    return String(value || "").match(/^\d{4}-\d{2}-\d{2}/)?.[0] || null;
  }

  function ageDays(date, asOfDate) {
    const left = dateOnly(date);
    const right = dateOnly(asOfDate);
    if (!left || !right) return null;
    const days = Math.floor((Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) / 86400000);
    return Number.isFinite(days) ? Math.max(0, days) : null;
  }

  function aggregatePrices(entries, options = {}) {
    const asOfDate = dateOnly(options.asOfDate);
    const staleAfterDays = Math.max(1, Number(options.staleAfterDays ?? 14));
    const excludeAfterDays = Math.max(staleAfterDays, Number(options.excludeAfterDays ?? 45));
    const prepared = entries.map((entry) => {
      const value = Number(entry.value);
      const age = ageDays(entry.updatedAt, asOfDate);
      const reasons = [];
      if (!(value > 0) || !Number.isFinite(value)) reasons.push("価格未取得");
      if (entry.valid === false) reasons.push(entry.invalidReason || "カード仕様の照合不一致");
      if (entry.conditionAccepted === false) reasons.push(entry.conditionReason || "美品・状態A以外");
      if (entry.languageAccepted === false) reasons.push("日本語版以外の疑い");
      if (entry.gradeAccepted === false) reasons.push("未鑑定品またはPSA10以外");
      if (age != null && age > excludeAfterDays) reasons.push(`更新${age}日前`);
      const stale = age != null && age > staleAfterDays;
      return {
        ...entry,
        value,
        ageDays: age,
        stale,
        weight: Math.max(0.25, Number(entry.weight || 1)) * (stale ? 0.5 : 1),
        excludedReasons: reasons,
      };
    });
    const valid = prepared.filter((entry) => entry.excludedReasons.length === 0);
    const invalid = prepared.filter((entry) => entry.excludedReasons.length > 0);
    if (!valid.length) return { value: NaN, included: [], outliers: [], excluded: invalid, confidence: "低", provisional: true, priceDivergence: false, asOfDate };

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
    const includedValues = included.map((entry) => entry.value);
    const rangeMin = Math.min(...valid.map((entry) => entry.value));
    const rangeMax = Math.max(...valid.map((entry) => entry.value));
    const spreadPct = overallMedian > 0 ? (rangeMax - rangeMin) / overallMedian * 100 : null;
    const priceDivergence = Number.isFinite(spreadPct) && spreadPct > Number(options.divergencePct ?? 35);
    const staleCount = included.filter((entry) => entry.stale).length;
    const confidence = conflicted || (priceDivergence && included.length < 3)
      ? "低"
      : included.length >= 3 && staleCount === 0 && !priceDivergence
        ? "高"
        : included.length >= 2
          ? "中"
          : "低";
    return {
      value: included.length ? weightedMedian(included) : NaN,
      included,
      outliers,
      excluded: invalid,
      anchor,
      conflicted,
      min: includedValues.length ? Math.min(...includedValues) : NaN,
      max: includedValues.length ? Math.max(...includedValues) : NaN,
      rangeMin,
      rangeMax,
      spreadPct,
      priceDivergence,
      provisional: included.length < 2 || confidence === "低",
      confidence,
      staleCount,
      asOfDate,
      strategy: hasMajorityCluster ? "多数価格帯" : "全店舗中央値",
    };
  }

  function resolvePsa9Price(input = {}) {
    const directPrice = Number(input.directPrice);
    if (directPrice > 0 && Number.isFinite(directPrice)) {
      return { value: directPrice, source: "直近PSA9実成約", periodDays: Number(input.directPeriodDays || 0) || null, count: Math.max(1, Number(input.directCount || 1)), confidence: "高", estimated: false };
    }
    const asOf = dateOnly(input.asOfDate);
    const trades = (Array.isArray(input.trades) ? input.trades : [])
      .map((trade) => ({ value: Number(trade?.price ?? trade?.value), updatedAt: trade?.date || trade?.updatedAt, weight: 1 }))
      .filter((trade) => trade.value > 0 && Number.isFinite(trade.value));
    for (const days of [30, 60, 90]) {
      const period = trades.filter((trade) => {
        const age = ageDays(trade.updatedAt, asOf);
        return age != null && age <= days;
      });
      const minimum = days === 30 ? 2 : 3;
      if (period.length < minimum) continue;
      const aggregate = aggregatePrices(period, { asOfDate: asOf, staleAfterDays: days, excludeAfterDays: days, minRatio: 0.55, maxRatio: 1.8 });
      if (aggregate.value > 0 && aggregate.included.length >= minimum) {
        return { value: aggregate.value, source: `${days}日PSA9成約中央値`, periodDays: days, count: aggregate.included.length, confidence: days === 30 ? "高" : "中", estimated: false, aggregate };
      }
    }
    const cohortRatio = Number(input.cohortRatio);
    const psa10Price = Number(input.psa10Price);
    if (cohortRatio > 0 && psa10Price > 0 && Number(input.cohortCount || 0) >= Number(input.minimumCohortCount || 12)) {
      return { value: psa10Price * cohortRatio, source: "年代・価格帯・レアリティ別PSA10比率", periodDays: null, count: Number(input.cohortCount), confidence: "中", estimated: true };
    }
    const fallbackPrice = Number(input.fallbackPrice);
    return {
      value: Math.max(0, Number.isFinite(fallbackPrice) ? fallbackPrice : 0),
      source: String(input.fallbackSource || "平均美品の75%推定"),
      periodDays: null,
      count: 0,
      confidence: "低",
      estimated: true,
    };
  }

  function capRoundingStep(value) {
    const price = Math.max(0, Number(value || 0));
    if (price < 10000) return 500;
    if (price < 30000) return 1000;
    if (price < 100000) return 2500;
    return 5000;
  }

  function operationalCap(input = {}) {
    const theoretical = Math.max(0, Number(input.theoreticalCap || 0));
    const step = Math.max(1, Number(input.roundingStep || capRoundingStep(theoretical)));
    const rounded = Math.floor(theoretical / step) * step;
    const history = (Array.isArray(input.history) ? input.history : [])
      .filter((row) => Number(row?.theoretical) >= 0 && Number(row?.operational) >= 0)
      .sort((left, right) => String(left.date || "").localeCompare(String(right.date || "")));
    const previous = history.at(-1) || null;
    const distinctDays = new Set(history.map((row) => dateOnly(row.date)).filter(Boolean)).size;
    const config = {
      deadbandPct: Math.max(0, Number(input.config?.deadbandPct ?? 3)),
      increaseConfirmations: Math.max(2, Math.floor(Number(input.config?.increaseConfirmations ?? 3))),
      highConfidenceDays: Math.max(3, Math.floor(Number(input.config?.highConfidenceDays ?? 7))),
      initialSafetyFactor: clamp(Number(input.config?.initialSafetyFactor ?? 1), 0.5, 1),
    };
    const calculationVersion = "operational-cap-v2";
    const windowMedian = (days, currentOperational) => {
      const anchor = dateOnly(input.asOfDate) || dateOnly(new Date().toISOString());
      const values = history
        .filter((row) => {
          const age = ageDays(row.date, anchor);
          return age != null && age < days;
        })
        .map((row) => Number(row.operational))
        .filter(Number.isFinite);
      if (Number.isFinite(currentOperational)) values.push(currentOperational);
      return values.length ? median(values) : null;
    };
    const withAudit = (result) => {
      const hasPreviousValue = result.previous != null && Number.isFinite(Number(result.previous));
      const previousValue = hasPreviousValue ? Number(result.previous) : null;
      const abruptPct = previousValue > 0
        ? Math.abs(Number(result.operational) - previousValue) / previousValue * 100
        : null;
      return {
        ...result,
        todayLimit: rounded,
        previousLimit: previousValue,
        median7: windowMedian(7, result.operational),
        median30: windowMedian(30, result.operational),
        calculationVersion,
        abrupt: Number.isFinite(abruptPct) && abruptPct >= 15,
        abruptPct,
        changeReason: result.reason,
      };
    };
    if (!previous) {
      const operational = Math.floor((rounded * config.initialSafetyFactor) / step) * step;
      const safetyText = config.initialSafetyFactor < 1
        ? `初回安全係数 ${(config.initialSafetyFactor * 100).toFixed(0)}%を適用`
        : "初回は理論最終上限を価格帯単位で切り下げ";
      return withAudit({
        theoretical,
        roundedTheoretical: rounded,
        operational,
        previous: null,
        previousDate: null,
        initial: true,
        initialSafetyFactor: config.initialSafetyFactor,
        smoothing: "平滑化なし",
        change: null,
        changePct: null,
        reason: safetyText,
        confidence: "蓄積中",
        provisional: true,
        step,
      });
    }
    const previousOperational = Math.max(0, Number(previous.operational));
    let operational = previousOperational;
    let reason = "小幅変動のため前回上限を維持";
    if (rounded < previousOperational) {
      operational = rounded;
      reason = "危険方向のため上限引き下げを即時反映";
    } else if (rounded > previousOperational) {
      const threshold = previousOperational * (1 + config.deadbandPct / 100);
      const confirmations = [...history.slice(-(config.increaseConfirmations - 1)), { theoretical: rounded }];
      const confirmed = confirmations.length >= config.increaseConfirmations && confirmations.every((row) => Number(row.theoretical) >= threshold);
      if (confirmed) {
        operational = Math.min(rounded, Math.floor(median(confirmations.map((row) => Number(row.theoretical))) / step) * step);
        reason = "安全な理論上限の継続を確認して値上げ";
      } else if (rounded <= threshold) {
        reason = "デッドバンド内のため前回上限を維持";
      } else {
        reason = `値上げ確認中（${config.increaseConfirmations}回継続で反映）`;
      }
    }
    const change = operational - previousOperational;
    const changePct = previousOperational > 0 ? change / previousOperational * 100 : null;
    const confidence = distinctDays >= config.highConfidenceDays ? "確定度高" : distinctDays >= 3 ? "確定度中" : "蓄積中";
    return withAudit({
      theoretical,
      roundedTheoretical: rounded,
      operational,
      previous: previousOperational,
      previousDate: dateOnly(previous.date),
      initial: false,
      initialSafetyFactor: null,
      smoothing: reason.includes("値上げ") ? `${config.increaseConfirmations}回確認後の中央値` : reason.includes("維持") || reason.includes("確認中") ? `デッドバンド ${config.deadbandPct}%` : "危険方向は平滑化せず即時反映",
      change,
      changePct,
      reason,
      confidence,
      provisional: distinctDays < 3,
      step,
    });
  }

  function buybackExitProfit(input = {}) {
    const buybackPrice = Math.max(0, Number(input.buybackPrice || 0));
    const purchasePrice = Math.max(0, Number(input.purchasePrice || 0));
    const gradingFee = Math.max(0, Number(input.gradingFee || 0));
    const extraCost = Math.max(0, Number(input.extraCost || 0));
    const fixedRate = clamp(Number(input.deductionRate ?? 3), 0, 5);
    const observedRate = Number(input.observedDeductionRate);
    const useObserved = input.mode === "observed" && Number.isFinite(observedRate) && observedRate >= 0 && observedRate <= 5;
    const deductionRate = useObserved ? observedRate : fixedRate;
    const deductionAmount = buybackPrice * deductionRate / 100;
    const beforeDeductionProfit = buybackPrice - purchasePrice - gradingFee - extraCost;
    const afterDeductionProfit = buybackPrice - deductionAmount - purchasePrice - gradingFee - extraCost;
    return {
      buybackPrice,
      deductionRate,
      deductionSource: useObserved ? "店舗・カード実績" : "固定設定",
      deductionAmount,
      beforeDeductionProfit,
      afterDeductionProfit,
      marketplaceFeeApplied: false,
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
      lowerGradeSource: actualPsa9 > 0 ? String(input.psa9Source || "PSA9市場価格") : String(input.fallbackLowerGradeSource || "平均美品の75%推定"),
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

  function economicsScenarioMatrix(input = {}) {
    const purchasePrices = {
      currentPurchase: Number(input.currentPurchasePrice),
      operationalLimit: Number(input.operationalLimitPrice),
    };
    const salePrices = {
      currentMarket: Number(input.currentPsa10Price),
      centralForecast: Number(input.centralForecastPrice),
      supplyStress: Number(input.supplyStressPrice),
    };
    const calculate = (purchasePrice, forecastPrice) => {
      if (!(purchasePrice > 0) || !(forecastPrice > 0) || !input.assumptions) return null;
      return expectedEconomics({ ...input, purchasePrice, forecastPrice, riskBufferPct: 0 });
    };
    return Object.fromEntries(Object.entries(purchasePrices).map(([purchaseKey, purchasePrice]) => [
      purchaseKey,
      Object.fromEntries(Object.entries(salePrices).map(([saleKey, salePrice]) => [saleKey, calculate(purchasePrice, salePrice)])),
    ]));
  }

  function purchaseAvailability(input = {}) {
    const marketPrice = Number(input.marketPrice);
    const finalLimit = Number(input.finalLimit);
    const offer = input.offer && typeof input.offer === "object" ? input.offer : null;
    const marketWithinLimit = marketPrice > 0 && finalLimit > 0 && marketPrice <= finalLimit;
    const offerPrice = Number(offer?.value);
    const offerFresh = offer?.fresh === true;
    const offerInStock = offer?.available === true;
    const priceReviewRequired = input.priceReviewRequired === true;
    const decisionBlocked = ["見送り", "要確認", "資金不足"].includes(String(input.verdict || ""));
    const verifiedNow = finalLimit > 0
      && offerPrice > 0
      && offerPrice <= finalLimit
      && offerFresh
      && offerInStock
      && !priceReviewRequired
      && !decisionBlocked;
    let label = "上限価格待ち";
    let reason = finalLimit > 0 ? `購入可能価格が上限¥${Math.floor(finalLimit).toLocaleString("ja-JP")}を超過または未取得` : "有効な仕入れ上限なし";
    if (priceReviewRequired) {
      label = "価格要確認";
      reason = "価格乖離または紐付けを手動確認するまで購入不可";
    } else if (verifiedNow) {
      label = "購入先確認済み／今すぐ仕入れ";
      reason = `${offer.source || "販売店"}の在庫あり価格¥${Math.floor(offerPrice).toLocaleString("ja-JP")}を確認`;
    } else if (marketWithinLimit) {
      label = "相場基準では仕入れ圏";
      reason = "基準相場は上限以下だが、新しい在庫あり購入先は未確認";
    }
    return {
      marketWithinLimit,
      verifiedNow,
      label,
      reason,
      offerPrice: offerPrice > 0 ? offerPrice : null,
      offerFresh,
      offerInStock,
    };
  }

  function bargainDecisionEligible(input = {}) {
    return String(input.verdict || "") === "価格次第" || String(input.goConfidence || "") === "暫定GO";
  }

  function operationalCapConcentration(values) {
    const frequencies = new Map();
    for (const value of Array.isArray(values) ? values : []) {
      const price = Number(value);
      if (!(price > 0) || !Number.isFinite(price)) continue;
      frequencies.set(price, (frequencies.get(price) || 0) + 1);
    }
    const ranked = [...frequencies.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0]);
    const [price = null, count = 0] = ranked[0] || [];
    const total = [...frequencies.values()].reduce((sum, value) => sum + value, 0);
    return { price, count, total, sharePct: total > 0 ? count / total * 100 : null };
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
    const theoreticalFinalMaxPrice = Math.min(effectiveEconomicMaxPrice, capitalMaxPrice);
    const requestedOperationalMaxPrice = Number(input.operationalMaxPrice);
    const operationalMaxPrice = Number.isFinite(requestedOperationalMaxPrice)
      ? Math.max(0, requestedOperationalMaxPrice)
      : theoreticalFinalMaxPrice;
    const finalMaxPrice = Math.min(theoreticalFinalMaxPrice, operationalMaxPrice);
    const preStressFinalMaxPrice = Math.min(economicMaxPrice, capitalMaxPrice);
    const supplyRiskReflected = preStressFinalMaxPrice <= selectedRiskMaxPrice;
    const limitingFactor = finalMaxPrice <= 0
      ? "none"
      : operationalMaxPrice < theoreticalFinalMaxPrice
        ? "operational"
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
      theoreticalFinalMaxPrice,
      operationalMaxPrice,
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
      operationalMaxPrice: input.operationalMaxPrice,
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
    if (caps.limitingFactor === "stress-break-even") reasons.push("供給ストレス時でも赤字にならない上限を反映");
    else if (caps.limitingFactor === "ultra-low-risk") reasons.push("低リスク設定：供給ストレス時でも目標利益を確保する上限を反映");
    else if (caps.limitingFactor === "operational") reasons.push("運用上限の平滑値を反映");
    else if (caps.supplyRiskReflected && Number.isFinite(Number(input.stressBreakEvenMaxPrice ?? input.stressMaxPrice))) reasons.push("供給ストレスは価格側に反映済み（二重控除なし）");
    return {
      verdict,
      reasons: [...new Set(reasons)],
      singleCardSpend: purchasePrice,
      availableCapital: capital.availableCapital,
      ...caps,
    };
  }

  return { aggregatePrices, bargainDecisionEligible, buybackExitProfit, capRoundingStep, capitalLimits, capitalPlan, economicsScenarioMatrix, expectedEconomics, gradeAssumptions, isSuspectedCardMismatch, matchConfidenceLabel, maxBuyPrice, median, operationalCap, operationalCapConcentration, portfolioPlan, portfolioStress, purchaseAvailability, purchaseCaps, purchaseDecision, purchaseLimitMarketRatio, resilienceMetrics, resolvePsa9Price, targetProfitMaxBuyPrice, weightedMedian };
});
