(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SnkrRawFlipModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function finite(value) {
    if (value == null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function median(values) {
    const sorted = values.map(finite).filter((value) => value != null).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function ageHours(value, now = new Date()) {
    const timestamp = Date.parse(value || "");
    return Number.isFinite(timestamp) ? Math.max(0, (now.getTime() - timestamp) / 3600000) : null;
  }

  function calculate(input = {}) {
    const purchasePrice = finite(input.purchasePrice);
    const sold30Median = finite(input.sold30Median);
    const listingPrice = finite(input.currentListingPrice);
    const salePrice = sold30Median > 0 ? sold30Median : listingPrice > 0 ? listingPrice : null;
    const feeRate = Math.min(100, Math.max(0, finite(input.feeRate) ?? 0));
    const shipping = Math.max(0, finite(input.shipping) ?? 0);
    const otherCost = Math.max(0, finite(input.otherCost) ?? 0);
    const fee = salePrice == null ? null : salePrice * feeRate / 100;
    const takeHome = salePrice == null ? null : salePrice - fee - shipping - otherCost;
    const profit = purchasePrice > 0 && takeHome != null ? takeHome - purchasePrice : null;
    const roi = purchasePrice > 0 && profit != null ? profit / purchasePrice * 100 : null;
    return {
      purchasePrice,
      salePrice,
      priceBasis: sold30Median > 0 ? "sold30Median" : listingPrice > 0 ? "currentListing" : "unavailable",
      feeRate,
      fee,
      shipping,
      otherCost,
      takeHome,
      profit,
      roi,
    };
  }

  function classify(input = {}, settings = {}) {
    const calculation = calculate({ ...input, ...settings });
    const sold7Count = finite(input.sold7Count);
    const sold30Count = finite(input.sold30Count);
    const fetchedAge = ageHours(input.fetchedAt, settings.now || new Date());
    const maxAgeHours = Math.max(1, finite(settings.maxAgeHours) ?? 48);
    const exact = input.linkageConfidence === "exact" || Number(input.linkageScore) >= 0.98;
    const safe = input.status === "ok" && input.identityValid !== false && input.anomaly !== true && fetchedAge != null && fetchedAge <= maxAgeHours;
    const profitable = calculation.profit != null && calculation.profit >= (finite(settings.minProfit) ?? 0)
      && calculation.roi != null && calculation.roi >= (finite(settings.minRoi) ?? 0);
    const active7 = sold7Count != null && sold7Count >= (finite(settings.minSold7) ?? 1);
    const active30 = sold30Count != null && sold30Count >= Math.max(3, finite(settings.minSold30) ?? 3);
    let tier = "none";
    if (safe && exact && calculation.priceBasis === "sold30Median" && profitable && active7 && active30) tier = "instant";
    else if (safe && calculation.priceBasis === "sold30Median" && profitable && active30) tier = "trading";
    else if (safe && calculation.profit != null && calculation.profit > 0) tier = "reference";
    return {
      ...calculation,
      tier,
      eligible: tier !== "none",
      sold7Count,
      sold30Count,
      fetchedAgeHours: fetchedAge,
      stale: fetchedAge == null || fetchedAge > maxAgeHours,
      exact,
      safe,
      soldConfirmed: calculation.priceBasis === "sold30Median",
      label: tier === "instant" ? "即売向き" : tier === "trading" ? "売買あり" : tier === "reference" ? "参考候補" : "対象外",
    };
  }

  return { finite, median, ageHours, calculate, classify };
});
