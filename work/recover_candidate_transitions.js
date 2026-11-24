// One-off, local: rebuild enter/leave events for the period before work/candidate_transition_log.js existed,
// from the committed data/priority-search-profile-audit.json history (4-J O2-2). No source requests, no AI.
// Rows are origin "recovered" with their commit and stay in their own file, apart from the natural log.
// Limitation: a run that was never committed is missing, so an event can be absent or appear one commit later.
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const log = require('./candidate_transition_log');
const ROOT = path.join(__dirname, '..'), AUDIT = 'data/priority-search-profile-audit.json', OUT = 'work/candidate-transition-recovered.json';
const git = (args, opts = {}) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts });
function recover({ until = 'HEAD', before } = {}) {
  const commits = git(['log', '--format=%H', '--reverse', until, '--', AUDIT]).trim().split('\n').filter(Boolean);
  const events = [], seen = new Set();
  let previousProfiles = [], scanned = 0, skipped = 0;
  for (const commit of commits) {
    let report;
    try { report = JSON.parse(git(['show', `${commit}:${AUDIT}`])); } catch { skipped++; continue; }
    scanned++;
    if (!report?.at || seen.has(report.at) || (before && report.at >= before)) continue;
    seen.add(report.at);
    const profiles = (report.profiles || []).filter(p => p.urlOnly);
    for (const e of log.events({ at: report.at, transitions: report.transitions || [], profiles, previousProfiles }))
      events.push({ ...e, origin: 'recovered', commit: commit.slice(0, 12) });
    previousProfiles = (report.transitions || []).map(t => ({ id: t.id, urlHash: t.urlHash,
      urlsMatched: profiles.find(p => p.urlOnly.id === t.id)?.urlOnly.ids || [] }));
  }
  const sorted = events.sort((a, b) => a.at.localeCompare(b.at) || log.key(a).localeCompare(log.key(b)));
  return { version: 1, generatedAt: new Date().toISOString(), source: AUDIT, origin: 'recovered', scannedCommits: scanned, unreadableCommits: skipped,
    until: before || null, first: sorted[0]?.at || null, last: sorted.at(-1)?.at || null, sourceRequests: 0, llmCalls: 0,
    rule: '確定済みの監査の transitions だけから復元。保存されなかった実行の出入りは欠ける。自然の記録（search-profile-targets.json の transitionLog）とは混ぜない',
    events: sorted };
}
module.exports = { recover };
if (require.main === module) {
  const before = process.argv.find(a => a.startsWith('--before='))?.slice(9);
  const result = recover({ before });
  fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(result));
  const counts = {}; for (const e of result.events) counts[e.e] = (counts[e.e] || 0) + 1;
  console.log(JSON.stringify({ scanned: result.scannedCommits, unreadable: result.unreadableCommits, events: result.events.length, counts, first: result.first, last: result.last }));
}
