function observe(previous = {}, monitor, now = Date.now()) {
  const sources = {};
  for (const [id, source] of Object.entries(monitor.sources || {})) {
    const before = previous.sources?.[id] || {};
    const cohort = before.cohort || source.cards.map(r => r.id).sort();
    const rows = new Map(source.cards.map(r => [r.id, r]));
    let fresh = 0, missing = 0, maxAge = null, autoWait = 0, manualWait = 0, stopped = 0;
    for (const id of cohort) {
      const row = rows.get(id), at = Date.parse(row?.lastConfirmedAt);
      if (Number.isFinite(at) && at <= now) {
        const age = (now - at) / 3600000;
        if (age <= 6) fresh += 1;
        maxAge = Math.max(maxAge ?? 0, age);
      } else missing += 1;
      if (/アクセス|認証/.test(row?.status || '')) stopped += 1;
      else if (/手動確認/.test(row?.status || '')) manualWait += 1;
      else if (!row || /待ち|期限超過/.test(row.status)) autoWait += 1;
    }
    const snapshot = {at:new Date(now).toISOString(),cohort:cohort.length,fresh6h:fresh,
      fresh6hPct:cohort.length?fresh/cohort.length*100:null,unconfirmed:missing,
      maxOverdueHours:maxAge==null?null:Math.max(0,maxAge-6),autoWait,manualWait,accessStopped:stopped,
      added:source.cards.filter(r=>!cohort.includes(r.id)).length,missingFromCurrent:cohort.filter(id=>!rows.has(id)).length};
    // Observation timestamps are append-only, not reconstructed from a current snapshot.
    const observations = [...(before.observations || [])];
    if (observations.at(-1)?.at !== snapshot.at) observations.push(snapshot);
    sources[id] = {cohort,observations};
  }
  return {version:1,baselineAt:previous.baselineAt || new Date(now).toISOString(),sources,
    method:'開始時の取得元別・固定優先カード群。同じID分母で6時間以内率と最大超過時間を比較。追加・消失は別計上。確認日時なしを新鮮扱いしない'};
}
module.exports = {observe};
