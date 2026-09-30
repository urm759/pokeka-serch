const fs = require("node:fs");
const path = require("node:path");
const FILE = path.join(__dirname, "backfill-rate-history.json");

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return { version: 1, samples: [] }; }
}
function transient(sample) {
  return sample?.httpStatus === 429 || sample?.httpStatus >= 500 && sample?.httpStatus < 600
    || /timeout|timed? out|ETIMEDOUT|AbortError|HTTP 429|HTTP 5\d\d/i.test(sample?.error || "");
}
function settings(base, lastSample) {
  if (!transient(lastSample) || lastSample?.manualHold || !(base.batchSize > 0) || !(base.intervalMs > 0))
    return { ...base, adjustment: "none" };
  return { ...base, batchSize: Math.max(2, Math.ceil(base.batchSize / 2)),
    intervalMs: Math.min(5000, Math.max(2000, base.intervalMs * 2)),
    adjustment: "transient-backoff" };
}
function record(sample) {
  const history = read();
  if (history.samples.some((row) => row.key === sample.key)) return history;
  history.samples = [...history.samples, { ...sample,
    failureRate: sample.attempted > 0 ? Math.round(sample.failed / sample.attempted * 10000) / 100 : null,
  }].slice(-180);
  fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(history), "utf8");
  fs.renameSync(`${FILE}.tmp`, FILE);
  return history;
}
module.exports = { FILE, read, record, settings, transient };
