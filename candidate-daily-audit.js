(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CandidateDailyAudit = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Keep legacy mask positions stable; new reasons are appended after them.
  const REASONS = ["search", "data", "capital", "profit", "inventory", "other", "quality"];

  function snapshot(cards, qualifications, completion, settings, date) {
    const rows = {};
    const details = {};
    const reasons = Object.fromEntries(REASONS.map((reason) => [reason, 0]));
    let candidates = 0;
    let purchasable = 0;
    for (const card of cards) {
      const flags = qualifications(card);
      const data = completion?.cards?.[card.id]?.s !== "分析可能"
        || card.dataQuality?.manualReview === true
        || card.dataQuality?.dataAnomaly === true
        || !(Number(card.price) > 0);
      const search = !data && (Number(card.saleTx30d || 0) < settings.minRawTrades30
        || Number(card.roi || 0) < settings.minRoi
        || !(Number(card.psa10) > 0 && Number(card.psa10) <= settings.maxPsa10));
      const capital = !data && (card.purchaseDecision?.verdict === "資金不足"
        || !(Number(card.buyLimits?.clean?.capitalMaxPrice) > 0));
      const quality = !data && card.purchaseDecision?.verdict === "見送り"
        && (card.purchaseDecision?.reasons || []).some((reason) => String(reason).includes("銘柄品質60点未満"));
      const profit = !data && ((card.purchaseDecision?.verdict === "見送り" && !quality)
        || !(Number(card.buyLimits?.clean?.finalMaxPrice) > 0)
        || !flags.stressSafe);
      const inventory = !data && !card.currentStoreOffer;
      const pass = !search && flags.combined === true;
      const now = pass && flags.now === true;
      const active = { search, data, capital, profit, inventory, other: !pass && !search && !data && !capital && !profit && !quality && !inventory, quality };
      if (pass) candidates += 1;
      if (now) purchasable += 1;
      if (!pass) for (const reason of REASONS) if (active[reason]) reasons[reason] += 1;
      rows[card.id] = [Number(pass), Number(now), REASONS.reduce((mask, reason, index) => mask | (active[reason] ? 1 << index : 0), 0),
        Number(card.torecaPrice) || null, Number(card.psa10) || null,
        Number(card.buyLimits?.clean?.finalMaxPrice) || null, Number(card.currentStoreOffer?.value) || null,
        Number(card.price) || null];
      if (completion?.cards?.[card.id]?.s === "分析可能") {
        const finite = (value) => value != null && Number.isFinite(Number(value)) ? Number(value) : null;
        details[card.id] = {
          expectedProfit: finite(card.psaDecision?.expectedProfit),
          expectedRoi: finite(card.psaDecision?.expectedRoi),
          calculationBasis: card.psaDecision?.calculationBasis || null,
          exit: card.buyLimits?.clean?.exitPolicy?.label || null,
          storeSource: card.currentStoreOffer?.source || null,
          storeUpdatedAt: card.currentStoreOffer?.updatedAt || null,
          stressAtLimitProfit: finite(card.buyLimits?.clean?.supplyStressAtFinal?.expectedProfit),
          verdict: card.purchaseDecision?.verdict || null,
          verdictReasons: card.purchaseDecision?.reasons || [],
        };
      }
    }
    return { date, settings, modelVersion: settings.modelVersion, cardCount: cards.length, candidates, purchasable, reasons, rows, details };
  }

  function compare(previous, current) {
    if (!previous || JSON.stringify(previous.settings) !== JSON.stringify(current.settings)) {
      return { status: previous ? "設定またはモデル変更・比較対象外" : "初回基準日・前日比較なし", sameSettings: false };
    }
    const commonIds = Object.keys(current.rows).filter((id) => previous.rows[id]);
    const lost = [], gained = [];
    const exclusion = Object.fromEntries(REASONS.map((reason) => [reason, 0]));
    const newlyFailed = Object.fromEntries(REASONS.map((reason) => [reason, 0]));
    const preexisting = Object.fromEntries(REASONS.map((reason) => [reason, 0]));
    let priceChanged = 0;
    let inventoryLost = 0;
    for (const id of commonIds) {
      const before = previous.rows[id];
      const after = current.rows[id];
      if (before[0] && !after[0]) {
        const causes = REASONS.filter((reason, index) => after[2] & (1 << index));
        const newReasons = causes.filter((reason) => !(before[2] & (1 << REASONS.indexOf(reason))));
        const existingReasons = causes.filter((reason) => !newReasons.includes(reason));
        for (const reason of causes) exclusion[reason] += 1;
        for (const reason of newReasons) newlyFailed[reason] += 1;
        for (const reason of existingReasons) preexisting[reason] += 1;
        const changed = [3, 4, 6, 7].some((index) => before[index] > 0 && after[index] > 0 && Math.abs(after[index] / before[index] - 1) >= 0.01);
        if (changed) priceChanged += 1;
        lost.push({ id, causes, newlyFailed: newReasons, preexisting: existingReasons, priceChanged: changed,
          before: { raw: before[3], psa10: before[4], store: before[6], adopted: before[7], limit: before[5], ...(previous.details?.[id] || { evidence: "利益・利益率・売却先は旧スナップショットに未記録" }) },
          after: { raw: after[3], psa10: after[4], store: after[6], adopted: after[7], limit: after[5], ...(current.details?.[id] || {}) } });
      } else if (!before[0] && after[0]) gained.push(id);
      if (before[1] && !after[1] && !after[6]) inventoryLost += 1;
    }
    const previousCommon = commonIds.filter((id) => previous.rows[id][0]).length;
    const currentCommon = commonIds.filter((id) => current.rows[id][0]).length;
    const isPreviousDay = Number.isFinite(Date.parse(previous.date)) && Date.parse(current.date) - Date.parse(previous.date) === 86400000;
    return {
      status: isPreviousDay ? "前日・同一条件と同一カード群" : "直近保存日比較（前日データなし）", sameSettings: true, isPreviousDay,
      previousDate: previous.date, currentDate: current.date, sameCardCount: commonIds.length,
      previousCandidates: previousCommon, currentCandidates: currentCommon,
      lostCount: lost.length, gainedCount: gained.length,
      newCardCount: Object.keys(current.rows).length - commonIds.length,
      removedCardCount: Object.keys(previous.rows).length - commonIds.length,
      exclusion, newlyFailed, preexisting, priceChangedAmongLost: priceChanged, inventoryLostFromNow: inventoryLost,
      lost: lost.slice(0, 100),
      note: "除外理由は重複計上。価格変化は同時発生した事実であり、単独の原因とは断定しません。検索設定は固定プロファイルです。",
    };
  }

  return { snapshot, compare };
});
