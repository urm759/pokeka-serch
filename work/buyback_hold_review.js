const {buybackDropConfirmed, buybackListingWithdrawn} = require('../market-analysis');
const HOUR = 3600000;
const UNKNOWN = '不明（記録開始前）';

function nextAttempt(meta) {
  const last = Date.parse(meta?.lastAttempt);
  return meta?.reviewStatus === 'count-drop-review' && Number.isFinite(last)
    ? new Date(last + 24 * HOUR).toISOString() : null;
}

function canAttempt(meta, now, legacyHomura) {
  if (!meta?.reviewStatus) return true;
  if (meta.reviewStatus === 'format-review') return Boolean(legacyHomura);
  const next = nextAttempt(meta);
  return next !== null && now >= Date.parse(next);
}

function heldSince(meta) {
  return meta?.holdStartedAt || meta?.lastAttempt || null;
}

// Only attempted outcomes change the two clocks. A replay or skip never clears a hold.
function transition(previous, attempt) {
  if (!attempt) return {};
  const {at, status, count, pageEvidence} = attempt;
  const priorDrop = previous.reviewStatus === 'count-drop-review';
  const event = {at, status, count, ...pageEvidence};
  const change = {reviewStatus:status, lastAttempt:at,
    holdStartedAt:status ? (previous.reviewStatus === status ? heldSince(previous) : at) : null};
  if (!status && attempt.success) change.lastGoodPages = pageEvidence;
  const withdrawn = buybackListingWithdrawn(previous);
  if (priorDrop || withdrawn || status === 'count-drop-review') {
    const old = priorDrop || withdrawn ? previous.countDropReview : null;
    change.countDropReview = {
      startedAt: old?.startedAt || (priorDrop ? heldSince(previous) : at),
      lastGoodCount: old?.lastGoodCount ?? previous.fetched,
      lastGoodPages: old?.lastGoodPages ?? previous.lastGoodPages ?? UNKNOWN,
      first: old?.first || event, latest:event, resolvedAt:attempt.success ? at : null,
    };
    // latest is overwritten on every attempt, so keep the confirming response.
    const confirmed = !attempt.success && (old?.confirmed
      || [old?.latest, event].find(e => buybackDropConfirmed(change.countDropReview, e)));
    if (confirmed) change.countDropReview.confirmed = confirmed;
  }
  return change;
}

function receipt(results, failures, recheck) {
  const acquired = results.filter(r => !r.savedReplay && !r.recoveredSavedPages);
  const held = failures.filter(f => f.reviewWait || f.permissionWait || f.knownDrop);
  const errors = failures.filter(f => !held.includes(f));
  const acquiredCount = acquired.reduce((n,r) => n + r.items.length, 0);
  const completionStatus = errors.length ? 'partial-with-failure' : held.length && acquiredCount ? 'partial'
    : acquiredCount ? 'success' : 'no-progress';
  return {completionStatus, acquiredCount, acquiredStores:acquired.map(r=>r.shop.id),
    heldStores:held.map(f=>f.source), newFailures:errors.map(f=>({source:f.source,reason:f.error})), recheck};
}

function warnings(summary, deadlines, now) {
  const issues = [];
  for (const [id,meta] of Object.entries(summary.shops || {})) {
    if (!meta.reviewStatus && meta.acquisitionPermission !== 'pending') continue;
    let within24 = 0, within48 = 0;
    for (const card of Object.values(summary.cards || {})) {
      const row = card.shops?.[id];
      if (!(row?.price > 0 && row.listingActive === true && row.matchConfidence === 'high' && !row.quarantined)) continue;
      const remaining = Date.parse(row.observedAt) + 168 * HOUR - now;
      if (remaining > 0 && remaining <= 48 * HOUR) within48++;
      if (remaining > 0 && remaining <= 24 * HOUR) within24++;
    }
    const formalCount = (deadlines.formal || []).filter(card => card.dependencies?.some(
      dep => dep.field === 'buybackExitEvidence' && dep.shopId === id)).length;
    const started = heldSince(meta) || meta.permissionCheckedAt || '不明';
    const name = meta.name || id, next = nextAttempt(meta);
    const details = {shopId:id,started,lastSuccess:meta.lastSuccess || null,nextAttempt:next,
      lastGoodCount:meta.countDropReview?.lastGoodCount ?? meta.fetched ?? null,within24,within48,formalCount};
    issues.push({key:'buyback-hold:'+id+':'+started, ...details,
      reason:name+' 保留開始 '+started+'、直前正常 '+(details.lastGoodCount ?? '不明')+'件、最終実取得 '+(details.lastSuccess || '不明')+'、次回 '+(next || '確認待ち')+'。個別提示期限24／48時間以内 '+within24+'／'+within48+'、正式出口 '+formalCount+'枚'});
    if (now - Date.parse(meta.lastSuccess) >= 120 * HOUR) issues.push({
      key:'buyback-store-120h:'+id+':'+meta.lastSuccess, ...details, reason:name+' 店舗の最終取得から120時間経過'});
  }
  return issues;
}
module.exports = {nextAttempt,canAttempt,transition,receipt,warnings};
