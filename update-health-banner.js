(async function () {
  const banner = document.getElementById("updateHealthBanner");
  const model = window.UpdateHealthModel;
  if (!banner || !model) return;
  async function json(url) {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
  const [sourceResult, runResult, snapshotResult] = await Promise.allSettled([
    json("./data/update-status.json"),
    json("https://api.github.com/repos/urm759/pokeka-serch/actions/workflows/daily-fast-update.yml/runs?per_page=30"),
    json("./data/update-health.json"),
  ]);
  const sourceLastSuccessAt = sourceResult.status === "fulfilled" ? sourceResult.value.sources?.toreca?.lastSuccessAt : null;
  const live = runResult.status === "fulfilled"
    ? model.evaluate({ runs: runResult.value.workflow_runs || [], sourceLastSuccessAt })
    : null;
  const snapshot = snapshotResult.status === "fulfilled" ? snapshotResult.value : null;
  const health = live || (sourceLastSuccessAt ? model.evaluate({ sourceLastSuccessAt }) : snapshot);
  const backfillIssues = (snapshot?.issues || []).filter((issue) => !issue.key?.startsWith("daily:"));
  const dailyReasons = live ? live.reasons : snapshot?.issues
    ? snapshot.issues.filter((issue) => issue.key?.startsWith("daily:")).map((issue) => issue.reason)
    : health?.reasons || [];
  const reasons = [...dailyReasons, ...backfillIssues.map((issue) => issue.reason)];
  if (!health || !reasons.length) return;
  banner.hidden = false;
  banner.dataset.status = "alert";
  const title = document.createElement("strong");
  title.textContent = "データ更新に注意";
  const message = document.createElement("span");
  message.textContent = '';
  const categorized = [...dailyReasons.map(reason => ({reason})), ...backfillIssues];
  const summaries = [...new Map(categorized.map(issue => {
    const summary = model.summarizeIssue(issue);
    return [JSON.stringify(summary), summary];
  })).values()];
  for (const summary of summaries) {
    const line = document.createElement('span');
    line.style.display = 'block';
    line.textContent = `${summary.cause}／${summary.impact}／${summary.action}`;
    message.append(line);
  }
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
  log.textContent = categorized.map(issue => issue.reason).join('\n\n');
  details.append(heading, log);
  banner.replaceChildren(title, message, link, details);
})();
