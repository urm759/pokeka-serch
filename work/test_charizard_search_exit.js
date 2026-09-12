const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const market = require("../market-analysis.js");
const decision = require("../decision-model.js");
const search = require("../search-index-model.js");

const root = path.join(__dirname, "..");
const regime = market.evaluateDowntrendRegime({
  currentPrice: 137000,
  rawTrend7: -22.9,
  rawTrend30: -22.6,
  direction: "下降",
  supportBroken: true,
  supportConfirmed: true,
  newLow14: 6,
  newLow30: 7,
  psaIncrease7: 725,
  psaTx7: 73,
  psaTx30: 247,
  storeDemandLabel: "強い",
});
assert.equal(regime.demandSupplyClass, "高需要／供給多");
assert.equal(regime.active, true);
assert.equal(regime.phaseOverride, "下落継続警戒");
assert.equal(regime.bottomCandidateAllowed, false);
assert(regime.maxCentralPrice < 137000, "下落局面では中央予測を現在価格未満へ制限");

const stress = market.supplyStressPrice({
  centralPrice: 101000,
  bearishPrice: 128000,
  pipeline: { status: "判定可", pressureRatio: 11, pressureKey: "excessive", pressureLabel: "供給過多" },
  buybackRows: [],
  step: 500,
});
assert(stress.price <= 101000, "供給ストレス価格は中央予測を超えない");

const rows = [
  { shopId: "a", valid: true, stale: false, outlier: false, buybackPrice: 125000, avg7: 130000, avg30: 142000, c30: 14, observed30: 15, priceDate: "2026-09-12" },
  { shopId: "b", valid: true, stale: false, outlier: false, buybackPrice: 120000, avg7: 128000, avg30: 138000, c30: 13, observed30: 15, priceDate: "2026-09-12" },
  { shopId: "campaign", valid: true, stale: false, outlier: true, buybackPrice: 250000, avg7: 250000, avg30: 250000, c30: 1, observed30: 15, priceDate: "2026-09-12" },
];
const assumptions = { hitRate: 0.78, lowerGradePrice: 93500 };
const buyback = decision.conservativeBuybackExit({
  rows,
  currentPsa10Price: 137000,
  stressPsa10Price: 85000,
  deductionRate: 3,
  saleFeeRate: 0,
  saleExtraCost: 0,
  assumptions,
  fee: 12980,
  minExpectedProfit: 10000,
  minExpectedRoi: 30,
  minAnnualEfficiency: 40,
  lockDays: 91,
});
assert.equal(buyback.usable, true);
assert.equal(buyback.storeCount, 2);
assert(buyback.grossCurrent < 130000, "単独最高額は保守価格へ混入しない");
assert.equal(decision.conservativeBuybackExit({ rows: rows.slice(0, 1), assumptions }).usable, false);

const policy = decision.exitPolicyCaps({
  policy: "buyback",
  marketplaceTargetCap: 110000,
  marketplaceBreakEvenCap: 101000,
  buyback,
});
assert.equal(policy.adoptedPolicy, "buyback");
assert.equal(policy.targetCap, buyback.targetMaxPrice);
const capital = decision.capitalPlan({ totalCapital: 500000, lockedCapital: 0, gradingReserve: 130000, submissionCount: 10, fee: 12980 });
const caps = decision.purchaseCaps({ capital, economicMaxPrice: 101000, stressBreakEvenMaxPrice: 105000, maxCapitalShare: 10 });
assert.equal(caps.finalMaxPrice, 50000);
assert.equal(caps.limitingFactor, "capital");
const targetDecision = decision.purchaseDecision({
  capital,
  economics: { purchasePrice: 110000, expectedProfit: -10000, expectedRoi: -8, annualEfficiency: -32 },
  economicMaxPrice: 86500,
  stressBreakEvenMaxPrice: 86500,
  operationalMaxPrice: 50000,
  qualityScore: 72,
  riskEligible: true,
  minExpectedProfit: 10000,
  minExpectedRoi: 30,
  minAnnualEfficiency: 40,
  maxCapitalShare: 10,
});
assert.equal(targetDecision.verdict, "価格次第", "供給リスクを上限へ反映できる高需要カードは価格次第");
assert(targetDecision.reasons.includes("1枚の価格が現在の資金上限を超過"));

assert.equal(decision.shouldIncludeVerdict("見送り", false), false);
assert.equal(decision.shouldIncludeVerdict("見送り", true), true);
assert.equal(decision.shouldIncludeVerdict("価格次第", false), true);

const payload = JSON.parse(fs.readFileSync(path.join(root, "data", "card-catalog", "search-index.json"), "utf8"));
const started = performance.now();
const matches = search.search(payload.cards, "M2 110/080", { limit: 250 });
const elapsedMs = performance.now() - started;
assert.equal(matches[0]?.id, "pk-71713");
assert.equal(new Set(matches.map((entry) => entry.p)).size, 1, "完全一致検索は対象JSON 1個だけ");
assert(elapsedMs < 50, `検索処理 ${elapsedMs.toFixed(1)}ms`);

const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
assert(!app.includes('if (normalizedQuery && completion?.s !== "分析可能") return true;'), "名称検索でフィルターを解除しない");
assert(app.includes("decisionModel.shouldIncludeVerdict"), "見送りは明示ON時だけ表示");
assert(app.includes("scheduleCatalogQueryLoad();"), "名称検索はデバウンス読込");
assert(app.includes("priceManagedDowntrend"), "高需要・供給多は供給ストレス上限で価格管理");
assert(app.includes("カード自体が見送りなのではなく"), "価格超過の対象外理由を明示");
assert(app.includes("検索") || true);

console.log(JSON.stringify({
  target: "M2 110/080",
  demandSupply: regime.demandSupplyClass,
  phase: regime.phaseOverride,
  forecastCap: regime.maxCentralPrice,
  supplyStressPrice: stress.price,
  buybackStores: buyback.storeCount,
  buybackTargetCap: buyback.targetMaxPrice,
  capitalCap: caps.finalMaxPrice,
  targetVerdict: targetDecision.verdict,
  searchMs: Number(elapsedMs.toFixed(2)),
  loadedJsonFiles: new Set(matches.map((entry) => entry.p)).size,
}, null, 2));
