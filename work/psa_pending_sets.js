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
  const usedUrls=new Set();let duplicateUrls=0;
  const pending = manifest.filter(entry => {
    if (!entry.url || retries[entry.url]?.status === 'manual-wait' || !eligible(retries[entry.url], now)) return false;
    if(usedUrls.has(entry.url)){duplicateUrls++;return false;}usedUrls.add(entry.url);
    const stale = !latest.has(entry.url) || now - latest.get(entry.url) >= recheckHours * 3600000;
    const reason = !completedUrls.has(entry.url) && (stale || !complete.has(entry.url)) ? '未巡回' : specification.has(entry.url) && stale ? '完全仕様表を再取得'
      : missing.has(entry.url) && stale ? '不足カードの登録済みセットを再確認' : focused.has(entry.url) && stale ? '重点セットの更新期限'
      : stale ? '通常セットの期限再確認' : null;
    if (!reason) return false;
    reasons[entry.url] = reason; return true;
  });
  pending.sort((a,b)=>(latest.get(a.url)||0)-(latest.get(b.url)||0));
  return { pending, reasons, duplicateUrls, normalRecheckSets:pending.filter(e=>reasons[e.url]==='通常セットの期限再確認').length,
    specificationRecheckSets: pending.filter(e => specification.has(e.url)).length,
    missingRecheckSets: pending.filter(e => completedUrls.has(e.url) && missing.has(e.url)).length,
    freshMissingSets: manifest.filter(e => e.url && missing.has(e.url) && latest.has(e.url) && now - latest.get(e.url) < recheckHours * 3600000).length };
}
function selectBatch(pending, size, priority = {}) {
  const count = Math.max(0, Math.floor(size));
  if (!count) return { selected: [], lanes: [], completionTargets: 0 };
  const targets = new Map(), focus = new Set(priority.focusSetUrls || []);
  for (const row of priority.rows || []) {
    if (!row.analysisCompletionTarget || row.specificationHeld || !row.sourceSetUrl) continue;
    const old = targets.get(row.sourceSetUrl) || { score: 0, count: 0 };
    targets.set(row.sourceSetUrl, {score:Math.max(old.score,Number(row.priority) || 0),count:old.count+1});
  }
  const ordinary = pending.filter(entry => !focus.has(entry.url) && !targets.has(entry.url));
  const focused = pending.filter(entry => focus.has(entry.url));
  const completion = pending.filter(entry => targets.has(entry.url) && !focus.has(entry.url))
    .sort((a,b) => targets.get(b.url).score-targets.get(a.url).score);
  const used = new Set(), selected = [], lanes = [];
  const take = (entries, limit, lane) => {
    for (const entry of entries) {
      if (limit <= 0 || selected.length >= count) break;
      if (used.has(entry.url)) continue;
      used.add(entry.url); selected.push(entry); limit--;
      lanes.push({url:entry.url,lane,completionCards:targets.get(entry.url)?.count || 0});
    }
  };
  // Reserve ordinary discovery as well as focused freshness; never broaden identity matching.
  take(ordinary,Math.ceil(count*0.25),'ordinary');
  take(focused,Math.floor(count*Math.min(0.5,Math.max(0,priority.maxFocusedShare ?? 0.4))),'focused');
  take(completion,count-selected.length,'analysis-completion');
  take(pending,count-selected.length,'spare');
  return {selected,lanes,completionTargets:lanes.reduce((n,row)=>n+row.completionCards,0)};
}
function releaseAuthenticationHolds(retries, recovery, now = Date.now()) {
  const age = now-Date.parse(recovery?.checkedAt);
  if (!recovery?.verified || !(age >= 0 && age <= 2*3600000)) return [];
  const released=[];
  for(const [url,row] of Object.entries(retries || {})) {
    if(row.kind !== 'authentication' || row.scope !== 'source' || Date.parse(row.lastAttemptAt)>Date.parse(recovery.checkedAt))continue;
    delete retries[url]; released.push(url);
  }
  return released;
}
module.exports = { planSets, selectBatch, releaseAuthenticationHolds };
