const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { build } = require("./build_supply_maturity_hypothesis");

const cards = [
  { id: "old-demand", name: "Old", p10tv30: 20, p10tv7: 5 },
  { id: "old-idle", name: "Idle", p10tv30: 0, tv30: 0 },
  { id: "new-demand", name: "New", p10tv30: 30 },
];
const index = { cards: [
  { id: "old-demand", releaseDate: "2020-01-01" },
  { id: "old-idle", releaseDate: "2020-01-01" },
  { id: "new-demand", releaseDate: "2026-08-01" },
] };
const result = build(cards, index, { cards: { "old-demand": { supportBroken: true } } },
  { cards: {} }, { outcomes: [], exitReadiness: { nextEligibleDate: "2026-12-01" } }, "2026-09-30");
assert.equal(result.counts.hypothesis, 1);
assert.equal(result.counts.comparison, 1);
assert.equal(result.counts.supplyWarningAmongHypothesis, 1);
assert.equal(result.examples[0].outOfPrintStatus, "公式の販売終了・再販停止は未確認");
assert.equal(result.examples[0].limitImpact, "なし");
assert.match(result.returnDateBacktest.status, /蓄積中/);
assert.equal(result.returnDateBacktest.hypothesis.evaluated, 0);

const model = fs.readFileSync(path.join(__dirname, "..", "decision-model.js"), "utf8");
const hypothesis = fs.readFileSync(path.join(__dirname, "build_supply_maturity_hypothesis.js"), "utf8");
assert(!model.includes("supply-maturity-hypothesis"));
assert(!hypothesis.includes("writeFileSync(path.join(ROOT, \"data\", \"pokemon-cards.json\")"));
console.log("Supply maturity remains a separate unverified reference and does not change limits");
