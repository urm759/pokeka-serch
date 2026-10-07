(function (root, factory) {
  const model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  if (root) root.UpdateHealthModel = model;
})(typeof window === "object" ? window : null, function () {
  const HOUR = 3600000;
  function evaluate({ runs = [], sourceLastSuccessAt = null, now = Date.now(), ttlHours = 24 } = {}) {
    const time = Number.isFinite(Number(now)) ? Number(now) : Date.parse(now);
    const completed = runs.filter((run) => run.status === "completed")
      .sort((left, right) => Date.parse(right.created_at || 0) - Date.parse(left.created_at || 0));
    const latest = completed[0] || null;
    const lastSuccess = completed.find((run) => run.conclusion === "success") || null;
    let consecutiveFailures = 0;
    for (const run of completed) {
      if (run.conclusion === "success") break;
      if (run.conclusion === "failure" || run.conclusion === "timed_out") consecutiveFailures += 1;
    }
    const sourceTime = Date.parse(sourceLastSuccessAt || "");
    const runTime = Date.parse(lastSuccess?.updated_at || lastSuccess?.created_at || "");
    const sourceAgeHours = Number.isFinite(sourceTime) && Number.isFinite(time) ? Math.max(0, (time - sourceTime) / HOUR) : null;
    const runAgeHours = Number.isFinite(runTime) && Number.isFinite(time) ? Math.max(0, (time - runTime) / HOUR) : null;
    const reasons = [];
    if (latest?.conclusion === "failure" || latest?.conclusion === "timed_out") reasons.push(`Daily Fast Updateが${consecutiveFailures}回連続失敗`);
    if (sourceAgeHours === null || sourceAgeHours >= ttlHours) reasons.push(`みんトレ主要データの取得が${ttlHours}時間以上停止`);
    if (runAgeHours !== null && runAgeHours >= ttlHours) reasons.push(`日次更新の成功が${ttlHours}時間以上なし`);
    return {
      status: reasons.length ? "alert" : latest ? "ok" : "unknown",
      reasons, consecutiveFailures, sourceLastSuccessAt,
      sourceAgeHours: sourceAgeHours === null ? null : Math.round(sourceAgeHours * 10) / 10,
      lastSuccessfulRunAt: lastSuccess?.updated_at || lastSuccess?.created_at || null,
      runAgeHours: runAgeHours === null ? null : Math.round(runAgeHours * 10) / 10,
      latestRunId: latest?.id || null,
      latestRunConclusion: latest?.conclusion || null,
      latestRunUrl: latest?.html_url || null,
    };
  }
  function fingerprint(health) {
    return JSON.stringify({
      status: health?.status || null,
      reasons: health?.reasons || [],
      consecutiveFailures: health?.consecutiveFailures || 0,
      sourceLastSuccessAt: health?.sourceLastSuccessAt || null,
      lastSuccessfulRunAt: health?.lastSuccessfulRunAt || null,
      latestRunId: health?.latestRunId || null,
      latestRunConclusion: health?.latestRunConclusion || null,
    });
  }
  function issueCategory(issue) {
    const text = `${issue.key || ''} ${issue.reason || ''}`;
    if (/独立監視未登録/.test(text)) return 'アクセス・手動対応待ち';
    if (/workflow-failure|保存.*失敗|競合|起動前失敗|監視取得失敗/.test(text)) return '取得処理の故障';
    if (/403|認証|sign.?in|log.?in|許諾|独立監視未登録/i.test(text)) return 'アクセス・手動対応待ち';
    if (/stalled|停滞|進捗なし|期限超過|以上停止|以上なし|stale/.test(text)) return '鮮度未達・進捗停滞';
    return '確認が必要';
  }
  function summarizeIssue(issue) {
    const text = String(issue.reason || '');
    const category = issueCategory(issue);
    if (/Cannot find module|dependency|依存|MODULE_NOT_FOUND/i.test(text))
      return {cause:'PSA実行ファイルの依存不足',impact:'新規取得が停止（保存済みデータは保持）',action:'修正版で再実行・認証操作とは別'};
    if (/403|認証|sign.?in|log.?in/i.test(text))
      return {cause:'取得元のアクセス・認証待ち',impact:'この取得元の更新を停止',action:'正規ページで認証を確認。制限は回避しない'};
    if (/curl 55|connection.*reset|公開.*失敗|push|競合/i.test(text))
      return {cause:'保存後の公開失敗',impact:'取得済みデータは保持',action:'再取得せず公開工程だけ再試行'};
    if (/独立監視未登録/.test(text))
      return {cause:'PC独立監視は未登録',impact:'起動前の観測に制約',action:'登録権限の確認が必要'};
    return {cause:category,impact:text.split(/\r?\n/)[0].slice(0,100),action:'詳細と実行履歴を確認'};
  }
  return { evaluate, fingerprint, issueCategory, summarizeIssue };
});
