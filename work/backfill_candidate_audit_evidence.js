const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const SOURCE_COMMIT = "21e3b66";
const HISTORY = path.join(__dirname, "candidate-daily-history.json");
const history = JSON.parse(fs.readFileSync(HISTORY, "utf8"));
const oldAudit = JSON.parse(execFileSync("git", ["show", `${SOURCE_COMMIT}:data/purchase-limit-model-audit.json`],
  { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }));
if (oldAudit.inputDate !== "2026-09-28") throw new Error("Historic audit date differs from the saved candidate baseline");
const baseline = history.days.find((day) => day.date === oldAudit.inputDate);
if (!baseline || baseline.modelVersion !== oldAudit.modelVersion) throw new Error("Historic candidate model differs from the audited model");
const auditById = new Map(oldAudit.rows.map((row) => [row.cardId, row]));
baseline.details ||= {};
let restored = 0;
for (const [id, values] of Object.entries(baseline.rows)) {
  if (baseline.details[id]) continue;
  const audit = auditById.get(id);
  const profit = audit?.marketCentralExpectedProfit;
  const purchase = audit?.marketPurchasePrice;
  if (profit == null || purchase == null || !Number.isFinite(Number(profit))
    || Math.abs(Number(purchase) - Number(values[7])) > 1) continue;
  const investment = Number(purchase) + Number(baseline.settings.fee || 0) + Number(baseline.settings.saleExtraCost || 0);
  baseline.details[id] = {
    expectedProfit: Number(profit), expectedRoi: investment > 0 ? Number(profit) / investment * 100 : null,
    calculationBasis: "基準相場で購入 × 中央予測（旧監査から復元）",
    exit: audit.exitPolicy || null, storeSource: null, storeUpdatedAt: null,
    stressAtLimitProfit: audit.supplyStressExpectedProfit ?? null,
    verdict: audit.currentDisplayedVerdict || null, verdictReasons: [],
    evidence: `公開済み仕入れ上限監査 ${SOURCE_COMMIT} から復元。店舗名と判定理由は当時未記録`,
  };
  restored += 1;
}
const target = `${HISTORY}.tmp`;
fs.writeFileSync(target, JSON.stringify(history), "utf8");
fs.renameSync(target, HISTORY);
console.log(JSON.stringify({ sourceCommit: SOURCE_COMMIT, date: baseline.date, restored,
  rayquaza: baseline.details["pk-14728"] || null }));
