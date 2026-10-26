const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const ROOT = path.join(__dirname, "..");
const read = (file, fallback = {}) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8")); } catch { return fallback; } };
function scheduledSlot(at,catchup=false) {
  const date=new Date(at);
  date.setUTCMinutes(catchup?47:20,0,0);
  if(!catchup)date.setUTCHours(Math.floor(date.getUTCHours()/2)*2);
  if(+date>at)date.setUTCHours(date.getUTCHours()-(catchup?1:2));
  return date;
}
function due(record, now = Date.now(), config = {}) {
  const success = Date.parse(record?.lastSuccessAt);
  const attempt = Date.parse(record?.lastAttemptAt);
  // Failed origins cool down too; running often must not retry protected sources.
  return (!Number.isFinite(success) || require("./proactive_refresh.js").eligibleDeadline(success + 6 * 3600000, true, now, config)) && (!Number.isFinite(attempt) || now - attempt >= 2 * 3600000);
}
function marketBeforeBuyback(market, buyback, now = Date.now(), config = {}) {
  if (due(market, now, config)) return true;
  const success=Date.parse(market?.lastSuccessAt),attempt=Date.parse(market?.lastAttemptAt);
  const day=at=>new Date(at+9*3600000).toISOString().slice(0,10);
  // Use the existing single bulk slot before new-day quotes. Never waive the source retry interval.
  return due(buyback,now,config) && Number.isFinite(success) && day(success)!==day(now)
    && (!Number.isFinite(attempt)||now-attempt>=2*3600000);
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
  const checkout=spawnSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).stdout?.trim();
  const checkoutCommit=/^[a-f0-9]{40}$/.test(checkout || '')?checkout:null;
  const catchup=process.argv.includes('--catchup') || finalizeOnly&&/監視経路/.test(previous.runClass || '');
  const scheduled = scheduledSlot(started,catchup);
  const save = () => require('./acquisition_retry').atomicWrite(path.join(ROOT, "data/priority-price-execution.json"), { version: 1, startedAt: new Date(started).toISOString(), endedAt: finalizeOnly ? previous.endedAt || null : new Date().toISOString(), durationMs: finalizeOnly ? previous.durationMs ?? null : Date.now() - started,
    reaggregatedAt: finalizeOnly ? new Date().toISOString() : null,
    runId: finalizeOnly ? previous.runId || null : process.env.GITHUB_RUN_ID || null, headSha:finalizeOnly ? previous.headSha || null : process.env.GITHUB_SHA || null,
    checkoutCommit:finalizeOnly?previous.checkoutCommit || null:checkoutCommit,
    priceQueueModel:"deadline-v2", startDelayMs: finalizeOnly ? previous.startDelayMs ?? null : process.env.GITHUB_EVENT_NAME === "schedule" ? started - scheduled.getTime() : null,
    scheduledSlotAt: finalizeOnly ? previous.scheduledSlotAt || null : process.env.GITHUB_EVENT_NAME === "schedule" ? scheduled.toISOString() : null,
    delayMethod:finalizeOnly ? previous.delayMethod || null : catchup?"毎時47分の補完cron枠から実処理開始まで。1時間超の遅延は識別不能":"2時間ごと20分のPriority cron枠から実処理開始まで。2時間超の遅延は識別不能",
    runClass: finalizeOnly ? "保存済み取得の集計復旧・再取得なし" : process.argv.includes('--catchup') ? "監視経路の空白補完・探索なし" : "価格更新・探索なし", llmCalls: 0, codexCalls: 0, runs });
  function run(script, args = [], env = {}, role = 'required') {
    if(finalizeOnly&&script==='work/audit_state_a_prices.js')env={...env,PRICE_EVIDENCE_FETCH_LIMIT:'0'};
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
  if (!run('work/audit_candidate_reduction.js')) throw new Error('Fixed shared-search recovery queue rebuild failed');
  if (!run('work/audit_purchase_price_recovery.js', ['--baseline'])) throw new Error('Freshness baseline save failed');
  const config = require("./priority_price_queue.js").timingConfig(ROOT);
  const evidenceBefore=require('./efficiency_evidence_queue').pending(read('data/pokemon-cards.json',[]),read('data/shop-buyback-summary.json'));
  // Use the existing bulk acquisition slots, not a second per-card crawler.
  for (const [source,key,script,args,env] of [
    ['toreca','psa9Evidence','work/daily_fast_update.js',[],{FAST_DEEP_SCAN:'0',DAILY_RUNTIME_LIMIT_MS:'300000'}],
    ['shopBuyback','buybackExitEvidence','work/run_tracked_update.js',['shopBuyback','work/update_shop_buybacks.js'],{TRACKED_TIMEOUT_MS:'300000'}]
  ]) {
    const ready=source==='toreca'?marketBeforeBuyback(sources.toreca,sources.shopBuyback,Date.now(),config):due(sources[source],Date.now(),config);
    if (ready) run(script,args,env,'source');
    const evidenceAfter=require('./efficiency_evidence_queue').pending(read('data/pokemon-cards.json',[]),read('data/shop-buyback-summary.json'));
    runs.push({source,field:key,status:ready?'補完ルート実処理後の監査':'確認期限・再試行間隔待ち',pendingBefore:evidenceBefore[key].length,pendingAfter:evidenceAfter[key].length,
      recovered:evidenceBefore[key].filter(id=>!evidenceAfter[key].includes(id)).length,
      reason:'一括取得で価格と確認日時を保存。集計確認を実成約取得として数えない。出現しない値は未取得のまま',llmCalls:0,codexCalls:0});
    save();
  }
  for (const sourceId of ["cardrush", "hareruya2"]) run("work/refresh_candidate_shops.js", [sourceId], { CANDIDATE_SHOP_MODE: "deadline" }, 'source');
  }
  for (const script of ["work/reconcile_saved_psa_summary.js", "work/audit_state_a_prices.js", "work/build_card_completion.js", "work/build_purchase_limit_audit.js", "work/audit_acquisition_progress.js", "work/audit_link_coverage.js"]) {
    if (!run(script)) throw new Error(`Required rebuild failed: ${script}`);
  }
  if (!run('work/audit_purchase_price_recovery.js')) throw new Error('Purchase freshness outcome audit failed');
  if (!run('work/audit_candidate_reduction.js')) throw new Error('Fixed shared-search outcome audit failed');
  if (!run('work/finalize_update_status.js')) throw new Error('Update status rebuild failed');
  save();
  // Source failures remain visible, but only required rebuild failures stop validation.
  return { sourceFailures: runs.filter(row => row.processStatus === 'failed').map(row => row.script) };
}
if (require.main === module) {
  if (process.argv.includes('--report-failures')) main();
  else if (process.argv.includes('--finalize-only')) {
    const release = require('./acquisition_retry').lock(path.join(ROOT,'work/priority-price-refresh.lock'));
    try { main(); require('./build_ui_data').build(ROOT); } finally { release(); }
  } else {
  const result = require('./price_refresh_gate').execute(ROOT, main, {
    catchup: process.argv.includes('--catchup'),
    afterSave: () => require('./build_ui_data').build(ROOT)
  });
  if (result.status === 'skipped') console.log(JSON.stringify(result));
  }
}
module.exports = { due,scheduledSlot,marketBeforeBuyback };
