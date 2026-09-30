function latestCompleted(runs = []) {
  return runs.filter((run) => run.status === "completed")
    .sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0))[0] || null;
}

function workflowState(runs = [], previous = {}, marker = null, pending = false, failureDetail = null) {
  const latest = latestCompleted(runs);
  const changedRun = latest?.id && latest.id !== previous.runId;
  const stuckRuns = changedRun && pending && marker === previous.marker
    ? (previous.stuckRuns || 0) + 1 : changedRun ? 0 : previous.stuckRuns || 0;
  const failureReason = latest && ["failure", "timed_out"].includes(latest.conclusion)
    ? failureDetail || `unknown:${latest.id}` : null;
  const repeatedFailures = changedRun && failureReason && failureReason === previous.failureReason
    ? (previous.repeatedFailures || 0) + 1 : changedRun && failureReason ? 1 : changedRun ? 0 : previous.repeatedFailures || 0;
  return { runId: latest?.id || previous.runId || null, runUrl: latest?.html_url || null,
    conclusion: latest?.conclusion || null, completedAt: latest?.updated_at || null,
    marker, stuckRuns, failureReason, repeatedFailures };
}

function manualId(row) {
  return `${row.sourceSetId || row.pokedataCardId || row.id || row.setName || "?"}:${row.reason || "manual"}`;
}

function evaluate({ safeRuns = [], pokeRuns = [], safeProgress = {}, pokeProgress = [], pokeHold = null,
  discovery = {}, ambiguousCandidates = [], recovery = {}, previous = {}, now = Date.now() } = {}) {
  const issues = [];
  const saved = previous.backfills || {};
  const safeSources = safeProgress.sources || {};
  const safeMarker = JSON.stringify({
    yuyutei: safeSources.yuyutei?.position?.lastSuccessfulPage,
    price: safeSources.priceEvidence?.position?.inspected,
    camp: [safeSources.torecacamp?.position?.sitemap, safeSources.torecacamp?.position?.productIndex],
  });
  const safePending = ["yuyutei", "priceEvidence", "torecacamp"].some((source) =>
    !["completed", "reviewed-with-unavailable", "manual-action-required"].includes(safeSources[source]?.status));
  const pokeMarker = pokeProgress.reduce((sum, row) => sum + (row.processedCardIds?.length || 0), 0);
  const pokePending = pokeProgress.some((row) => (row.processedCardIds?.length || 0) < Number(row.targetCount || row.sourceSetTotal || 0));
  const safeLatest = latestCompleted(safeRuns);
  const pokeLatest = latestCompleted(pokeRuns);
  const savedReason = (source, latest) => recovery.sources?.[source]?.workflowRunId
    && String(recovery.sources[source].workflowRunId) === String(latest?.id)
    ? recovery.sources[source].failureDetail : null;
  const safe = workflowState(safeRuns, saved.safe, safeMarker, safePending, savedReason("safe", safeLatest));
  const pokedata = workflowState(pokeRuns, saved.pokedata, pokeMarker, pokePending, savedReason("pokedata", pokeLatest));
  safe.sourceObservations = {};
  const safeRunChanged = safe.runId && safe.runId !== saved.safe?.runId;
  for (const source of ["yuyutei", "priceEvidence", "psaLinkage", "torecacamp"]) {
    const stage = safeSources[source] || {};
    const old = saved.safe?.sourceObservations?.[source] || {};
    const marker = JSON.stringify(stage.position || {});
    const pending = ["partial", "time-budget", "stalled"].includes(stage.status);
    const stuckRuns = safeRunChanged && pending && marker === old.marker
      ? (old.stuckRuns || 0) + 1 : safeRunChanged ? 0 : old.stuckRuns || 0;
    const transientStop = stage.status === "stopped" && !/HTTP 401|HTTP 403|取得件数急減/.test(stage.reason || "");
    const repeatedStops = safeRunChanged && transientStop && stage.reason === old.reason
      ? (old.repeatedStops || 0) + 1 : safeRunChanged && transientStop ? 1 : safeRunChanged ? 0 : old.repeatedStops || 0;
    safe.sourceObservations[source] = { marker, stuckRuns, repeatedStops, reason: transientStop ? stage.reason : null };
    if (stuckRuns >= 3) issues.push({ key: `safe:${source}:stalled`,
      reason: `${source}が${stuckRuns}回連続でチェックポイント進捗なし`, url: safe.runUrl });
    if (repeatedStops >= 2) issues.push({ key: `safe:${source}:repeated-stop:${stage.reason}`,
      reason: `${source}が同じ理由で${repeatedStops}回連続停止: ${stage.reason}`, url: safe.runUrl });
  }
  for (const [source, state, label] of [["safe", safe, "安全バックフィル"], ["pokedata", pokedata, "PokeDATA"]]) {
    if (state.repeatedFailures >= 2) issues.push({ key: `${source}:repeated-failure:${state.failureReason}`,
      reason: `${label}が同じ失敗で${state.repeatedFailures}回連続停止。保存済み位置から再開待ち`, url: state.runUrl });
    if (source === "pokedata" && state.stuckRuns >= 3) issues.push({ key: `${source}:stalled`,
      reason: `${label}が${state.stuckRuns}回連続でチェックポイント進捗なし`, url: state.runUrl });
    const age = Date.parse(state.completedAt || "");
    if (Number.isFinite(age) && now - age >= 30 * 3600000) issues.push({ key: `${source}:run-overdue`,
      reason: `${label}の定期実行が30時間以上完了していません`, url: state.runUrl });
  }
  for (const [source, label] of [["yuyutei", "遊々亭"], ["priceEvidence", "状態A価格確認"],
    ["psaLinkage", "PSA紐づけ候補"], ["torecacamp", "トレカキャンプ"]]) {
    const stage = safeSources[source];
    if (!stage) continue;
    if (stage.status === "manual-action-required" || stage.status === "stalled"
      || stage.status === "stopped" && /取得件数急減/.test(stage.reason || "")) {
      const reason = stage.reason || "保存済み位置から再開待ち";
      issues.push({ key: `safe:${source}:${stage.status}:${reason.replace(/\d+/g, "#")}`,
        reason: `${label}: ${reason}`, url: safe.runUrl });
    }
  }
  if (pokeHold) issues.push({ key: `pokedata:manual-hold:${pokeHold.httpStatus || "unknown"}:${pokeHold.reason || "確認待ち"}`,
    reason: `PokeDATA手動確認待ち: ${pokeHold.reason || "認証・形式を確認"}`, url: pokedata.runUrl });
  const reviewIds = [...new Set([
    ...(discovery.manualReview || []).map(manualId),
    ...ambiguousCandidates.map((row) => `card:${manualId(row)}`),
    ...pokeProgress.flatMap((row) => Object.entries(row.retryByCard || {}).filter(([, retry]) => retry.manualReview)
      .map(([id, retry]) => `${row.setName || "set"}:${id}:${retry.reason || "retry"}`)),
  ])].sort();
  const knownReviews = new Set(saved.reviewIds || reviewIds);
  const newReviews = reviewIds.filter((id) => !knownReviews.has(id));
  if (newReviews.length) issues.push({ key: `pokedata:new-manual-review:${newReviews.join("|")}`,
    reason: `PokeDATAに新規の手動確認待ち${newReviews.length}件`, url: pokedata.runUrl });
  const activeKeys = issues.map((issue) => issue.key);
  const previousKeys = new Set(previous.activeAlertKeys || []);
  return { issues, activeAlertKeys: activeKeys, newIssues: issues.filter((issue) => !previousKeys.has(issue.key)),
    backfills: { safe, pokedata, reviewIds, newManualReviewCount: newReviews.length,
      safeProgress: safeSources, pokeProgress: pokeProgress.map((row) => ({ setName: row.setName,
        processed: row.processedCardIds?.length || 0, target: row.targetCount || row.sourceSetTotal || null,
        lastCardId: row.lastCardId || null, lastFailure: row.lastFailure || null })) },
  };
}

module.exports = { evaluate, workflowState };
