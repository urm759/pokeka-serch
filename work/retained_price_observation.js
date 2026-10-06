// A complete bulk response may recheck every supplied price, but not a retained missing field.
function retainedPriceObservations(current, previous, previousBatchAt) {
  const result = {};
  for (const [field, dateField] of [['price', 'priceObservedAt'], ['snkPsa10Price', 'psa10ObservedAt']]) {
    if (typeof current[field] === 'number' && Number.isFinite(current[field])) continue;
    result[dateField] = Object.hasOwn(previous, dateField) ? previous[dateField]
      : typeof previous[field] === 'number' && Number.isFinite(previous[field]) ? previousBatchAt || null : null;
  }
  return result;
}
module.exports = { retainedPriceObservations };
