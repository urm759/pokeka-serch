// Daily buying digest: small summary of the formal URLs, day-over-day changes against the previous
// Japan calendar day, and a phone page that only reads it. Fixtures only; no requests.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { build, jstDate } = require('./build_daily_digest');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'digest-'));
fs.mkdirSync(path.join(root, 'data'));
const row = (id, qualified, extra = {}) => ({ id, name: `カード${id} SAR [SV9 001/100](拡張パック「テスト」)`, qualified, reasons: qualified ? [] : ['利益条件'], buy: 20000, profit: 6000, annual: 41.25, go: '価格次第', priority: Number(id.replace(/\D/g, '')),
  metrics: { purchase: { price: 20000, source: 'トレカキャンプ状態A', url: 'https://torecacamp-pokemon.com/products/x', fresh: true, priceObservedAt: '2026-11-24T01:00:00Z' }, decision: { operationalLimit: 18000, verdict: '価格次第' } }, ...extra });
const audit = rows => ({ at: '2026-11-24T01:00:00Z', profiles: [{ urlOnly: { id: 'B', reportName: '条件プライオリティ', originalUrl: 'https://urm759.github.io/pokeka-serch/?x=1', rows } }],
  pendingDepartures: [{ id: 'pk-3', profile: 'B', reasons: ['在庫なし'] }] });
const put = rows => fs.writeFileSync(path.join(root, 'data/priority-search-profile-audit.json'), JSON.stringify(audit(rows)));
const read = () => JSON.parse(fs.readFileSync(path.join(root, 'data/daily-digest.json'), 'utf8'));

assert.equal(jstDate(Date.parse('2026-11-23T14:59:59Z')), '2026-11-23');
// Specified-condition URLs share the report name, so the digest names them apart.
{ const r = fs.mkdtempSync(path.join(os.tmpdir(), 'digest-name-')); fs.mkdirSync(path.join(r, 'data'));
  fs.writeFileSync(path.join(r, 'data/priority-search-profile-audit.json'), JSON.stringify({ profiles: [{ urlOnly: { id: 'V-x', reportName: '条件バリュー', rows: [] } }, { urlOnly: { id: 'V-x-specified', reportName: '条件バリュー', rows: [] } }] }));
  assert.deepEqual(build(r).profiles.map(p => p.name), ['条件バリュー', '条件バリュー（指定条件）']); fs.rmSync(r, { recursive: true, force: true }); }
assert.equal(jstDate(Date.parse('2026-11-23T15:00:00Z')), '2026-11-24', 'JST midnight starts the next day');

// Day 1 (JST 11-24): no previous day yet, so no changes are claimed.
put([row('pk-1', true), row('pk-2', true), row('pk-3', true)]);
let d = build(root, Date.parse('2026-11-23T16:00:00Z'));
assert.equal(d.date, '2026-11-24'); assert.equal(d.baseline, null);
assert.equal(d.profiles[0].count, 3); assert.equal(d.profiles[0].previousCount, null);
assert.deepEqual(d.profiles[0].gained, []); assert.deepEqual(d.profiles[0].lost, []);
const c = d.profiles[0].candidates[0];
assert.equal(c.id, 'pk-3', 'sorted by the audit priority');
assert.equal(c.name, 'カードpk-3 SAR [SV9 001/100]', 'set description trimmed for the phone');
assert.deepEqual([c.buy, c.store, c.cap, c.profit, c.annual, c.fresh], [20000, 'トレカキャンプ状態A', 18000, 6000, 41.3, true]);
// Later the same day: still compared with nothing (the previous day), even if the list changed.
put([row('pk-1', true), row('pk-2', true), row('pk-3', false), row('pk-4', true)]);
d = build(root, Date.parse('2026-11-24T10:00:00Z'));
assert.equal(d.baseline, null);

// Day 2 (JST 11-25): compared with the last state of 11-24 (pk-1, pk-2, pk-4).
put([row('pk-1', true), row('pk-2', false), row('pk-5', true)]);
d = build(root, Date.parse('2026-11-24T16:00:00Z'));
assert.equal(d.baseline.date, '2026-11-24');
assert.equal(d.profiles[0].previousCount, 3);
assert.deepEqual(d.profiles[0].gained.map(x => x.id), ['pk-5']);
assert.deepEqual(d.profiles[0].lost.map(x => [x.id, x.reasons]), [['pk-4', []], ['pk-2', ['利益条件']]], 'listed in the previous day priority order');
// Later on day 2 the baseline stays 11-24.
d = build(root, Date.parse('2026-11-25T09:00:00Z'));
assert.equal(d.baseline.date, '2026-11-24');
assert.deepEqual(read().profiles[0].gained.map(x => x.id), ['pk-5']);
assert.equal(d.llmCalls, 0); assert.equal(d.sourceRequests, 0);
assert(fs.statSync(path.join(root, 'data/daily-digest.json')).size < 100000, 'stays small');
// A missing audit fails loudly (the builder hook only warns, never blocks the formal audit).
fs.rmSync(path.join(root, 'data/priority-search-profile-audit.json'));
assert.throws(() => build(root), /formal profile audit missing/);
fs.rmSync(root, { recursive: true, force: true });

// Wiring and the phone page.
const builder = fs.readFileSync(path.join(__dirname, 'build_priority_search_targets.js'), 'utf8');
assert.match(builder, /try\{require\('\.\/build_daily_digest'\)\.build\(root\);\}catch\(error\)\{console\.warn/);
const page = fs.readFileSync(path.join(__dirname, '../digest.html'), 'utf8');
assert.match(page, /fetch\('\.\/data\/daily-digest\.json\?ts='/);
assert.match(page, /var esc=function/); assert.match(page, /safeUrl=function\(u\)\{try\{var x=new URL\(u\);return \/\^https:\$\//, 'only https links');
assert.doesNotMatch(page, /<script[^>]+src=/, 'no external scripts');
console.log('PASS daily digest: formal URL summary, JST day-over-day changes with reasons, small file, phone page reads only the digest');
