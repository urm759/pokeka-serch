const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { build, observation } = require("./focus_monitor.js");
const root = path.join(__dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const baseline = (file) => {
  const result = spawnSync("git", ["show", `HEAD:${file}`], { cwd: root, encoding: "utf8", maxBuffer: 30000000 });
  if (result.status) throw new Error(result.stderr);
  return JSON.parse(result.stdout);
};
const focus = build(root);
const before = baseline("data/psa-population-summary.json").cards || {};
const after = read("data/psa-population-summary.json").cards || {};
const now = Date.now();
const valid = (v) => v && v.ten != null && Number(v.total) > 0 && Number(v.ten) >= 0 && Number(v.ten) <= Number(v.total);
const oldShop = baseline("data/hareruya2-stock-summary.json").cards || {};
const newShop = read("data/hareruya2-stock-summary.json").cards || {};
const shopFresh = (v) => v && (v.available === true || Number(v.stock) > 0) && observation(v.hareruya2Price, v.updatedAt, now, 48).fresh;
const payload = { baselineCommit: spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim(), observedAt: new Date(now).toISOString(),
  scope: "今回開始時の公開mainと比較。鮮度回復と新規有効POPを区別。前回からの累積取得監査とは別。",
  globalValidPopulationBefore: Object.values(before).filter(valid).length, globalValidPopulationAfter: Object.values(after).filter(valid).length,
  focusPopulationFreshBefore: focus.ids.filter((id) => valid(before[id]) && observation(before[id].total, before[id].f, now, 48).fresh).length,
  focusPopulationFreshAfter: focus.totals.psaPopulation.fresh,
  focusHareruyaFreshBefore: focus.ids.filter((id) => shopFresh(oldShop[id])).length,
  focusHareruyaFreshAfter: focus.ids.filter((id) => shopFresh(newShop[id])).length,
  completion: read("data/completion-acquisition.json"), psa: read("work/psa-fetch-progress.json"),
  llmCalls: 0, codexCalls: 0 };
payload.populationUsableNet = payload.globalValidPopulationAfter - payload.globalValidPopulationBefore;
fs.writeFileSync(path.join(root, "data/focus-acquisition-audit.json"), JSON.stringify(payload));
console.log(JSON.stringify({ ...payload, completion: { attempted: payload.completion.attempted, acquired: payload.completion.acquired, newAcquired: payload.completion.newAcquired }, psa: { sets: payload.psa.attemptedCount, rows: payload.psa.refreshedCount, durationMs: payload.psa.durationMs } }));
