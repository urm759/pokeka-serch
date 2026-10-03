const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const ROOT = path.join(__dirname, "..");
const read = (file, fallback = {}) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8")); } catch { return fallback; } };
const save = (file, value) => { const target = path.join(ROOT, file); fs.writeFileSync(`${target}.tmp`, JSON.stringify(value)); fs.renameSync(`${target}.tmp`, target); };
function plan(cards, queue, checkpoint, now = Date.now()) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  return (queue.queue || []).filter((id) => {
    const old = checkpoint.cards?.[id];
    return !old || (old.failures || 0) < 3 && (!old.nextRetryAt || Date.parse(old.nextRetryAt) <= now);
  }).map((id) => ({ card: byId.get(id), detail: queue.cards?.[id] })).filter((row) => row.card && row.detail)
    .sort((a, b) => Number(b.detail.p || 0) - Number(a.detail.p || 0));
}
function run() {
  const start = Date.now();
  const queue = read("work/card-completion-queue.json");
  const cards = read("data/pokemon-cards.json", []);
  const state = read("work/completion-acquisition-checkpoint.json", { cards: {} });
  const candidates = plan(cards, queue, state);
  const currentCatalog = new Map(read("work/hareruya2_catalog.json", []).map((row) => [row.cardId, row]));
  const selected = candidates.filter((r) => r.card.hareruya2Url && !(Number(currentCatalog.get(r.card.id)?.price) > 0 && Date.now() - Date.parse(currentCatalog.get(r.card.id)?.observedAt || "") < 2 * 86400000)).slice(0, Math.max(1, Number(process.env.COMPLETION_BATCH || 6)));
  const run = { startedAt: new Date(start).toISOString(), llmCalls: 0, codexCalls: 0, selected: selected.map((r) => ({ id: r.card.id, priority: r.detail.p, reasons: r.detail.r, missingRequired: r.detail.m })), attempted: 0, acquired: 0, newAcquired: 0, newLinked: 0, failures: 0, checkpoint: null, stopReason: null };
  save("work/completion-acquisition-checkpoint.json", { ...state, running: run });
  const maxTime = Math.max(10000, Number(process.env.COMPLETION_RUNTIME_MS || 120000));
  const result = selected.length ? spawnSync(process.execPath, ["work/refresh_candidate_shops.js", "hareruya2"], { cwd: ROOT, encoding: "utf8", timeout: maxTime + 3000,
    env: { ...process.env, COMPLETION_PRIORITY_IDS: selected.map((r) => r.card.id).join(","), CANDIDATE_SHOP_BATCH: String(selected.length), CANDIDATE_SHOP_TIME_MS: String(maxTime - 20000), CANDIDATE_SHOP_INTERVAL_MS: "1200" } }) : null;
  const shop = read("work/candidate-shop-refresh.json").sources?.hareruya2 || {};
  if (selected.length && result && result.status === 0) {
    run.attempted = shop.attemptedCount ?? 0; run.acquired = shop.refreshedCount ?? 0; run.newAcquired = shop.newAcquiredCount ?? 0; run.newLinked = shop.newLinkedCount ?? 0; run.failures = shop.failedCount ?? 0;
    run.stopReason = shop.stopReason || null; run.checkpoint = shop.nextId || null;
    for (const record of shop.records || []) {
      const old = state.cards[record.id] || {};
      const blocked = record.status === "manual-wait" || /HTTP (401|403)|同一カード|形式/.test(record.error || "");
      state.cards[record.id] = { lastAttemptAt: record.startedAt, lastSuccessAt: record.status === "verified" ? shop.lastSuccessAt : old.lastSuccessAt || null,
        status: record.status, failures: record.status === "verified" ? 0 : (old.failures || 0) + 1,
        reason: record.error || null, nextRetryAt: blocked ? "9999-12-31T00:00:00Z" : new Date(Date.now() + (record.status === "verified" ? 2 * 86400000 : 3600000 * 2 ** Math.min(3, old.failures || 0))).toISOString() };
    }
  } else if (result) run.stopReason = result.error?.message || String(result.stderr || "補完実行失敗").slice(-300);
  run.endedAt = new Date().toISOString(); run.durationMs = Date.now() - start;
  run.status = run.stopReason ? "停止・確認待ち" : run.acquired ? "部分取得" : "処理成功・進捗なし";
  const support = {
    hareruya2: { status: "自動補完対応済み", method: "確定済み商品URLの状態A価格。完了カードの再試行は2日間隔", intervalMs: 1200, maxRetries: 3 },
    cardrush: { status: "認証・アクセス確認待ち", reason: "403停止を維持。自動回避なし" },
    yuyutei: { status: "認証・アクセス確認待ち", reason: "403停止を維持" },
    torecacamp: { status: "自動補完対応済み", method: "別担当のサイトマップ段階巡回。二重取得しない" },
    psaOfficial: { status: "認証待ち／PC側対応済み", method: "下記優先キューをPC定期取得へ渡す。未登録セットURLは確認待ち" },
    pokedata: { status: "公開情報対応済み／実成約は認証待ち", method: "別担当のセット・ページチェックポイント。個別成約を推定しない" },
    domesticPsa9: { status: "取得処理未実装", reason: "同一日本語カードの国内PSA9個別実成約を取得する正規経路未確定" },
    rawActualSales: { status: "取得不能・状態A証明不足は確認待ち", reason: "全状態取引件数を状態A成約件数へ代用しない" },
  };
  state.lastRun = run; delete state.running;
  save("work/completion-acquisition-checkpoint.json", state);
  save("data/completion-acquisition.json", { version: 1, ...run, support, pending: candidates.length, cards: state.cards });
  for (const script of ["build_psa_linkage_queue.js", "build_psa_priority_queue.js"]) {
    const queued = spawnSync(process.execPath, [path.join(__dirname, script)], { cwd: ROOT, encoding: "utf8", timeout: 15000 });
    if (queued.status !== 0) { run.stopReason = `PSA優先キュー接続失敗: ${script}`; process.exitCode = 1; }
  }
  console.log(JSON.stringify(run));
  if (result && result.status !== 0) process.exitCode = 1;
  return run;
}
if (require.main === module) run();
module.exports = { plan, run };
