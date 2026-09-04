const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { nextScheduledAt, percent } = require("./source_observability.js");

const root = path.join(__dirname, "..");
const coverage = JSON.parse(fs.readFileSync(path.join(root, "data", "link-coverage.json"), "utf8"));
const updateStatus = JSON.parse(fs.readFileSync(path.join(root, "data", "update-status.json"), "utf8"));
const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "refresh-all-site-data.yml"), "utf8");
const updater = fs.readFileSync(path.join(root, "work", "update_yuyutei_torecacamp.js"), "utf8");

const stores = coverage.current.storeCoverage.stores;
assert.deepStrictEqual(Object.keys(stores).sort(), ["cardrush", "hareruya2", "torecacamp", "yuyutei"]);
for (const store of Object.values(stores)) {
  for (const field of ["fetchedProducts", "fetchedUniqueCards", "totalCards", "targetCards", "matched", "unmatched", "targetCoveragePct", "totalCoveragePct", "lastSuccessAt", "fetchFailureCount", "mainUnmatchedReasons"]) {
    assert.ok(Object.hasOwn(store, field), `${store.label}: missing ${field}`);
  }
  assert.strictEqual(store.matched + store.unmatched, store.targetCards, `${store.label}: target denominator mismatch`);
  assert.strictEqual(store.targetCoveragePct, percent(store.matched, store.targetCards));
  assert.strictEqual(store.totalCoveragePct, percent(store.matchedAll, store.totalCards));
}

for (const source of Object.values(updateStatus.sources)) {
  for (const field of ["lastAttemptAt", "lastSuccessAt", "durationMs", "status", "acquiredCount", "fetchFailureCount", "nextScheduledAt"]) {
    assert.ok(Object.hasOwn(source, field), `${source.label}: missing ${field}`);
  }
}

assert.strictEqual(nextScheduledAt(new Date("2026-09-03T18:00:00Z")), "2026-09-04T04:30:00+09:00");
assert.strictEqual(nextScheduledAt(new Date("2026-09-04T01:00:00Z")), "2026-09-04T17:00:00+09:00");
assert.match(workflow, /inputs:\s+[\s\S]*source:/);
assert.match(workflow, /SHOP_SOURCE_ONLY: "yuyutei"/);
assert.match(workflow, /SHOP_SOURCE_ONLY: "torecacamp"/);
assert.match(workflow, /continue-on-error: true/);
assert.match(updater, /sourceOnly === "all" \|\| sourceOnly === "yuyutei"/);
assert.match(updater, /sourceOnly === "all" \|\| sourceOnly === "torecacamp"/);

console.log(JSON.stringify({ stores: Object.keys(stores).length, sources: Object.keys(updateStatus.sources).length, phase4: "ok" }));
