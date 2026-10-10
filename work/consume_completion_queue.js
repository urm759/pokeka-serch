const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const ROOT = path.join(__dirname, "..");
const { fairBatch, write: buildFocus } = require("./focus_monitor.js");
const { needs, routes, failureState } = require("./completion_routes.js");
const read = (file, fallback = {}) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8")); } catch { return fallback; } };
const save = (file, value) => { const target = path.join(ROOT, file); fs.writeFileSync(`${target}.tmp`, JSON.stringify(value)); fs.renameSync(`${target}.tmp`, target); };
function plan(cards, queue, checkpoint, now = Date.now()) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  return (queue.queue || []).filter((id) => {
    const retry = require("./acquisition_retry.js");
    const old = retry.migrateLegacy(checkpoint.cards?.[id], now);
    if (old && checkpoint.cards) checkpoint.cards[id] = old;
    return retry.eligible(old, now);
  }).map((id) => ({ card: byId.get(id), detail: queue.cards?.[id] })).filter((row) => row.card && row.detail)
    .sort((a, b) => Number(b.detail.p || 0) - Number(a.detail.p || 0));
}
function eligibleForHareru(candidates, catalog, now = Date.now()) {
  const byId = new Map(catalog.map((row) => [row.cardId, row]));
  return candidates.filter((r) => {
    const previous = byId.get(r.card.id);
    const observed = Date.parse(previous?.observedAt || "");
    return r.detail && needs(r.detail, "shopStateA") && r.card.hareruya2Url && !(Number(previous?.price) > 0 && observed <= now && now - observed < 2 * 86400000);
  });
}
function run() {
  const start = Date.now();
  const queue = read("work/card-completion-queue.json");
  const cards = read("data/pokemon-cards.json", []);
  const state = read("work/completion-acquisition-checkpoint.json", { cards: {} });
  const candidates = plan(cards, queue, state);
  const focus = buildFocus(ROOT);
  const eligible = eligibleForHareru(candidates, read("work/hareruya2_catalog.json", []));
  const selectionReasons = { queuedCards: (queue.queue || []).length, retryEligibleCards: candidates.length,
    missingStateACards: candidates.filter(r => needs(r.detail, "shopStateA")).length,
    missingStateAWithUrl: candidates.filter(r => needs(r.detail, "shopStateA") && r.card.hareruya2Url).length,
    eligibleHareruCards: eligible.length, psaOnlyCards: candidates.filter(r => r.detail.m?.length === 1 && r.detail.m[0] === "psaOfficial").length,
    heldCards: Object.values(state.cards || {}).filter(r => r.held).length,
    retryWaitingCards: Object.values(state.cards || {}).filter(r => !r.held && Date.parse(r.nextRetryAt) > start).length };
  const groupOrder = new Map(focus.groups.map((g, i) => [g.id, i]));
  eligible.sort((a, b) => {
    const fa = focus.cards[a.card.id], fb = focus.cards[b.card.id];
    return fa && fb ? groupOrder.get(fa.group) - groupOrder.get(fb.group) || Number(b.detail.p || 0) - Number(a.detail.p || 0)
      : Number(Boolean(fb)) - Number(Boolean(fa)) || Number(b.detail.p || 0) - Number(a.detail.p || 0);
  });
  const maxTime = Math.max(10000, Number(process.env.COMPLETION_RUNTIME_MS || 120000));
  const last = read("work/candidate-shop-refresh.json").sources?.hareruya2 || {};
  const msPerCard = last.refreshedCount > 0 ? Math.max(3000, last.durationMs / last.refreshedCount) : 5000;
  const capacity = Math.max(1, Math.floor((maxTime - 36000) / msPerCard));
  const selected = fairBatch(eligible, Math.max(1, Number(process.env.COMPLETION_BATCH || capacity)), (r) => focus.cards[r.card.id]?.pending.includes("shopStateA"), focus.maxFocusedShare);
  const run = { startedAt: new Date(start).toISOString(), llmCalls: 0, codexCalls: 0, selectionReasons, zeroTargetReason: selected.length ? null : !selectionReasons.missingStateACards ? "状態A不足は現選択対象にない。他項目の補完待ちは継続" : !selectionReasons.missingStateAWithUrl ? "状態A不足カードの晴れる屋2確定URLなし・探索担当へ" : "正常値キャッシュまたは再試行待ち・全補完完了ではない", focusedSelected: selected.filter((r) => focus.cards[r.card.id]).length, normalSelected: selected.filter((r) => !focus.cards[r.card.id]).length, selected: selected.map((r) => ({ id: r.card.id, priority: r.detail.p, reasons: [focus.cards[r.card.id]?.priorityReason, ...r.detail.r].filter(Boolean), missingRequired: r.detail.m })), attempted: 0, acquired: 0, newAcquired: 0, newLinked: 0, failures: 0, checkpoint: null, stopReason: null };
  save("work/completion-acquisition-checkpoint.json", { ...state, running: run });
  const result = selected.length ? spawnSync(process.execPath, ["work/refresh_candidate_shops.js", "hareruya2"], { cwd: ROOT, encoding: "utf8", timeout: maxTime + 3000,
    env: { ...process.env, COMPLETION_PRIORITY_IDS: selected.map((r) => r.card.id).join(","), CANDIDATE_SHOP_BATCH: String(selected.length), CANDIDATE_SHOP_TIME_MS: String(maxTime - 20000), CANDIDATE_SHOP_INTERVAL_MS: "1200" } }) : null;
  const shop = read("work/candidate-shop-refresh.json").sources?.hareruya2 || {};
  if (selected.length && result && result.status === 0) {
    run.attempted = shop.attemptedCount ?? 0; run.acquired = shop.refreshedCount ?? 0; run.newAcquired = shop.newAcquiredCount ?? 0; run.newLinked = shop.newLinkedCount ?? 0; run.failures = shop.failedCount ?? 0;
    run.stopReason = shop.stopReason || null; run.checkpoint = shop.nextId || null;
    for (const record of shop.records || []) {
      state.cards[record.id] = { ...failureState(state.cards[record.id], record), field: "shopStateA", source: "hareruya2" };
    }
  } else if (result) run.stopReason = result.error?.message || String(result.stderr || "補完実行失敗").slice(-300);
  run.endedAt = new Date().toISOString(); run.durationMs = Date.now() - start;
  run.status = /時間予算|time budget/i.test(run.stopReason || "") ? "時間予算で安全停止・次回継続" : run.stopReason ? "停止・確認待ち" : run.acquired ? "部分取得" : "処理成功・進捗なし";
  const support = {
    hareruya2: { status: "自動補完対応済み", method: "正規一覧でURL探索後、確定済み商品URLの状態A価格を実取得。通信一時障害は待機後に再試行。完了カードは2日間隔", intervalMs: 1200, maxRetries: 5 },
    cardrush: { status: "認証・アクセス確認待ち", reason: "403停止を維持。自動回避なし" },
    yuyutei: { status: "認証・アクセス確認待ち", reason: "403停止を維持" },
    torecacamp: { status: "自動補完対応済み", method: "別担当のサイトマップ段階巡回。二重取得しない" },
    psaOfficial: { status: read('data/psa-pc-observation.json').lastScheduledState?.publishStatus === 'published' ? "PC定期取得・公開確認済み／未登録・曖昧は別保留" : "PC取得処理あり・認証／公開復旧待ち", method: "優先キュー生成は取得0件。実取得・保存・公開を個別監査。未登録セットURLは確認待ち" },
    pokedata: { status: "公開情報対応済み／実成約は認証待ち", method: "別担当のセット・ページチェックポイント。個別成約を推定しない" },
    domesticPsa9: { status: "取得処理未実装", reason: "同一日本語カードの国内PSA9個別実成約を取得する正規経路未確定" },
    rawActualSales: { status: "海外実成約は認証確認待ち", reason: "PokeDATA Rawは国内状態A成約とは別指標" },
    domesticStateASales: { status: "取得処理未実装・許諾確認待ち", reason: "全状態取引件数・海外Rawを状態A成約件数へ代用しない" },
  };
  state.lastRun = run; delete state.running;
  save("work/completion-acquisition-checkpoint.json", state);
  const pending = eligibleForHareru(plan(cards, queue, state), read("work/hareruya2_catalog.json", [])).length;
  const routing = {};
  for (const candidate of candidates) for (const route of routes(candidate.detail)) {
    const key = `${route.source}:${route.mode}`;
    routing[key] ||= { source: route.source, mode: route.mode, cards: 0, requiredItems: 0 };
    routing[key].cards++; routing[key].requiredItems += Number(route.required);
  }
  for (const script of ["build_psa_linkage_queue.js", "build_psa_priority_queue.js"]) {
    const queued = spawnSync(process.execPath, [path.join(__dirname, script)], { cwd: ROOT, encoding: "utf8", timeout: 15000 });
    if (queued.status !== 0) { run.stopReason = `PSA優先キュー接続失敗: ${script}`; process.exitCode = 1; }
  }
  save("data/completion-acquisition.json", { version: 2, ...run, urlDiscovery:read('data/state-a-url-discovery.json'), support, routing, pending: candidates.length, eligiblePending: pending, pendingDefinition: "eligiblePendingは状態A価格が不足し確定URL・再試行条件を満たす対象。PSAだけ不足するカードを店舗取得へ送らない。routing.cardsはカード×項目数で合算不可", cards: state.cards });
  state.lastRun = run; save("work/completion-acquisition-checkpoint.json", state);
  console.log(JSON.stringify(run));
  if (result && result.status !== 0) process.exitCode = 1;
  return run;
}
if (require.main === module) run();
module.exports = { plan, run, eligibleForHareru };
