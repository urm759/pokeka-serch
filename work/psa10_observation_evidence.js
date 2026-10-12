const crypto = require('node:crypto');
const identity = card => crypto.createHash('sha256').update(String(card.identityKey || card.id)).digest('hex').slice(0, 12);
const dayFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
});
const dayCache = new Map();
function calendarDay(value) {
  const key = String(value);
  if (dayCache.has(key)) return dayCache.get(key);
  if (!Number.isFinite(Date.parse(value))) return null;
  const day = dayFormatter.format(new Date(value));
  if (dayCache.size >= 4096) dayCache.clear();
  dayCache.set(key,day);
  return day;
}
function confirmation(card, day, evidence) {
  if (!card.identityKey || card.identityReviewRequired || (card.language && card.language !== 'ja')
    || !Number.isFinite(card.snkPsa10Price) || !(card.snkPsa10Price > 0)) return null;
  if (evidence?.sourceIdentities && evidence.sourceIdentities.get(card.id) !== card.identityKey) return null;
  // An explicit retained timestamp always wins over the catalog's publication date.
  if (Object.hasOwn(card, 'psa10ObservedAt')) return calendarDay(card.psa10ObservedAt) === day
    ? [card.psa10ObservedAt, identity(card)] : null;
  const run = evidence?.sourceRun, meta = evidence?.meta;
  const acquiredAt = run?.lastSuccessAt;
  const delta = Math.abs(Date.parse(meta?.generatedAt) - Date.parse(acquiredAt));
  if (run?.status !== 'success' || !(run.acquiredCount > 0) || calendarDay(acquiredAt) !== day
    || !Number.isFinite(delta) || delta > 60000) return null;
  return [acquiredAt, identity(card)];
}
module.exports = { identity, calendarDay, confirmation };
