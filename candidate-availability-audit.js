(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CandidateAvailabilityAudit = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function snapshot(cards, qualifications, date, generatedAt, modelVersion) {
    const rows = {};
    const counts = { combined: 0, now: 0, priceWait: 0, missingOffer: 0, aboveLimit: 0 };
    for (const card of cards) {
      const flags = qualifications(card);
      if (!flags.combined) continue;
      const limit = Number(card.buyLimits?.clean?.finalMaxPrice || 0);
      const offer = card.currentStoreOffer;
      const offerPrice = Number(offer?.value || 0);
      const status = flags.now ? "購入先確認済み" : "価格待ち";
      const reason = flags.now ? "上限内の購入可能価格を確認" : !offer ? "購入可能な状態A価格未取得"
        : offerPrice > limit ? "店舗価格が安定重視上限を超過" : "利益・品質・鮮度条件を再確認";
      counts.combined += 1;
      if (flags.now) counts.now += 1;
      else {
        counts.priceWait += 1;
        if (!offer) counts.missingOffer += 1;
        else if (offerPrice > limit) counts.aboveLimit += 1;
      }
      rows[card.id] = {
        status, reason, limit, offerPrice: offerPrice || null, store: offer?.source || null,
        storeUpdatedAt: offer?.updatedAt || null, gap: offerPrice > 0 ? Math.max(0, offerPrice - limit) : null,
        cardrushLinked: Boolean(card.cardrushUrl), hareruya2Linked: Boolean(card.hareruya2Url),
      };
    }
    return { date, generatedAt, modelVersion, counts, rows };
  }

  function compare(previous, current) {
    if (!previous || previous.modelVersion !== current.modelVersion) {
      return { status: previous ? "モデル変更・比較対象外" : "初回基準・移行比較なし", promoted: 0, demoted: 0, promotedIds: [], demotedIds: [] };
    }
    const promotedIds = [], demotedIds = [];
    for (const [id, row] of Object.entries(current.rows)) {
      const old = previous.rows[id];
      if (old?.status === "価格待ち" && row.status === "購入先確認済み") promotedIds.push(id);
      if (old?.status === "購入先確認済み" && row.status === "価格待ち") demotedIds.push(id);
    }
    return { status: "同一モデル・連続取得比較", previousAt: previous.generatedAt,
      currentAt: current.generatedAt, promoted: promotedIds.length, demoted: demotedIds.length,
      promotedIds, demotedIds };
  }
  return { snapshot, compare };
});
