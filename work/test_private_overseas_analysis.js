const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const analysis = require('./private_overseas_analysis'), access = require('./overseas_access_policy');
const guard = require('./enforce_overseas_publication'), ui = require('./serve_private_overseas');
const now = Date.parse('2026-10-20T12:00:00Z');
const identity = { setCode: 'TEST', number: '001100', rarity: 'SR', variant: 'standard', language: 'JAPANESE' };
const row = { identity, grade: 'PSA10', condition: 'PSA10', value: 100, currency: 'JPY', priceType: 'actual-sale',
  priceObservedAt: '2026-10-20T10:00:00Z', capturedAt: '2026-10-20T11:00:00Z', count: 4,
  sourceUrl: 'https://example.com/synthetic-only', identityVerified: true, period: { start: '2026-10-19', end: '2026-10-20' } };
const compare = (a, b, policy = {}) => analysis.comparison(a, b, { now, ...policy });
assert.equal(compare(row, { ...row, value: 115 }).label, '海外高');
assert(Math.abs(compare(row, { ...row, value: 115 }).gapPct - 15) < 1e-10);
assert.equal(compare(row, { ...row, value: 80 }).label, '国内高');
assert.equal(compare(row, { ...row, value: 0 }).gapPct, null);
assert.equal(compare(row, row).gapPct, 0);
assert.equal(compare(row, { ...row, value: 105 }).label, 'ほぼ同水準');
assert.equal(compare(row, { ...row, value: 105.0001 }).label, '海外高');
assert.equal(compare(row, { ...row, value: 95 }).label, 'ほぼ同水準');
assert.equal(compare(row, { ...row, value: 94.9999 }).label, '国内高');
assert.equal(compare(row, { ...row, value: 1, currency: 'USD', fx: { currency: 'USD', jpyRate: 115, rateDate: '2026-10-20', sourceUrl: 'https://example.com/fx' } }).foreignJpy, 115);
for (const patch of [{ count: null }, { priceObservedAt: null }, { priceObservedAt: '2026-09-01' }, { capturedAt: '2026-10-19' },
  { currency: 'USD', fx: null }, { identity: { ...identity, variant: 'mirror' } }, { identity: { ...identity, language: 'ENGLISH' } },
  { grade: 'PSA9' }, { priceConflict: true }, { identityVerified: false }, { held: true }, { priceType: 'estimate' },
  { priceType: 'listing' }, { period: null }, { count: 0 }, { sourceUrl: null }]) assert.equal(compare(row, { ...row, ...patch }).status, 'incomparable', JSON.stringify(patch));
assert.equal(compare({ ...row, grade: 'RAW', condition: 'mint' }, { ...row, grade: 'RAW', condition: 'mixed' }).gapPct, null);
assert.equal(compare({ ...row, grade: 'RAW', condition: 'mint' }, { ...row, grade: 'RAW', condition: 'mint' }).gapPct, 0);
assert.equal(compare(row, { ...row, priceObservedAt: '2026-10-19T09:00:00Z', capturedAt: row.capturedAt }).status, 'incomparable');
assert.throws(() => compare(row, row, { neutralBandPct: -1 }), /policy/);
assert(guard.priceLeaks({ renamed: { schema: analysis.SCHEMA, rows: [] } }).length);
assert(guard.priceLeaks({ differentName: { gapPct: 0 } }).length);
assert(guard.priceLeaks({ foreignJpy: 100 }).length);
assert(guard.priceLeaks({ api_key: 'synthetic-test-key' }).length);
assert(!guard.priceLeaks({ domestic: { price: 100, acquisitionStatus: 'success' } }).length);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'private-analysis-'));
const write = (file, value) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), JSON.stringify(value)); };
write('data/pokemon-cards.json', []); write('data/pokedata/manifest.json', { sets: [] });
write('work/search-profile-targets.json', { profiles: [] });
write('.private/overseas/analysis-input.json', { rows: [{ localCardId: 'unproven', domestic: row, foreign: row }] });
assert.equal(analysis.build(root, { now }).rows.length, 0, 'unauthorized inputs are retained but not analysed');
assert.equal(access.allowed(root), false);
write('.private/overseas/api/permission.json', { version: 1, internalAnalysisAllowed: true, apiSubscriptionConfirmed: true, permissionEvidence: 'synthetic-only', reviewedAt: '2026-10-20', expiresAt: '2000-01-01' });
assert.equal(access.allowed(root), false, 'expired private grant fails closed');
write('.private/overseas/api/permission.json', { version: 1, internalAnalysisAllowed: true, apiSubscriptionConfirmed: true, permissionEvidence: 'synthetic-only', reviewedAt: '2026-10-20' });
assert.equal(access.allowed(root), true); assert.equal(access.allowed(root, 'public'), false);
write('data/overseas-access-policy.json', { version: 1, publicPricesAllowed: true, permissionEvidence: 'synthetic-public-license' });
write('data/renamed-internal-result.json', { gapPct: 0 });
assert.throws(() => guard.verify(root), /renamed-internal-result/, 'private derived values stay private even under an unrelated public-data license');
fs.unlinkSync(path.join(root, 'data/renamed-internal-result.json'));
const report = analysis.build(root, { now });
assert.equal(report.coverage.comparable, 0, 'unproven metadata never adopted');
assert.equal(report.coverage.supportedMatchingPct, null, 'acquired universe is not the supported denominator');
assert(ui.render({ ...report, rows: [{ name: '<script>alert(1)</script>', domestic: row, foreign: row, result: compare(row, row) }] }).includes('&lt;script&gt;'));
(async () => {
  let calls = 0;
  const receipt = await require('./run_private_pokedata').run(root, { fetcher: () => { calls++; } });
  assert.equal(receipt.status, 'budget-approval-wait'); assert.equal(calls, 0);
  const card = { id: 'synthetic-card', name: 'Synthetic SR [TEST 001/100]', snkPsa10Price: 100, priceObservedAt: row.priceObservedAt };
  const mapped = { localCardId: card.id, localCardName: card.name, linkStatus: 'auto-confirmed',
    sourceUrl: 'https://www.pokedata.io/card/Test/Synthetic+001', pokedata: { language: 'JAPANESE', setCode: 'TEST', printedNumber: '001/100', number: '001', name: 'Synthetic' } };
  write('data/pokemon-cards.json', [card]);
  write('data/pokedata/manifest.json', { sets: [{ file: 'data/pokedata/sets/test.json' }] });
  write('data/pokedata/sets/test.json', { cards: { [card.id]: mapped }, linkageRecords: [{ localCardId: card.id, pokedataCardId: 1, status: 'auto-confirmed' }] });
  const map = analysis.metadata(root).mappings[0]; assert(map);
  const payload = { id: 1, language: 'JAPANESE', set_code: 'TEST', num: '001', name: 'Synthetic', pricing: { 'PSA 10.0': { value: 1, currency: 'usd' } } };
  assert(analysis.verifyPayload(payload, map));
  assert(!analysis.verifyPayload({ ...payload, set_code: 'OTHER' }, map));
  write('.private/overseas/api/config.json', { approvedCredits: 10, timeBudgetMs: 1000 });
  const acquired = await require('./run_private_pokedata').run(root, { token: 'synthetic-token', fetcher: async () => { calls++; return { ok: true, json: async () => payload }; } });
  assert.equal(acquired.acquired, 1); assert.equal(acquired.newAcquired, 1); assert.equal(calls, 1);
  const acquiredReport = analysis.build(root);
  assert.equal(acquiredReport.coverage.acquired, 1); assert.equal(acquiredReport.coverage.comparable, 0, 'undated aggregate must not invent a dated comparison');
  assert(acquiredReport.rows.find(r => r.localCardId === card.id).result.reasons.includes('海外価格確認日未取得'));
  const skipped = await require('./run_private_pokedata').run(root, { token: 'synthetic-token', fetcher: () => { calls++; } });
  assert.equal(skipped.attempted, 0); assert.equal(calls, 1, 'saved current response is not fetched for analysis or serving');
  const server = ui.createServer(root);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const response = await fetch(base); assert.equal(response.status, 200);
    assert(response.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await fetch(base + '/.private/overseas/analysis-input.json')).status, 404);
    assert.equal((await fetch(base, { headers: { Origin: 'https://example.com' } })).status, 403);
    const badHost = await new Promise((resolve, reject) => require('node:http').get(base, { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject));
    assert.equal(badHost, 403);
    assert.equal((await fetch(base, { method: 'POST' })).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
  console.log('PASS private identity, price/date/FX/count gates, neutral band, negative/zero, no fallback, no unauthorized calls, no public grant, leakage/XSS/loopback-only server');
})().catch(e => { console.error(e); process.exitCode = 1; });
