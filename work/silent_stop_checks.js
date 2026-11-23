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

// 4-J J: acquisition starts. The external timer starts Watch when Priority has not been
// created for 2.5 hours, so a gap over 3 hours means both GitHub schedules and the timer
// failed to start anything. Each gap is keyed by its start, so it is reported once.
const ACQUISITION_WORKFLOWS = ['Priority Purchase Price Refresh', 'Daily Fast Update', 'Safe Checkpoint Backfill', 'Deep Resolve Unmatched Cards', 'Data Update Health Watchdog'];
const ACQUISITION_GAP_HOURS = 3, ACQUISITION_WINDOW_HOURS = 24;
function acquisitionGapIssues(runs = [], now = Date.now()) {
  const starts = [...new Set(runs.filter(run => ACQUISITION_WORKFLOWS.includes(run.name))
    .map(run => Date.parse(run.created_at)).filter(t => Number.isFinite(t) && t <= now))].sort((a, b) => a - b);
  const since = now - ACQUISITION_WINDOW_HOURS * HOUR, issues = [];
  if (!starts.length) return [{ key: 'acquisition-start:none', reason: `取得の起動（Priority・Daily・Safe・Deep・Watch）が直近の記録に1回もない。外部タイマーと定期起動の両方の停止を確認`, url: null }];
  const points = [...starts, now];
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1], to = points[i], hours = (to - from) / HOUR;
    if (to < since || hours <= ACQUISITION_GAP_HOURS) continue;
    const open = i === points.length - 1;
    issues.push({ key: `acquisition-start:gap:${new Date(from).toISOString().slice(0, 16)}`,
      reason: `取得の起動が${hours.toFixed(1)}時間空いた（${new Date(from).toISOString().slice(0, 16)}Z から${open ? '今まで' : ' ' + new Date(to).toISOString().slice(0, 16) + 'Z まで'}）。外部タイマー（2.5時間で Watch を起動）も働いていない。Cloudflare の Worker と GitHub の定期起動を確認`, url: null });
  }
  return issues;
}

// The timer's GitHub token is limited to this repository and expires on 2027-02-12
// (ops/external-wakeup/README.md). Warn 14 days ahead so the timer does not stop silently.
const TIMER_TOKEN_EXPIRES_AT = '2027-02-12T00:00:00Z', TIMER_TOKEN_WARN_DAYS = 14;
function timerTokenIssues(now = Date.now(), expiresAt = TIMER_TOKEN_EXPIRES_AT) {
  const left = (Date.parse(expiresAt) - now) / (24 * HOUR);
  if (!(left <= TIMER_TOKEN_WARN_DAYS)) return [];
  return [{ key: `external-timer:token-expiring:${expiresAt.slice(0, 10)}`,
    reason: left > 0 ? `外部タイマーの GitHub トークンが${Math.ceil(left)}日後（${expiresAt.slice(0, 10)}）に期限切れ。同じ限定権限（このリポジトリの Actions 読み書き）で更新し、Cloudflare の secret を差し替える`
      : `外部タイマーの GitHub トークンが期限切れ（${expiresAt.slice(0, 10)}）。外部タイマーからの起動が止まっている可能性`, url: null }];
}

module.exports = { weeklyIssues, buybackObservationIssues, latestFetchByShop, latestObservationByShop, acquisitionGapIssues, timerTokenIssues,
  WEEKLY_STALE_HOURS, OBSERVATION_STALL_HOURS, ACQUISITION_GAP_HOURS, ACQUISITION_WORKFLOWS, TIMER_TOKEN_EXPIRES_AT };
