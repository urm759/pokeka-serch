// Daily buying digest: a few KB summary of the formal search URLs for a phone page and later
// notifications. Reads the profile audit that finalize just wrote; no source requests, no AI.
const fs = require('node:fs'), path = require('node:path');
const DAY = 86400000;
const jstDate = (t = Date.now()) => new Date(t + 9 * 3600000).toISOString().slice(0, 10);
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function card(row) {
  const m = row.metrics || {}, p = m.purchase || {};
  return { id: row.id, name: String(row.name || '').replace(/\s*\(.*$/, '').slice(0, 60),
    buy: Number.isFinite(p.price) ? p.price : (Number.isFinite(row.buy) ? row.buy : null), store: p.source || null, url: p.url || null,
    fresh: p.fresh === true, priceAt: p.priceObservedAt || null,
    cap: Number.isFinite(m.decision?.operationalLimit) ? m.decision.operationalLimit : null,
    profit: Number.isFinite(row.profit) ? Math.round(row.profit) : null, annual: Number.isFinite(row.annual) ? Math.round(row.annual * 10) / 10 : null,
    verdict: row.go || m.decision?.verdict || null };
}
function build(root = path.join(__dirname, '..'), now = Date.now(), userProfiles = require('./digest_user_profiles').build) {
  const audit = readJson(path.join(root, 'data/priority-search-profile-audit.json'), null);
  if (!audit?.profiles?.length) throw new Error('daily digest: formal profile audit missing');
  const file = path.join(root, 'data/daily-digest.json'), previous = readJson(file, null), today = jstDate(now);
  const prior = previous?.current?.date !== today ? previous?.current : previous?.baselineState;
  const baseline = prior?.date === jstDate(now - DAY) ? prior : null;
  const personal = userProfiles(root, audit.at, baseline);
  const profiles = [...audit.profiles.map(p => p.urlOnly).filter(Boolean), ...personal].map(u => {
    const rows = Array.isArray(u.rows) ? u.rows : [], byId = new Map(rows.map(r => [r.id, r]));
    const qualified = rows.filter(r => r.qualified).sort((a, b) => (b.priority || 0) - (a.priority || 0));
    // The specified-condition URLs share the report name; say which one it is.
    const name = (u.reportName || u.id) + (/-specified$/.test(u.id) ? '（指定条件）' : '');
    return { id: u.id, name, url: u.originalUrl || null, count: qualified.length, ids: qualified.map(r => r.id),
      candidates: qualified.map(card), byId };
  });
  // Changes are measured against the last state of the previous Japan calendar day.
  const current = { date: today, at: new Date(now).toISOString(), ids: Object.fromEntries(profiles.map(p => [p.id, p.ids])) };
  const departures = new Map((audit.pendingDepartures || []).map(d => [`${d.profile}|${d.id}`, d]));
  let transitionLog;
  function savedDepartureName(profile, id, at) {
    if (!at) return null;
    if (!transitionLog) {
      const entries = readJson(path.join(root, 'work/search-profile-targets.json'), null)?.transitionLog;
      transitionLog = Array.isArray(entries) ? entries : [];
    }
    return transitionLog.find(e => e?.profile === profile && e.id === id && e.e === 'out' && e.at === at && e.name)?.name;
  }
  const digest = { version: 1, generatedAt: new Date(now).toISOString(), auditAt: audit.at || null, date: today,
    rule: '正式条件とマイ条件の候補。前日比は日本時間の前日の最後の状態と比べる', llmCalls: 0, sourceRequests: 0,
    baseline: baseline ? { date: baseline.date, at: baseline.at } : null,
    profiles: profiles.map(p => {
      const before = baseline?.ids?.[p.id] || null, beforeSet = new Set(before || []), nowSet = new Set(p.ids);
      const gained = before ? p.ids.filter(id => !beforeSet.has(id)) : [], lost = before ? before.filter(id => !nowSet.has(id)) : [];
      return { id: p.id, name: p.name, url: p.url, count: p.count, previousCount: before ? before.length : null,
        gained: gained.map(id => card(p.byId.get(id))),
        lost: lost.map(id => {
          const r = p.byId.get(id), d = departures.get(`${p.id}|${id}`);
          const name = r?.name || d?.before?.name || savedDepartureName(p.id, id, d?.firstObservedAt) || id;
          const reasons = [r?.reasons, d?.reasons, d?.rootCauses, d?.after?.exclusions, d?.departureAudit?.directFailures]
            .find(values => Array.isArray(values) && values.length) || [];
          return { id, name: String(name).replace(/\s*\(.*$/, '').slice(0, 60), reasons: reasons.slice(0, 3).map(String) };
        }),
        candidates: personal.some(u => u.id === p.id) ? p.candidates : p.candidates.slice(0, 30) };
    }),
    current: { date: current.date, at: current.at, ids: current.ids } };
  // Keep only the previous day's last state (ids per profile) for later runs today; no growing history.
  digest.baselineState = baseline ? { date: baseline.date, at: baseline.at, ids: baseline.ids } : null;
  fs.writeFileSync(file, JSON.stringify(digest));
  return digest;
}
if (require.main === module) { const d = build(); console.log(JSON.stringify(d.profiles.map(p => ({ id: p.id, count: p.count, previous: p.previousCount, gained: p.gained.length, lost: p.lost.length })))); }
module.exports = { build, jstDate };
