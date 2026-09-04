const { spawnSync } = require("child_process");
const path = require("path");
const { ROOT, countCurrentRecords, updateRun } = require("./source_observability.js");

const sourceId = String(process.argv[2] || "").trim();
const script = String(process.argv[3] || "").trim();
if (!sourceId || !script) {
  console.error("usage: node work/run_tracked_update.js <sourceId> <script> [args...]");
  process.exit(2);
}

const startedAt = new Date();
updateRun(sourceId, { lastAttemptAt: startedAt.toISOString(), status: "running" });
const result = spawnSync(process.execPath, [path.resolve(ROOT, script), ...process.argv.slice(4)], {
  cwd: ROOT,
  env: process.env,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

const endedAt = new Date();
const output = `${result.stdout || ""}\n${result.stderr || ""}`;
const fetchFailureCount = [...output.matchAll(/\b(?:failed|failure|error)(?:Count)?\s*(?:[:=]\s*)?(\d+)?/gi)]
  .reduce((total, match) => total + (match[1] === "0" ? 0 : Number(match[1] || 1)), 0)
  + (result.status !== 0 ? 1 : 0);
const status = result.status !== 0 ? "failed" : fetchFailureCount > 0 ? "partial" : "success";
const record = {
  lastAttemptAt: startedAt.toISOString(),
  durationMs: endedAt - startedAt,
  status,
  acquiredCount: countCurrentRecords(sourceId),
  fetchFailureCount,
  lastError: status === "failed" ? String(result.error?.message || result.stderr || `exit ${result.status}`).slice(0, 500) : null,
};
if (status === "success") record.lastSuccessAt = endedAt.toISOString();
updateRun(sourceId, record);
console.log(JSON.stringify({ sourceId, ...record }));
if (status !== "success") process.exit(result.status || 1);
