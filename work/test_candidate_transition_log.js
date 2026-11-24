const assert = require('assert'), log = require('./candidate_transition_log'), { mergeProfileTargets } = require('./reconcile_saved_source_merge');
const at1 = '2026-11-24T01:00:00.000Z', at2 = '2026-11-24T03:00:00.000Z';
const metrics = (cap, price) => ({ decision: { operationalLimit: cap }, purchase: { price, source: 'キャンプ' } });
const profiles = [{ urlOnly: { id: 'V', ids: ['a', 'c'], rows: [{ id: 'a', metrics: metrics(10000, 9000) }, { id: 'c', metrics: metrics(5000, 4000) }] } }];
const previousProfiles = [{ id: 'V', urlHash: 'h1', urlsMatched: ['a', 'b'] }];
const transitions = [{ id: 'V', urlHash: 'h1', gained: ['c'], firstQualified: ['c'], lost: ['b'],
  lostReasons: [{ id: 'b', name: 'ピカチュウ SAR (x)', before: metrics(8000, 7000),
    departureAudit: { roots: [{ code: 'purchase-price-expired' }], changedPrices: [{ field: '計算採用買値', before: 7000, after: 7500 }], temporalOnly: true, settingsChanged: false, codeChanged: false } }] }];
const e = log.events({ at: at1, transitions, profiles, previousProfiles });
assert.deepEqual(e.map(x => [x.e, x.id]), [['in', 'c'], ['out', 'b']], 'one event per entering and leaving card');
assert.equal(e[0].first, true); assert.equal(e[0].cap, 5000); assert.equal(e[0].buy, 4000); assert.equal(e[0].origin, 'natural');
assert.equal(e[1].name, 'ピカチュウ SAR'); assert.deepEqual(e[1].roots, ['purchase-price-expired']); assert.deepEqual(e[1].prices, [['計算採用買値', 7000, 7500]]);
assert.equal(e[1].temporalOnly, true); assert.equal(e[1].cap, 8000, 'leaving facts are the last qualified facts');
// A changed URL/settings is one settings event, never a mass of entering/leaving cards.
const changed = log.events({ at: at1, transitions: [{ id: 'V', urlHash: 'h2', gained: [], lost: [] }], profiles, previousProfiles });
assert.deepEqual(changed.map(x => [x.e, x.fromHash, x.toHash, x.before, x.after]), [['settings', 'h1', 'h2', 2, 2]]);
// Re-running the same instant does not duplicate; old events leave only after the retention period.
const once = log.append([], e, at1), twice = log.append(once, e, at1);
assert.equal(twice.length, 2, 'same run is idempotent');
const old = { ...e[0], at: '2025-10-01T00:00:00.000Z' };
assert.equal(log.append([old], [], at2).length, 0, 'older than retention is dropped');
assert.equal(log.append([{ ...old, at: '2025-11-01T00:00:00.000Z' }], [], at2).length, 1, 'within 400 days is kept');
// The card returning later is a new event; the earlier leaving stays in the log (pendingDepartures forgets it).
const back = log.events({ at: at2, profiles: [{ urlOnly: { id: 'V', ids: ['a', 'b', 'c'], rows: [] } }], previousProfiles: [{ id: 'V', urlHash: 'h1' }],
  transitions: [{ id: 'V', urlHash: 'h1', gained: ['b'], lost: [] }] });
const both = log.append(once, back, at2);
assert.deepEqual(both.filter(x => x.id === 'b').map(x => x.e), ['out', 'in']);
// Publication merge keeps both sides' events and the rest of the newer file.
const side = (at, transitionLog, urlsMatched) => ({ at, profiles: [{ id: 'V', urlHash: 'h1', urlsMatched, seenQualified: [] }], pendingDepartures: [], ...(transitionLog ? { transitionLog } : {}) });
const merged = mergeProfileTargets(side(at1, [], ['a']), side(at1, once, ['a', 'c']), side(at2, back, ['a', 'b', 'c']));
assert.equal(merged.at, at2); assert.deepEqual(merged.transitionLog.map(x => x.at + x.e + x.id), both.map(x => x.at + x.e + x.id));
assert.equal(merged.transitionLog.some(x => x.origin === 'merge'), false, 'consistent sides need no reconciliation');
// Concurrent runs: the older side recorded b leaving, the newer side still lists b. The log gains one merge event.
const outOnly = log.append([], [{ at: at1, profile: 'V', id: 'b', e: 'out', origin: 'natural' }], at1);
const raced = mergeProfileTargets(side(at1, [], ['a', 'b']), side(at1, outOnly, ['a']), side(at2, [], ['a', 'b']));
assert.deepEqual(raced.transitionLog.map(x => [x.at, x.e, x.id, x.origin]), [[at1, 'out', 'b', 'natural'], [at2, 'in', 'b', 'merge']]);
assert.deepEqual([...log.implied(raced.transitionLog, 'V')], [['b', 'in']], 'log agrees with the kept candidates');
const legacy = mergeProfileTargets(side(at1, undefined, ['a']), side(at1, undefined, ['a']), side(at2, undefined, ['a']));
assert.equal('transitionLog' in legacy, false, 'files without the log merge exactly as before');
console.log('PASS candidate transition log: in/out facts, settings change as one event, idempotent append, 400-day retention, return after leaving, publication merge');
