const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { updateRun, appendRunHistory } = require("./source_observability.js");
const backfillRate = require("./backfill_rate.js");

const ROOT = path.join(__dirname, "..");
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, "safe-backfill-config.json"), "utf8"));
const CHECKPOINT = path.join(__dirname, "safe-backfill-progress.json");
const dryRun = process.env.SAFE_BACKFILL_DRY_RUN === "1";
const read = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
};
const save = (value) => {
  const temporary = `${CHECKPOINT}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(temporary, CHECKPOINT);
};
const stages = ["yuyutei", "priceEvidence", "psaLinkage", "torecacamp"];
const sourceProgress = (source) => {
  if (source === "yuyutei") {
    const value = read(path.join(__dirname, "yuyutei_progress.json"), {});
    return { remaining: value.lastRun?.remainingSearchCount ?? null, lastSuccessfulPage: value.lastSuccessfulPage || null,
      retryQueue: value.retryQueue?.length || 0, catalogCount: read(path.join(__dirname, "yuyutei_catalog.json"), []).length,
      accessBlock: value.lastExternalBlock || null };
  }
  if (source === "priceEvidence") {
    const value = read(path.join(ROOT, "data", "state-a-price-audit.json"), {});
    return { remaining: value.lastRun?.remaining ?? Math.max(0, Number(value.disputedCount || 0) - Number(value.inspectedSourcePages || 0)),
      inspected: value.inspectedSourcePages || 0, unavailable: value.unavailableSourcePages || 0,
      resumeCardId: value.lastRun?.resumeCardId || null,
      stopReason: value.lastRun?.stopReason || null };
  }
  if (source === "psaLinkage") {
    const value = read(path.join(ROOT, "data", "psa-linkage-priority.json"), {});
    return { unlinked: value.counts?.unlinked ?? null, note: "候補整理のみ。PSA公式の認証取得とは別工程" };
  }
  const value = read(path.join(__dirname, "torecacamp_progress.json"), {});
  return { sitemap: Number(value.currentSitemapIndex || 0) + 1, productIndex: value.currentEntryIndex || 0,
    totalSitemaps: value.totalSitemaps || null, visitedProducts: value.seenProductUrls?.length || 0, catalogCount: read(path.join(__dirname, "torecacamp_catalog.json"), []).length,
    lastFailure: value.lastFailure || null, sourceRetry: value.sourceRetry || null, retryQueue: Object.keys(value.retryByUrl || {}).length,
    failedSitemaps: Object.keys(value.failedSitemaps || {}).length,
    maintenance: value.maintenance || null, firstPassCompletedAt: value.firstPassCompletedAt || null };
};
const complete = (source, progress) => source === "yuyutei" || source === "priceEvidence"
  ? progress.remaining === 0
  : source === "torecacamp" ? false : true;
const command = (source, settings) => {
  if (source === "yuyutei") return {
    script: "work/update_yuyutei_torecacamp.js",
    env: { SHOP_SOURCE_ONLY: "yuyutei", YUYUTEI_SEARCH_BATCH: String(settings.batchSize),
      SHOP_ACCESS_INTERVAL_MS: String(settings.intervalMs), SHOP_MAX_FAILURES: String(settings.maxFailures),
      SHOP_FETCH_TIMEOUT_MS: "10000", SHOP_FETCH_RETRIES: "1" },
  };
  if (source === "priceEvidence") return {
    script: "work/audit_state_a_prices.js",
    env: { PRICE_EVIDENCE_FETCH_LIMIT: String(settings.batchSize), PRICE_EVIDENCE_INTERVAL_MS: String(settings.intervalMs),
      PRICE_EVIDENCE_MAX_FAILURES: String(settings.maxFailures), PRICE_EVIDENCE_TIMEOUT_MS: "10000",
      PRICE_EVIDENCE_MAX_RUNTIME_MS: String(settings.batchTimeoutMs - 5000) },
  };
  if (source === "psaLinkage") return { script: "work/build_psa_linkage_queue.js", env: {} };
  return { script: "work/update_yuyutei_torecacamp.js",
    env: { SHOP_SOURCE_ONLY: "torecacamp", TORECACAMP_SITEMAPS_PER_RUN: "1",
      TORECACAMP_PRODUCT_DETAIL_BATCH: String(settings.batchSize),
      TORECACAMP_RUNTIME_LIMIT_MS: String(settings.batchTimeoutMs - 5000),
      SHOP_ACCESS_INTERVAL_MS: String(settings.intervalMs), SHOP_FETCH_TIMEOUT_MS: "10000", SHOP_FETCH_RETRIES: "1" } };
};
const lastJsonLine = (output) => {
  for (const line of String(output).trim().split(/\r?\n/).reverse()) {
    try { return JSON.parse(line); } catch { /* non-JSON diagnostics */ }
  }
  return null;
};
const batchFailureCount = (output, source) => Number(output?.failed || 0) + Number(output?.[source]?.failed || 0);

function run(options = {}) {
  const now = () => new Date().toISOString();
  const started = Date.now();
  const totalLimit = Math.min(CONFIG.totalRuntimeMs, Number(options.totalRuntimeMs || process.env.SAFE_BACKFILL_TOTAL_MS || CONFIG.totalRuntimeMs));
  const state = read(CHECKPOINT, { version: 1, sources: {} });
  state.startedAt = now();
  state.status = dryRun ? "dry-run" : "running";
  let unsafeDropDetected = false;
  if (dryRun) {
    console.log(JSON.stringify({ mode: "dry-run", order: stages, limits: CONFIG.sources,
      positions: Object.fromEntries(stages.map((source) => [source, sourceProgress(source)])) }));
    return state;
  }
  save(state);
  let donatedMs = 0;
  for (const source of stages) {
    const lastSample = [...backfillRate.read().samples].reverse().find((row) => row.source === source);
    const settings = backfillRate.settings(CONFIG.sources[source], lastSample);
    const allocatedMs = Math.min(settings.runtimeMs + donatedMs, settings.maxRuntimeMs || settings.runtimeMs * 2);
    donatedMs = Math.max(0, donatedMs - (allocatedMs - settings.runtimeMs));
    settings.runtimeMs = allocatedMs;
    const sourceStarted = Date.now();
    const retryPolicy = require("./acquisition_retry.js");
    const previousRetry = state.sources[source]?.retry;
    if (previousRetry && !retryPolicy.eligible(previousRetry)) {
      state.sources[source] = { ...state.sources[source], checkedAt: now(), status: previousRetry.status, durationMs: 0 };
      donatedMs += allocatedMs; save(state); continue;
    }
    state.sources[source] = { status: "pending", position: sourceProgress(source), checkedAt: now(), batches: 0 };
    let failures = 0;
    let batches = 0;
    let previousPosition = null;
    while (Date.now() - sourceStarted < settings.runtimeMs && Date.now() - started < totalLimit) {
      const position = sourceProgress(source);
      if (complete(source, position) && source !== "psaLinkage") {
        state.sources[source] = { status: source === "priceEvidence" && position.unavailable > 0 ? "reviewed-with-unavailable" : "completed", position, checkedAt: now(), batches };
        break;
      }
      if (source === "yuyutei" && process.env.GITHUB_ACTIONS === "true" && position.accessBlock?.httpStatus === 403) {
        state.sources[source] = { status: "manual-action-required", reason: "GitHub ActionsからHTTP 403。正規アクセス確認待ち", position, checkedAt: now(), batches };
        break;
      }
      const remaining = Math.min(settings.batchTimeoutMs, settings.runtimeMs - (Date.now() - sourceStarted), totalLimit - (Date.now() - started));
      const minimumBatchMs = source === "torecacamp" ? 45000 : source === "psaLinkage" ? 10000 : 30000;
      if (remaining < minimumBatchMs) break;
      const task = command(source, settings);
      if (source === "yuyutei") task.env.YUYUTEI_SEARCH_BATCH = String(Math.max(1, Math.min(settings.batchSize, Math.floor((remaining - 5000) / (settings.intervalMs + 10000)))));
      if (source === "priceEvidence") {
        task.env.PRICE_EVIDENCE_FETCH_LIMIT = String(Math.max(1, Math.min(settings.batchSize, Math.floor((remaining - 5000) / (settings.intervalMs + 10000)))));
        task.env.PRICE_EVIDENCE_MAX_RUNTIME_MS = String(remaining - 5000);
      }
      if (source === "torecacamp") task.env.TORECACAMP_RUNTIME_LIMIT_MS = String(Math.max(30000, remaining - 5000));
      const batchStartedAt = now();
      const result = spawnSync(process.execPath, [path.join(ROOT, task.script)], {
        cwd: ROOT, env: { ...process.env, ...task.env }, encoding: "utf8", timeout: remaining,
        killSignal: "SIGTERM", maxBuffer: 32 * 1024 * 1024,
      });
      if (result.stdout) process.stdout.write(result.stdout.slice(-8000));
      if (result.stderr) process.stderr.write(result.stderr.slice(-2000));
      batches += 1;
      const output = lastJsonLine(result.stdout);
      const after = sourceProgress(source);
      const shopBatch = output?.[source] || {};
      const batchFailures = batchFailureCount(output, source);
      const failure = result.status !== 0 || result.error?.code === "ETIMEDOUT" || output?.stopReason
        || batchFailures > 0 || output?.yuyutei?.externalBlock;
      if (failure) failures += 1;
      else failures = 0;
      const accessBlocked = /HTTP (401|403)|external_access_blocked/i.test(`${output?.stopReason || ""} ${output?.yuyutei?.externalBlock?.message || ""} ${shopBatch.lastFailure?.httpStatus || ""} ${result.stderr || ""}`)
        || [401, 403].includes(Number(shopBatch.lastFailure?.httpStatus));
      const abruptDrop = source === "priceEvidence" && Number(after.inspected) < Number(position.inspected)
        || ["yuyutei", "torecacamp"].includes(source) && Number(position.catalogCount) >= 20
          && Number(after.catalogCount) < Math.floor(Number(position.catalogCount) * 0.7);
      const localCampFailure = source === "torecacamp" && result.status === 0 && batchFailures > 0 && !after.sourceRetry;
      const stopped = accessBlocked || abruptDrop || !localCampFailure && failures >= settings.maxFailures;
      const attempted = Number(shopBatch.attempted || shopBatch.searched || output?.attempted || output?.searched
        || output?.processed || Math.max(1, Number(after.inspected || after.catalogCount || 0) - Number(position.inspected || position.catalogCount || 0)));
      const acquired = Math.max(0, Number(after.inspected || after.catalogCount || 0) - Number(position.inspected || position.catalogCount || 0));
      backfillRate.record({ key: `${process.env.GITHUB_RUN_ID || state.startedAt}:${source}:${batches}`,
        source, at: now(), batchSize: Number(task.env.YUYUTEI_SEARCH_BATCH || task.env.PRICE_EVIDENCE_FETCH_LIMIT
          || task.env.TORECACAMP_PRODUCT_DETAIL_BATCH || settings.batchSize), intervalMs: settings.intervalMs,
        adjustment: settings.adjustment, attempted, acquired, newlyVisitedProducts: source === "torecacamp" ? Math.max(0, after.visitedProducts - position.visitedProducts) : null, failed: batchFailures + (result.status !== 0 ? 1 : 0),
        httpStatus: Number(shopBatch.lastFailure?.httpStatus || after.lastFailure?.httpStatus) || null,
        error: failure ? String(output?.stopReason || shopBatch.lastFailure?.error || result.error?.message || result.stderr || "").slice(0, 250) : null,
        manualHold: accessBlocked || abruptDrop });
      if (abruptDrop) unsafeDropDetected = true;
      if (["yuyutei", "torecacamp"].includes(source)) {
        const batch = shopBatch;
        const record = {
          lastAttemptAt: batchStartedAt, startedAt: batchStartedAt, endedAt: now(),
          durationMs: Date.now() - Date.parse(batchStartedAt), checkpoint: after,
          status: stopped ? "failed" : "partial", sourceState: stopped ? "取得処理停止・過去データ保持" : "部分取得・チェックポイントから継続",
          acquiredCount: after.catalogCount, updatedCount: Number(batch.linked || 0) + Number(batch.updated || 0),
          fetchFailureCount: Number(batch.failed || 0) + (result.status !== 0 ? 1 : 0),
          lastError: failure ? String(output?.stopReason || batch.lastFailure?.error || result.error?.message || result.stderr || "取得異常").slice(0, 300) : null,
          executionEnvironment: process.env.GITHUB_ACTIONS === "true" ? "GitHub Actions" : "PCローカル",
          workflowRunId: process.env.GITHUB_RUN_ID || null,
        };
        if (!failure && Number(batch.fetchedPages || batch.detailFetched || 0) > 0) record.lastSuccessAt = record.endedAt;
        updateRun(source, record);
        appendRunHistory(source, record);
      }
      state.sources[source] = {
        status: stopped ? accessBlocked ? "manual-action-required" : "stopped" : source === "psaLinkage" ? "queue-updated" : complete(source, after) ? source === "priceEvidence" && after.unavailable > 0 ? "reviewed-with-unavailable" : "completed" : "partial",
        reason: accessBlocked ? "HTTP 401/403・認証またはアクセス制限" : abruptDrop ? "取得件数急減・監査待ち" : failure ? String(output?.stopReason || shopBatch.lastFailure?.error || after.lastFailure?.error || result.error?.message || result.stderr || `exit ${result.status}`).slice(0, 250) : null,
        position: after, checkedAt: now(), batches, failures,
        retry: stopped && !abruptDrop ? retryPolicy.failure(previousRetry, { error: accessBlocked ? "HTTP 403" : String(shopBatch.lastFailure?.error || output?.stopReason || result.error?.message || result.stderr || "取得工程異常") }) : null,
      };
      save(state);
      console.log(JSON.stringify({ source, ...state.sources[source] }));
      if (stopped || complete(source, after) || source === "psaLinkage") break;
      const marker = JSON.stringify(after);
      if (marker === previousPosition) {
        state.sources[source].status = "stalled";
        state.sources[source].reason = "2回連続でチェックポイント進捗なし";
        save(state);
        break;
      }
      previousPosition = marker;
    }
    if (state.sources[source].status === "pending") state.sources[source] = { status: "time-budget", position: sourceProgress(source), checkedAt: now(), batches };
    state.sources[source].durationMs = Date.now() - sourceStarted;
    state.sources[source].allocatedMs = allocatedMs;
    donatedMs += Math.max(0, allocatedMs - state.sources[source].durationMs);
    save(state);
  }
  state.endedAt = now();
  state.durationMs = Date.now() - started;
  state.status = stages.some((source) => ["stopped", "manual-action-required"].includes(state.sources[source]?.status)) ? "partial-with-stop" : "partial-or-complete";
  save(state);
  console.log(JSON.stringify({ status: state.status, durationMs: state.durationMs, sources: state.sources, llmCalls: 0 }));
  if (unsafeDropDetected) process.exitCode = 1;
  return state;
}

if (require.main === module) {
  const release = require("./acquisition_retry.js").lock(path.join(__dirname, "safe-backfill.lock"));
  try { run(); } finally { release(); }
}
module.exports = { run, sourceProgress, command, complete, lastJsonLine, batchFailureCount };
