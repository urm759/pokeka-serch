// Post-publication regression invariants (4-J C). Read-only, offline: it recomputes
// published numbers from the saved inputs in the checked-out main (what Pages serves)
// with logic written separately from the builders, and records mismatches. It never
// requests a retailer, source or AI, never changes purchase criteria and never blocks
// publication; mismatches only become monitor alerts.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const DAY = 86400000, HOUR = 3600000, FILE = 'data/post-publication-check.json', EXAMPLES = 3;

function reader(root) {
  const cache = new Map();
  return file => {
    if (!cache.has(file)) {
      const full = path.join(root, file);
      cache.set(file, fs.existsSync(full) ? JSON.parse(fs.readFileSync(full, 'utf8').replace(/^﻿/, '')) : null);
    }
    return cache.get(file);
  };
}
function tally(name) {
  const result = { name, compared: 0, mismatches: 0, examples: [] };
  result.miss = (...detail) => { result.mismatches++; if (result.examples.length < EXAMPLES) result.examples.push(detail); };
  return result;
}
const near = (a, b, eps = 1e-6) => a == null ? b == null : b != null && Math.abs(a - b) < eps;
const mean = values => values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
const utcDay = d => Date.parse(d + 'T00:00:00Z');

// PSA10 period means (7/30/75/200): one row per JST day, evidence must match day and card identity.
function periodMeans(read, root, evidence) {
  const t = tally('psa10-period-means');
  const history = read('work/market_stability_history.json')?.cards || {}, summary = read('data/psa10-period-summary.json');
  const cards = new Map((read('data/pokemon-cards.json') || []).map(c => [c.id, c]));
  const shards = {};
  const dir = path.join(root, 'data/psa10-periods');
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) Object.assign(shards, read('data/psa10-periods/' + f)?.cards);
  const end = utcDay(summary.asOf), index = { 7: 0, 30: 2, 75: 5, 200: 9 };
  for (const [id, rows] of Object.entries(history)) {
    const card = cards.get(id); if (!card) continue;
    const want = evidence.identity(card), byDay = new Map();
    for (const r of rows || []) {
      if (!Array.isArray(r) || !/^\d{4}-\d{2}-\d{2}$/.test(r[0]) || !(r[2] > 0)) continue;
      const ev = r.length >= 11 ? r[10] : null;
      if (r.length >= 11 && !(Array.isArray(ev) && evidence.calendarDay(ev[0]) === r[0] && ev[1] === want)) continue;
      const prev = byDay.get(r[0]);
      if (prev && Array.isArray(prev[10]) && (!Array.isArray(ev) || Date.parse(ev[0]) < Date.parse(prev[10][0]))) continue;
      byDay.set(r[0], r);
    }
    if (!byDay.size) continue;
    const chunk = shards[id];
    if (!chunk) { t.compared++; t.miss('missing-shard', id); continue; }
    for (const days of [7, 30, 75, 200]) {
      t.compared++;
      const inWin = [...byDay.values()].filter(r => utcDay(r[0]) >= end - (days - 1) * DAY && utcDay(r[0]) <= end).sort((a, b) => a[0].localeCompare(b[0]));
      const prices = inWin.map(r => r[2]), m = prices.length ? Math.round(mean(prices) * 100) / 100 : null;
      const s = chunk.snapshots?.[days];
      if (!s) { t.miss('missing-snapshot', id, days); continue; }
      if (s.mean !== m || s.observedDays !== inWin.length || (s.latestDate || null) !== (inWin.at(-1)?.[0] || null)
        || (prices.length && (s.min !== Math.min(...prices) || s.max !== Math.max(...prices)))) t.miss('snapshot', id, days, s.mean, m);
      const row = summary.cards?.[id];
      if (row && row[index[days]] !== s.mean) t.miss('summary', id, days, row[index[days]], s.mean);
    }
  }
  return t;
}

// U07 mint + sealed-single store reference: per-store median over unique URLs, then simple mean.
function rawReference(read, root) {
  const t = tally('raw-condition-reference');
  const dir = path.join(root, 'data/raw-condition-reference'), all = {};
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) Object.assign(all, read('data/raw-condition-reference/' + f)?.cards);
  const median = a => { const s = a.slice().sort((x, y) => x - y); return (s[Math.floor(s.length / 2)] + s[Math.floor((s.length - 1) / 2)]) / 2; };
  for (const [id, r] of Object.entries(all)) {
    t.compared++;
    const seen = new Set(), bySource = new Map();
    let mint = 0, sealed = 0;
    for (const e of r.evidence || []) {
      if (!e.adopted || !(e.price > 0)) continue;
      const key = e.url || `${e.source}:${e.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (e.condition === 'sealed-single') sealed++; else mint++;
      if (!bySource.has(e.source)) bySource.set(e.source, []);
      bySource.get(e.source).push(e.price);
    }
    const m = mean([...bySource.values()].map(median)), s = r.stores || {};
    if (!((m == null && s.mean == null) || (m != null && s.mean != null && Math.abs(m - s.mean) < 0.51))) t.miss('mean', id, s.mean, m);
    if ((s.independent || 0) !== bySource.size || (s.mint || 0) !== mint || (s.sealed || 0) !== sealed) t.miss('counts', id);
    const b = r.sales?.breakdown || {};
    if (r.sales?.count != null && r.sales.count !== (b.mint || 0) + (b['sealed-single'] || 0)) t.miss('sales', id);
  }
  return t;
}

// U16 MINTORE listing counts (current, 30/75/200-day means) and retailer stock-flow arithmetic.
function listings(read, root) {
  const t = tally('mintore-listings');
  const cards = new Map((read('data/pokemon-cards.json') || []).map(c => [c.id, c]));
  const s = read('data/mintore-listing-summary.json'), hist = {};
  const dir = path.join(root, 'work/mintore-listing-history');
  for (const f of (fs.existsSync(dir) ? fs.readdirSync(dir) : []).sort()) {
    for (const [id, r] of Object.entries(read('work/mintore-listing-history/' + f)?.cards || {})) {
      const card = cards.get(id);
      if (!card || r.identityKey !== card.identityKey || r.sourceId !== (card.sourceId || card.id)) continue;
      Object.assign(hist[id] ||= {}, r.days);
    }
  }
  const end = utcDay(s.asOf);
  for (const [id, values] of Object.entries(s.cards || {})) {
    const days = hist[id];
    for (const [k, vi] of [[0, 1], [1, 4]]) {
      const row = values[k]; if (!row) continue;
      t.compared++;
      if (!days) { t.miss('no-history', id, k); continue; }
      const series = Object.entries(days).filter(([, v]) => Array.isArray(v) && Number.isFinite(v[vi])).sort(([a], [b]) => utcDay(a) - utcDay(b));
      if (series.at(-1)?.[1][vi] !== row[0]) t.miss('current', id, k, row[0]);
      for (const [period, mi] of [[30, 3], [200, 7], [75, 11]]) {
        const w = series.filter(([d]) => utcDay(d) > end - period * DAY && utcDay(d) <= end).map(([, v]) => v[vi]);
        const m = mean(w);
        if (row[mi + 1] !== w.length || (m == null ? row[mi] != null : Math.abs(row[mi] - m) > 0.051)) t.miss('period', id, k, period, row[mi], m);
      }
    }
  }
  for (const f of fs.readdirSync(path.join(root, 'data')).filter(f => /-stock-summary\.json$/.test(f))) {
    for (const [id, card] of Object.entries(read('data/' + f)?.cards || {})) {
      for (const [period, flow] of Object.entries(card?.stockFlow || {})) {
        if (!flow || typeof flow !== 'object' || flow.net == null) continue;
        t.compared++;
        if (flow.net !== (flow.increase || 0) - (flow.decrease || 0) || flow.increase < 0 || flow.decrease < 0) t.miss('stock-flow', f, id, period);
      }
    }
  }
  return t;
}

// U23 PSA10 / raw gap. The builder's clock is not saved; the newest evidence time it
// accepted is a lower bound that reproduces its "no future evidence" rule exactly.
function readSavedRaw(root) {
  const manifest = path.join(root, 'work/raw-price-observations-manifest.json');
  if (!fs.existsSync(manifest)) return {};
  const m = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  if (m.version !== 1 || m.file !== 'work/raw-price-observations.json.gz') throw Error('raw observation archive manifest invalid');
  const bytes = fs.readFileSync(path.join(root, m.file));
  if (require('node:crypto').createHash('sha256').update(bytes).digest('hex') !== m.sha256) throw Error('raw observation archive checksum mismatch');
  return JSON.parse(zlib.gunzipSync(bytes).toString('utf8')).cards || {};
}
function priceGap(read, root, evidence) {
  const t = tally('psa10-raw-gap');
  const history = read('work/market_stability_history.json')?.cards || {}, summary = read('data/psa10-period-summary.json'), gap = summary.priceGap || {};
  const cards = new Map((read('data/pokemon-cards.json') || []).map(c => [c.id, c]));
  // times mixes calendar days and evidence instants; rows [12] rawAt and [13] marketAt index the instants.
  const times = gap.times || [], instants = Object.values(gap.cards || {}).flatMap(r => [times[r[12]], times[r[13]]]).filter(v => /T/.test(v || ''));
  const now = instants.length ? Math.max(...instants.map(Date.parse)) : -Infinity;
  let saved = null;
  const asOf = summary.asOf;
  for (const [id, r] of Object.entries(gap.cards || {})) {
    t.compared++;
    const card = cards.get(id), rows = history[id] || [];
    if (!card) { t.miss('unknown-card', id); continue; }
    if (rows.some(x => Array.isArray(x?.[10]) && !Array.isArray(x[11]))) saved ||= readSavedRaw(root);
    const want = evidence.identity(card), day = new Map();
    for (const x of rows) {
      const p = x[10], q = x[11] || saved?.[id]?.[x[0]];
      if (!Array.isArray(p) || !Array.isArray(q) || p[1] !== want || q[1] !== want || q[2] !== 'mint-domestic-raw-aggregate-v1') continue;
      if (!(x[1] > 0 && x[2] > 0) || (q[3] != null && q[3] !== x[1])) continue;
      const tp = Date.parse(p[0]), tq = Date.parse(q[0]);
      if (evidence.calendarDay(p[0]) !== x[0] || evidence.calendarDay(q[0]) !== x[0] || Math.abs(tp - tq) > 6 * HOUR || tp > now || tq > now) continue;
      const at = Math.max(tp, tq), old = day.get(x[0]);
      if (!old || old.at < at) day.set(x[0], { d: x[0], at, ratio: (x[2] / x[1] - 1) * 100, raw: x[1], psa10: x[2] });
    }
    const list = [...day.values()].sort((a, b) => a.d.localeCompare(b.d));
    const win = n => list.filter(e => e.d <= asOf && utcDay(e.d) >= utcDay(asOf) - (n - 1) * DAY);
    const w75 = win(75), w7 = win(7), last = w75.at(-1), m75 = mean(w75.map(e => e.ratio)), m7 = mean(w7.map(e => e.ratio));
    if (!near(r[1], m75) || !near(r[3], m7) || r[2] !== w75.length || r[4] !== w7.length) t.miss('means', id, r[1], m75, r[3], m7);
    if (last && (r[10] !== last.raw || r[11] !== last.psa10 || (r[0] != null && !near(r[0], last.ratio)))) t.miss('current', id, r[0], last.ratio);
    if (r[5] != null && !near(r[5], m7 - m75)) t.miss('change', id, r[5], m7 - m75);
  }
  return t;
}

// Buyback identity holds: a held or quarantined quote never carries a current price.
// A printed-number hold (PR #97) also keeps the old mapping out of every average; an
// older identity-change hold keeps the averages recorded before the change by design.
function buybackHolds(read) {
  const t = tally('buyback-holds');
  const summary = read('data/shop-buyback-summary.json') || {};
  for (const [id, card] of Object.entries(summary.cards || {})) {
    for (const [shop, row] of Object.entries(card.shops || {})) {
      if (!(row?.identityHeld || row?.quarantined)) continue;
      t.compared++;
      if (row.price != null) t.miss('held-with-price', id, shop, row.price);
      else if (row.numberHeldThrough && (row.avg7 != null || row.avg30 != null || row.avg90 != null)) t.miss('number-hold-with-average', id, shop);
    }
  }
  return t;
}

function gitHead(root) {
  try { return require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { return null; }
}
function run(root = path.join(__dirname, '..'), { now = Date.now(), head = gitHead(root) } = {}) {
  const started = Date.now(), read = reader(root);
  const result = { version: 1, checkedAt: new Date(now).toISOString(), head, sourceRequests: 0, llmCalls: 0, codexCalls: 0,
    rule: '保存済み入力から別実装で再計算し公開値と照合。取得・AI呼出0。不一致は監視の警告のみで公開・計算条件は変えない', checks: {} };
  let evidence = null;
  try { evidence = require(path.join(root, 'work/psa10_observation_evidence')); } catch (error) { result.checks.setup = { name: 'setup', error: error.message }; }
  for (const [name, check] of [['periodMeans', () => periodMeans(read, root, evidence)], ['rawReference', () => rawReference(read, root)],
    ['listings', () => listings(read, root)], ['priceGap', () => priceGap(read, root, evidence)], ['buybackHolds', () => buybackHolds(read)]]) {
    try {
      if (!evidence && (name === 'periodMeans' || name === 'priceGap')) throw Error('psa10_observation_evidence unavailable');
      const { miss, ...row } = check();
      result.checks[name] = row;
    } catch (error) { result.checks[name] = { name, error: String(error.message).slice(0, 300) }; }
  }
  result.durationMs = Date.now() - started;
  result.status = Object.values(result.checks).some(c => c.error || c.mismatches) ? 'alert' : 'ok';
  return result;
}
function issues(result) {
  if (!result) return [];
  return Object.values(result.checks || {}).flatMap(check => check.error
    ? [{ key: `post-publication:${check.name}:error`, reason: `公開後の自動確認（${check.name}）を実行できず：${check.error}`, url: null }]
    : check.mismatches ? [{ key: `post-publication:${check.name}:mismatch`,
      reason: `公開後の自動確認：${check.name} が保存入力からの再計算と${check.mismatches}件不一致（照合${check.compared}件）。例 ${JSON.stringify(check.examples[0])}`, url: null }] : []);
}
function record(root = path.join(__dirname, '..'), options) {
  const result = run(root, options);
  fs.writeFileSync(path.join(root, FILE), JSON.stringify(result));
  return result;
}
if (require.main === module) {
  const result = record();
  console.log(JSON.stringify({ status: result.status, durationMs: result.durationMs,
    checks: Object.fromEntries(Object.entries(result.checks).map(([k, c]) => [k, c.error || `${c.mismatches}/${c.compared}`])) }));
}
module.exports = { run, record, issues, FILE, periodMeans, rawReference, listings, priceGap, buybackHolds, reader };
