const fs = require("node:fs");
const path = require("node:path");
const { groupFor } = require("./focus_monitor.js");
const ROOT = path.join(__dirname, "..");
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
    const time = Date.parse(lastSuccessAt);
    const validTime = Number.isFinite(time) && time <= now;
    const hours = important ? config.importantHours || 6 : config.normalHours || 48;
    const due = validTime ? time + hours * 3600000 : 0;
    const retry = Date.parse(previous.nextRetryAt);
    const waiting = manualWait[card.id]?.url === url || previous.url === url && previous.failures >= (config.retryLimit || 3);
    return { card, important, focus, url, lastSuccessAt, lastAttemptAt: previous.lastAttemptAt || null,
      nextDueAt: due ? new Date(due).toISOString() : null, due: due <= now,
      eligible: due <= now && !waiting && (!Number.isFinite(retry) || retry <= now),
      status: waiting ? "手動確認待ち" : Number.isFinite(retry) && retry > now ? "再試行待ち" : due <= now ? "期限超過・取得待ち" : "期限内",
      reason: [focus && "重点カード", candidate && "購入候補", favorites.has(card.id) && "同期済みお気に入り", !important && "通常巡回"].filter(Boolean).join("／"),
      score: (validTime ? Math.max(0, (now - due) / 3600000) : 100000) + (important ? 24 : 0) };
  });
  const sorted = records.filter((row) => row.eligible).sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id));
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
    catalog: read(root, `work/${sourceId}_catalog.json`, []), candidateRows: read(root, "work/candidate-availability-history.json").runs?.at(-1)?.rows || read(root, "work/acquisition-audit-baseline.json").availability?.rows || {},
    focusConfig: read(root, "data/focus-monitor-config.json"), config: read(root, "data/priority-price-config.json"),
    jobs: read(root, "work/priority-price-checkpoint.json").sources?.[sourceId]?.jobs || {},
    manualWait: read(root, "work/candidate-shop-refresh.json").checkpoints?.[sourceId]?.manualWait || {}, now });
}
function finish(previous = {}, record, at, config = {}) {
  const ok = record.status === "verified";
  const failures = ok ? 0 : Number(previous.failures || 0) + 1;
  return { ...previous, url: record.url, lastAttemptAt: record.startedAt, lastSuccessAt: ok ? at : previous.lastSuccessAt || null,
    failures, status: ok ? "success" : record.status, error: ok ? null : record.error,
    nextRetryAt: ok ? null : new Date(Date.parse(at) + Math.min(48, 2 ** failures) * 3600000).toISOString(),
    nextDueAt: ok ? new Date(Date.parse(at) + (record.important ? config.importantHours || 6 : config.normalHours || 48) * 3600000).toISOString() : previous.nextDueAt || null };
}
function write(root = ROOT) {
  const checkpoint = read(root, "work/priority-price-checkpoint.json", { sources: {} });
  const sources = {};
  for (const id of ["cardrush", "hareruya2"]) {
    const planned = load(id, root), run = read(root, "work/candidate-shop-refresh.json").sources?.[id] || {};
    const blocked = read(root, "work/candidate-shop-refresh.json").checkpoints?.[id]?.sourceBlocked || null;
    const elapsed = Number(run.durationMs || 0) / 1000;
    const rate = elapsed > 0 && run.refreshedCount > 0 ? run.refreshedCount / elapsed : null;
    const priorityVerified = (run.records || []).filter((record) => record.important && record.status === "verified").length;
    const priorityRate = elapsed > 0 && priorityVerified > 0 ? priorityVerified / elapsed : null;
    const budgetSeconds = Number(read(root, "data/priority-price-config.json").timeBudgetMs || 240000) / 1000;
    const important = planned.records.filter((r) => r.important);
    sources[id] = { total: planned.records.length, priorityCards: important.length,
      overdue: important.filter((r) => r.due && r.nextDueAt).length, unconfirmed: important.filter((r) => !r.nextDueAt).length, pending: planned.queue.length,
      status: blocked ? "認証・アクセス確認待ち" : "期限付き価格更新", stopReason: blocked || run.stopReason || null,
      refreshed: run.refreshedCount ?? null, changed: run.changedCount ?? null, durationMs: run.durationMs ?? null,
      httpRequests: run.httpRequests ?? null, cacheHits: run.cacheHits ?? 0, cardsPerMinute: rate ? Number((rate * 60).toFixed(2)) : null,
      priorityCardsPerMinute: priorityRate ? Number((priorityRate * 60).toFixed(2)) : null,
      estimatedSweepActiveMinutes: priorityRate && !blocked ? Math.ceil(important.length / priorityRate / 60) : null,
      estimatedExecutionsToClearOverdue: priorityRate && !blocked ? Math.ceil(important.filter((r) => r.due).length / (priorityRate * budgetSeconds)) : null,
      estimatedFullSweepHours: priorityRate && !blocked ? Math.ceil(important.length / (priorityRate * budgetSeconds)) * 2 : null,
      lastRunAt: run.startedAt || null, checkpoint: run.nextId || null,
      cards: important.map((r) => ({ id: r.card.id, name: r.card.name, lastConfirmedAt: r.lastSuccessAt, nextDueAt: r.nextDueAt,
        lastAttemptAt: checkpoint.sources?.[id]?.jobs?.[r.card.id]?.lastAttemptAt || null, status: blocked ? "アクセス確認待ち・正常値保持" : r.status, priorityReason: r.reason })) };
  }
  const cards = read(root, "data/pokemon-cards.json", []);
  const names = new Map(cards.map((card) => [card.id, card.name]));
  const candidates = read(root, "work/candidate-availability-history.json").runs?.at(-1)?.rows || {};
  const focusConfig = read(root, "data/focus-monitor-config.json");
  const favorites = new Set(read(root, "data/priority-price-config.json").favoriteIds || []);
  const priorityCards = cards.filter((card) => candidates[card.id] || groupFor(card, focusConfig) || favorites.has(card.id));
  const inventory = read(root, "work/toreca-source-inventory.json"), present = new Set((inventory.cards || []).map((card) => card.id));
  const runs = read(root, "work/source-update-runs.json").sources || {};
  const buys = read(root, "data/shop-buyback-summary.json");
  const now = Date.now();
  function bulkSource(id, observations) {
    const records = observations.map(({ card, at, detail }) => {
      const time = Date.parse(at), known = Number.isFinite(time) && time <= now;
      const nextDueAt = known ? new Date(time + 6 * 3600000).toISOString() : null;
      return { id: card.id, name: names.get(card.id), lastConfirmedAt: known ? at : null, nextDueAt,
        lastAttemptAt: runs[id]?.lastAttemptAt || null, status: !known ? "カード単位の確認日時なし・取得待ち" : time + 6 * 3600000 < now ? "期限超過" : "期限内", detail };
    });
    return { total: cards.length, priorityCards: records.length, overdue: records.filter((r) => r.status === "期限超過").length,
      unconfirmed: records.filter((r) => !r.lastConfirmedAt).length,
      pending: records.filter((r) => r.status !== "期限内").length, status: "正規一括差分・6時間目標", stopReason: runs[id]?.lastError || null,
      refreshed: runs[id]?.acquiredCount ?? null, changed: runs[id]?.updatedCount ?? null, durationMs: runs[id]?.durationMs ?? null,
      httpRequests: null, cacheHits: null, cardsPerMinute: null, estimatedSweepActiveMinutes: null,
      lastRunAt: runs[id]?.startedAt || null, checkpoint: "一括差分・カードID照合", cards: records };
  }
  const torecaDay = runs.toreca?.lastSuccessAt ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date(runs.toreca.lastSuccessAt)) : null;
  const inventoryAt = runs.toreca?.status === "success" && inventory.updatedAt === torecaDay ? runs.toreca.lastSuccessAt : inventory.updatedAt;
  sources.toreca = bulkSource("toreca", priorityCards.map((card) => ({ card,
    at: present.has(card.id) && Number(card.price) > 0 ? inventoryAt : null, detail: "取得一覧ID一致と成功実行日の一致を確認。成約日時・状態A実売証明とは別" })));
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
    notes: "一巡見込みは実処理時間の参考値。Actions待機・通信変動を含まない。国内相場・買取表は正規一括取得を6時間目標、ショップはカード別期限。認証停止は古い値を保持。お気に入りは同期済みIDのみ。" };
  fs.writeFileSync(path.join(root, "data/priority-price-monitor.json"), JSON.stringify(output));
  return output;
}
if (require.main === module) { const output = write(); console.log(JSON.stringify({ ...output, sources: Object.fromEntries(Object.entries(output.sources).map(([id, row]) => [id, { ...row, cards: undefined }])) })); }
module.exports = { plan, finish, load, write };
