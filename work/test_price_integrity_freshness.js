// 4-J Q2: the shop-dispute audit compares only store prices from the last 48 hours, like every other store check.
const assert = require('assert'), integrity = require('../price-integrity.js'), fs = require('fs'), path = require('path');
const now = Date.parse('2026-11-24T08:00:00Z');
const shop = (source, value, hoursAgo) => ({ source, kind: '販売価格', value, updatedAt: new Date(now - hoursAgo * 3600000).toISOString(), conditionAccepted: true, valid: true });
// Two fresh shops near the reference: no dispute.
assert.equal(integrity.audit(10000, [shop('A', 9800, 2), shop('B', 10500, 5)], { now }).disputed, false);
// The same shops 40 days old (an old mismatch) no longer dispute a current reference.
const old = [shop('A', 45000, 960), shop('B', 46000, 970)];
assert.equal(integrity.audit(10000, old, { asOfDate: '2026-11-24' }).disputed, true, 'the date-only mode still sees old shops (kept for the separate unit test)');
assert.equal(integrity.audit(10000, old, { now }).disputed, false, 'with now only 48h-fresh shops count');
// Fresh shops that really disagree by 4x still dispute.
assert.equal(integrity.audit(10000, [shop('A', 45000, 3), shop('B', 46000, 6)], { now }).disputed, true);
// A shop 49 hours old is outside the window.
assert.equal(integrity.audit(10000, [shop('A', 45000, 49), shop('B', 46000, 3)], { now }).disputed, false, 'one fresh shop is not a corroborating cluster');
// The app passes now (one exact call site).
const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
assert.equal(app.split('priceIntegrityModel?.audit(torecaPrice, priceEntries, { asOfDate: meta.updatedAt || meta.generatedAt, now: Date.now() })').length - 1, 1);
console.log('PASS shop-dispute audit uses 48h store prices: old mismatches ignored, fresh 4x mismatches still disputed, app passes now');
