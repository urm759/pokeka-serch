const HOUR = 3600000;
function lead(config = {}) {
  const intervalMs = Number(config.executionIntervalMs) || 2 * HOUR;
  const delayMs = Math.max(0, Number(config.observedStartDelayMs ?? config.startDelayAllowanceMs ?? 30 * 60000));
  const processingMs = Math.max(0, Number(config.observedProcessingMs ?? config.pipelineBudgetMs ?? config.timeBudgetMs ?? 24 * 60000));
  const requestedMs = intervalMs + delayMs + processingMs;
  const freshnessMs = (Number(config.importantHours) || 6) * HOUR;
  return { intervalMs, delayMs, processingMs, requestedMs, leadMs: Math.min(requestedMs, freshnessMs - 1),
    delayBasis: config.observedStartDelayMs == null ? "設定上の遅延余裕・実績未取得" : "観測開始遅延",
    capacityWarning: requestedMs >= freshnessMs ? "実行間隔・遅延・処理時間が鮮度期限以上" : null };
}
function eligibleDeadline(deadline, important, now, config) {
  return deadline <= now || important && deadline <= now + lead(config).leadMs;
}
// Evaluate the previous confirmed values immediately before this observation.
// These are inter-observation minima, not fabricated future acquisitions.
function intervalMinimum(previousRows, cohort, start, end, hours = 6) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const rows = new Map((previousRows || []).map(row => [row.id, row]));
  let fresh = 0, maxOverdueHours = null;
  for (const id of cohort) {
    const at = Date.parse(rows.get(id)?.lastConfirmedAt);
    if (!Number.isFinite(at) || at > start) continue;
    const age = (end - at) / HOUR;
    if (age <= hours) fresh++;
    maxOverdueHours = Math.max(maxOverdueHours ?? 0, Math.max(0, age - hours));
  }
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString(), fresh, total: cohort.length,
    minimumFreshnessPct: cohort.length ? fresh / cohort.length * 100 : null, maxOverdueHours,
    method: "前回確認値を次の観測直前まで進めた保守的な最低鮮度。区間内の未観測更新は含まない" };
}
module.exports = { lead, eligibleDeadline, intervalMinimum };
