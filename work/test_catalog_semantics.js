const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const model = require("../decision-model.js");
const { resolveRelease, lifecycleFlags, classifyPsa9, retryAt } = require("./catalog_semantics");

const root = path.join(__dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const completion = read("data/card-catalog-completion.json");
const index = read("data/card-catalog/index.json");
const queue = read("work/card-completion-queue.json");

const oldRalts = resolveRelease({ name: "ラルトス [SMH 087/131]", setCode: "SMH" });
assert.equal(oldRalts.date, "2018-07-13");
assert.equal(lifecycleFlags({ arrival: { firstSeenAt: "2026-09-07" }, release: oldRalts, now: new Date("2026-09-07T12:00:00Z") }).siteNew, true);
assert.equal(lifecycleFlags({ arrival: { firstSeenAt: "2026-09-07" }, release: oldRalts, now: new Date("2026-09-07T12:00:00Z") }).recentRelease, false, "site addition date must not make an old card recently released");

const recent = resolveRelease({ name: "メガゼラオラex [M5 112/081]", setCode: "M5" });
assert.equal(recent.date, "2026-05-22");
assert.equal(lifecycleFlags({ arrival: null, release: recent, now: new Date("2026-09-07T12:00:00Z") }).recentRelease, true);
assert.equal(lifecycleFlags({ arrival: null, release: recent, now: new Date("2026-09-07T12:00:00Z") }).siteNew, false);

const aggregate = classifyPsa9({ aggregatePrice: 42000, estimatedPrice: 30000 });
assert.equal(aggregate.kind, "aggregate");
assert.equal(aggregate.count, 0, "aggregate price must not count as an individual sale");
const actual = classifyPsa9({ pokedataSummary: { adoptedCount: 4 }, aggregatePrice: 42000 });
assert.equal(actual.kind, "actual");
assert.equal(actual.count, 4);
const estimate = classifyPsa9({ estimatedPrice: 30000 });
assert.equal(estimate.kind, "estimate");

const aggregateAudit = model.resolvePsa9Price({ directPrice: 42000, directKind: "aggregate", directSource: "集計値" });
const legacyAudit = model.resolvePsa9Price({ directPrice: 42000 });
assert.equal(aggregateAudit.value, legacyAudit.value, "PSA9 relabeling must not change the existing calculation value");
assert.equal(aggregateAudit.measurementType, "aggregate");
assert.equal(aggregateAudit.count, 0);

assert.ok(Date.parse(retryAt("2026-09-07T00:00:00Z", 7)) > Date.parse("2026-09-07T00:00:00Z"), "currently-no-data must receive a future retry date");
const noTrade = Object.values(queue.cards).find((row) => row.i?.domesticTrades?.[0] === "定期再確認");
assert.ok(noTrade, "currently-no-trade cards must remain in periodic recheck");
assert.ok(noTrade.i.domesticTrades[5], "periodic recheck must save its next retry time");

assert.equal(completion.summary.siteNewCards, index.cards.filter((row) => row.siteNew).length);
assert.equal(completion.summary.recentReleaseCards, index.cards.filter((row) => row.recentRelease).length);
assert.equal(completion.dataTypeTotals.psa9.actual, completion.itemTotals.psa9Sales.acquired, "PSA9 actual total must only count individual adopted sales");
assert.ok(completion.dataTypeTotals.psa9.actual < completion.dataTypeTotals.psa9.aggregate, "aggregate PSA9 values must not be reported as individual sales");
assert.ok(completion.summary.releaseDateCompletenessPct > 19.2, "set master must materially improve release-date completeness");

const unsupported = Object.values(queue.cards).find((row) => row.pk === "unsupported-or-unconfirmed");
assert.ok(unsupported);
assert.equal(unsupported.i.pokedata[0], "取得不能", "unsupported/unconfirmed PokeDATA rows must not be retried forever");
const sortedPriorities = queue.queue.slice(0, 100).map((id) => queue.cards[id].p);
assert.deepEqual(sortedPriorities, [...sortedPriorities].sort((a, b) => b - a), "priority queue must process the highest score first");

console.log(JSON.stringify({
  siteNew: completion.summary.siteNewCards,
  recentRelease: completion.summary.recentReleaseCards,
  releaseDatePct: completion.summary.releaseDateCompletenessPct,
  releaseKnownPct: completion.summary.releaseKnownCompletenessPct,
  psa9Actual: completion.dataTypeTotals.psa9.actual,
  psa9Aggregate: completion.dataTypeTotals.psa9.aggregate,
  completableAfterNext: completion.summary.completableAfterNext,
  tests: 22,
}, null, 2));
