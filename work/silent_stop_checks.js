// Silent-stop detection (4-J C). Pure functions over saved data and GitHub run lists:
// no retailer, source or AI requests. Each returns monitor issues {key, reason, url}.
const HOUR = 3600000;
const WEEKLY_STALE_HOURS = 8 * 24, OBSERVATION_STALL_HOURS = 24;

// Weekly full regression: the last completed run on main must have succeeded, and a
// run must have completed within 8 days (a disabled or skipped schedule is silent).
function weeklyIssues(runs = [], now = Date.now()) {
  const done = runs.filter(run => run.status === 'completed' && run.head_branch === 'main')
    .sort((a, b) => Date.parse(b.updated_at || b.created_at) - Date.parse(a.updated_at || a.created_at));
  const latest = done[0], issues = [];
  // The run ID is part of the key, so each failed week is reported once.
  if (latest && latest.conclusion !== 'success') issues.push({ key: `weekly-tests:failure:${latest.id ?? latest.run_number ?? latest.created_at}`,
    reason: `週次全テスト：最新の実行が ${latest.conclusion}（${String(latest.created_at || '').slice(0, 10)}）。失敗したテスト名は実行の Summary に一覧`, url: latest.html_url || null });
  const at = latest ? Date.parse(latest.updated_at || latest.created_at) : NaN;
  if (!Number.isFinite(at) || now - at > WEEKLY_STALE_HOURS * HOUR) issues.push({ key: 'weekly-tests:stale',
    reason: `週次全テスト：完了した実行が${WEEKLY_STALE_HOURS / 24}日以上なし。定期起動の停止を確認`, url: latest?.html_url || null });
  return issues;
}

// Buyback price observations: a store whose quotes are still being fetched must keep
// producing observations. Store holds stop both together and are reported elsewhere.
function latestFetchByShop(summary = {}) {
  const latest = {};
  for (const card of Object.values(summary.cards || {})) {
    for (const [shop, row] of Object.entries(card.shops || {})) {
      if (!(row?.price > 0)) continue;
      const at = Date.parse(row.observedAt);
      if (Number.isFinite(at) && !(latest[shop] >= at)) latest[shop] = at;
    }
  }
  return latest;
}
function latestObservationByShop(observations = {}) {
  const latest = {};
  for (const [shop, cards] of Object.entries(observations.shops || {})) {
    for (const days of Object.values(cards || {})) {
      for (const row of Object.values(days || {})) {
        const at = Date.parse(row?.observedAt);
        if (Number.isFinite(at) && !(latest[shop] >= at)) latest[shop] = at;
      }
    }
  }
  return latest;
}
function buybackObservationIssues(observations, summary, now = Date.now()) {
  const fetched = latestFetchByShop(summary), observed = latestObservationByShop(observations), issues = [];
  const name = shop => summary?.shops?.[shop]?.name || shop, limit = OBSERVATION_STALL_HOURS * HOUR;
  const iso = at => Number.isFinite(at) ? new Date(at).toISOString() : '記録なし';
  for (const [shop, at] of Object.entries(fetched)) {
    if (now - at > limit) continue;
    const seen = observed[shop];
    if (!Number.isFinite(seen) || at - seen > limit) issues.push({ key: `buyback-observation:${shop}:stalled`,
      reason: `買取観測：${name(shop)}は取得が続く（最終 ${iso(at)}）のに観測記録が${OBSERVATION_STALL_HOURS}時間以上停止（最終 ${iso(seen)}）。期間平均・買取倍率が古くなる`, url: null });
  }
  const newest = Math.max(-Infinity, ...Object.values(observed));
  if (!Number.isFinite(newest) || now - newest > limit) issues.push({ key: 'buyback-observation:all:stalled',
    reason: `買取観測：全店で観測記録が${OBSERVATION_STALL_HOURS}時間以上なし（最終 ${iso(newest)}）。取得自体の停止も確認`, url: null });
  return issues;
}

module.exports = { weeklyIssues, buybackObservationIssues, latestFetchByShop, latestObservationByShop, WEEKLY_STALE_HOURS, OBSERVATION_STALL_HOURS };
