(function (root, factory) {
  const model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  if (root) root.LimitDisplayModel = model;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function classifyCap(value) {
    const rawCap = value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
    const capState = rawCap == null ? 'unavailable' : rawCap < 0 ? 'loss-at-zero' : 'available';
    return { rawCap, capState, cap: capState === 'available' ? Math.floor(rawCap / 500) * 500 : null,
      capLabel: capState === 'available' ? '仕入れ可能な上限あり' : capState === 'loss-at-zero' ? '0円仕入れでも赤字' : 'データ不足で算出不可',
      capNote: rawCap === 0 ? '正確な損益分岐は0円' : rawCap > 0 && rawCap < 500 ? '非負の上限を500円刻みで切下げ' : '' };
  }
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
    const current = limit.currentBreakEvenMaxPrice == null ? NaN : Number(limit.currentBreakEvenMaxPrice);
    const stable = limit.finalMaxPrice == null ? NaN : Number(limit.finalMaxPrice);
    const classification = classifyCap(Number(input.psa10Price) > 0
      ? Object.hasOwn(limit, 'currentBreakEvenRaw') ? limit.currentBreakEvenRaw : current : null);
    const currentCap = classification.cap;
    const stableCap = Number.isFinite(stable) && stable >= 0 && Number(input.psa10Price) > 0 ? stable : null;
    const zeroReasons = [];
    if (stableCap === 0) {
      if (Number.isFinite(limit.capitalMaxPrice) && limit.capitalMaxPrice <= 0) zeroReasons.push("資金枠なし");
      if (Number.isFinite(limit.normalMaxPrice) && limit.normalMaxPrice <= 0) zeroReasons.push("目標利益・利益率・鑑定費条件");
      if (Number.isFinite(limit.stressBreakEvenMaxPrice) && limit.stressBreakEvenMaxPrice <= 0) zeroReasons.push("供給ストレス時の採算");
      if (Number.isFinite(limit.operationalMaxPrice) && limit.operationalMaxPrice <= 0 && Number(limit.theoreticalFinalMaxPrice) > 0) zeroReasons.push("平滑化・保留上限");
    }
    const stableLabel = stableCap == null ? "算出不可・データ不足" : stableCap === 0 ? "設定条件を満たす上限なし" : null;
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
    if (classification.capState === 'unavailable') warnings.push("PSA10相場・損益分岐データ不足");
    if (classification.capState === 'loss-at-zero') warnings.push("0円仕入れでも費用込みの期待損益が赤字");
    if (!priceDate) warnings.push("採用価格の更新日未取得");
    else if (age > (buybackConstrained ? 14 : 30)) warnings.push(`採用価格が古い（${age}日）`);
    if (input.psa9Audit?.estimated === true) warnings.push("PSA9以下は推定値・実成約未取得");
    else if (!input.psa9Audit || !(Number(input.psa9Audit.value) > 0)) warnings.push("PSA9以下の価格未取得");
    if (exit.dataShortage) warnings.push("買取データ不足のためフリマ基準");
    const hitRate = Number(limit.hitRate);
    const gap = currentCap != null && stableCap != null ? currentCap - stableCap : null;
    return {
      currentCap, currentCapState: classification.capState, currentCapLabel: classification.capLabel,
      currentCapNote: classification.capNote, currentRawCap: classification.rawCap, stableCap, gap, exitLabel, priceDate, age,
      hitRate: Number.isFinite(hitRate) && hitRate > 0 ? hitRate : null,
      reason: zeroReasons.length ? zeroReasons.join("／") : String(input.reason || "制限理由未取得"), warnings, stableLabel,
    };
  }

  return { summarize, validDate, daysOld, classifyCap };
});
