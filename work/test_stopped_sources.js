// Owner-stopped sources: published rows are emptied after every writer, originals archived once,
// idempotent, never triggered by a transient error. Local fixtures only; no requests.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), zlib = require('node:zlib');
const { apply } = require('./apply_stopped_sources');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stopped-')), put = (f, v) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), JSON.stringify(v)); };
const read = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
put('data/cardrush-stock-summary.json', { updatedAt: '2026-09-19', coverage: { totalCards: 2 }, cards: { a: { cardrushPrice: 100 }, b: { cardrushPrice: 200 } } });
put('data/hareruya2-stock-summary.json', { cards: { a: { hareruya2Price: 90 } } });
// No decision file: nothing happens (a 403 alone never empties a source).
assert.deepEqual(apply(root).applied, []);
assert.equal(Object.keys(read('data/cardrush-stock-summary.json').cards).length, 2);
put('data/stopped-sources.json', { version: 1, decidedAt: '2026-11-24', sources: { cardrush: { file: 'data/cardrush-stock-summary.json', reason: '403' }, missing: { file: 'data/none.json', reason: 'x' } } });
const now = new Date('2026-11-24T00:00:00Z');
assert.deepEqual(apply(root, now).applied, [{ source: 'cardrush', rowsRemoved: 2 }]);
const after = read('data/cardrush-stock-summary.json');
assert.deepEqual(after.cards, {}, 'rows emptied');
assert.deepEqual(after.coverage, { totalCards: 2 }, 'file shape and coverage kept');
assert.equal(after.stoppedByOwner.rowsRemoved, 2);
const archive = path.join(root, 'work/stopped-source-archive/cardrush-2026-11-24.json.gz');
assert.equal(Object.keys(JSON.parse(zlib.gunzipSync(fs.readFileSync(archive))).cards).length, 2, 'original archived outside data/');
assert.equal(Object.keys(read('data/hareruya2-stock-summary.json').cards).length, 1, 'other sources untouched');
// Idempotent, and a writer that refills rows is emptied again without overwriting the first archive.
assert.deepEqual(apply(root, now).applied, []);
put('data/cardrush-stock-summary.json', { ...after, cards: { c: { cardrushPrice: 1 } } });
assert.deepEqual(apply(root, now).applied, [{ source: 'cardrush', rowsRemoved: 1 }]);
assert.equal(Object.keys(JSON.parse(zlib.gunzipSync(fs.readFileSync(archive))).cards).length, 2, 'first archive kept');
// Only data/*.json files may be listed.
put('data/stopped-sources.json', { version: 1, sources: { bad: { file: '../escape.json', reason: 'x' } } });
assert.throws(() => apply(root), /data\/\*\.json/);
fs.rmSync(root, { recursive: true, force: true });
// Wiring and the owner's current decision.
const finalize = fs.readFileSync(path.join(__dirname, 'finalize_update_status.js'), 'utf8');
assert(finalize.indexOf("require('./apply_stopped_sources').apply(ROOT)") > finalize.indexOf("require('./audit_purchase_issue_aliases.js').build(ROOT);"), 'runs after the writers in finalize');
assert(finalize.indexOf("require('./apply_stopped_sources').apply(ROOT)") < finalize.indexOf('build_card_completion.js'), 'runs before completion and audits');
const decision = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/stopped-sources.json'), 'utf8'));
assert.deepEqual(Object.keys(decision.sources).sort(), ['cardrush', 'snkrRaw', 'yuyutei']);
console.log('PASS owner-stopped sources: rows emptied after writers, archive kept once, idempotent, no transient trigger, data/*.json only');
