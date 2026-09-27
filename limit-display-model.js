(function (root, factory) {
  const model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  if (root) root.LimitDisplayModel = model;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function validDate(value) {
    const date = String(value || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const parsed = Date.parse(`${date}T00:00:00Z`);
    return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === date ? date : null;
  }

  function daysOld(value, now) {
    const date = validDate(value);
    if (!date) return null;
    const elapsed = Date.parse(now) - Date.parse(`${date}T00:00:00+09:00`);
    return Number.isFinite(elapsed) ? Math.max(0, Math.floor(elapsed / 86400000)) : null;
  }

  function summarize(input = {}) {
    const limit = input.limit || {};
    const exit = limit.exitPolicy || {};
    const current = Number(limit.currentBreakEvenMaxPrice);
    const stable = Number(limit.finalMaxPrice);
    const currentCap = Number.isFinite(current) && current >= 0 && Number(input.psa10Price) > 0 ? current : null;
    const stableCap = Number.isFinite(stable) && stable >= 0 ? stable : null;
    const buybackConstrained = exit.adoptedPolicy === "buyback" || (
      exit.adoptedPolicy === "both" && Number(exit.buybackCurrentBreakEvenCap) <= Number(exit.marketplaceCurrentBreakEvenCap)
    );
    const trustedRows = limit.buybackExit?.trustedRows || [];
    const buybackDates = trustedRows.map((row) => validDate(row.priceDate)).filter(Boolean).sort();
    const exitLabel = exit.adoptedPolicy === "both"
      ? `買取店・フリマ両方（制約: ${buybackConstrained ? "買取店" : "フリマ"}）`
      : exit.adoptedPolicy === "buyback" ? "買取店" : "フリマ";
    const priceDate = buybackConstrained ? buybackDates[0] || null : validDate(input.domesticPsa10UpdatedAt);
    const age = daysOld(priceDate, input.now || new Date().toISOString());
    const warnings = [];
    if (currentCap == null) warnings.push("PSA10相場・損益分岐データ不足");
    if (!priceDate) warnings.push("採用価格の更新日未取得");
    else if (age > (buybackConstrained ? 14 : 30)) warnings.push(`採用価格が古い（${age}日）`);
    if (input.psa9Audit?.estimated === true) warnings.push("PSA9以下は推定値・実成約未取得");
    else if (!input.psa9Audit || !(Number(input.psa9Audit.value) > 0)) warnings.push("PSA9以下の価格未取得");
    if (exit.dataShortage) warnings.push("買取データ不足のためフリマ基準");
    const hitRate = Number(limit.hitRate);
    const gap = currentCap != null && stableCap != null ? currentCap - stableCap : null;
    return {
      currentCap, stableCap, gap, exitLabel, priceDate, age,
      hitRate: Number.isFinite(hitRate) && hitRate > 0 ? hitRate : null,
      reason: String(input.reason || "制限理由未取得"), warnings,
    };
  }

  return { summarize, validDate, daysOld };
});
