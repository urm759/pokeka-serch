const fs = require("node:fs");
const path = require("node:path");
const { groupFor } = require("./focus_monitor.js");
const ROOT = path.join(__dirname, "..");
const proactive = require("./proactive_refresh.js");
const { observationTime } = require('../decision-model.js');
const read = (root, file, fallback = {}) => { try { return JSON.parse(fs.readFileSync(path.join(root, file), "utf8")); } catch { return fallback; } };
function plan({ cards, sourceId, catalog, candidateRows = {}, focusConfig = {}, config = {}, jobs = {}, manualWait = {}, now = Date.now() }) {
  const byId = new Map(catalog.filter((row) => row.cardId).map((row) => [row.cardId, row]));
  const byUrl = new Map(catalog.map((row) => [row.detailUrl, row]));
  const favorites = new Set(config.favoriteIds || []);
  const records = cards.filter((card) => card[`${sourceId}Url`]).map((card) => {
    const url = card[`${sourceId}Url`], previous = jobs[card.id] || {};
    const focus = Boolean(groupFor(card, focusConfig));
    const candidate = Boolean(candidateRows[card.id]);
    const important = focus || candidate || favorites.has(card.id);
    const entry = byId.get(card.id) || byUrl.get(url);
    const lastSuccessAt = entry?.observedAt || null;
    const time = observationTime(lastSuccessAt);
    const validTime = Number.isFinite(time) && time <= now;
    const hours = important ? config.importantHours || 6 : config.normalHours || 720;
    const due = validTime ? time + hours * 3600000 : 0;
    const retry = Date.parse(previous.nextRetryAt);
    const waiting = manualWait[card.id]?.url === url || previous.url === url && previous.failures >= (config.retryLimit || 3);
    return { card, important, focus, url, lastSuccessAt, lastAttemptAt: previous.lastAttemptAt || null,
      nextDueAt: due ? new Date(due).toISOString() : null, due: due <= now,
      proactive: important && due > now && proactive.eligibleDeadline(due, important, now, config),
      eligible: proactive.eligibleDeadline(due, important, now, config) && !waiting && (!Number.isFinite(retry) || retry <= now),
      status: waiting ? "手動確認待ち" : Number.isFinite(retry) && retry > now ? "再試行待ち" : due <= now ? "期限超過・取得待ち" : proactive.eligibleDeadline(due, important, now, config) ? "次回完了前に期限切れ・先回り待ち" : "期限内",
      priceRefreshReady: candidateRows[card.id]?.priceRefreshReady === true,
      currentMarket: candidateRows[card.id]?.currentMarket === true,
      reason: [focus && "重点カード", candidate && "購入候補", candidateRows[card.id]?.currentMarket && "現相場採算候補", candidateRows[card.id]?.priceRefreshReady && "購入価格再確認で試算可能", favorites.has(card.id) && "同期済みお気に入り", !important && "通常巡回"].filter(Boolean).join("／"),
      score: (validTime ? Math.max(0, (now - due) / 3600000) : 100000) + (important ? 24 : 0) };
  });
  const sorted = records.filter((row) => row.eligible).sort((a, b) => Number(b.due) - Number(a.due)
    || (Date.parse(a.nextDueAt) || 0) - (Date.parse(b.nextDueAt) || 0) || Number(b.priceRefreshReady) - Number(a.priceRefreshReady) || a.card.id.localeCompare(b.card.id));
  const preferred = sorted.filter((row) => row.important), ordinary = sorted.filter((row) => !row.important);
  const queue = [];
  // Three priority requests followed by one ordinary request prevent starvation.
  while (preferred.length || ordinary.length) {
    queue.push(...preferred.splice(0, 3));
    if (ordinary.length) queue.push(ordinary.shift());
    else if (!preferred.length) break;
  }
  return { records, queue };
}
function load(sourceId, root = ROOT, now = Date.now()) {
  return plan({ cards: read(root, "data/pokemon-cards.json", []), sourceId,
    catalog: read(root, `work/${sourceId}_catalog.json`, []), candidateRows: { ...(read(root, "work/candidate-availability-history.json").runs?.at(-1)?.rows || read(root, "work/acquisition-audit-baseline.json").availability?.rows || {}), ...read(root, 'work/purchase-price-targets.json').rows },
    focusConfig: read(root, "data/focus-monitor-config.json"), config: timingConfig(root),
    jobs: read(root, "work/priority-price-checkpoint.json").sources?.[sourceId]?.jobs || {},
    manualWait: read(root, "work/candidate-shop-refresh.json").checkpoints?.[sourceId]?.manualWait || {}, now });
}
function finish(previous = {}, record, at, config = {}) {
  const ok = record.status === "verified";
  const failures = ok ? 0 : Number(previous.failures || 0) + 1;
  return { ...previous, url: record.url, lastAttemptAt: record.startedAt, lastSuccessAt: ok ? at : previous.lastSuccessAt || null,
    failures, status: ok ? "success" : record.status, error: ok ? null : record.error,
    nextRetryAt: ok ? null : new Date(Date.parse(at) + Math.min(48, 2 ** failures) * 3600000).toISOString(),
    nextDueAt: ok ? new Date(Date.parse(at) + (record.important ? config.importantHours || 6 : config.normalHours || 720) * 3600000).toISOString() : previous.nextDueAt || null };
}
function write(root = ROOT) {
  const checkpoint = read(root, "work/priority-price-checkpoint.json", { sources: {} });
  const fixedHistory = read(root, "work/priority-freshness-history.json");
  const sources = {};
  for (const id of ["cardrush", "hareruya2"]) {
    const planned = load(id, root), run = read(root, "work/candidate-shop-refresh.json").sources?.[id] || {};
    const blocked = read(root, "work/candidate-shop-refresh.json").checkpoints?.[id]?.sourceBlocked || null;
    const elapsed = Number(run.durationMs || 0) / 1000;
    const rate = elapsed > 0 && run.refreshedCount > 0 ? run.refreshedCount / elapsed : null;
    const priorityVerified = (run.records || []).filter((record) => record.important && record.status === "verified").length;
    const priorityRate = elapsed > 0 && priorityVerified > 0 ? priorityVerified / elapsed : null;
    const normalRate = elapsed > 0 && run.refreshedCount > priorityVerified ? (run.refreshedCount - priorityVerified) / elapsed : null;
    const budgetSeconds = Number(read(root, "data/priority-price-config.json").timeBudgetMs || 240000) / 1000;
    const important = planned.records.filter((r) => r.important);
    const storedJobs = checkpoint.sources?.[id]?.jobs;
    if (storedJobs) for (const record of planned.records) {
      const previous = storedJobs[record.card.id];
      if (!previous || previous.url !== record.url) continue;
      // A configured cadence change must also update the saved deadline, not the confirmed timestamp.
      previous.nextDueAt = record.nextDueAt;
    }
    sources[id] = { total: planned.records.length, priorityCards: important.length,
      currentMarketTargets: important.filter(r => r.currentMarket).length,
      priceRefreshReady: important.filter(r => r.priceRefreshReady).length,
      overdue: important.filter((r) => r.due && r.nextDueAt).length, proactivePending: important.filter(r => r.proactive && r.eligible).length,
      proactiveWindow: proactive.lead(timingConfig(root)), unconfirmed: important.filter((r) => !r.nextDueAt).length, pending: planned.queue.length,
      status: blocked ? "認証・アクセス確認待ち" : "期限付き価格更新", stopReason: blocked || run.stopReason || null,
      refreshed: run.refreshedCount ?? null, changed: run.changedCount ?? null, durationMs: run.durationMs ?? null,
      httpRequests: run.httpRequests ?? null, cacheHits: run.cacheHits ?? 0, cardsPerMinute: rate ? Number((rate * 60).toFixed(2)) : null,
      priorityCardsPerMinute: priorityRate ? Number((priorityRate * 60).toFixed(2)) : null,
      normalCardsPerMinute: normalRate ? Number((normalRate * 60).toFixed(2)) : null,
      estimatedNormalSweepDays: normalRate && !blocked ? Math.ceil((planned.records.length - important.length) / (normalRate * budgetSeconds * 12)) : null,
      normalTargetHours: read(root, "data/priority-price-config.json").normalHours || 720,
      estimatedSweepActiveMinutes: priorityRate && !blocked ? Math.ceil(important.length / priorityRate / 60) : null,
      estimatedExecutionsToClearOverdue: priorityRate && !blocked ? Math.ceil(important.filter((r) => r.due).length / (priorityRate * budgetSeconds)) : null,
      estimatedFullSweepHours: priorityRate && !blocked ? Math.ceil(important.length / (priorityRate * budgetSeconds)) * 2 : null,
      lastRunAt: run.startedAt || null, checkpoint: run.nextId || null,
      cards: important.map((r) => ({ id: r.card.id, name: r.card.name, lastConfirmedAt: r.lastSuccessAt, nextDueAt: r.nextDueAt,
        lastAttemptAt: checkpoint.sources?.[id]?.jobs?.[r.card.id]?.lastAttemptAt || null, status: blocked ? "アクセス確認待ち・正常値保持" : r.status, priorityReason: r.reason })) };
    const fixedIds = new Set(fixedHistory.sources?.[id]?.cohort || []);
    sources[id].fixedCards = planned.records.filter(r => fixedIds.has(r.card.id)).map(r => ({id:r.card.id,
      lastConfirmedAt:r.lastSuccessAt, status:blocked ? "アクセス確認待ち・正常値保持" : r.status}));
    sources[id].capacity = require('./refresh_capacity.js').estimate({importantCount:important.length,
      eligibleCount:planned.queue.filter(r=>r.important).length, manualCount:important.filter(r=>r.status==='手動確認待ち').length,
      retryCount:important.filter(r=>r.status==='再試行待ち').length,blocked:Boolean(blocked),
      verifiedCount:run.refreshedCount,durationMs:run.durationMs,budgetMs:budgetSeconds*1000});
    sources[id].proactiveVerified = run.proactiveVerified ?? null;
    sources[id].proactiveAttempted = run.proactiveAttempted ?? null;
  }
  const cards = read(root, "data/pokemon-cards.json", []);
  const names = new Map(cards.map((card) => [card.id, card.name]));
  const candidates = { ...(read(root, "work/candidate-availability-history.json").runs?.at(-1)?.rows || {}), ...read(root,'work/purchase-price-targets.json').rows };
  const focusConfig = read(root, "data/focus-monitor-config.json");
  const favorites = new Set(read(root, "data/priority-price-config.json").favoriteIds || []);
  const isPriority = card => candidates[card.id] || groupFor(card, focusConfig) || favorites.has(card.id);
  const fixedBulkIds = new Set([...(fixedHistory.sources?.toreca?.cohort || []), ...(fixedHistory.sources?.shopBuyback?.cohort || [])]);
  const priorityCards = cards.filter((card) => isPriority(card) || fixedBulkIds.has(card.id));
  const inventory = read(root, "work/toreca-source-inventory.json"), present = new Set((inventory.cards || []).map((card) => card.id));
  const runs = read(root, "work/source-update-runs.json").sources || {};
  const buys = read(root, "data/shop-buyback-summary.json");
  const now = Date.now();
  function bulkSource(id, observations) {
    const records = observations.map(({ card, at, detail }) => {
      const time = Date.parse(at), known = Number.isFinite(time) && time <= now;
      const nextDueAt = known ? new Date(time + 6 * 3600000).toISOString() : null;
      return { id: card.id, name: names.get(card.id), lastConfirmedAt: known ? at : null, nextDueAt,
        lastAttemptAt: runs[id]?.lastAttemptAt || null, status: !known ? "カード単位の確認日時なし・取得待ち" : time + 6 * 3600000 < now ? "期限超過" : proactive.eligibleDeadline(time + 6 * 3600000, true, now, timingConfig(root)) ? "次回完了前に期限切れ・先回り待ち" : "期限内", detail };
    });
    const fixedIds = new Set(fixedHistory.sources?.[id]?.cohort || []);
    const fixedCards = records.filter(r => fixedIds.has(r.id));
    const currentIds = new Set(cards.filter(isPriority).map(c => c.id));
    const current = records.filter(r => currentIds.has(r.id));
    return { total: cards.length, priorityCards: current.length, overdue: current.filter((r) => r.status === "期限超過").length,
      unconfirmed: current.filter((r) => !r.lastConfirmedAt).length,
      pending: current.filter((r) => r.status !== "期限内").length, status: "正規一括差分・6時間目標", stopReason: runs[id]?.lastError || null,
      refreshed: runs[id]?.acquiredCount ?? null, changed: runs[id]?.updatedCount ?? null, durationMs: runs[id]?.durationMs ?? null,
      httpRequests: null, cacheHits: null, cardsPerMinute: null, estimatedSweepActiveMinutes: null,
      lastRunAt: runs[id]?.startedAt || null, checkpoint: "一括差分・カードID照合", cards: current, fixedCards };
  }
  const inventoryAt = confirmedInventoryAt(inventory, runs.toreca);
  sources.toreca = bulkSource("toreca", priorityCards.map((card) => ({ card,
    at: present.has(card.id) && Number(card.price) > 0 ? inventoryAt : null, detail: "取得一覧ID・取得件数を成功記録と照合。変更なし再確認の日時であり、実成約日時・状態A実売証明ではない" })));
  sources.shopBuyback = bulkSource("shopBuyback", priorityCards.map((card) => {
    const rows = Object.entries(buys.cards?.[card.id]?.shops || {}).map(([shopId, price]) => {
      const shop = buys.shops?.[shopId];
      const observedDay = shop?.lastSuccess ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date(shop.lastSuccess)) : null;
      return price.price > 0 && price.listingActive && !price.quarantined && price.priceDate === observedDay ? shop.lastSuccess : null;
    }).filter(Boolean).sort();
    return { card, at: rows.at(-1) || null, detail: "正常な掲載価格の店舗別実取得日時。古い保存価格を最新扱いしない" };
  }));
  const output = { version: 1, generatedAt: new Date().toISOString(), runClass: "購入価格高速更新（探索キューとは別）", llmCalls: 0, codexCalls: 0,
    targetHours: read(root, "data/priority-price-config.json").importantHours || 6, scheduledHours: 2, sources,
    notes: "一巡見込みは実処理時間の参考値。Actions待機・通信変動を含まない。国内相場・買取表と重要ショップ価格は6時間目標、通常ショップ約6000枚は30日巡回目標。巡回目標とGOに採用する48時間等の価格鮮度は別で、古い値はGOに使わない。認証停止は古い値を保持。お気に入りは同期済みIDのみ。" };
  const history = require('./fixed_freshness.js').observe(read(root, 'work/priority-freshness-history.json'), output);
  fs.writeFileSync(path.join(root, 'work/priority-freshness-history.json'), JSON.stringify(history));
  output.fixedCohortFreshness = {baselineAt:history.baselineAt,method:history.method,
    sources:Object.fromEntries(Object.entries(history.sources).map(([id,r])=>[id,{baseline:r.observations[0],latest:r.observations.at(-1),previous:r.observations.at(-2)||null,intervalMinimum:r.intervalMinima?.at(-1)||null}]))};
  fs.writeFileSync(path.join(root, "data/priority-price-monitor.json"), JSON.stringify(output));
  fs.writeFileSync(path.join(root, "work/priority-price-checkpoint.json"), JSON.stringify(checkpoint));
  return output;
}
if (require.main === module) { const output = write(); console.log(JSON.stringify({ ...output, sources: Object.fromEntries(Object.entries(output.sources).map(([id, row]) => [id, { ...row, cards: undefined }])) })); }
function confirmedInventoryAt(inventory, run) {
  const at = Date.parse(run?.lastSuccessAt);
  const inventoryAt = Date.parse(inventory?.updatedAt);
  const count = (inventory?.cards || []).length;
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(inventory?.updatedAt || '');
  const successDay = Number.isFinite(at) ? new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Tokyo'}).format(new Date(at)) : null;
  // Inventory dates are JST labels, not UTC midnights. Never invent per-card
  // sales dates: this is only a successful full-list revalidation timestamp.
  const compatibleDate = dayOnly ? inventory.updatedAt <= successDay : Number.isFinite(inventoryAt) && inventoryAt <= at;
  return run?.status === "success" && count > 0 && count === Number(inventory.total)
    && count === Number(run.acquiredCount) && Number.isFinite(at) && compatibleDate
    ? run.lastSuccessAt : null;
}
function timingConfig(root = ROOT) {
  const config = read(root, "data/priority-price-config.json");
  const execution = read(root, "data/priority-price-execution.json");
  return {...config, pipelineBudgetMs: 24 * 60000,
    ...(Number.isFinite(execution.startDelayMs) ? {observedStartDelayMs:Math.max(30*60000,execution.startDelayMs)} : {})};
}
module.exports = { plan, finish, load, write, confirmedInventoryAt, timingConfig };
