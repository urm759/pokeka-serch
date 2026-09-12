const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const NODE = process.execPath;
const startedAt = Date.now();

function run(script, env = {}) {
  const result = spawnSync(NODE, [path.join(ROOT, script)], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: Math.max(30000, Number(process.env.DAILY_RUNTIME_LIMIT_MS || 540000)),
  });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout || "" };
}

function parseResult(output, prefix) {
  const line = String(output).split(/\r?\n/).find((row) => row.startsWith(prefix));
  return line ? JSON.parse(line.slice(prefix.length).trim()) : null;
}

function parseLastJsonLine(output) {
  const lines = String(output).trim().split(/\r?\n/).reverse();
  for (const line of lines) {
    if (!line.startsWith("{")) continue;
    try { return JSON.parse(line); } catch { /* Keep looking. */ }
  }
  return null;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function main() {
  const source = run("work/update_pokemon_site.js", { FAST_UPDATE: "1", SNKR_BATCH: "0" });
  if (source.status !== 0) throw new Error(`みんトレ差分取得に失敗しました（exit ${source.status}）`);
  const sourceMetrics = parseResult(source.stdout, "FAST_UPDATE_RESULT ");
  if (!sourceMetrics) throw new Error("差分取得メトリクスを読み取れませんでした");
  if (!sourceMetrics.changed) {
    console.log(`DAILY_FAST_RESULT ${JSON.stringify({ ...sourceMetrics, runClass: "高速更新", committed: false })}`);
    return;
  }

  const changedFile = "work/changed-card-ids.json";
  run("work/build_market_analysis.js", { CHANGED_CARD_IDS_PATH: changedFile });
  const chunkResult = run("work/update_changed_catalog_chunks.js");
  let regeneratedFiles = sourceMetrics.regeneratedFiles || 0;
  if (chunkResult.status === 2) {
    const full = run("work/build_card_completion.js");
    if (full.status !== 0) throw new Error("全カードカタログの再生成に失敗しました");
    regeneratedFiles += 51;
  } else if (chunkResult.status !== 0) {
    throw new Error("変更チャンクの再生成に失敗しました");
  } else {
    const chunkMetrics = parseLastJsonLine(chunkResult.stdout) || {};
    regeneratedFiles += Number(chunkMetrics.regeneratedFiles || 0);
  }
  run("work/build_market_backtest.js");

  const metrics = {
    version: 1,
    updatedAt: new Date().toISOString(),
    runClass: "高速更新",
    processedCards: sourceMetrics.processedCards,
    changedCards: sourceMetrics.changedCards,
    httpRequests: sourceMetrics.httpRequests,
    cacheHits: sourceMetrics.cacheHits,
    cacheRatePct: sourceMetrics.httpRequests > 0 ? Number((sourceMetrics.cacheHits / sourceMetrics.httpRequests * 100).toFixed(1)) : null,
    durationMs: Date.now() - startedAt,
    regeneratedFiles,
    checkpoint: changedFile,
    llmCalls: 0,
    codexCalls: 0,
  };
  writeJson(path.join(ROOT, "data", "update-performance.json"), metrics);
  run("work/finalize_update_status.js");
  console.log(`DAILY_FAST_RESULT ${JSON.stringify({ ...metrics, committed: true })}`);
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message || error);
  process.exit(1);
}
