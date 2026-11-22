// Owner-approved 2026-11-23: a product printed with another card number is never that card's
// current buyback quote, even through a saved link. Shops retitle or reuse product IDs.
function numbers(text) {
  const result=[...text.matchAll(/(?<![\d/])(\d{1,3})\s*\/\s*(\d{1,3}|(?:XY|SM|SV|BW|S)-P)(?![\dA-Z/-])/ig)]
    .map(m=>`${Number(m[1])}/${/^\d+$/.test(m[2])?Number(m[2]):m[2].toUpperCase()}`);
  for(const m of text.matchAll(/(?:^|\[)\s*((?:XY|SM|SV|BW|S)-P)\s+(\d{1,3})(?=\s*\]|$)/ig))result.push(`${Number(m[2])}/${m[1].toUpperCase()}`);
  return result;
}

const printed = values => new Set(values.flatMap(value => numbers(String(value || '').normalize('NFKC'))));

// Only two readable, entirely different numbers are evidence of a mismatch.
function mismatch(item, card) {
  const product = printed([item?.name, item?.number]);
  const expected = printed([card?.name, card?.model]);
  return product.size > 0 && expected.size > 0 && ![...product].some(value => expected.has(value));
}

// Move mismatches out of matched before any history, link or summary reads them.
function hold(results, cards) {
  const byId = new Map(cards.map(card => [String(card.id), card]));
  const held = new Set();
  for (const result of results) {
    const kept = [];
    for (const item of result.matched || []) {
      const reviewed = item.verifiedCardId || item.matchMethod === 'image-reviewed';
      if (reviewed || !mismatch(item, byId.get(String(item.cardId)))) { kept.push(item); continue; }
      const {cardId, score, matchMethod, ...rest} = item;
      (result.unmatched ||= []).push({...rest, identityHeld:true, previousCardId:cardId,
        mismatchReason:'商品名のカード番号が紐付け先と不一致・照合保留'});
      held.add(`${result.shop.id}:${cardId}`);
    }
    if (result.matched) result.matched = kept;
  }
  return held;
}

// Saved originals stay in the history. Days up to the hold are only left out of counts and averages.
function countedValues(values, dates, heldThrough, currentDay) {
  if (!heldThrough) return values;
  return values.map((value, i) => dates[i] <= heldThrough && dates[i] !== currentDay ? null : value);
}

module.exports = { numbers, mismatch, hold, countedValues };
