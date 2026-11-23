// Display only: CSV file names use the Japan calendar day, and the 75-day PSA10/raw gap
// is labelled as a reference while fewer than 75 observation days exist. No calculation change.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

// CSV file names.
const helper = app.match(/function csvJstDate\(now = Date\.now\(\)\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(helper, 'csvJstDate helper present');
const csvJstDate = new Function(helper + '\nreturn csvJstDate;')();
assert.equal(csvJstDate(Date.parse('2026-11-22T23:30:00Z')), '2026-11-23', 'JST morning is the new day');
assert.equal(csvJstDate(Date.parse('2026-11-23T14:59:59Z')), '2026-11-23');
assert.equal(csvJstDate(Date.parse('2026-11-23T15:00:00Z')), '2026-11-24', 'JST midnight starts the next day');
assert.match(app, /link\.download = `pokeka-buy-list-\$\{csvJstDate\(\)\}\.csv`;/);
assert.match(app, /link\.download = `pokeka-search-conditions-\$\{csvJstDate\(\)\}\.csv`;/);
assert.doesNotMatch(app, /toISOString\(\)\.slice\(0, 10\)\}\.csv/, 'no UTC-dated CSV name remains');

// 75-day gap: the data already marks fewer than 75 days as a reference; the label shows it.
const metrics = require('../exploration-metrics.js');
const now = Date.parse('2026-11-23T03:00:00Z'), at = '2026-11-23T01:00:00.000Z';
const summary = count75 => ({ asOf: '2026-11-23', priceGap: { times: ['2026-11-23', '2026-09-10', at],
  cards: { c: [120, 110, count75, 125, 7, 15, 0, 1, count75, 0, 5000, 11000, 2, 2] } } });
const short = metrics.priceGap(summary(40), { id: 'c', psa10: 11000 }, now);
const full = metrics.priceGap(summary(75), { id: 'c', psa10: 11000 }, now);
assert.equal(short.reference, true);
assert.equal(short.direction, '拡大', 'the direction itself is unchanged');
assert.equal(full.reference, false);
const gapLine = app.split('\n').find(line => line.includes("const gapLabel='<div class=\"price-gap\">"));
assert.ok(gapLine, 'gap label line present');
assert.match(gapLine, /gap\.reference&&Number\.isFinite\(gap\.mean75\)\?'（参考・'\+gap\.count75\+'\/75観測日）'/);
assert.match(gapLine, /gap\.direction\+\(gap\.reference&&gap\.change!=null\?'（参考）':''\)/);
console.log('PASS CSV names use the JST day; the 75-day gap shows 参考 below 75 observation days (display only)');
