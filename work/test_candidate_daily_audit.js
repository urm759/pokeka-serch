const assert = require("assert");
const model = require("../candidate-daily-audit.js");

const settings = { modelVersion: "test-v1", minRawTrades30: 30, minRoi: 40, maxPsa10: 200000 };
const completion = { cards: Object.fromEntries(["price", "capital", "profit", "data", "inventory", "search", "steady"].map((id) => [id, { s: "分析可能" }])) };
const flags = (card) => ({ combined: card.combined, now: card.now, stressSafe: card.stressSafe });
const base = (id) => ({ id, combined: true, now: true, stressSafe: true, saleTx30d: 50, roi: 60, psa10: 100000,
  torecaPrice: 40000, price: 40000, buyLimits: { clean: { finalMaxPrice: 35000, capitalMaxPrice: 50000 } },
  purchaseDecision: { verdict: "GO" }, currentStoreOffer: { value: 34000 } });
const before = ["price", "capital", "profit", "data", "inventory", "search", "steady"].map(base);
const after = before.map((card) => ({ ...card }));
after[0].combined = false; after[0].torecaPrice = 45000; after[0].stressSafe = false;
after[1].combined = false; after[1].purchaseDecision = { verdict: "資金不足" };
after[2].combined = false; after[2].stressSafe = false;
after[3].combined = false; after[3].dataQuality = { manualReview: true };
after[4].now = false; after[4].currentStoreOffer = null;
after[5].saleTx30d = 20;
const old = model.snapshot(before, flags, completion, settings, "2026-09-27");
const current = model.snapshot(after, flags, completion, settings, "2026-09-28");
const comparison = model.compare(old, current);
assert.equal(comparison.sameSettings, true);
assert.equal(comparison.isPreviousDay, true);
assert.equal(model.compare(old, { ...current, date: "2026-09-29" }).isPreviousDay, false);
assert.equal(model.compare(old, { ...current, date: "2026-09-29" }).status, "直近保存日比較（前日データなし）");
assert.equal(comparison.sameCardCount, 7);
assert.equal(comparison.lostCount, 5);
assert.equal(comparison.exclusion.capital, 1);
assert.equal(comparison.exclusion.profit, 2);
assert.equal(comparison.exclusion.data, 1);
assert.equal(comparison.exclusion.search, 1);
assert.equal(comparison.newlyFailed.profit, 2);
assert.equal(comparison.preexisting.profit, 0);
assert.equal(comparison.lost.find((row) => row.id === "price").newlyFailed.includes("profit"), true);
assert.equal(comparison.lost.find((row) => row.id === "price").before.expectedProfit, null);
assert.equal(comparison.lost.find((row) => row.id === "price").after.store, 34000);
const waitingBefore = model.snapshot([{ ...base("waiting"), now: false, currentStoreOffer: null }], flags,
  { cards: { waiting: { s: "分析可能" } } }, settings, "2026-09-27");
const waitingAfter = model.snapshot([{ ...base("waiting"), combined: false, now: false, currentStoreOffer: null, stressSafe: false }], flags,
  { cards: { waiting: { s: "分析可能" } } }, settings, "2026-09-28");
assert.deepEqual(model.compare(waitingBefore, waitingAfter).lost[0].newlyFailed, ["profit"]);
assert.deepEqual(model.compare(waitingBefore, waitingAfter).lost[0].preexisting, ["inventory"]);
const qualityAfter = model.snapshot([{ ...base("waiting"), combined: false, now: false, currentStoreOffer: null,
  purchaseDecision: { verdict: "見送り", reasons: ["銘柄品質60点未満（53/100）"] } }], flags,
  { cards: { waiting: { s: "分析可能" } } }, settings, "2026-09-28");
assert.deepEqual(model.compare(waitingBefore, qualityAfter).lost[0].newlyFailed, ["quality"]);
assert.deepEqual(model.compare(waitingBefore, qualityAfter).lost[0].preexisting, ["inventory"]);
assert.equal(comparison.priceChangedAmongLost, 1);
assert.equal(comparison.inventoryLostFromNow, 1);
assert.equal(model.compare(null, current).sameSettings, false);
assert.equal(model.compare(old, { ...current, settings: { ...settings, minRoi: 50 } }).sameSettings, false);
console.log(JSON.stringify({ lost: comparison.lostCount, priceChanged: comparison.priceChangedAmongLost, reasons: comparison.exclusion }));
