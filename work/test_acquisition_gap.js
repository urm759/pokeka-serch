// 4-J J: a 3-hour gap in acquisition starts (GitHub schedules and the external timer both
// silent) and the timer token expiry are reported once each. Fixtures only; no requests.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const c = require('./silent_stop_checks');
const now = Date.parse('2026-11-23T14:00:00Z'), at = h => new Date(now - h * 3600000).toISOString();
const run = (h, name = 'Priority Purchase Price Refresh') => ({ name, created_at: at(h) });

// Normal day (the last 3 days peaked at 2.57 hours): no warning.
const normal = [run(23), run(20.5, 'Daily Fast Update'), run(18), run(15.6, 'Data Update Health Watchdog'), run(13.1), run(10.6, 'Safe Checkpoint Backfill'),
  run(8.2, 'Data Update Health Watchdog'), run(5.7), run(3.2, 'Deep Resolve Unmatched Cards'), run(0.7, 'Data Update Health Watchdog')];
assert.deepEqual(c.acquisitionGapIssues(normal, now), []);
// Pages builds and pull-request checks are not acquisition starts.
assert.deepEqual(c.acquisitionGapIssues([...normal, run(1, 'pages build and deployment'), run(2, 'Operational Entry Path Checks')], now), []);

// A closed 4-hour gap inside the last 24 hours, keyed by its start.
const gapped = [run(12), run(8), run(5.5), run(3), run(1)];
const closed = c.acquisitionGapIssues(gapped, now);
assert.deepEqual(closed.map(i => i.key), ['acquisition-start:gap:' + at(12).slice(0, 16)]);
assert.match(closed[0].reason, /4\.0時間空いた/);
assert.match(closed[0].reason, /外部タイマー/);
// The same gap seen by later watcher runs keeps the same key (one alert).
assert.deepEqual(c.acquisitionGapIssues(gapped, now + 3600000).map(i => i.key), closed.map(i => i.key));
// An open gap up to now is reported while it lasts.
const open = c.acquisitionGapIssues([run(7), run(5)], now);
assert.deepEqual(open.map(i => i.key), ['acquisition-start:gap:' + at(5).slice(0, 16)]);
assert.match(open[0].reason, /今まで/);
// Gaps that ended more than 24 hours ago are not reported again.
assert.deepEqual(c.acquisitionGapIssues([run(40), ...[30, 27.6, 25.2, 22.8, 20.4, 18, 15.6, 13.2, 10.8, 8.4, 6, 3.6, 1.2].map(h => run(h))], now), []);
// Exactly 3 hours is still within the rule; future-dated runs are ignored.
assert.deepEqual(c.acquisitionGapIssues([run(3), { name: 'Daily Fast Update', created_at: new Date(now + 3600000).toISOString() }], now), []);
// Nothing at all is reported, never hidden.
assert.deepEqual(c.acquisitionGapIssues([run(1, 'pages build and deployment')], now).map(i => i.key), ['acquisition-start:none']);

// Timer token: quiet until 14 days before 2027-02-12, then one stable key.
assert.equal(c.TIMER_TOKEN_EXPIRES_AT, '2027-02-12T00:00:00Z');
assert.match(fs.readFileSync(path.join(__dirname, '../ops/external-wakeup/README.md'), 'utf8'), /2027-02-12/, 'expiry matches the recorded token setting');
assert.deepEqual(c.timerTokenIssues(Date.parse('2027-01-28T23:00:00Z')), []);
const soon = c.timerTokenIssues(Date.parse('2027-01-30T00:00:00Z'));
assert.deepEqual(soon.map(i => i.key), ['external-timer:token-expiring:2027-02-12']);
assert.match(soon[0].reason, /13日後/);
assert.match(c.timerTokenIssues(Date.parse('2027-02-13T00:00:00Z'))[0].reason, /期限切れ/);
assert.deepEqual(c.timerTokenIssues(now), [], 'not yet (2026-11-23)');

// The watcher reads the run list (24h, up to 3 pages) and isolates failures.
const watch = fs.readFileSync(path.join(__dirname, 'watch_update_health.js'), 'utf8');
assert.match(watch, /actions\/runs\?per_page=100&page=\$\{page\}&created=%3E\$\{since\}/);
assert.match(watch, /acquisitionGapIssues\(runs,clockAt\)/);
assert.match(watch, /key:'acquisition-start:check-error'/);
assert.match(watch, /timerTokenIssues\(clockAt\)/);
console.log('PASS acquisition start gap over 3h reported once per gap, non-acquisition runs ignored, timer token expiry warned 14 days ahead');
