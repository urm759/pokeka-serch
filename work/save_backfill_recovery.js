const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..");
const read = (file, fallback = null) => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
};

const source = process.argv[2];
if (!["safe", "pokedata", "daily", "priority-prices"].includes(source)) throw new Error("unknown backfill source");
const file = path.join(ROOT, "data", "backfill-recovery.json");
const previous = read(file, { sources: {} });
const progressFiles = fs.readdirSync(__dirname).filter((name) => /^pokedata-progress(?:-.*)?\.json$/.test(name));
const checkpoint = ["daily", "priority-prices"].includes(source) ? { daily: read(path.join(__dirname, "daily-fast-update-metrics.json")),
    priority: read(path.join(__dirname, "priority-price-checkpoint.json")),
    shops: read(path.join(__dirname, "candidate-shop-refresh.json")),
    runs: read(path.join(__dirname, "source-update-runs.json")) }
  : source === "safe"
  ? read(path.join(__dirname, "safe-backfill-progress.json"), {})
  : { hold: read(path.join(__dirname, "pokedata-access-hold.json")),
      sets: progressFiles.map((name) => ({ file: name, progress: read(path.join(__dirname, name), {}) })) };
const failureDetail = source === "safe"
  ? Object.values(checkpoint.sources || {}).find((stage) => ["stopped", "stalled"].includes(stage.status) && stage.reason)?.reason || null
  : checkpoint.hold?.reason || checkpoint.sets?.map((row) => row.progress.lastFailure?.error).find(Boolean) || null;
previous.sources[source] = { savedAt: new Date().toISOString(), workflowRunId: process.env.GITHUB_RUN_ID || null,
  reason: "更新処理または公開前テスト失敗。前回の正常データは保持", failureDetail, checkpoint };
fs.writeFileSync(`${file}.tmp`, JSON.stringify(previous), "utf8");
fs.renameSync(`${file}.tmp`, file);
console.log(JSON.stringify({ source, recovery: file, workflowRunId: process.env.GITHUB_RUN_ID || null }));
