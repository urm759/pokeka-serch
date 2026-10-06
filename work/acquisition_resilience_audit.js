const fs = require("node:fs");
const path = require("node:path");
const { atomicWrite, classify } = require("./acquisition_retry.js");
const read = (root, file, fallback = {}) => { try { return JSON.parse(fs.readFileSync(path.join(root, file), "utf8").replace(/^\uFEFF/, "")); } catch { return fallback; } };
function dailyRate(samples, remaining) {
  const days = new Map();
  for (const row of samples) { const date = String(row.at || "").slice(0, 10); if (!date) continue; days.set(date, (days.get(date) || 0) + Number(row.attempted || 0)); }
  const total = [...days.values()].reduce((a, b) => a + b, 0), daily = days.size >= 2 ? total / days.size : null;
  return { observedExecutionDays: days.size, processedPerExecutionDay: daily == null ? null : Math.round(daily * 10) / 10,
    firstPassDaysEstimate: remaining != null && daily > 0 ? Math.ceil(remaining / daily) : null,
    estimateConditions: "実行があった観測日2日以上の試行数平均。新規有効値数ではない。停止・日次枠・対象追加・未実行日は別。全項目取得/鮮度達成の期限ではない" };
}
function build(root) {
  const samples = read(root, "work/backfill-rate-history.json").samples || [];
  const outcomes = read(root, "data/completion-outcomes.json");
  const completion = read(root, "work/card-completion-queue.json");
  const psa = read(root, "work/psa-fetch-progress.json"), linkage = read(root, "work/psa-linkage-all.json");
  const psaOnly = Object.entries(completion.cards || {}).filter(([, c]) => c.m?.length === 1 && c.m[0] === "psaOfficial");
  const links = new Map((linkage.rows || []).map(row => [row.cardId, row]));
  const causes = {}, records = [];
  for (const [id] of psaOnly) {
    const link = links.get(id), retry = psa.retryByUrl?.[link?.sourceSetUrl];
    const cause = !link ? "照合キュー未接続" : link.status === "ambiguous" ? "仕様・URL曖昧" : !link.sourceSetUrl ? "公式セットURL未登録"
      : retry ? retry.status === "retry-wait" ? "一時障害・再試行待ち" : "個別セット確認待ち"
        : /manual-wait/.test(psa.status || "") ? "認証・アクセス確認待ち" : "登録URLの取得範囲・未一致確認";
    causes[cause] = (causes[cause] || 0) + 1;
    records.push({ id, setCode: link?.setCode || null, url: link?.sourceSetUrl || null, cause });
  }
  const camp = read(root, "work/torecacamp_progress.json");
  const poke = read(root, "work/pokedata-budget-progress.json");
  const manifest = read(root, "data/pokedata/manifest.json");
  const pokeRemaining = (manifest.sets || []).reduce((n, s) => n + Math.max(0, Number(s.sourceCount || 0) - Number(s.linkageCount || 0)), 0);
  const rows = [
    { source: "psaOfficial", label: "PSA公式・PC正規認証", remaining: psaOnly.length, queueDefinition: "あとPSAだけで分析可能な国内カード。全PSA未取得とは別", sourceState: psa.status,
      failureScope: psa.sourceRetry?.scope || classify({ error: psa.stopReason }).scope, stopReason: psa.stopReason || null, authRecovery: psa.authRecovery || null, retryUrls: Object.values(psa.retryByUrl || {}), lastRun: { attempted: psa.attemptedCount, newAcquired: psa.newAcquiredCount, refreshed: psa.refreshedCount, durationMs: psa.durationMs }, firstPassDaysEstimate: null },
    { source: "torecacamp", label: "トレカキャンプ・不足探索", remaining: camp.lastRun?.estimatedRemainingProducts ?? null, queueDefinition: "未巡回商品数推計。全国内カードの不足項目数とは別", checkpoint: { sitemap: Number(camp.currentSitemapIndex || 0) + 1, entry: camp.currentEntryIndex, total: camp.totalSitemaps }, sourceState: camp.sourceRetry?.status || "partial", stopReason: camp.sourceRetry?.reason || camp.stoppingReason || null, retryUrls: Object.values(camp.retryByUrl || {}), lastRun: camp.lastRun || null },
    { source: "pokedata", label: "PokeDATA公開一覧・成約行", remaining: pokeRemaining, queueDefinition: "展開済みセットの未巡回ID。認証済み実成約とは別", sourceState: poke.status || "未実行", stopReason: poke.stopReason || null, checkpoint: poke.checkpoint || null, lastRun: poke, authenticatedStatus: "認証・確認待ち／今回の公開取得で代替しない" },
  ];
  for (const row of rows) {
    Object.assign(row, dailyRate(samples.filter(s => s.source === row.source).slice(-100), row.remaining));
    row.usableNet = outcomes.previousObservation?.sources?.[row.source]?.usableNet ?? null;
    row.observationPeriod = { from: outcomes.previousObservation?.baselineAt || null, to: outcomes.generatedAt || null };
    row.sinceBaseline = outcomes.sinceBaseline?.sources?.[row.source] || null;
    row.freshness = read(root, "data/priority-price-monitor.json").sources?.[row.source] || null;
    if (row.source === "psaOfficial" || /manual|authentication|access/.test(row.sourceState || "")) row.firstPassDaysEstimate = null;
  }
  const result = { version: 1, generatedAt: new Date().toISOString(), llmCalls: 0, codexCalls: 0, retryPolicy: { transientMaxAttempts: 5, waitsHours: [1, 2, 4, 8, 16], sourceStop: ["401", "403", "authentication"], urlIsolation: ["missing table", "identity", "format"] }, rows,
    psaOnly: { count: psaOnly.length, causes, cards: records }, progress: outcomes.counts || {}, newlyAnalyzable: outcomes.previousObservation?.newlyAnalyzable ?? null,
    note: "一時障害の再試行、個別URL隔離、取得元停止を区別。未取得をデータ不存在に変更しない。巡回完了と全項目取得・最新価格は別" };
  atomicWrite(path.join(root, "data/acquisition-resilience.json"), result);
  return result;
}
if (require.main === module) console.log(JSON.stringify(build(path.join(__dirname, "..")).psaOnly.causes));
module.exports = { build, dailyRate };
