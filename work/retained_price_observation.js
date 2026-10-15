// A complete bulk response may recheck every supplied price, but not a retained missing field.
function retainedPriceObservations(current, previous, previousBatchAt, currentBatchAt = null) {
  const result = {};
  for (const [field, dateField] of [['price', 'priceObservedAt'], ['snkPsa10Price', 'psa10ObservedAt']]) {
    if (typeof current[field] === 'number' && Number.isFinite(current[field])) continue;
    result[dateField] = Object.hasOwn(previous, dateField) ? previous[dateField]
      : typeof previous[field] === 'number' && Number.isFinite(previous[field]) ? previousBatchAt || null : null;
  }
  if (typeof current.price === 'number' && Number.isFinite(current.price) && current.price > 0
    && typeof currentBatchAt === 'string' && currentBatchAt.includes('T') && Number.isFinite(Date.parse(currentBatchAt))) result.priceObservedAt=currentBatchAt;
  // Only a price actually present in this response gets a new confirmation time.
  // This is a retrieval time, never the date of an individual sale.
  if (Object.hasOwn(current,'snkPsa9Price') || Object.hasOwn(previous,'snkPsa9Price') || Object.hasOwn(previous,'psa9ObservedAt')) {
    result.psa9ObservedAt = typeof current.snkPsa9Price === 'number' && current.snkPsa9Price > 0 && Number.isFinite(current.snkPsa9Price)
      && currentBatchAt && Number.isFinite(Date.parse(currentBatchAt)) ? currentBatchAt : previous.psa9ObservedAt || null;
  }
  return result;
}
module.exports = { retainedPriceObservations };
