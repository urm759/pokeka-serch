(async function () {
  const banner = document.getElementById("updateHealthBanner");
  const model = window.UpdateHealthModel;
  if (!banner || !model) return;
  async function json(url) {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
  const [snapshotResult, runResult] = await Promise.allSettled([
    json("./data/update-health-banner.json"),
    json("https://api.github.com/repos/urm759/pokeka-serch/actions/workflows/daily-fast-update.yml/runs?per_page=30"),
  ]);
  const snapshot = snapshotResult.status === "fulfilled" ? snapshotResult.value : null;
  const sourceLastSuccessAt = snapshot?.sourceLastSuccessAt || null;
  const live = runResult.status === "fulfilled"
    ? model.evaluate({ runs: runResult.value.workflow_runs || [], sourceLastSuccessAt,
      dailyOutcomes:snapshot?.dailyOutcomes, outcomeLabels:snapshot?.dailyOutcomeLabels })
    : null;
  const health = live || (sourceLastSuccessAt ? model.evaluate({ sourceLastSuccessAt }) : snapshot);
  const backfillIssues = [...(snapshot?.issues || []).filter((issue) => !issue.key?.startsWith("daily:")),...model.monitorIssues(snapshot?.monitoring)];
  const dailyReasons = live ? live.reasons : snapshot?.issues
    ? snapshot.issues.filter((issue) => issue.key?.startsWith("daily:")).map((issue) => issue.reason)
    : health?.reasons || [];
  if(!live && snapshot?.dailyOutcomes?.[0]?.state==='recovered')dailyReasons.unshift('Dailyは退避原票から回収・公開照合済み（元実行の失敗は履歴に保持）');
  const reasons = [...dailyReasons, ...backfillIssues.map((issue) => issue.reason)];
  if (!health || !reasons.length) return;
  banner.hidden = false;
  const recoveredOnly=reasons.every(reason=>reason.includes('元実行の失敗は履歴に保持'));
  banner.dataset.status = recoveredOnly ? "ok" : "alert";
  const title = document.createElement("strong");
  title.textContent = recoveredOnly ? "Dailyデータ回収済み" : "データ更新に注意";
  const message = document.createElement("span");
  message.textContent = '';
  const categorized = [...dailyReasons.map(reason => ({reason})), ...backfillIssues];
  const summaries = [...new Map(categorized.map(issue => {
    const summary = model.summarizeIssue(issue);
    return [JSON.stringify(summary), summary];
  })).values()];
  message.textContent = `${summaries[0]?.cause || '更新確認待ち'}${summaries.length > 1 ? ` ほか${summaries.length - 1}項目` : ''}。影響と必要操作は詳細へ。`;
  const link = document.createElement("a");
  link.href = backfillIssues[0]?.url || "https://github.com/urm759/pokeka-serch/actions";
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "実行履歴を見る";
  const details = document.createElement('details');
  const heading = document.createElement('summary');
  heading.textContent = '停止理由・詳細ログ';
  const log = document.createElement('pre');
  log.style.whiteSpace = 'pre-wrap';
  log.style.overflowWrap = 'anywhere';
  log.textContent = summaries.map(s=>`${s.cause}／${s.impact}／${s.action}`).join('\n') + '\n\n' + categorized.map(issue => issue.reason).join('\n\n');
  const auditLink = document.createElement('a');
  auditLink.href = snapshot?.detailUrl || './data/update-health.json';
  auditLink.textContent = '監視全項目・カード別鮮度・未公開データを確認';
  details.append(heading, log, auditLink);
  banner.replaceChildren(title, message, link, details);
})();
