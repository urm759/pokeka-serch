// Durable, compact log of formal-search candidates entering and leaving (U16 / 4-J O2-1).
// It only records what the profile evaluator already decided; it never changes candidates, limits or GO.
// Kept inside work/search-profile-targets.json so the existing publication merge keeps it.
const DAY = 86400000, RETENTION_DAYS = 400, MAX_PRICES = 4;
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
function facts(metrics) {
  const m = metrics || {}, p = m.purchase || {};
  return { cap: num(m.decision?.operationalLimit), buy: num(p.price), store: p.source || null };
}
function key(e) { return [e.at, e.profile, e.id || '', e.e].join('|'); }
// One run's events from the evaluator's own transitions. origin "natural" separates them from rows
// rebuilt later from saved history (origin "recovered").
function events({ at, transitions = [], profiles = [], previousProfiles = [] }) {
  const out = [];
  for (const t of transitions) {
    const p = profiles.find(r => r.urlOnly?.id === t.id)?.urlOnly, old = previousProfiles.find(r => r.id === t.id);
    if (!p) continue;
    if (old && old.urlHash !== t.urlHash) {
      out.push({ at, profile: t.id, e: 'settings', origin: 'natural', fromHash: old.urlHash || null, toHash: t.urlHash || null,
        before: (old.urlsMatched || []).length, after: (p.ids || []).length });
      continue;
    }
    const rows = new Map((p.rows || []).map(r => [r.id, r]));
    const first = new Set(t.firstQualified || []);
    for (const id of t.gained || []) out.push({ at, profile: t.id, id, e: 'in', origin: 'natural', first: first.has(id), ...facts(rows.get(id)?.metrics) });
    for (const r of t.lostReasons || []) {
      const a = r.departureAudit || {};
      out.push({ at, profile: t.id, id: r.id, e: 'out', origin: 'natural', name: r.name ? String(r.name).replace(/\s*\(.*$/, '').slice(0, 60) : null,
        roots: (a.roots || []).map(x => x.code).filter(Boolean).slice(0, 6),
        prices: (a.changedPrices || []).slice(0, MAX_PRICES).map(x => [x.field, num(x.before), num(x.after)]),
        temporalOnly: a.temporalOnly === true, settingsChanged: a.settingsChanged === true, codeChanged: a.codeChanged === true,
        ...facts(r.before) });
    }
  }
  return out;
}
function retain(log, now) {
  const cutoff = Date.parse(now) - RETENTION_DAYS * DAY;
  return log.filter(e => Date.parse(e.at) >= cutoff);
}
function union(...logs) {
  const byKey = new Map();
  for (const log of logs) for (const e of log || []) byKey.set(key(e), e);
  return [...byKey.values()].sort((a, b) => a.at.localeCompare(b.at) || key(a).localeCompare(key(b)));
}
function append(previousLog, newEvents, now) { return retain(union(previousLog, newEvents), now); }
// Membership implied by the log: the last in/out per card after the profile's last settings change.
function implied(log, profileId) {
  const state = new Map();
  for (const e of log) {
    if (e.profile !== profileId) continue;
    if (e.e === 'settings') state.clear();
    else if (e.e === 'in' || e.e === 'out') state.set(e.id, e.e);
  }
  return state;
}
// Publication merge: keep both sides' events. Two concurrent runs can leave an older "out" next to the newer
// file's current list; such a card gets one origin "merge" event at the merged time so the log matches the
// kept candidates instead of contradicting them.
function merge(a, b, profiles = [], at) {
  const now = at || [a?.at, b?.at].filter(Boolean).sort().at(-1) || new Date().toISOString();
  const joined = union(a?.transitionLog, b?.transitionLog), fixes = [];
  for (const p of profiles) {
    const current = new Set(p.urlsMatched || []);
    for (const [id, last] of implied(joined, p.id)) {
      const isIn = current.has(id);
      if ((last === 'in') !== isIn) fixes.push({ at: now, profile: p.id, id, e: isIn ? 'in' : 'out', origin: 'merge', note: 'concurrent-run-reconciled' });
    }
  }
  return retain(union(joined, fixes), now);
}
module.exports = { RETENTION_DAYS, events, append, merge, implied, key };
