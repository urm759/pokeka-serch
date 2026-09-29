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
  if (!health || health.status === "ok") return;
  banner.hidden = false;
  banner.dataset.status = health.status;
  const title = document.createElement("strong");
  title.textContent = health.status === "alert" ? "データ更新に注意" : "データ更新状況を確認できません";
  const message = document.createElement("span");
  message.textContent = health.reasons?.join("／") || "最新の実行結果を確認してください。";
  const link = document.createElement("a");
  link.href = "https://github.com/urm759/pokeka-serch/actions/workflows/daily-fast-update.yml";
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "実行履歴を見る";
  banner.replaceChildren(title, message, link);
})();
