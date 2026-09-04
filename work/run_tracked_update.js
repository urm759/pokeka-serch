const { spawnSync } = require("child_process");
const path = require("path");
const { ROOT, appendRunHistory, artifactFingerprint, countCurrentRecords, updateRun } = require("./source_observability.js");

const sourceId = String(process.argv[2] || "").trim();
const script = String(process.argv[3] || "").trim();
if (!sourceId || !script) {
  console.error("usage: node work/run_tracked_update.js <sourceId> <script> [args...]");
  process.exit(2);
}

const startedAt = new Date();
const beforeCount = countCurrentRecords(sourceId);
const beforeFingerprint = artifactFingerprint(sourceId);
const configuredTimeoutMs = Number(process.env.TRACKED_TIMEOUT_MS || 0);
const timeoutMs = Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0 ? configuredTimeoutMs : undefined;
updateRun(sourceId, {
  lastAttemptAt: startedAt.toISOString(),
  startedAt: startedAt.toISOString(),
  endedAt: null,
  durationMs: null,
  status: "running",
  timedOut: false,
  terminationReason: null,
  lastError: null,
});
const result = spawnSync(process.execPath, [path.resolve(ROOT, script), ...process.argv.slice(4)], {
  cwd: ROOT,
  env: process.env,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  timeout: timeoutMs,
  killSignal: "SIGTERM",
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

const endedAt = new Date();
const output = `${result.stdout || ""}\n${result.stderr || ""}`;
const timedOut = result.error?.code === "ETIMEDOUT";
const fetchFailureCount = [...output.matchAll(/\b(?:failed|failure|error)(?:Count)?\s*(?:[:=]\s*)?(\d+)?/gi)]
  .reduce((total, match) => total + (match[1] === "0" ? 0 : Number(match[1] || 1)), 0)
  + (result.status !== 0 || timedOut ? 1 : 0);
const status = result.status !== 0 || timedOut ? "failed" : fetchFailureCount > 0 ? "partial" : "success";
const acquiredCount = countCurrentRecords(sourceId);
const afterFingerprint = artifactFingerprint(sourceId);
const dataChanged = afterFingerprint != null && beforeFingerprint !== afterFingerprint;
const countDelta = Number.isFinite(acquiredCount) && Number.isFinite(beforeCount) ? acquiredCount - beforeCount : null;
const updatedMatch = output.match(/(?:updated|更新(?:件数)?)\s*(?:[:=]\s*)?(\d+)/i);
const updatedCount = updatedMatch ? Number(updatedMatch[1]) : Number.isFinite(countDelta) && countDelta > 0 ? countDelta : dataChanged ? null : 0;
const sourceState = status === "failed"
  ? "取得処理失敗"
  : status === "partial"
    ? "一部取得失敗"
    : dataChanged
      ? "取得成功・データ更新あり"
      : "取得成功・データ元更新なし";
const record = {
  lastAttemptAt: startedAt.toISOString(),
  startedAt: startedAt.toISOString(),
  endedAt: endedAt.toISOString(),
  durationMs: endedAt - startedAt,
  status,
  acquiredCount,
  updatedCount,
  dataChanged,
  sourceState,
  fetchFailureCount,
  timedOut,
  terminationReason: timedOut ? "timeout" : result.signal ? `signal:${result.signal}` : null,
  lastError: status === "failed"
    ? String(timedOut ? `取得処理が${Math.round(timeoutMs / 1000)}秒でタイムアウトしました` : result.error?.message || result.stderr || `exit ${result.status}`).slice(0, 500)
    : null,
};
if (status === "success") record.lastSuccessAt = endedAt.toISOString();
updateRun(sourceId, record);
appendRunHistory(sourceId, record);
console.log(JSON.stringify({ sourceId, ...record }));
if (status !== "success") process.exit(result.status || 1);
