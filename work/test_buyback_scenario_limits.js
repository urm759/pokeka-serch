const assert = require("assert");
const fs = require("fs");
const path = require("path");
const model = require("../decision-model.js");

const rows = [
  { shopId: "shop-a", valid: true, stale: false, outlier: false, quarantined: false, buybackPrice: 100000, avg7: 101000, avg30: 103000, observed30: 20, c30: 18, priceDate: "2026-09-20" },
  { shopId: "shop-b", valid: true, stale: false, outlier: false, quarantined: false, buybackPrice: 98000, avg7: 99000, avg30: 102000, observed30: 20, c30: 17, priceDate: "2026-09-20" },
];
const common = {
  rows,
  currentPsa10Price: 120000,
  centralPsa10Price: 105000,
  stressPsa10Price: 75000,
  deductionRate: 3,
  saleFeeRate: 8,
  saleExtraCost: 1000,
  assumptions: { hitRate: 0.72, lowerGradePrice: 42000 },
  fee: 12980,
  minExpectedProfit: 10000,
  minExpectedRoi: 30,
  minAnnualEfficiency: 40,
  lockDays: 91,
  step: 500,
};

const exit = model.conservativeBuybackExit(common);
assert.equal(exit.usable, true);
assert(exit.scenarios.current && exit.scenarios.central && exit.scenarios.stress, "買取出口を3シナリオへ分離");
assert(exit.scenarios.current.grossPrice > exit.scenarios.central.grossPrice);
assert(exit.scenarios.central.grossPrice > exit.scenarios.stress.grossPrice);
assert(exit.scenarios.stress.breakEvenMaxPrice <= exit.scenarios.central.breakEvenMaxPrice, "ストレス損益分岐は中央予測損益分岐を超えない");
assert(exit.scenarios.stress.targetMaxPrice <= exit.scenarios.central.targetMaxPrice, "同条件のストレス目標上限は中央予測目標上限を超えない");
assert.equal(exit.scenarios.central.deductionRate, 3);
assert.equal(exit.scenarios.central.hitRate, 0.72);
assert.equal(exit.scenarios.central.lockDays, 91);

const policy = model.exitPolicyCaps({
  policy: "buyback",
  marketplaceCurrentBreakEvenCap: 80000,
  marketplaceCentralTargetCap: 65000,
  marketplaceStressBreakEvenCap: 45000,
  buyback: exit,
});
assert.equal(policy.centralTargetCap, exit.scenarios.central.targetMaxPrice, "通常上限は中央予測買取出口を使用");
assert.equal(policy.stressBreakEvenCap, exit.scenarios.stress.breakEvenMaxPrice, "安全側上限はストレス買取出口を使用");
assert.notEqual(policy.centralTargetCap, exit.scenarios.stress.targetMaxPrice, "供給ストレス価格を通常上限へ直接混入させない");

const capital = model.capitalPlan({ totalCapital: 900000, lockedCapital: 0, gradingReserve: 129800, submissionCount: 10, fee: 12980 });
const caps = model.purchaseCaps({
  capital,
  economicMaxPrice: policy.centralTargetCap,
  stressBreakEvenMaxPrice: policy.stressBreakEvenCap,
  maxCapitalShare: 20,
});
assert.equal(caps.finalMaxPrice, Math.min(policy.centralTargetCap, policy.stressBreakEvenCap, caps.capitalMaxPrice));
const expectedFactor = caps.capitalMaxPrice < Math.min(policy.centralTargetCap, policy.stressBreakEvenCap)
  ? "capital"
  : policy.stressBreakEvenCap < policy.centralTargetCap ? "stress-break-even" : "normal-economics";
assert.equal(caps.limitingFactor, expectedFactor, "表示する制限理由と最小上限が一致");

const higherCurrent = model.conservativeBuybackExit({ ...common, currentPsa10Price: 130000, centralPsa10Price: 115000, stressPsa10Price: 82000 });
assert(higherCurrent.scenarios.central.targetMaxPrice >= exit.scenarios.central.targetMaxPrice, "PSA10価格上昇時に理由なく上限が下がらない");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const decisionSource = fs.readFileSync(path.join(__dirname, "..", "decision-model.js"), "utf8");
for (const forbidden of ["pk-70080", "pk-70051", "メガサーナイトex MUR", "メガルカリオex MUR"]) {
  assert(!app.includes(forbidden) && !decisionSource.includes(forbidden), `個別カードのハードコード禁止: ${forbidden}`);
}
assert(app.includes("buildBuyLimitScenario(card, condition)"), "新規カードも共通シナリオ計算を使用");
assert(app.includes("decisionModel.MODEL_VERSION"), "判断モデルにバージョン番号を付与");
assert(app.includes("hasMaterialLimitSignalChange"), "25%以上の根拠不明急変を隔離");

const stableHistory = [{
  date: "2026-09-20",
  theoretical: 50000,
  operational: 50000,
  calculationVersion: model.MODEL_VERSION,
}];
const quarantined = model.operationalCap({
  theoreticalCap: 30000,
  history: stableHistory,
  asOfDate: "2026-09-21",
  modelVersion: model.MODEL_VERSION,
  materialDataChange: false,
});
assert.equal(quarantined.operational, 50000, "根拠不明の25%以上急変は前回正常値を保持");
assert.equal(quarantined.quarantinedAbruptChange, true, "急変を要確認へ隔離");
const justified = model.operationalCap({
  theoreticalCap: 30000,
  history: stableHistory,
  asOfDate: "2026-09-21",
  modelVersion: model.MODEL_VERSION,
  materialDataChange: true,
});
assert.equal(justified.operational, 30000, "根拠データ変化がある危険方向の引き下げは即時反映");
const versionedUpdate = model.operationalCap({
  theoreticalCap: 30000,
  history: [{ ...stableHistory[0], calculationVersion: "purchase-decision-v3" }],
  asOfDate: "2026-09-21",
  modelVersion: model.MODEL_VERSION,
  materialDataChange: false,
});
assert.equal(versionedUpdate.operational, 30000, "明示的なモデル更新は日次急変と分離して再計算");

const dailySource = fs.readFileSync(path.join(__dirname, "daily_fast_update.js"), "utf8");
assert(!dailySource.includes("writeFileSync(\"decision-model.js\"") && !dailySource.includes("writeFileSync('decision-model.js'"), "日次更新は判断式を書き換えない");
assert(!dailySource.includes("purchase-decision-model.json"), "日次更新は判断モデル設定を書き換えない");
assert(app.includes("purchase-limit-model-audit.json"), "全カード影響監査JSONを公開画面から確認できる");

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "pokemon-cards.json"), "utf8"));
const completion = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "card-catalog-completion.json"), "utf8"));
assert(Number(completion.summary.listingRatePct) <= 100, "掲載率が100%を超えない");
assert.equal(Number(completion.summary.siteTotal), catalog.length, "カタログ件数と掲載集計が一致");
assert.equal(completion.summary.sourceMatched + completion.summary.unlisted, completion.summary.sourceTotal, "掲載率の分子と未掲載の合計が取得元総数に一致");
const yearTotal = Object.values(completion.summary.releaseYearCounts || {}).reduce((sum, value) => sum + Number(value || 0), 0);
assert.equal(yearTotal, catalog.length, "年別掲載数と発売年不明数の合計がカタログに一致");

const audit = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "purchase-limit-model-audit.json"), "utf8"));
assert.equal(audit.modelVersion, model.MODEL_VERSION, "公開監査JSONのモデル番号が実装と一致");
assert.equal(audit.scope, "分析可能カード・同一最新データで旧式と新式を再計算");
assert.equal(audit.analyzedCards, audit.rows.length, "監査対象件数と行数が一致");
assert.equal(audit.changedLimits, audit.rows.filter((row) => row.oldLimit !== row.newLimit).length);
assert.equal(audit.changedVerdicts, audit.rows.filter((row) => row.oldVerdict !== row.newVerdict).length);
assert.equal(Object.values(audit.verdictChanges).reduce((sum, value) => sum + value, 0), audit.changedVerdicts);
assert(audit.rows.every((row) => Number.isFinite(row.oldLimit) && Number.isFinite(row.newLimit)
  && Number.isFinite(row.newOperationalLimit) && row.oldLimit >= 0 && row.newLimit >= 0
  && row.difference === row.newLimit - row.oldLimit), "全行で上限差額が一致");
assert(audit.rows.every((row) => row.oldLimitingFactor && row.newLimitingFactor && row.operationalLimitingFactor), "理論と運用の制限要因が記録される");
assert(audit.rows.every((row, index) => index === 0
  || Math.abs(audit.rows[index - 1].changeRatePct) >= Math.abs(row.changeRatePct)), "変化率の大きい順に並ぶ");
assert.equal(audit.settings.exitPolicy, "buyback", "買取店優先条件で監査");
assert(!app.includes("/__save_audit"), "一時監査サーバーへの送信処理を公開しない");

console.log(JSON.stringify({ modelVersion: model.MODEL_VERSION, buybackScenarios: exit.scenarios, policy, finalCap: caps.finalMaxPrice }, null, 2));
