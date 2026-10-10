const { eligible } = require('./acquisition_retry.js');

function planSets({ manifest, completed, rows = [], priority = {}, reviews = [], retries = {}, now = Date.now(), recheckHours = 24 }) {
  const completedUrls = new Set(completed || []);
  const latest = new Map(), complete = new Set();
  for (const row of rows) {
    if (row.captureVersion >= 2 && row.completeSnapshot) complete.add(row.sourceUrl);
    const at = Date.parse(row.fetchedAt);
    if (Number.isFinite(at)) latest.set(row.sourceUrl, Math.max(latest.get(row.sourceUrl) || 0, at));
  }
  const missing = new Set((priority.rows || []).map(row => row.sourceSetUrl).filter(Boolean));
  const focused = new Set(priority.focusSetUrls || []);
  const specification = new Set(reviews.map(row => row.sourceUrl).filter(url => url && !complete.has(url)));
  const reasons = {};
  const pending = manifest.filter(entry => {
    if (!entry.url || retries[entry.url]?.status === 'manual-wait' || !eligible(retries[entry.url], now)) return false;
    const stale = !latest.has(entry.url) || now - latest.get(entry.url) >= recheckHours * 3600000;
    const reason = !completedUrls.has(entry.url) ? '未巡回' : specification.has(entry.url) ? '完全仕様表を再取得'
      : missing.has(entry.url) && stale ? '不足カードの登録済みセットを再確認' : focused.has(entry.url) && stale ? '重点セットの更新期限' : null;
    if (!reason) return false;
    reasons[entry.url] = reason; return true;
  });
  return { pending, reasons, specificationRecheckSets: pending.filter(e => specification.has(e.url)).length,
    missingRecheckSets: pending.filter(e => completedUrls.has(e.url) && missing.has(e.url)).length,
    freshMissingSets: manifest.filter(e => e.url && missing.has(e.url) && latest.has(e.url) && now - latest.get(e.url) < recheckHours * 3600000).length };
}
module.exports = { planSets };
