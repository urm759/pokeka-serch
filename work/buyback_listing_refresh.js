const { calendarDay } = require('./psa10_observation_evidence');

const complete = result => result.fullListing === true || result.coverageComplete === true;
const absenceKnown = result => complete(result) && !(result.unmatched || []).length;
function link(item, fallbackDay) {
  return { url:item.itemUrl || '', date:item.observedDate || calendarDay(item.observedAt) || fallbackDay,
    price:item.price, active:item.active === true, matchMethod:item.matchMethod || 'unknown',
    matchScore:Number(item.score || 0), observedAt:item.observedAt || null, sourceUpdatedAt:item.sourceUpdatedAt || null,
    pageUpdatedAt:item.pageUpdatedAt || null,quoteUpdatedAt:item.quoteUpdatedAt || null };
}
function currentLinks(result, day) {
  const links = new Map();
  for (const item of result.matched) {
    const next = link(item, result.savedReplay ? null : day), old = links.get(item.cardId);
    if (!old || next.date > old.date || next.date === old.date &&
      (next.active && !old.active || next.active === old.active && next.price >= old.price)) links.set(item.cardId, next);
  }
  return links;
}
function refresh(history, result, today, priorItems = []) {
  const shopId = result.shop.id;
  const links = currentLinks(result, today);
  if (result.savedReplay) {
    // A newly verified link can recover a genuinely observed old day. The
    // replay date itself is never a price observation; never replace conflicts.
    for(const item of result.matched) {
      const date=calendarDay(item.observedAt),index=history.dates.indexOf(date);
      if(index<0 || !item.cardId || item.active!==true || item.verifiedCardId!==item.cardId || !item.identityEvidence?.catalogIdentity
        || !(Number(item.score)>=90) || item.quarantined || !Number.isFinite(item.price) || item.price<=0)continue;
      const entries=history.shops[shopId]||={},values=entries[item.cardId]||=Array(history.dates.length).fill(null);
      if(values[index]==null){values[index]=item.price;(result.savedReplayRecovered||=[]).push({id:item.cardId,date,price:item.price,observedAt:item.observedAt});}
    }
    return links;
  }
  const products = new Map([...result.matched, ...(result.unmatched || [])].map(item=>[String(item.shopItemId),item]));
  const invalidated = new Set();
  for (const old of priorItems) {
    const item = products.get(String(old.shopItemId));
    if (old.cardId && item && item.cardId !== old.cardId) {
      invalidated.add(old.cardId);
      if (!links.has(old.cardId)) links.set(old.cardId,{...link(item,today),active:null,identityHeld:true});
    }
  }
  const targetDates = history.dates;
  if (complete(result)) {
    history.confirmedCompleteByShop ||= {};
    history.confirmedCompleteByShop[shopId] = [...new Set([...(history.confirmedCompleteByShop[shopId] || []), today])]
      .filter(date => targetDates.includes(date)).sort();
  }
  const entries = history.shops[shopId] ||= {};
  const datesById = new Map();
  for (const item of result.matched) {
    if (!datesById.has(item.cardId)) datesById.set(item.cardId, new Set());
    datesById.get(item.cardId).add(item.observedDate || today);
  }
  const observedDates = [...new Set(result.items.map(item => item.observedDate || today))];
  if (complete(result) && !observedDates.length) observedDates.push(today);
  history.observedByShop[shopId] = [...new Set([...(history.observedByShop[shopId] || []), ...observedDates])]
    .filter(date => targetDates.includes(date)).sort();
  for (const [id, values] of Object.entries(entries)) {
    while (values.length < targetDates.length) values.push(null);
    // A partial page cannot erase a card it did not actually observe.
    const dates = absenceKnown(result) || invalidated.has(id) ? observedDates : datesById.get(id) || [];
    for (const date of dates) { const i = targetDates.indexOf(date); if (i >= 0) values[i] = null; }
  }
  for (const item of result.matched.filter(item => item.active)) {
    const values = entries[item.cardId] ||= Array(targetDates.length).fill(null);
    const i = targetDates.indexOf(item.observedDate || today);
    if (i >= 0 && item.price >= Number(values[i] || 0)) values[i] = item.price;
  }
  return links;
}
function unavailable(result, links, id, previous) {
  return Boolean(result && (absenceKnown(result) && !links?.has(id) || links?.get(id)?.active === false || links?.get(id)?.identityHeld
    || !links?.has(id) && (previous?.listingActive === false || previous?.identityHeld === true)));
}
module.exports = { complete, currentLinks, refresh, unavailable };
