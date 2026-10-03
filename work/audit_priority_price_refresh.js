const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { load, plan } = require("./priority_price_queue.js");
const root = path.join(__dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const ref = process.env.PRICE_REFRESH_AUDIT_REF || process.argv[2];
if (!ref) throw new Error("Provide a verified pre-refresh Git reference; no fabricated baseline");
const beforeCatalog = JSON.parse(execFileSync("git", ["show", `${ref}:work/hareruya2_catalog.json`], { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }));
const now = Date.now(), currentPlan = load("hareruya2", root, now);
const fixedCohort = new Set(currentPlan.records.filter((r) => r.important).map((r) => r.card.id));
const before = plan({ cards: read("data/pokemon-cards.json"), sourceId: "hareruya2", catalog: beforeCatalog,
  candidateRows: Object.fromEntries([...fixedCohort].map((id) => [id, {}])), config: read("data/priority-price-config.json"), now });
const byId = new Map(beforeCatalog.filter((row) => row.cardId).map((row) => [row.cardId, row]));
const byUrl = new Map(beforeCatalog.map((row) => [row.detailUrl, row]));
const current = read("work/hareruya2_catalog.json"), currentId = new Map(current.map((row) => [row.cardId, row])), currentUrl = new Map(current.map((row) => [row.detailUrl, row]));
const run = read("work/candidate-shop-refresh.json").sources.hareruya2;
const rows = run.records.map((record) => {
  const old = byId.get(record.id) || byUrl.get(record.url), next = currentId.get(record.id) || currentUrl.get(record.url);
  return { id: record.id, status: record.status, reason: record.error || null, important: record.important,
    before: { price: old?.price ?? null, stock: old?.stock ?? null, at: old?.observedAt || null },
    after: { price: next?.price ?? null, stock: next?.stock ?? null, at: next?.observedAt || null },
    failureKeptNormalValue: record.status === "verified" ? null : old?.price === next?.price && old?.observedAt === next?.observedAt };
});
const output = { version: 1, generatedAt: new Date().toISOString(), baselineRef: ref, fixedCohortSize: fixedCohort.size,
  importantOverdueBefore: before.records.filter((r) => fixedCohort.has(r.card.id) && r.due).length,
  importantOverdueAfter: currentPlan.records.filter((r) => fixedCohort.has(r.card.id) && r.due).length,
  attempted: run.attemptedCount, refreshed: run.refreshedCount, changed: run.changedCount, failed: run.failedCount,
  newAcquired: run.newAcquiredCount, newLinked: run.newLinkedCount,
  validValuesNet: rows.reduce((sum, r) => sum + Number(r.after.price > 0) - Number(r.before.price > 0), 0),
  durationMs: run.durationMs, httpRequests: run.httpRequests, cacheHits: run.cacheHits, nextId: run.nextId, stopReason: run.stopReason,
  rows, note: `同じ現在の優先カード群・同じ時刻で再計算。基準Git後の他実行も含む鮮度比較と、今回${run.attemptedCount}試行${run.refreshedCount}再確認を混同しない。期限超過解消は新規有効値追加ではない。` };
fs.writeFileSync(path.join(root, "data/priority-price-impact.json"), JSON.stringify(output));
console.log(JSON.stringify({ ...output, rows: undefined }));
