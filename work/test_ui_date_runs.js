// 4-J G: daily [date, number] series are stored as runs in the UI copy and decode to the exact same rows.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const codec = require('../ui-data-codec');
(async () => {
  const series = {
    flat: [['2026-10-25', 0.8769230769230769], ['2026-10-26', 0.8769230769230769], ['2026-10-27', 0.96]],
    gap: [['2026-10-30', 0.96], ['2026-11-01', 0.96], ['2026-11-02', 0.848]], // 10-31 missing: not filled in
    monthEnd: [['2026-02-27', 1], ['2026-02-28', 1], ['2026-03-01', 1], ['2026-03-02', 0]],
    zeroAndNegative: [['2026-11-01', 0], ['2026-11-02', -1.5], ['2026-11-03', -1.5]],
    // Not a date series: left exactly as ordinary arrays.
    unordered: [['2026-11-02', 1], ['2026-11-01', 1]],
    duplicate: [['2026-11-01', 1], ['2026-11-01', 1]],
    badDate: [['2026-02-30', 1], ['2026-03-01', 1]],
    textValue: [['2026-11-01', '1'], ['2026-11-02', '1']],
    nullValue: [['2026-11-01', null], ['2026-11-02', 1]],
    extra: [['2026-11-01', 1, 2], ['2026-11-02', 1, 2]],
    single: [['2026-11-01', 1]],
    nested: { rows: [['2026-11-01', 0.5], ['2026-11-02', 0.5]], label: '2026-11-01' },
  };
  const stored = JSON.parse(JSON.stringify(codec.encode(series, { version: 2, dateRuns: true, repeats: true })));
  assert.equal(stored.dateRuns, true);
  const text = JSON.stringify(stored);
  assert.match(text, /\[-4,/, 'eligible series use runs');
  for (const restored of [codec.decode(stored), await codec.decodeAsync(stored)]) {
    assert.deepEqual(restored, series);
    assert.equal(JSON.stringify(restored), JSON.stringify(series), 'order, dates, gaps and values are exact');
  }
  // Without the option nothing changes, and version 1 cannot use runs.
  assert.equal(codec.encode(series, { version: 2 }).dateRuns, undefined);
  assert.doesNotMatch(JSON.stringify(codec.encode(series, { version: 2 })), /\[-4,/);
  assert.throws(() => codec.encode(series, { version: 1, dateRuns: true }));
  // Broken runs fail loudly instead of returning a partial history.
  for (const data of [[-4, '2026-11-01'], [-4, '2026-11-01', 1], [-4, '2026-11-01', 1, 0], [-4, '2026-11-01', 1, 1.5],
    [-4, '2026-11-01', '1', 1], [-4, '2026-02-30', 1, 1], [-4, 5, 1, 1], [-4, '2026-11-01', null, 2]]) {
    const broken = { codec: 'ui-schema-v2', strings: [], schemas: [], data };
    assert.throws(() => codec.decode(broken), /Invalid UI date run/, JSON.stringify(data));
    await assert.rejects(() => codec.decodeAsync(broken), /Invalid UI date run/);
  }

  // The published buyback observation copy decodes to exactly what the plain encoding gives.
  const root = path.join(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/ui/manifest.json')));
  const file = manifest.aliases['data/buyback-observation-summary.json'];
  const published = JSON.parse(fs.readFileSync(path.join(root, file)));
  assert.equal(published.dateRuns, true, 'buyback observation copy uses runs');
  const decoded = codec.decode(published);
  assert.deepEqual(codec.decode(JSON.parse(JSON.stringify(codec.encode(decoded, { version: 2 })))), decoded);
  assert.deepEqual(await codec.decodeAsync(published), decoded);
  let rows = 0;
  for (const shops of Object.values(decoded.support?.cards || {})) for (const row of Object.values(shops)) if (Array.isArray(row.days)) {
    rows++;
    for (const day of row.days) assert(Array.isArray(day) && day.length === 2 && /^\d{4}-\d{2}-\d{2}$/.test(day[0]) && Number.isFinite(day[1]));
  }
  assert(rows > 1000, 'daily ratio rows are present after decoding');
  console.log(`PASS date runs: exact dates/gaps/values, non-series untouched, broken runs rejected; ${rows} buyback ratio rows decode exactly`);
})().catch(e => { console.error(e); process.exitCode = 1; });
