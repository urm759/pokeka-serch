const assert = require("node:assert/strict");
const { snapshot, compare } = require("../candidate-availability-audit.js");
const card = (id, price, limit) => ({ id, currentStoreOffer: price ? { value: price, source: "店舗A" } : null,
  buyLimits: { clean: { finalMaxPrice: limit } }, cardrushUrl: "https://example.com/item" });
const flags = (row) => ({ combined: true, now: Boolean(row.currentStoreOffer && row.currentStoreOffer.value <= row.buyLimits.clean.finalMaxPrice) });
const old = snapshot([card("ready", null, 30000), card("wait", 35000, 30000)], flags, "2026-09-30", "2026-09-30T00:00:00Z", "v1");
const next = snapshot([card("ready", 29000, 30000), card("wait", 35000, 30000)], flags, "2026-09-30", "2026-09-30T08:00:00Z", "v1");
assert.deepEqual(old.counts, { combined: 2, now: 0, priceWait: 2, missingOffer: 1, aboveLimit: 1 });
assert.deepEqual(compare(old, next).promotedIds, ["ready"]);
assert.equal(compare(old, next).promoted, 1);
assert.equal(compare(null, next).status, "初回基準・移行比較なし");
assert.equal(compare(old, { ...next, modelVersion: "v2" }).promoted, 0);
console.log("candidate availability transitions passed");
