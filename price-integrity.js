(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PriceIntegrity = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function median(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function audit(referencePrice, entries, options = {}) {
    const reference = Number(referencePrice);
    const asOf = String(options.asOfDate || "").slice(0, 10);
    const usable = (Array.isArray(entries) ? entries : [])
      .filter((row) => {
        const date = String(row.updatedAt || "").slice(0, 10);
        const age = date && asOf ? (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000 : null;
        return row.kind === "販売価格" && row.valid !== false && row.conditionAccepted !== false && row.languageAccepted !== false && Number(row.value) > 0 && row.stale !== true && !(age > 45);
      })
      .map((row) => ({ source: row.source, value: Number(row.value) }))
      .sort((left, right) => left.value - right.value);
    let cluster = [];
    for (const row of usable) {
      const group = usable.filter((item) => item.value >= row.value && item.value <= row.value * 1.35);
      if (group.length > cluster.length) cluster = group;
    }
    const shopMedian = cluster.length >= 2 ? median(cluster.map((row) => row.value)) : null;
    const ratio = reference > 0 && shopMedian != null ? reference / shopMedian : null;
    const threshold = Math.max(2, Number(options.threshold || 4));
    const disputed = ratio != null && (ratio >= threshold || ratio <= 1 / threshold);
    return {
      disputed,
      sourcePrice: reference > 0 ? reference : null,
      corroboratingShopCount: cluster.length,
      corroboratingShops: cluster.map((row) => row.source),
      shopMedian,
      ratio,
      reason: disputed ? `状態A参考価格と複数店舗価格が${Math.max(ratio, 1 / ratio).toFixed(1)}倍乖離。成約根拠・カード仕様を要確認` : null,
    };
  }

  function classifyReference(text) {
    const body = String(text || "");
    if (/美品の参考価格（実売の裏付けなし）/.test(body)) return "unbacked";
    if (/美品の(?:成約|実売)(?:中央値|価格)/.test(body)) return "backed";
    return "unknown";
  }

  return { audit, classifyReference };
});
