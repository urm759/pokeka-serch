const assert = require("node:assert/strict");
const fs = require("node:fs");
const { collectSet } = require("./update_psa_official_populations.js");
const { migrateCampRetries } = require("./update_yuyutei_torecacamp.js");
const retry = require("./acquisition_retry.js");

(async () => {
  let closed = 0;
  const context = { newPage: async () => ({ goto: async () => ({ status: () => 503 }), close: async () => { closed++; } }) };
  const failed = await collectSet(context, { name: "Test", setCode: "TEST", url: "https://www.psacard.com/pop/tcg-cards/test" });
  assert.equal(failed.httpStatus, 503); assert.equal(closed, 1);
  assert.equal(retry.failure({}, failed).status, "retry-wait");
  const progress = { failedSitemaps: { 32: { url: "https://shop.test/product.js", stage: "fetch-product", sitemapNumber: 32, productEntry: 537, at: "2026-10-05T23:05:21Z", httpStatus: 503, error: "HTTP 503" } }, currentSitemapIndex: 31, currentEntryIndex: 673 };
  migrateCampRetries(progress, Date.parse("2026-10-06T09:00:00Z"));
  const isolated = progress.retryByUrl["https://shop.test/product.js"];
  assert.equal(isolated.sitemapIndex, 31); assert.equal(isolated.entryIndex, 536);
  assert(retry.eligible(isolated, Date.parse("2026-10-06T09:00:00Z")));
  assert.equal(Object.keys(progress.failedSitemaps).length, 0);
  assert.equal(progress.currentEntryIndex, 673, "failure migration never rewinds normal cursor");
  const script = fs.readFileSync(require.resolve("./acquire_psa_data.ps1"), "utf8");
  assert(script.includes("No newly verified PSA values"));
  assert(script.includes("acquiredCount = $fetchAudit.refreshedCount"));
  assert(!script.includes("PSA_RESUME_AUTH"));
  const { dailyRate } = require("./acquisition_resilience_audit.js");
  const samples = [{ at: "2026-10-05", attempted: 100, newlyVisitedProducts: 20 }, { at: "2026-10-06", attempted: 100, newlyVisitedProducts: 20 }];
  assert.equal(dailyRate(samples, 100, "newlyVisitedProducts").firstPassDaysEstimate, 5);
  assert.equal(dailyRate(samples, 100, "publicNewRecords").firstPassDaysEstimate, null, "no ETA from incompatible units");
  console.log("PSA HTTP failures, partial acquisition counts, and legacy failed-product checkpoint migration: passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
