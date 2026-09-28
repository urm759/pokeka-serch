(function (root, factory) {
  const model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  if (root) root.RawPsa9GapModel = model;
})(typeof window === "object" ? window : null, function () {
  const DAY = 86400000;
  const clean = (value) => String(value || "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, "");
  const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
  const date = (value) => { const time = Date.parse(value || ""); return Number.isFinite(time) ? time : null; };
  const median = (values) => {
    const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  const sameIdentity = (expected, observed) => ["setCode", "number", "rarity", "variant", "language"]
    .every((key) => clean(expected?.[key]) && clean(expected[key]) === clean(observed?.[key]));
  function identityFromCard(card = {}) {
    const name = String(card.name || "");
    const standard = name.match(/\[\s*([A-Za-z0-9+-]+)\s+(\d{1,4}(?:-\d{1,4})?)\s*\/\s*\d{1,4}\s*\]/i);
    const promo = name.match(/\[\s*(\d{1,4})\s+([A-Za-z0-9-]+-P)\s*\]/i);
    return {
      setCode: promo?.[2] || standard?.[1] || card.setCode || "",
      number: promo?.[1] || standard?.[2] || "",
      rarity: card.rarity || name.match(/\b(MUR|BWR|SAR|SSR|CSR|CHR|RRR|SR|UR|HR|AR|RR|PR|R|U|C|H|P)\b/i)?.[1] || "",
      variant: /マスターボール/i.test(name) ? "masterball" : /モンスターボール/i.test(name) ? "monsterball" : /ミラー/i.test(name) ? "mirror" : "normal",
      language: card.language || "ja",
    };
  }

  function evaluate(input = {}) {
    const asOf = date(input.asOf) ?? Date.now();
    const raw = input.raw || {};
    const expected = raw.identity?.expected || input.identity;
    const reasons = [];
    const rawPrice = positive(raw.sold30Median);
    const rawCount = Number(raw.sold30Count);
    const rawDate = date(raw.newestSaleAt);
    const rawFetchedAt = date(raw.fetchedAt);
    const exactRaw = raw.cardId === input.cardId && raw.status === "ok" && raw.identityValid === true
      && raw.linkageConfidence === "exact" && sameIdentity(expected, raw.identity?.observed)
      && (!input.identity || sameIdentity(input.identity, expected));
    if (!exactRaw) reasons.push("状態Aカードの型番・仕様一致を確認できない");
    if (!raw.historyComplete30d || !rawPrice || !Number.isFinite(rawCount) || rawCount < 3 || !rawDate) reasons.push("状態Aの30日実成約が不足");
    if (!rawFetchedAt || asOf - rawFetchedAt > 7 * DAY || rawFetchedAt - asOf > DAY) reasons.push("状態A価格の取得日が古い・不明");
    if (input.priceConflict) reasons.push("素体価格に対立・実売根拠の不足あり");

    const excluded = {};
    const seen = new Set();
    const validTrades = [];
    for (const trade of Array.isArray(input.psa9Trades) ? input.psa9Trades : []) {
      const soldAt = date(trade.soldAt || trade.date);
      const price = positive(trade.price);
      const tradeId = String(trade.id || trade.saleId || "");
      let reason = null;
      if (trade.cardId !== input.cardId || !sameIdentity(expected, trade)) reason = "カード・仕様不一致";
      else if (clean(trade.gradingCompany) !== "psa" || Number(trade.grade) !== 9 || trade.singleCard !== true) reason = "PSA9単品ではない";
      else if (clean(trade.country) !== "jp" || clean(trade.currency) !== "jpy" || trade.saleType !== "sold") reason = "国内円建て実成約ではない";
      else if (!soldAt || soldAt > asOf || asOf - soldAt > 30 * DAY || !price) reason = "期間外・日時または価格未確認";
      else if (!tradeId || seen.has(tradeId)) reason = "成約IDなし・重複";
      if (reason) excluded[reason] = (excluded[reason] || 0) + 1;
      else { seen.add(tradeId); validTrades.push({ price, soldAt }); }
    }
    const psa9Median = median(validTrades.map((trade) => trade.price));
    const psa9Latest = validTrades.length ? Math.max(...validTrades.map((trade) => trade.soldAt)) : null;
    if (validTrades.length < 3) reasons.push("国内PSA9の同一仕様・30日実成約が3件未満");
    if (rawDate && psa9Latest && Math.abs(rawDate - psa9Latest) > 14 * DAY) reasons.push("状態AとPSA9の最新成約日が14日超離れている");
    const status = reasons.length ? "検証不能" : "比較可能・参考";
    const feeRate = input.saleFeeRate != null && Number.isFinite(Number(input.saleFeeRate)) ? Math.min(100, Math.max(0, Number(input.saleFeeRate))) : null;
    const comparable = status === "比較可能・参考" && feeRate !== null;
    if (status === "比較可能・参考" && feeRate === null) reasons.push("売却手数料率が未設定");
    const netMultiplier = feeRate === null ? null : 1 - feeRate / 100;
    const psa10Price = positive(input.psa10Price);
    return {
      status: reasons.length ? "検証不能" : status,
      reasons,
      raw: { median: exactRaw ? rawPrice : null, count: exactRaw && Number.isFinite(rawCount) ? rawCount : null, newestSaleAt: rawDate ? new Date(rawDate).toISOString() : null, fetchedAt: rawFetchedAt ? new Date(rawFetchedAt).toISOString() : null },
      psa9: { median: psa9Median, count: validTrades.length, latestSaleAt: psa9Latest ? new Date(psa9Latest).toISOString() : null, aggregateReference: positive(input.psa9Aggregate), excluded },
      saleFeeRate: feeRate,
      gapJpy: comparable ? Math.round(psa9Median - rawPrice) : null,
      gapPct: comparable ? Math.round((psa9Median / rawPrice - 1) * 1000) / 10 : null,
      netGapJpy: comparable ? Math.round((psa9Median - rawPrice) * netMultiplier) : null,
      psa10: { price: psa10Price, premiumToRawJpy: exactRaw && rawPrice && psa10Price ? Math.round(psa10Price - rawPrice) : null },
      grading: { psa10Rate: input.psa10Rate != null && Number.isFinite(Number(input.psa10Rate)) ? Number(input.psa10Rate) : null, fee: positive(input.gradingFee), lockDays: positive(input.lockDays) },
      usedForPurchaseDecision: false,
    };
  }
  return { evaluate, sameIdentity, identityFromCard, median };
});
