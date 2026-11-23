// 4-F B-2/B-3: the guard measures everything read at startup, and the monitor warns once before the
// budget is reached. Local files only; no requests. Publication rules and the budget are unchanged.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const w = require('./payload_budget_warning');
const { violations, startupFiles } = require('./measure_performance_guard');
const root = path.join(__dirname, '..');
const budgets = JSON.parse(fs.readFileSync(path.join(root, 'data/performance-budgets.json'), 'utf8'));

// The same 24,000,000 applies to the wider startup scope; the 30-file limit is unchanged.
assert.equal(budgets.maximum.initialBytes, 24000000);
assert.equal(budgets.maximum.startupBytes, 24000000);
assert.equal(violations({ startupBytes: 24000001 }, budgets).filter(v => v.startsWith('startupBytes')).length, 1, 'over the startup budget stops publication like the 30-file budget');
assert.equal(violations({ startupBytes: 24000000 }, { maximum: { startupBytes: 24000000 } }).length, 0);

// Startup scope: manifest, health banner, GemRate summary and every PSA POP glance shard.
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/ui/manifest.json'), 'utf8'));
const extra = startupFiles(root, manifest);
assert(extra.includes('data/ui/manifest.json') && extra.includes('data/update-health-banner.json'));
assert(extra.includes(manifest.aliases['data/gemrate-reference-summary.json'] || 'data/gemrate-reference-summary.json'));
const shards = fs.readdirSync(path.join(root, 'data/psa-pop-glance')).filter(n => n.endsWith('.json'));
assert.equal(extra.filter(f => f.startsWith('data/psa-pop-glance/')).length, shards.length, 'all glance shards counted as an upper bound');
assert(!extra.some(f => /performance-(?:guard|history)|psa-history|psa-mapping-review/.test(f)), 'raw audits never enter the startup scope');

// Early warning.
const now = Date.parse('2026-11-23T12:00:00Z'), at = h => new Date(now - h * 3600000).toISOString();
const limits = { maximum: { initialBytes: 24000000, startupBytes: 24000000 } };
const flat = { records: [{ generatedAt: at(100), startupBytes: 22100000 }, { generatedAt: at(1), startupBytes: 22100000 }] };
assert.deepEqual(w.issues({ startupBytes: 22100000 }, flat, limits, now), [], 'below 95% and not growing: no warning');
assert.deepEqual(w.issues({ startupBytes: 22800000 }, flat, limits, now).map(i => i.key), ['payload-budget:near-limit'], '95% warns');
const growing = { records: [{ generatedAt: at(48), startupBytes: 22000000 }, { generatedAt: at(0), startupBytes: 22600000 }] };
const projected = w.issues({ startupBytes: 22600000 }, growing, limits, now);
assert.deepEqual(projected.map(i => i.key), ['payload-budget:projected-7d'], '300,000/day reaches the limit within 7 days');
assert.match(projected[0].reason, /5日で基準を超える/);
const slow = { records: [{ generatedAt: at(48), startupBytes: 22000000 }, { generatedAt: at(0), startupBytes: 22060000 }] };
assert.deepEqual(w.issues({ startupBytes: 22060000 }, slow, limits, now), [], '30,000/day is weeks away');
// Old rows without the wider scope fall back to the 30-file growth; rows older than 7 days or in the future are ignored.
const mixed = { records: [{ generatedAt: at(400), initialBytes: 1 }, { generatedAt: at(48), initialBytes: 21000000 }, { generatedAt: at(0), initialBytes: 21600000, startupBytes: 22600000 }, { generatedAt: new Date(now + 3600000).toISOString(), initialBytes: 99999999 }] };
assert.equal(Math.round(w.growthPerDay(mixed.records, now)), 300000);
// A one-off reduction gives a negative slope and no projection warning.
const reduced = { records: [{ generatedAt: at(48), initialBytes: 22300000 }, { generatedAt: at(0), initialBytes: 21130000 }] };
assert.deepEqual(w.issues({ initialBytes: 21130000 }, reduced, limits, now), []);
// Unreadable measurements are reported, never hidden; keys are stable so the watcher sends one alert.
assert.deepEqual(w.issues({}, flat, limits, now).map(i => i.key), ['payload-budget:unmeasured']);
assert.deepEqual(w.issues({ startupBytes: 22800000 }, flat, limits, now), w.issues({ startupBytes: 22800000 }, flat, limits, now + 3600000));

// The watcher reads published files only, isolated so a failure is reported.
const watch = fs.readFileSync(path.join(__dirname, 'watch_update_health.js'), 'utf8');
assert.match(watch, /require\('\.\/payload_budget_warning'\)\.issues\(read\('data\/performance-guard\.json'\),read\('data\/performance-history\.json'\),read\('data\/performance-budgets\.json'\),clockAt\)/);
assert.match(watch, /key:'payload-budget:check-error'/);
console.log('PASS startup scope with all glance shards, same 24,000,000 budget, 95% and 7-day warnings once, no request');
