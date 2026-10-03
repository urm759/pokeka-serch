const fs = require("node:fs");
const path = require("node:path");
const { updateRun, appendRunHistory } = require("./source_observability.js");
const root = path.join(__dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8").replace(/^\uFEFF/, ""));
const progress = read("work/psa-fetch-progress.json");
const old = read("work/psa_update_state.json");
const sameAttempt = old.startedAt === progress.startedAt;
const state = { ...old, previousAttempt: sameAttempt ? old.previousAttempt : { startedAt: old.startedAt, status: old.status, lastError: old.lastError },
  startedAt: progress.startedAt, endedAt: progress.endedAt, lastAttemptAt: progress.startedAt,
  status: progress.status === "manual-wait" ? "manual-wait" : progress.refreshedCount > 0 ? "partial" : "failed", lastError: progress.stopReason || null, durationMs: progress.durationMs, sourceState: `登録済み${progress.attemptedCount}セットの試行。全カード完了ではない`,
  acquiredCount: read("data/psa-official-populations.json").rows.length, updatedCount: progress.changedCount,
  fetchFailureCount: progress.records.filter((r) => r.error).length,
  lastSuccessAt: progress.lastSuccessAt || old.lastSuccessAt, lastSuccessDate: (progress.lastSuccessAt || old.lastSuccessAt || "").slice(0, 10),
  syncStatus: "not-run", syncError: null, publishStatus: "not-run", publishError: null };
fs.writeFileSync(path.join(root, "work/psa_update_state.json"), JSON.stringify(state));
const run = updateRun("psaOfficial", { ...state, newAcquiredCount: progress.newAcquiredCount, refreshedCount: progress.refreshedCount, durationMs: progress.durationMs });
if (!sameAttempt) appendRunHistory("psaOfficial", run);
console.log(JSON.stringify({ status: state.status, refreshed: progress.refreshedCount, lastSuccessAt: state.lastSuccessAt }));
