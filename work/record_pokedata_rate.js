const fs = require("node:fs");
const path = require("node:path");
const rate = require("./backfill_rate.js");
const read = (name) => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, name), "utf8")); } catch { return {}; }
};
const run = read("source-update-runs.json").sources?.pokedata;
if (run?.lastAttemptAt) {
  const cards = read("pokedata-fetch-metrics.json").cards || [];
  const recent = cards.filter((row) => Date.parse(row.startedAt || "") >= Date.parse(run.lastAttemptAt));
  const failed = Number(run.fetchFailureCount || 0);
  const budget = read("pokedata-budget-progress.json");
  const budgetMatches = Array.isArray(budget.batches) && Date.parse(budget.startedAt) >= Date.parse(run.lastAttemptAt) && Date.parse(budget.endedAt) <= Date.parse(run.endedAt) + 1000;
  const transientMetric = recent.find((row) => rate.transient(row));
  const sample = { key: `pokedata:${run.workflowRunId || run.lastAttemptAt}`, source: "pokedata",
    at: run.endedAt || new Date().toISOString(), batchSize: Number(process.env.POKEDATA_BATCH || 10),
    intervalMs: Number(process.env.POKEDATA_INTERVAL_MS || 1100),
    adjustment: Number(process.env.POKEDATA_BATCH || 10) < 10 ? "transient-backoff" : "none",
    attempted: recent.length, acquired: recent.filter((row) => row.status === "success" && !row.fromCache).length,
    failed, httpStatus: transientMetric?.httpStatus || null,
    error: transientMetric?.error || run.lastError || null,
    manualHold: run.completionStatus === "manual-action-required" };
  if (budgetMatches) Object.assign(sample, { attempted: budget.attempted, acquired: budget.fetched, failed: budget.failed,
    publicNewRecords: budget.publicNewRecords, domesticNewLinked: budget.newLinked, durationMs: budget.durationMs,
    httpRequests: budget.httpRequests, batches: budget.batches.length, batchSizes: budget.batches.map(row => row.batchSize),
    intervalMs: budget.throttle?.intervalMs, adjustment: budget.failed ? "transient-backoff" : "adaptive-time-budget" });
  rate.record(sample);
  console.log(JSON.stringify(sample));
}
