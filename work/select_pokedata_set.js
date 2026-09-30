const fs = require("node:fs");
const path = require("node:path");
const backfillRate = require("./backfill_rate.js");

const ROOT = path.join(__dirname, "..");
const SET_QUEUE = [
  { setName: "Pokemon Card 151 Japanese", verifiedSourceCount: 516 },
  { setName: "SM-P Promos", verifiedSourceCount: 410 },
];
const DISCOVERY = path.join(__dirname, "pokedata-set-discovery.json");
const SELECTION = path.join(__dirname, "pokedata-set-selection.json");
const ACCESS_HOLD = path.join(__dirname, "pokedata-access-hold.json");
const read = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } };

function activeQueue(manifest, discovery) {
  const unfinished = (row) => {
    const entry = (manifest.sets || []).find((item) => item.setName === row.setName);
    return !entry || Number(entry.sourceCount || 0) <= 0 || Number(entry.linkageCount || 0) < Number(entry.sourceCount);
  };
  const legacy = SET_QUEUE.filter(unfinished);
  const newlyVerified = (discovery.eligible || []).filter((row) => row.status !== "complete"
    && !SET_QUEUE.some((old) => old.setName === row.setName)).slice(0, 2);
  return [...legacy, ...newlyVerified];
}

function selectNextSet(manifest, queue = SET_QUEUE) {
  for (const target of queue) {
    const entry = (manifest.sets || []).find((row) => row.setName === target.setName);
    if (!entry || Number(entry.linkageCount || 0) < Number(entry.sourceCount || target.verifiedSourceCount)) {
      return { ...target, completed: Number(entry?.linkageCount || 0), sourceCount: Number(entry?.sourceCount || target.verifiedSourceCount) };
    }
  }
  return null;
}

if (require.main === module) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "pokedata", "manifest.json"), "utf8"));
  const discovery = read(DISCOVERY, {});
  const accessHold = read(ACCESS_HOLD, null);
  const selection = read(SELECTION, { runs: [] });
  const queue = discovery.status === "success" && !accessHold ? activeQueue(manifest, discovery) : [];
  const selectedAt = new Map((selection.runs || []).map((row) => [row.setName, row.at]));
  queue.sort((a, b) => String(selectedAt.get(a.setName) || "").localeCompare(String(selectedAt.get(b.setName) || "")));
  const next = queue.length ? selectNextSet(manifest, queue) : null;
  const lastSample = [...backfillRate.read().samples].reverse().find((row) => row.source === "pokedata");
  const throttle = backfillRate.settings({ batchSize: 10, intervalMs: 1100 }, lastSample);
  const values = next
    ? `POKEDATA_SET=${next.setName}\nPOKEDATA_SET_CODE=${next.setCode || ""}\nPOKEDATA_TARGET=10000\nPOKEDATA_BATCH=${throttle.batchSize}\nPOKEDATA_INTERVAL_MS=${throttle.intervalMs}\nPOKEDATA_SET_READY=1\n`
    : "POKEDATA_SET_READY=0\n";
  if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, values, "utf8");
  if (next) {
    selection.runs = [...(selection.runs || []), { setName: next.setName, at: new Date().toISOString() }].slice(-30);
    fs.writeFileSync(SELECTION, JSON.stringify(selection), "utf8");
  }
  console.log(next ? `PokeDATA next set: ${next.setName} ${next.completed}/${next.sourceCount || "未取得"}; ${throttle.adjustment} batch=${throttle.batchSize} interval=${throttle.intervalMs}ms`
    : `PokeDATA停止: ${accessHold?.reason || discovery.stopReason || "確認済み日本語セットの待機列なし"}`);
}

module.exports = { activeQueue, selectNextSet, SET_QUEUE };
