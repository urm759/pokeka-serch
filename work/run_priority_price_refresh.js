const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const ROOT = path.join(__dirname, "..");
const read = (file, fallback = {}) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8")); } catch { return fallback; } };
function due(record, now = Date.now(), config = {}) {
  const success = Date.parse(record?.lastSuccessAt);
  const attempt = Date.parse(record?.lastAttemptAt);
  // Failed origins cool down too; running often must not retry protected sources.
  return (!Number.isFinite(success) || require("./proactive_refresh.js").eligibleDeadline(success + 6 * 3600000, true, now, config)) && (!Number.isFinite(attempt) || now - attempt >= 2 * 3600000);
}
function main() {
  if (process.argv.includes('--report-failures')) {
    const previous = read('data/priority-price-execution.json');
    if (String(previous.runId || '') !== String(process.env.GITHUB_RUN_ID || '')) return;
    const failed = (previous.runs || []).filter(row => row.processStatus === 'failed');
    if (failed.length) { console.error('Independent source failures retained: ' + failed.map(row => row.script).join(', ')); process.exitCode = 1; }
    return;
  }
  const finalizeOnly = process.argv.includes('--finalize-only');
  const previous = finalizeOnly ? read('data/priority-price-execution.json') : {};
  const started = finalizeOnly ? Date.parse(previous.startedAt) || Date.now() : Date.now(), runs = previous.runs || [];
  const scheduled = new Date(started);
  scheduled.setUTCMinutes(20, 0, 0);
  scheduled.setUTCHours(Math.floor(scheduled.getUTCHours()/2)*2);
  if (scheduled.getTime() > started) scheduled.setUTCHours(scheduled.getUTCHours()-2);
  const save = () => require('./acquisition_retry').atomicWrite(path.join(ROOT, "data/priority-price-execution.json"), { version: 1, startedAt: new Date(started).toISOString(), endedAt: new Date().toISOString(), durationMs: Date.now() - started,
    runId: process.env.GITHUB_RUN_ID || null, headSha:process.env.GITHUB_SHA || null, priceQueueModel:"deadline-v2", startDelayMs: process.env.GITHUB_EVENT_NAME === "schedule" ? started - scheduled.getTime() : null,
    scheduledSlotAt: process.env.GITHUB_EVENT_NAME === "schedule" ? scheduled.toISOString() : null,
    delayMethod: "直近の定期cron枠から実処理開始まで。2時間超の遅延は識別不能のため手動監査対象",
    runClass: finalizeOnly ? "保存済み取得の集計復旧・再取得なし" : process.argv.includes('--catchup') ? "監視経路の空白補完・探索なし" : "価格更新・探索なし", llmCalls: 0, codexCalls: 0, runs });
  function run(script, args = [], env = {}, role = 'required') {
    const at = Date.now();
    const child = spawnSync(process.execPath, [path.join(ROOT, script), ...args], { cwd: ROOT,
      env: { ...process.env, ...env }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 600000 });
    process.stdout.write(child.stdout || ""); process.stderr.write(child.stderr || "");
    let details = null;
    for (const line of String(child.stdout || "").trim().split(/\r?\n/).reverse()) { try { details = JSON.parse(line); break; } catch { /* Non-JSON progress text. */ } }
    const processStatus = child.status === 0 && !child.error ? "success" : "failed";
    runs.push({ script, startedAt: new Date(at).toISOString(), endedAt: new Date().toISOString(), durationMs: Date.now() - at,
      processStatus, failureClass:processStatus==='failed'?(role==='source'?'source-acquisition':'required-calculation'):null,
      status: processStatus === "failed" ? "failed" : details?.status || details?.completionStatus || "process-success",
      attempted: details?.attemptedCount ?? null, refreshed: details?.refreshedCount ?? null, changed: details?.changedCount ?? null,
      proactiveAttempted:details?.proactiveAttempted ?? null, proactiveVerified:details?.proactiveVerified ?? null,
      httpRequests:details?.httpRequests ?? null, deadlineOrderVersion:details?.deadlineOrderVersion || null,
      stopReason: details?.stopReason || null, error: child.error?.message || null });
    save();
    return child.status === 0 && !child.error;
  }
  if (!finalizeOnly) {
  const sources = read("work/source-update-runs.json").sources || {};
  // Rebuild eligibility from saved data before selecting prices; no HTTP or LLM here.
  if (!run('work/build_purchase_limit_audit.js')) throw new Error('Purchase target queue rebuild failed');
  if (!run('work/audit_purchase_price_recovery.js', ['--baseline'])) throw new Error('Freshness baseline save failed');
  const config = require("./priority_price_queue.js").timingConfig(ROOT);
  if (due(sources.toreca, Date.now(), config)) run("work/daily_fast_update.js", [], { FAST_DEEP_SCAN: "0", DAILY_RUNTIME_LIMIT_MS: "300000" }, 'source');
  if (due(sources.shopBuyback, Date.now(), config)) run("work/run_tracked_update.js", ["shopBuyback", "work/update_shop_buybacks.js"], { TRACKED_TIMEOUT_MS: "300000" }, 'source');
  for (const sourceId of ["cardrush", "hareruya2"]) run("work/refresh_candidate_shops.js", [sourceId], { CANDIDATE_SHOP_MODE: "deadline" }, 'source');
  }
  for (const script of ["work/audit_state_a_prices.js", "work/build_card_completion.js", "work/build_purchase_limit_audit.js", "work/audit_acquisition_progress.js", "work/audit_link_coverage.js"]) {
    if (!run(script)) throw new Error(`Required rebuild failed: ${script}`);
  }
  if (!run('work/audit_purchase_price_recovery.js')) throw new Error('Purchase freshness outcome audit failed');
  if (!run('work/finalize_update_status.js')) throw new Error('Update status rebuild failed');
  save();
  // Source failures remain visible, but only required rebuild failures stop validation.
  return { sourceFailures: runs.filter(row => row.processStatus === 'failed').map(row => row.script) };
}
if (require.main === module) {
  if (process.argv.includes('--report-failures')) main();
  else if (process.argv.includes('--finalize-only')) {
    const release = require('./acquisition_retry').lock(path.join(ROOT,'work/priority-price-refresh.lock'));
    try { main(); } finally { release(); }
  } else {
  const result = require('./price_refresh_gate').execute(ROOT, main, { catchup: process.argv.includes('--catchup') });
  if (result.status === 'skipped') console.log(JSON.stringify(result));
  }
}
module.exports = { due };
