const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUTPUT = path.join(ROOT, "data", "update-status.json");
const HISTORY_OUTPUT = path.join(ROOT, "data", "update-history.json");
const { countCurrentRecords, nextScheduledAt } = require("./source_observability.js");

function read(relativePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function jstDate(value = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(value));
}

function validDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isFinite(parsed.getTime())) return jstDate(parsed);
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

const today = jstDate();
const previous = read("data/update-status.json", {});
const meta = read("data/pokemon-cards-meta.json");
const stock = read("data/cardrush-stock-summary.json");
const hareruya2 = read("data/hareruya2-stock-summary.json");
const yuyutei = read("data/yuyutei-stock-summary.json");
const torecacamp = read("data/torecacamp-stock-summary.json");
const buyback = read("data/shop-buyback-summary.json");
const marketAnalysis = read("data/market-stability-summary.json");
const psa = read("data/psa-official-populations.json");
const services = read("data/psa-japan-services.json");
const pokedata = read("data/pokedata-summary.json");
const runs = read("work/source-update-runs.json", { sources: {} });
const runHistory = read("work/source-update-history.json", { version: 1, sources: {} });
const psaTask = read("work/psa_update_state.json", {});
const psaRowDates = (psa.rows || []).map((row) => validDate(row.fetchedAt)).filter(Boolean);
const psaDateCounts = {};
for (const date of psaRowDates) psaDateCounts[date] = (psaDateCounts[date] || 0) + 1;
const dominantPsaDate = Object.entries(psaDateCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

const sources = {
  toreca: { label: "みんトレ", date: validDate(meta.updatedAt || meta.generatedAt), automatic: true },
  cardrush: { label: "カードラッシュ", date: validDate(stock.updatedAt), automatic: true },
  hareruya2: { label: "晴れる屋2", date: validDate(hareruya2.updatedAt), automatic: true },
  yuyutei: { label: "遊々亭", date: validDate(yuyutei.updatedAt), automatic: true },
  torecacamp: { label: "トレカキャンプ", date: validDate(torecacamp.updatedAt), automatic: true },
  shopBuyback: { label: "Web買取表", date: validDate(buyback.updatedAt), automatic: true },
  marketAnalysis: { label: "下値安定・買取率分析", date: validDate(marketAnalysis.updatedAt), automatic: true },
  psaOfficial: { label: "PSA公式枚数", date: dominantPsaDate, automatic: true, note: "PC起動時にPSA専用Chromeで自動取得", coverageRows: psaDateCounts[dominantPsaDate] || 0 },
  psaJapan: { label: "PSA Japan料金", date: validDate(services.checkedAt || services.updatedAt), automatic: true, status: services.checkStatus || "unknown" },
  pokedata: { label: "PokeDATA海外相場", date: validDate(pokedata.updatedAt), automatic: false, note: "ログイン済みChromeで個別成約を厳格照合" },
};

for (const [sourceId, source] of Object.entries(sources)) {
  const run = sourceId === "psaOfficial" ? {
    lastAttemptAt: psaTask.lastAttemptAt,
    lastSuccessAt: psaTask.lastSuccessAt,
    startedAt: psaTask.startedAt || psaTask.lastAttemptAt,
    endedAt: psaTask.endedAt,
    durationMs: psaTask.durationMs,
    status: psaTask.status,
    acquiredCount: Number.isFinite(psaTask.acquiredCount) ? psaTask.acquiredCount : source.coverageRows,
    fetchFailureCount: psaTask.fetchFailureCount,
    lastError: psaTask.lastError,
    updatedCount: psaTask.updatedCount,
    sourceState: psaTask.sourceState,
    syncStatus: psaTask.syncStatus,
    syncError: psaTask.syncError,
    publishStatus: psaTask.publishStatus,
    publishError: psaTask.publishError,
  } : (runs.sources?.[sourceId] || {});
  source.lastAttemptAt = run.lastAttemptAt || null;
  source.startedAt = run.startedAt || source.lastAttemptAt;
  source.endedAt = run.endedAt || null;
  source.lastSuccessAt = run.lastSuccessAt || (source.date ? `${source.date}T00:00:00+09:00` : null);
  source.durationMs = Number.isFinite(run.durationMs) ? run.durationMs : null;
  source.status = run.status || source.status || (source.date ? "success" : "unknown");
  const fallbackCount = source.coverageRows || countCurrentRecords(sourceId, ROOT);
  source.acquiredCount = Number.isFinite(run.acquiredCount) ? run.acquiredCount : (Number.isFinite(fallbackCount) ? fallbackCount : null);
  source.fetchFailureCount = Number.isFinite(run.fetchFailureCount) ? run.fetchFailureCount : null;
  source.updatedCount = Number.isFinite(run.updatedCount) ? run.updatedCount : null;
  source.sourceState = run.sourceState || (source.status === "failed" ? "取得処理失敗" : "過去データ・処理履歴未記録");
  source.syncStatus = run.syncStatus || null;
  source.syncError = run.syncError || null;
  source.publishStatus = run.publishStatus || null;
  source.publishError = run.publishError || null;
  source.lastError = run.lastError || null;
  source.nextScheduledAt = nextScheduledAt();
  source.fresh = source.date === today && source.status === "success";
}
// A completed refresh requires both cloud sources and the login-dependent
// PSA task on the user's PC to be current.
const automaticSources = Object.values(sources).filter((source) => source.automatic);
const complete = automaticSources.length > 0 && automaticSources.every((source) => source.fresh);
const manualPending = Object.entries(sources)
  .filter(([, source]) => !source.automatic && !source.fresh)
  .map(([key]) => key);
const payload = {
  checkedAt: new Date().toISOString(),
  complete,
  completeDate: complete ? today : previous.completeDate || null,
  manualPending,
  sources,
};
fs.writeFileSync(OUTPUT, JSON.stringify(payload), "utf8");
const publishedHistory = { version: 1, updatedAt: runHistory.updatedAt || null, sources: {} };
for (const sourceId of Object.keys(sources)) {
  publishedHistory.sources[sourceId] = (runHistory.sources?.[sourceId] || []).slice(-30);
  if (sourceId === "psaOfficial" && psaTask.startedAt && !publishedHistory.sources[sourceId].length) {
    publishedHistory.sources[sourceId].push({
      sourceId,
      startedAt: psaTask.startedAt,
      endedAt: psaTask.endedAt || null,
      status: psaTask.status || "unknown",
      acquiredCount: psaTask.acquiredCount || sources[sourceId].acquiredCount,
      updatedCount: psaTask.updatedCount ?? null,
      fetchFailureCount: psaTask.fetchFailureCount ?? null,
      sourceState: psaTask.sourceState || null,
      lastError: psaTask.lastError || null,
      syncStatus: psaTask.syncStatus || null,
      syncError: psaTask.syncError || null,
      publishStatus: psaTask.publishStatus || null,
      publishError: psaTask.publishError || null,
    });
  }
}
fs.writeFileSync(HISTORY_OUTPUT, JSON.stringify(publishedHistory), "utf8");
console.log(JSON.stringify({ complete, completeDate: payload.completeDate, sources }));
