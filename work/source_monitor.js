const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const read = (root, file, fallback = {}) => { try { return JSON.parse(fs.readFileSync(path.join(root, file), "utf8").replace(/^\uFEFF/, "")); } catch { return fallback; } };
const fresh = (value, now, hours) => { const t = Date.parse(value); return Number.isFinite(t) && t <= now && now - t <= hours * 3600000; };
function pcHealth(observation, now = Date.now()) {
  if (!fresh(observation.observedAt, now, 30)) return { status: "PC観測未受信", reason: "30時間以内の独立タスク観測なし。PC停止・観測起動失敗・未公開を区別して確認", action: "PCでobserve_psa_tasks.ps1を実行" };
  if (observation.error) return { status: "監視取得失敗", reason: observation.error };
  if (observation.independentObserverRegistered === false) return { status: "独立監視未登録", reason: "Windowsのタスク登録権限が不足。通常PSAのfinally観測は稼働するが、起動前失敗を捕捉する独立タスクは未登録" };
  const tasks = observation.tasks || [];
  const failures = tasks.filter((t) => t.registrationValid === false || t.preStartFailure);
  if (failures.length) return { status: "起動前失敗", reason: failures.map((t) => `${t.name}: ${t.reason}`).join(" / ") };
  return { status: "観測受信済み", reason: "取得・公開の成否はPSA実行履歴で別判定" };
}
function build(root, sources, previous = {}, now = Date.now()) {
  const audit = read(root, "data/acquisition-progress-audit.json").sources || {};
  const total = read(root, "data/pokemon-cards.json", []).length;
  const queue = read(root, "work/card-completion-queue.json");
  const runs = read(root, "work/source-update-runs.json").sources || {};
  const health = read(root, "data/update-health.json");
  const linkage = read(root, "data/psa-linkage-priority.json");
  const price = read(root, "data/state-a-price-audit.json");
  const rows = {};
  for (const [id, source] of Object.entries(sources)) {
    const a = audit[id] || {};
    const filename = { toreca: "data/pokemon-cards.json", cardrush: "work/cardrush_catalog.json", hareruya2: "work/hareruya2_catalog.json", yuyutei: "work/yuyutei_catalog.json", torecacamp: "work/torecacamp_catalog.json", psaOfficial: "data/psa-population-summary.json", pokedata: "data/pokedata/manifest.json", shopBuyback: "data/shop-buyback-summary.json", snkrRaw: "data/snkr-raw-flip-summary.json", psaJapan: "data/psa-japan-services.json", marketAnalysis: "data/market-stability-summary.json" }[id];
    const old = previous.rows?.[id] || {};
    const freshRows = id === "psaOfficial" ? Object.values(read(root, filename).cards || {}).filter((v) => fresh(v.f, now, 48)).length
      : ["cardrush", "hareruya2", "yuyutei", "torecacamp"].includes(id) ? new Set(read(root, filename, []).filter((v) => Number(v.price) > 0 && !v.priceQuarantined && fresh(v.observedAt, now, 48)).map((v) => v.cardId)).size
      : id === "snkrRaw" ? Object.values(read(root, filename).cards || {}).filter((v) => v.identityValid && fresh(v.fetchedAt, now, 24)).length : null;
    const published = filename ? spawnSync("git", ["log", "-1", "--format=%cI", "origin/main", "--", filename], { cwd: root, encoding: "utf8", windowsHide: true }).stdout?.trim() || null : null;
    const workflowRunId = runs[id]?.workflowRunId;
    const failure = (health.issues || []).find((i) => i.key?.startsWith(`${id}:`));
    const newAcquired = a.newAcquired ?? null;
    const net = a.usableNet ?? null;
    const progressNow = newAcquired > 0 || net > 0;
    rows[id] = { label: source.label, lastAttempt: a.lastAttemptAt || source.lastAttemptAt || null,
      lastSuccess: a.lastSuccessAt || source.lastSuccessAt || null, publishedAt: published,
      remaining: id === "psaOfficial" ? linkage.counts?.unlinked ?? null : id === "yuyutei" ? read(root, "work/yuyutei_progress.json").lastRun?.remainingSearchCount ?? null : id === "torecacamp" ? read(root, "work/torecacamp_progress.json").lastRun?.estimatedRemainingProducts ?? null : id === "pokedata" ? (read(root, "data/pokedata/manifest.json").sets || []).reduce((sum, s) => sum + Math.max(0, (s.sourceCount || 0) - (s.linkageCount || 0)), 0) : null,
      remainingDefinition: id === "pokedata" ? "展開済みセットの公開カード一覧未巡回数。国内一致詳細数・認証成約残数とは別" : id === "torecacamp" ? "サイトマップ商品残数（推定）" : "取得・紐付け残数",
      attempted: a.attempted ?? null, newAcquired, newLinked: a.newLinked ?? null,
      usableValues: a.usableValues ?? null, usableNet: net,
      lastProgressAt: progressNow ? a.lastSuccessAt || source.lastSuccessAt || old.lastProgressAt || null : old.lastProgressAt || null,
      freshCards: freshRows, targetCards: total, freshnessPct: freshRows == null || !total ? null : Number((freshRows / total * 100).toFixed(2)),
      stopReason: a.stopReason || source.lastError || source.diagnostics?.externalBlock?.message || null,
      status: a.status || source.status, checkpoint: a.checkpoint || source.diagnostics?.currentCursor || null,
      failureUrl: failure?.url || (workflowRunId ? `https://github.com/urm759/pokeka-serch/actions/runs/${workflowRunId}` : null) };
  }
  const observation = read(root, "data/psa-pc-observation.json");
  for (const [id, shop] of Object.entries(read(root, "data/shop-buyback-summary.json").shops || {})) {
    rows[`buyback:${id}`] = { label: shop.name, lastAttempt: shop.lastAttempt || null, lastSuccess: shop.lastSuccess || null,
      publishedAt: rows.shopBuyback?.publishedAt || null, remaining: shop.unmatched ?? null,
      attempted: shop.attempted ?? null, newAcquired: shop.newAcquired ?? null, newLinked: shop.newLinked ?? null, usableValues: shop.activeMatched ?? null, usableNet: shop.usableNet ?? null,
      lastProgressAt: shop.newAcquired > 0 || shop.usableNet > 0 ? shop.lastSuccess : previous.rows?.[`buyback:${id}`]?.lastProgressAt || null,
      freshCards: null, freshnessPct: null, stopReason: shop.error || null, status: shop.error ? "failed" : "partial",
      fulfilment: shop.fulfilment || "mail", sourceUpdatedAt: shop.sourceUpdatedAt || null,
      note: "最終成功は当サイトの取得日時。元サイト更新日時は未公表ならnull。未紐付けは取得不存在ではない" };
  }
  return { version: 1, observedAt: new Date(now).toISOString(), rows,
    freshnessDefinition: "48時間以内（スニダン素体24時間）のカード別取得日が確認できた有効価格・POP / サイト全カード。少数更新で全体を最新扱いしない。公開日は該当ファイルの公開main最終コミット日。純増不明は未記録。",
    pc: { ...observation, health: pcHealth(observation, now) },
    completion: read(root, "data/completion-acquisition.json"),
    backlogs: { priceConfirmation: price.lastRun?.remaining ?? null, psaUnlinked: linkage.counts?.unlinked ?? null,
      domesticPsa9IndividualSales: 0, domesticPsa9Status: "取得処理未実装・実成約0枚。海外・集計・推定を含めない",
      completionQueue: queue.summary?.priorityQueueRemaining ?? null, returnBacktest: "時間待ち：12月以降の返却時期未到達" } };
}
module.exports = { build, pcHealth, fresh };
