const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const retry = require("./acquisition_retry.js");
const { activeQueue, selectNextSet } = require("./select_pokedata_set.js");
const { lastJsonLine } = require("./run_safe_backfill.js");
const ROOT = path.join(__dirname, "..");
const read = (file, fallback) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8")); } catch { return fallback; } };
const STATE = path.join(__dirname, "pokedata-budget-progress.json");

function nextBatch(previous, sample) {
  if (sample.failed > 0 || /retry-wait|manual/.test(sample.completionStatus || "")) return { batchSize: Math.max(2, Math.floor(previous.batchSize / 2)), intervalMs: Math.min(5000, previous.intervalMs * 2), streak: 0 };
  const streak = (previous.streak || 0) + 1;
  return { batchSize: Math.min(20, previous.batchSize + (streak >= 2 ? 2 : 0)), intervalMs: previous.intervalMs, streak };
}

function run(options = {}) {
  const release = retry.lock(path.join(__dirname, "pokedata-budget.lock"));
  try {
    const started = Date.now(), budget = Number(options.budgetMs || process.env.POKEDATA_BUDGET_MS || 360000);
    const day = new Date().toISOString().slice(0, 10);
    const old = read("work/pokedata-budget-progress.json", {});
    if (old.nextRetryAt && Date.parse(old.nextRetryAt) > started) {
      const waiting = { completionStatus: "retry-wait", attempted: 0, fetched: 0, failed: 0, nextRetryAt: old.nextRetryAt, stopReason: "source-cooldown" };
      console.log(JSON.stringify(waiting)); return waiting;
    }
    const daily = old.day === day ? Number(old.dailyAttempted || 0) : 0;
    const dailyCap = Math.max(1, Number(process.env.POKEDATA_DAILY_CAP || 200));
    const state = { version: 1, day, startedAt: new Date(started).toISOString(), dailyAttempted: daily, dailyCap,
      mode: "public-list-backfill", authenticatedSales: "認証工程は別処理・今回未実施", batches: [], attempted: 0, fetched: 0, failed: 0, cacheHits: 0, newLinked: 0, publicNewRecords: 0, httpRequests: 0, llmCalls: 0, codexCalls: 0 };
    let throttle = { batchSize: Math.min(10, old.throttle?.batchSize || 10), intervalMs: Math.max(1100, old.throttle?.intervalMs || 1100), streak: 0 };
    const waitingSets = new Set();
    while (Date.now() + 40000 < started + budget && state.dailyAttempted < dailyCap) {
      if (fs.existsSync(path.join(__dirname, "pokedata-access-hold.json"))) { state.stopReason = "source-auth-or-access-hold"; break; }
      const manifest = read("data/pokedata/manifest.json", {}), discovery = read("work/pokedata-set-discovery.json", {});
      const queue = discovery.status === "success" ? activeQueue(manifest, discovery).filter(row => !waitingSets.has(row.setName) && !fs.existsSync(path.join(__dirname, `pokedata-set-hold-${require("./pokedata_storage.js").setSlug(row.setName)}.json`))) : [];
      const target = selectNextSet(manifest, queue);
      if (!target) { state.stopReason = discovery.status !== "success" ? "discovery-not-connected" : "verified-public-queue-complete-or-set-holds"; break; }
      const batchSize = Math.min(throttle.batchSize, dailyCap - state.dailyAttempted);
      const invoke = options.invoke || ((env) => spawnSync(process.execPath, [path.join(__dirname, "update_pokedata_batch.js")], { cwd: ROOT, env: { ...process.env, ...env }, encoding: "utf8", timeout: started + budget - Date.now(), maxBuffer: 32 * 1024 * 1024 }));
      const before = (manifest.sets || []).find(row => row.setName === target.setName);
      const result = invoke({ POKEDATA_SET: target.setName, POKEDATA_SET_CODE: target.setCode || "", POKEDATA_TARGET: "10000", POKEDATA_BATCH: String(batchSize), POKEDATA_INTERVAL_MS: String(throttle.intervalMs), POKEDATA_RUN_DEADLINE_MS: String(started + budget) });
      const sample = lastJsonLine(result.stdout) || { attempted: 0, failed: 1, completionStatus: "failed", stopReason: result.error?.message || result.stderr };
      sample.setName ||= target.setName;
      const after = (read("data/pokedata/manifest.json", {}).sets || []).find(row => row.setName === target.setName);
      const acquired = Math.max(0, Number(after?.linkageCount || 0) - Number(before?.linkageCount || 0));
      const linked = Math.max(0, Number(after?.count || 0) - Number(before?.count || 0));
      for (const key of ["attempted", "fetched", "failed", "cacheHits", "httpRequests"]) state[key] += Number(sample[key] || 0);
      state.newLinked += linked; state.dailyAttempted += Number(sample.attempted || 0);
      state.publicNewRecords += acquired;
      state.batches.push({ ...sample, batchSize, intervalMs: throttle.intervalMs, publicNewRecords: acquired, newLinked: linked });
      throttle = nextBatch(throttle, sample); state.throttle = throttle;
      state.checkpoint = { setName: target.setName, acquired: after?.linkageCount ?? target.completed, total: target.sourceCount };
      retry.atomicWrite(STATE, state);
      const setHold = path.join(__dirname, `pokedata-set-hold-${require("./pokedata_storage.js").setSlug(target.setName)}.json`);
      if (fs.existsSync(setHold) && !fs.existsSync(path.join(__dirname, "pokedata-access-hold.json"))) { waitingSets.add(target.setName); continue; }
      if (!sample.attempted && result.status === 0 && sample.completionStatus === "no-progress") { waitingSets.add(target.setName); continue; }
      if (result.status !== 0 || ["retry-wait", "manual-action-required"].includes(sample.completionStatus) || !sample.attempted) { state.stopReason = sample.reason || sample.stopReason || "batch-failure-or-no-eligible-target"; state.nextRetryAt = sample.nextRetryAt || null; break; }
    }
    state.endedAt = new Date().toISOString(); state.durationMs = Date.now() - started;
    state.stopReason ||= state.dailyAttempted >= dailyCap ? "daily-cap" : "time-budget-safe-stop";
    state.status = state.failed ? "partial-with-failure" : state.attempted ? "partial" : "no-progress";
    retry.atomicWrite(STATE, state);
    retry.atomicWrite(path.join(ROOT, "data/pokedata-budget-progress.json"), state);
    console.log(JSON.stringify({ ...state, batches: state.batches.length, completionStatus: state.status }));
    return state;
  } finally { release(); }
}
if (require.main === module) { try { run(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { run, nextBatch };
