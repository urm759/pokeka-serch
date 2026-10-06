const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const model = require("../limit-display-model.js");
const decisionModel = require("../decision-model.js");

const now = "2026-09-28T12:00:00+09:00";
const base = {
  limit: {
    currentBreakEvenMaxPrice: 61000,
    finalMaxPrice: 40000,
    hitRate: 77.9,
    exitPolicy: { adoptedPolicy: "marketplace", dataShortage: false },
  },
  psa10Price: 109900,
  domesticPsa10UpdatedAt: "2026-09-27",
  psa9Audit: { value: 46000, estimated: false },
  reason: "供給ストレス損益分岐で制限",
  now,
};

const current = model.summarize(base);
assert.equal(current.currentCap, 61000);
assert.equal(current.stableCap, 40000);
assert.equal(current.gap, 21000);
assert.equal(current.exitLabel, "フリマ");
assert.equal(current.priceDate, "2026-09-27");
assert.equal(current.hitRate, 77.9);
assert.deepEqual(current.warnings, []);
assert.equal(model.validDate("2026-02-30"), null);

const buyback = model.summarize({ ...base, limit: {
  ...base.limit,
  buybackExit: { trustedRows: [{ priceDate: "2026-09-24" }, { priceDate: "2026-09-26" }] },
  exitPolicy: { adoptedPolicy: "buyback" },
} });
assert.equal(buyback.exitLabel, "買取店");
assert.equal(buyback.priceDate, "2026-09-24");

const both = model.summarize({ ...base, limit: {
  ...base.limit,
  buybackExit: { trustedRows: [{ priceDate: "2026-09-25" }] },
  exitPolicy: { adoptedPolicy: "both", buybackCurrentBreakEvenCap: 61000, marketplaceCurrentBreakEvenCap: 65000 },
} });
assert.match(both.exitLabel, /制約: 買取店/);
assert.equal(both.priceDate, "2026-09-25");

const warnings = model.summarize({ ...base, domesticPsa10UpdatedAt: "2026-08-01", psa9Audit: { value: 46000, estimated: true } });
assert.ok(warnings.warnings.some((message) => message.includes("古い")));
assert.ok(warnings.warnings.some((message) => message.includes("PSA9以下は推定値")));
const missing = model.summarize({ ...base, domesticPsa10UpdatedAt: null, psa10Price: 0, limit: { ...base.limit, currentBreakEvenMaxPrice: 0 } });
assert.equal(missing.currentCap, null);
assert.ok(missing.warnings.some((message) => message.includes("更新日未取得")));
assert.equal(model.summarize({ ...base, limit: { ...base.limit, currentBreakEvenMaxPrice: 0, finalMaxPrice: 0 } }).currentCap, 0);
for (const [raw, state, cap] of [[-1,'loss-at-zero',null],[0,'available',0],[499,'available',0],[500,'available',500],[null,'unavailable',null]]) {
  const result=model.summarize({...base,limit:{...base.limit,currentBreakEvenMaxPrice:0,currentBreakEvenRaw:raw}});
  assert.equal(result.currentCapState,state);
  assert.equal(result.currentCap,cap);
}

// The display module must not mutate caps or purchase verdicts.
const original = structuredClone(base.limit);
model.summarize(base);
assert.deepEqual(base.limit, original);
assert.equal(decisionModel.shouldIncludeVerdict("見送り"), false);
assert.equal(decisionModel.shouldIncludeVerdict("価格次第"), true);
const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
assert.ok(!app.includes("psa-market-trial.json"), "undated overseas search cache must not enter current prices");
assert.match(app, /const limitComparison =/);
assert.match(app, /const candidateGlance =/);
assert.match(app, /\$\{priceCells\}/, "paired primary prices remain outside details");
assert.match(app, /detail-limit-comparison">\$\{limitComparison\}/);
console.log("limit display tests passed");
