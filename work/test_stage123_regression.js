const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const decisionModel = fs.readFileSync(path.join(root, "decision-model.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const implementation = `${app}\n${decisionModel}`;

for (const preset of ["combined", "now", "low-risk", "turnover", "bargain"]) {
  assert.ok(html.includes(`data-preset="${preset}"`), `既存プリセット ${preset} を維持`);
}
for (const parameter of ["filterExpRoi", "filterExpProfit", "preset", "riskMode"]) {
  assert.ok(app.includes(`"${parameter}"`), `URLパラメータ ${parameter} を維持`);
}
for (const label of [
  "現在仕入値 ¥",
  "現在PSA10相場 ¥",
  "中央予測 ¥",
  "供給ストレス ¥",
  "運用上限 ¥",
  "相場基準では仕入れ圏",
  "購入先確認済み／今すぐ仕入れ",
]) {
  assert.ok(implementation.includes(label), `表示 ${label} を維持`);
}
assert.ok(app.includes("card.purchaseAvailability?.verifiedNow === true"), "今すぐ仕入れは購入先確認済みだけを使用");
assert.ok(app.includes("decisionModel.bargainDecisionEligible"), "薄商い・高粗利へ最終判定ゲートを適用");
assert.ok(app.includes("主因: ${dominantFactorLabel}"), "同一運用上限の集中理由を監査表示");
assert.ok(app.includes("economicsScenarioMatrix"), "6シナリオを共通計算で生成");
assert.ok(app.includes("String(row.date).slice(0, 10) < currentDataDate"), "同日値を過去の運用上限として平滑化しない");
assert.ok(html.includes("期待利益が高い順（現在仕入値×中央予測）"), "期待利益の並び順シナリオを明記");
assert.ok(html.includes("現在仕入値 × 中央予測"), "期待利益フィルターのシナリオを明記");

console.log(JSON.stringify({
  presets: ["combined", "now", "low-risk", "turnover", "bargain"],
  urlParameters: ["filterExpRoi", "filterExpProfit", "preset", "riskMode"],
  scenarioMatrix: "current/limit x market/central/stress",
  nowRule: "fresh in-stock offer at or below operational limit",
  bargainRule: "provisional GO or conditional only",
}, null, 2));
