(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CandidateDailyAudit = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const REASONS = ["search", "data", "capital", "profit", "inventory", "other"];

  function snapshot(cards, qualifications, completion, settings, date) {
    const rows = {};
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
      const profit = !data && (card.purchaseDecision?.verdict === "見送り"
        || !(Number(card.buyLimits?.clean?.finalMaxPrice) > 0)
        || !flags.stressSafe);
      const inventory = !data && !card.currentStoreOffer;
      const pass = !search && flags.combined === true;
      const now = pass && flags.now === true;
      const active = { search, data, capital, profit, inventory, other: !pass && !search && !data && !capital && !profit };
      if (pass) candidates += 1;
      if (now) purchasable += 1;
      if (!pass) for (const reason of REASONS) if (active[reason]) reasons[reason] += 1;
      rows[card.id] = [Number(pass), Number(now), REASONS.reduce((mask, reason, index) => mask | (active[reason] ? 1 << index : 0), 0),
        Number(card.torecaPrice) || null, Number(card.psa10) || null,
        Number(card.buyLimits?.clean?.finalMaxPrice) || null, Number(card.currentStoreOffer?.value) || null,
        Number(card.price) || null];
    }
    return { date, settings, modelVersion: settings.modelVersion, cardCount: cards.length, candidates, purchasable, reasons, rows };
  }

  function compare(previous, current) {
    if (!previous || JSON.stringify(previous.settings) !== JSON.stringify(current.settings)) {
      return { status: previous ? "設定またはモデル変更・比較対象外" : "初回基準日・前日比較なし", sameSettings: false };
    }
    const commonIds = Object.keys(current.rows).filter((id) => previous.rows[id]);
    const lost = [], gained = [];
    const exclusion = Object.fromEntries(REASONS.map((reason) => [reason, 0]));
    let priceChanged = 0;
    let inventoryLost = 0;
    for (const id of commonIds) {
      const before = previous.rows[id];
      const after = current.rows[id];
      if (before[0] && !after[0]) {
        const causes = REASONS.filter((reason, index) => after[2] & (1 << index));
        for (const reason of causes) exclusion[reason] += 1;
        const changed = [3, 4, 6, 7].some((index) => before[index] > 0 && after[index] > 0 && Math.abs(after[index] / before[index] - 1) >= 0.01);
        if (changed) priceChanged += 1;
        lost.push({ id, causes, priceChanged: changed, before: { raw: before[3], psa10: before[4], store: before[6], adopted: before[7], limit: before[5] }, after: { raw: after[3], psa10: after[4], store: after[6], adopted: after[7], limit: after[5] } });
      } else if (!before[0] && after[0]) gained.push(id);
      if (before[1] && !after[1] && !after[6]) inventoryLost += 1;
    }
    const previousCommon = commonIds.filter((id) => previous.rows[id][0]).length;
    const currentCommon = commonIds.filter((id) => current.rows[id][0]).length;
    return {
      status: "同一条件・同一カード群", sameSettings: true,
      previousDate: previous.date, currentDate: current.date, sameCardCount: commonIds.length,
      previousCandidates: previousCommon, currentCandidates: currentCommon,
      lostCount: lost.length, gainedCount: gained.length,
      newCardCount: Object.keys(current.rows).length - commonIds.length,
      removedCardCount: Object.keys(previous.rows).length - commonIds.length,
      exclusion, priceChangedAmongLost: priceChanged, inventoryLostFromNow: inventoryLost,
      lost: lost.slice(0, 100),
      note: "除外理由は重複計上。価格変化は同時発生した事実であり、単独の原因とは断定しません。検索設定は固定プロファイルです。",
    };
  }

  return { snapshot, compare };
});
