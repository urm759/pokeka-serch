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
  message.textContent = reasons.join("／");
  const link = document.createElement("a");
  link.href = backfillIssues[0]?.url || "https://github.com/urm759/pokeka-serch/actions";
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "実行履歴を見る";
  banner.replaceChildren(title, message, link);
})();
