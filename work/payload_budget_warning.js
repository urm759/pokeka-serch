// 4-F B-3: warn before the startup JSON reaches the publication budget. Warning only:
// publication and the budget itself are unchanged (the guard still stops at the limit).
const NEAR_RATIO = 0.95, HORIZON_DAYS = 7, WINDOW_DAYS = 7, DAY_MS = 86400000;
const bytesOf = row => Number.isFinite(row?.startupBytes) ? row.startupBytes : Number.isFinite(row?.initialBytes) ? row.initialBytes : null;
function growthPerDay(records = [], now = Date.now()) {
  // Same-scope slope over the last 7 days; the 30-file total stands in while older rows lack startupBytes.
  const recent = records.filter(r => Number.isFinite(Date.parse(r.generatedAt)) && now - Date.parse(r.generatedAt) <= WINDOW_DAYS * DAY_MS && Date.parse(r.generatedAt) <= now);
  const key = recent.every(r => Number.isFinite(r.startupBytes)) ? 'startupBytes' : 'initialBytes';
  const rows = recent.filter(r => Number.isFinite(r[key])).sort((a, b) => Date.parse(a.generatedAt) - Date.parse(b.generatedAt));
  if (rows.length < 2) return null;
  const days = (Date.parse(rows.at(-1).generatedAt) - Date.parse(rows[0].generatedAt)) / DAY_MS;
  return days >= 1 ? (rows.at(-1)[key] - rows[0][key]) / days : null;
}
function issues(guard, history, budgets, now = Date.now()) {
  const limit = budgets?.maximum?.startupBytes ?? budgets?.maximum?.initialBytes;
  const current = bytesOf(guard);
  if (!Number.isFinite(limit) || !Number.isFinite(current)) return [{ key: 'payload-budget:unmeasured', reason: '起動時JSONの容量を読めない。性能検査の記録を確認', url: null }];
  const out = [], scope = Number.isFinite(guard.startupBytes) ? '起動時に読む全部' : '計算用30本';
  if (current >= limit * NEAR_RATIO) out.push({ key: 'payload-budget:near-limit',
    reason: `初期JSON（${scope}）${current.toLocaleString('en-US')}バイト＝基準${limit.toLocaleString('en-US')}の${(current / limit * 100).toFixed(1)}%。95%以上。超えると公開前の検証で止まる`, url: null });
  const slope = growthPerDay(history?.records || [], now);
  if (slope != null && slope > 0 && current < limit && current + slope * HORIZON_DAYS >= limit) out.push({ key: 'payload-budget:projected-7d',
    reason: `直近7日の増え方（1日約${Math.round(slope).toLocaleString('en-US')}バイト）だと、${Math.ceil((limit - current) / slope)}日で基準を超える見込み`, url: null });
  return out;
}
module.exports = { issues, growthPerDay, NEAR_RATIO, HORIZON_DAYS };
