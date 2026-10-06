const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const read = (root, file, fallback = {}) => { try { return JSON.parse(fs.readFileSync(path.join(root, file), "utf8").replace(/^\uFEFF/, "")); } catch { return fallback; } };
const fresh = (value, now, hours) => { const t = Date.parse(value); return Number.isFinite(t) && t <= now && now - t <= hours * 3600000; };
function pcHealth(observation, now = Date.now()) {
  if (!fresh(observation.observedAt, now, 30)) return { status: "PC観測未受信", reason: "30時間以内の独立タスク観測なし。PC停止・観測起動失敗・未公開を区別して確認", action: "PCでobserve_psa_tasks.ps1を実行" };
  if (observation.error) return { status: "監視取得失敗", reason: observation.error };
  const tasks = observation.tasks || [];
  const failures = tasks.filter((t) => t.registrationValid === false || t.preStartFailure);
  if (failures.length) return { status: "起動前失敗", reason: failures.map((t) => `${t.name}: ${t.reason}`).join(" / ") };
  if (observation.independentObserverRegistered === false) return { status: "独立監視未登録", reason: "Windowsのタスク登録権限が不足。通常PSAのfinally観測は稼働するが、起動前失敗を捕捉する独立タスクは未登録" };
  return { status: "観測受信済み", reason: "取得・公開の成否はPSA実行履歴で別判定" };
}
function build(root, sources, previous = {}, now = Date.now()) {
  const outcomes = require("./audit_completion_outcomes.js").build(root, now);
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
    const sourceIsNewer = Date.parse(source.lastAttemptAt || "") > Date.parse(a.lastAttemptAt || "");
    const latestSuccess = [a.lastSuccessAt, source.lastSuccessAt].filter(Boolean).sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
    rows[id] = { label: source.label, lastAttempt: sourceIsNewer ? source.lastAttemptAt : a.lastAttemptAt || source.lastAttemptAt || null,
      lastSuccess: latestSuccess, publishedAt: published,
      remaining: id === "psaOfficial" ? linkage.counts?.unlinked ?? null : id === "yuyutei" ? read(root, "work/yuyutei_progress.json").lastRun?.remainingSearchCount ?? null : id === "torecacamp" ? read(root, "work/torecacamp_progress.json").lastRun?.estimatedRemainingProducts ?? null : id === "pokedata" ? (read(root, "data/pokedata/manifest.json").sets || []).reduce((sum, s) => sum + Math.max(0, (s.sourceCount || 0) - (s.linkageCount || 0)), 0) : null,
      remainingDefinition: id === "pokedata" ? "展開済みセットの公開カード一覧未巡回数。国内一致詳細数・認証成約残数とは別" : id === "torecacamp" ? "サイトマップ商品残数（推定）" : "取得・紐付け残数",
      attempted: a.attempted ?? null, newAcquired, newLinked: a.newLinked ?? null,
      usableValues: a.usableValues ?? null, usableNet: net,
      lastProgressAt: progressNow ? a.lastSuccessAt || source.lastSuccessAt || old.lastProgressAt || null : old.lastProgressAt || null,
      freshCards: freshRows, targetCards: total, freshnessPct: freshRows == null || !total ? null : Number((freshRows / total * 100).toFixed(2)),
      stopReason: sourceIsNewer ? source.lastError || null : a.stopReason || source.lastError || source.diagnostics?.externalBlock?.message || null,
      status: sourceIsNewer ? source.status : a.status || source.status, checkpoint: a.checkpoint || source.diagnostics?.currentCursor || null,
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
  const storedPsaProgress = read(root, "work/psa-fetch-progress.json");
  const psaProgress = Date.parse(observation.fetchProgress?.lastAttemptAt || "") > Date.parse(storedPsaProgress.lastAttemptAt || "") ? observation.fetchProgress : storedPsaProgress;
  const pokedata = read(root, "data/pokedata/manifest.json");
  const publicRemaining = (pokedata.sets || []).reduce((n, s) => n + Math.max(0, Number(s.sourceCount || 0) - Number(s.linkageCount || 0)), 0);
  const backlogStates = [
    { label: "状態A元ページ価格確認", category: "実際に自動巡回中", remaining: price.lastRun?.remaining ?? null, usableNet: null, lastProgressAt: price.lastProgressAt || null, nextAction: "安全バックフィルで元ページを確認。今回の晴れる屋2価格取得とは別処理。実成約取得の完了ではない。純増・最終進捗の未記録を他ソースから代用しない" },
    { label: "晴れる屋2価格補完", category: "実際に自動巡回中", remaining: read(root, "data/completion-acquisition.json").eligiblePending ?? null, usableNet: rows.hareruya2?.usableNet ?? null, lastProgressAt: read(root, "data/completion-acquisition.json").acquired > 0 ? read(root, "data/completion-acquisition.json").endedAt : rows.hareruya2?.lastProgressAt || null, nextAction: "残件は確定URLがあり2日間隔・再試行制限を満たす価格対象。重点枠最大40%と通常枠を併用。鮮度回復と純増は別集計" },
    { label: "PSA公式未取得・未紐付け", category: /manual-wait|failed/.test(psaProgress.status || "") ? "認証・形式確認待ち" : "実際に自動巡回中（PC起動・認証が必要）", remaining: linkage.counts?.unlinked ?? null, usableNet: rows.psaOfficial?.usableNet ?? null, lastProgressAt: psaProgress.refreshedCount > 0 ? psaProgress.lastSuccessAt : rows.psaOfficial?.lastProgressAt || null, nextAction: psaProgress.stopReason || "登録済みセットはPC定期取得。未登録URL・曖昧一致は確認待ち。取得率を推定で補わない" },
    { label: "国内PSA9個別実成約／状態A限定実成約", category: "取得処理未実装", remaining: null, usableNet: 0, lastProgressAt: null, nextAction: "利用可能な正規取得経路と状態証明の確定が必要。集計・海外・推定値を実成約数に加えない" },
    { label: "PokeDATA公開一覧", category: "実際に自動巡回中", remaining: publicRemaining, usableNet: rows.pokedata?.usableNet ?? null, lastProgressAt: rows.pokedata?.lastProgressAt || null, nextAction: "SM-P等の保存地点から継続。公開マスクを実価格と数えない" },
    { label: "PokeDATA認証済み実成約", category: "認証・手動対応待ち", remaining: null, usableNet: null, lastProgressAt: null, nextAction: "認証画面で確認できる実価格のみ保存。公開APIの進捗とは分離" },
    { label: "トレカキャンプ", category: "実際に自動巡回中", remaining: rows.torecacamp?.remaining ?? null, usableNet: rows.torecacamp?.usableNet ?? null, lastProgressAt: rows.torecacamp?.lastProgressAt || null, nextAction: "安全バックフィルだけがサイトマップ・商品位置から再開" },
    { label: "カードラッシュ／遊々亭", category: "アクセス確認待ち（403）", remaining: rows.yuyutei?.remaining ?? null, usableNet: 0, lastProgressAt: rows.yuyutei?.lastProgressAt || null, nextAction: "403停止・前回正常値を維持。自動回避しない" },
    { label: "季節性・海外先行性の検証", category: "時間待ち（記録は日次自動保存）", remaining: null, usableNet: null, lastProgressAt: null, nextAction: "将来期間・複数イベントを待つ。仕入れ上限に適用しない" },
    { label: "返却時バックテスト", category: "時間待ち", remaining: null, usableNet: 0, lastProgressAt: null, nextAction: "最短2026-12-01以降。未到達を完了扱いしない" },
  ];
  return { version: 1, observedAt: new Date(now).toISOString(), rows, backlogStates,
    freshnessDefinition: "48時間以内（スニダン素体24時間）のカード別取得日が確認できた有効価格・POP / サイト全カード。少数更新で全体を最新扱いしない。公開日は該当ファイルの公開main最終コミット日。純増は取得監査の比較基準からの差。今回の重点実行分は重点監査JSONで別表示。純増不明は未記録。",
    pc: { ...observation, health: pcHealth(observation, now) },
    completion: read(root, "data/completion-acquisition.json"), outcomes,
    backlogs: { priceConfirmation: price.lastRun?.remaining ?? null, psaUnlinked: linkage.counts?.unlinked ?? null,
      domesticPsa9IndividualSales: 0, domesticPsa9Status: "取得処理未実装・実成約0枚。海外・集計・推定を含めない",
      completionQueue: queue.summary?.priorityQueueRemaining ?? null, returnBacktest: "時間待ち：12月以降の返却時期未到達" } };
}
module.exports = { build, pcHealth, fresh };
