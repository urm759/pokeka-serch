const assert = require('node:assert/strict');
const { confirmedInventoryAt, confirmedCardPriceAt } = require('./priority_price_queue');
const now = Date.parse('2026-10-23T12:30:00Z');
const checkedAt = '2026-10-23T12:10:06.676Z';
const inventory = { updatedAt: '2026-10-23', total: 2, cards: [{id:'a'}, {id:'b'}] };
const run = { status:'success', acquiredCount:3, lastSuccessAt:'2026-10-23T12:10:08Z' };
const batch = confirmedInventoryAt(inventory, run);
assert.equal(batch, null, 'retained site supplements do not prove full source coverage');
assert.equal(confirmedCardPriceAt({priceObservedAt:checkedAt}, batch, now), checkedAt,
  'a real per-card observation survives a bulk count mismatch');
for (const missing of [null, undefined, '', 'bad-date', '2026-10-24T00:00:00Z']) {
  assert.equal(confirmedCardPriceAt({priceObservedAt:missing}, checkedAt, now), null,
    'explicit unknown/future observations cannot inherit file or batch freshness');
}
const old = '2026-09-16T05:00:00Z';
assert.equal(confirmedCardPriceAt({priceObservedAt:old}, checkedAt, now), old,
  'retained stale values keep their own timestamp');
assert.equal(confirmedCardPriceAt({}, checkedAt, now), checkedAt, 'verified legacy fallback remains compatible');
assert.equal(confirmedCardPriceAt({}, batch, now), null);
console.log('PASS per-card freshness, source/site count mismatch, stale/unknown/future dates and legacy coverage');
