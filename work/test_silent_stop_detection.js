// 4-J C: silent-stop detection. Local fixtures and saved main data only; no requests.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const ROOT = path.join(__dirname, '..');
const checks = require('./silent_stop_checks');
const invariants = require('./post_publication_invariants');
const H = 3600000, NOW = Date.parse('2026-11-24T00:00:00Z'), iso = h => new Date(NOW - h * H).toISOString();

// C1 weekly: last completed main run must pass, and one must complete within 8 days.
const run = (h, conclusion, extra = {}) => ({ status: 'completed', conclusion, head_branch: 'main', created_at: iso(h), updated_at: iso(h - 0.3), html_url: 'u' + h, id: 1000 + h, ...extra });
assert.deepEqual(checks.weeklyIssues([run(30, 'success'), run(200, 'failure')], NOW), []);
assert.deepEqual(checks.weeklyIssues([run(30, 'failure'), run(200, 'success')], NOW).map(i => i.key), ['weekly-tests:failure:1030']);
assert.deepEqual(checks.weeklyIssues([run(30, 'timed_out')], NOW).map(i => i.key), ['weekly-tests:failure:1030']);
// A second failed week is a new alert key, so it is reported again.
assert.notEqual(checks.weeklyIssues([run(30, 'failure')], NOW)[0].key, checks.weeklyIssues([run(30, 'failure', { id: 2 })], NOW)[0].key);
assert.deepEqual(checks.weeklyIssues([run(200, 'success')], NOW).map(i => i.key), ['weekly-tests:stale']);
assert.deepEqual(checks.weeklyIssues([], NOW).map(i => i.key), ['weekly-tests:stale']);
assert.deepEqual(checks.weeklyIssues([run(5, 'failure', { head_branch: 'feature' }), run(30, 'success'), { ...run(1, null), status: 'in_progress' }], NOW), []);

// C2 buyback observations: fetched store without observations for 24h alerts; held stores do not.
const quote = (h, price = 1000) => ({ price, observedAt: iso(h) });
const summary = { shops: { a: { name: 'A店' }, b: { name: 'B店' }, held: { name: '保留店' } },
  cards: { c1: { shops: { a: quote(1), b: quote(1), held: quote(60), z: quote(1, null) } } } };
const obs = (h) => ({ c1: { '2026-11-23': { price: 1000, observedAt: iso(h) } } });
assert.deepEqual(checks.buybackObservationIssues({ shops: { a: obs(1), b: obs(1), held: obs(60) } }, summary, NOW), []);
const stalled = checks.buybackObservationIssues({ shops: { a: obs(1), b: obs(26), held: obs(60) } }, summary, NOW);
assert.deepEqual(stalled.map(i => i.key), ['buyback-observation:b:stalled']);
assert.match(stalled[0].reason, /B店/);
assert.deepEqual(checks.buybackObservationIssues({ shops: { a: obs(1) } }, summary, NOW).map(i => i.key), ['buyback-observation:b:stalled']);
assert.deepEqual(checks.buybackObservationIssues({ shops: { a: obs(30), b: obs(30) } },
  { cards: { c1: { shops: { a: quote(30), b: quote(30) } } } }, NOW).map(i => i.key), ['buyback-observation:all:stalled']);
assert.deepEqual(checks.buybackObservationIssues({ shops: { a: obs(1), b: obs(23) } }, summary, NOW), []);
// The saved main data has no stall at its own fetch time.
const savedSummary = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/shop-buyback-summary.json'), 'utf8'));
const savedObs = JSON.parse(fs.readFileSync(path.join(ROOT, 'work/buyback-price-observations.json'), 'utf8'));
const lastFetch = Math.max(...Object.values(checks.latestFetchByShop(savedSummary)));
assert.deepEqual(checks.buybackObservationIssues(savedObs, savedSummary, lastFetch), []);

// C3 weekly runner: every test runs to the end and each failure is listed.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'weekly-suite-'));
fs.mkdirSync(path.join(dir, 'work'));
for (const [name, code] of [['test_a.js', 0], ['test_b.js', 1], ['test_c.js', 2], ['helper.js', 3]]) fs.writeFileSync(path.join(dir, 'work', name), `process.exit(${code});`);
const summaryFile = path.join(dir, 'summary.md'), lines = [];
const weekly = require('./run_weekly_suite').run({ dir: path.join(dir, 'work'), env: { ...process.env, GITHUB_STEP_SUMMARY: summaryFile }, log: l => lines.push(l) });
assert.equal(weekly.total, 3);
assert.deepEqual(weekly.failed.map(r => r.file), ['test_b.js', 'test_c.js']);
assert.equal(lines.filter(l => l.startsWith('::error')).length, 2);
assert.match(fs.readFileSync(summaryFile, 'utf8'), /test_b\.js[\s\S]*test_c\.js/);
fs.rmSync(dir, { recursive: true, force: true });

// C4 post-publication invariants: saved main data matches, and a single changed published
// value is detected by each check without touching any file.
const read = invariants.reader(ROOT), ev = require('./psa10_observation_evidence');
const base = {
  periodMeans: () => invariants.periodMeans(read, ROOT, ev), rawReference: () => invariants.rawReference(read, ROOT),
  listings: () => invariants.listings(read, ROOT), priceGap: () => invariants.priceGap(read, ROOT, ev), buybackHolds: () => invariants.buybackHolds(read),
};
for (const [name, check] of Object.entries(base)) {
  const r = check();
  assert.ok(r.compared > 0, name + ' compared nothing');
  assert.equal(r.mismatches, 0, name + ' ' + JSON.stringify(r.examples));
}
const mutate = (file, pick, change, check) => {
  const target = pick(read(file)), saved = JSON.stringify(target);
  change(target);
  try { assert.ok(check().mismatches >= 1, 'not detected: ' + file); } finally { Object.assign(target, JSON.parse(saved)); }
};
const summaryData = read('data/psa10-period-summary.json');
const gapId = Object.keys(summaryData.priceGap.cards).find(id => summaryData.priceGap.cards[id][1] != null);
mutate('data/psa10-period-summary.json', s => s.priceGap.cards[gapId], r => { r[1] += 1; }, base.priceGap);
const periodId = Object.keys(summaryData.cards).find(id => summaryData.cards[id][0] != null);
mutate('data/psa10-period-summary.json', s => s.cards[periodId], r => { r[0] += 1; }, base.periodMeans);
const shard = fs.readdirSync(path.join(ROOT, 'data/raw-condition-reference'))[0];
const refId = Object.keys(read('data/raw-condition-reference/' + shard).cards).find(id => read('data/raw-condition-reference/' + shard).cards[id].stores?.mean != null);
mutate('data/raw-condition-reference/' + shard, f => f.cards[refId].stores, s => { s.mean += 10; }, base.rawReference);
const listing = read('data/mintore-listing-summary.json'), listId = Object.keys(listing.cards).find(id => listing.cards[id][0]);
mutate('data/mintore-listing-summary.json', f => f.cards[listId][0], row => { row[0] += 1; }, base.listings);
const buyback = read('data/shop-buyback-summary.json');
const [heldCard, heldShop] = Object.entries(buyback.cards).flatMap(([id, c]) => Object.entries(c.shops).filter(([, r]) => r.identityHeld).map(([shop]) => [id, shop]))[0];
mutate('data/shop-buyback-summary.json', b => b.cards[heldCard].shops[heldShop], r => { r.price = 155000; }, base.buybackHolds);

// Issues: mismatches and errors become monitor alert keys; a clean result raises none.
assert.deepEqual(invariants.issues({ checks: { a: { name: 'x', compared: 3, mismatches: 0, examples: [] } } }), []);
assert.deepEqual(invariants.issues({ checks: { a: { name: 'x', compared: 3, mismatches: 2, examples: [['m']] }, b: { name: 'y', error: 'boom' } } }).map(i => i.key),
  ['post-publication:x:mismatch', 'post-publication:y:error']);

// The hourly monitor wires all three without any new request type.
const watch = fs.readFileSync(path.join(__dirname, 'watch_update_health.js'), 'utf8');
assert.match(watch, /silent_stop_checks'\)\.weeklyIssues/);
assert.match(watch, /buybackObservationIssues/);
assert.match(watch, /post_publication_invariants'\)\.record/);
for (const file of ['post_publication_invariants.js', 'silent_stop_checks.js', 'run_weekly_suite.js'])
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, file), 'utf8'), /fetch\(|https?:\/\/|require\('node:https?'\)/, file);
const yml = fs.readFileSync(path.join(ROOT, '.github/workflows/weekly-full-tests.yml'), 'utf8');
assert.match(yml, /node work\/run_weekly_suite\.js/);
assert.match(yml, /if: success\(\) \|\| failure\(\)/);
console.log('PASS silent-stop detection: weekly result/stale, buyback observation stall, run-to-end weekly runner, post-publication invariants');
