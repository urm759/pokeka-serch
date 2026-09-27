(function (root) {
  function isVisible(card, { enabled = false, query = "", purchaseMode = "normal" } = {}) {
    if (!enabled || String(query).trim() || purchaseMode === "snkr-raw") return true;
    if (card.catalogCompletion?.n || card.catalogCompletion?.rr) return true;
    const exceptionalProfit = Number(card.psaDecision?.expectedProfit) >= 20000 && Number(card.roi) >= 40;
    if (exceptionalProfit) return true;
    return Number(card.psaTx30d || 0) > 0 || Number(card.buyback30 || 0) > 0;
  }
  const api = { isVisible };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CandidateVisibility = api;
})(typeof window !== "undefined" ? window : globalThis);
