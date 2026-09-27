const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const model = require("../decision-model.js");

const root = path.join(__dirname, "..");
const audit = JSON.parse(fs.readFileSync(path.join(root, "data/purchase-limit-model-audit.json"), "utf8"));
const history = JSON.parse(fs.readFileSync(path.join(root, "data/operational-limit-history.json"), "utf8"));
const catalog = JSON.parse(fs.readFileSync(path.join(root, "data/pokemon-cards.json"), "utf8"));
assert.equal(audit.modelVersion, model.MODEL_VERSION);
assert.equal(history.modelVersion, model.MODEL_VERSION);
assert.equal(audit.catalogCards, catalog.length, "the audit must scan every catalog card");
assert.equal(audit.analyzedCards + audit.notAnalyzable, catalog.length);
assert.equal(audit.rows.length, audit.analyzedCards);
assert.equal(Object.keys(history.cards).length, audit.analyzedCards, "only analyzable cards require published smoothing history");
assert.deepEqual(audit.settings, history.settings, "browser history and audit must use identical settings");
assert.equal(audit.inputDate, history.currentDataDate);
assert(Object.values(history.cards).every((card) => ["clean", "scratch"].every((condition) => {
  const rows = card[condition];
  return Array.isArray(rows) && rows.length > 0 && rows.at(-1).calculationVersion === model.MODEL_VERSION;
})), "both card conditions must have shared history");
assert(audit.rows.every((row) => ["marketCentralExpectedProfit", "marketStressExpectedProfit", "marketPsa9Profit"].every((key) => row[key] == null || Number.isFinite(row[key]))), "market-purchase profit audits must be finite or unavailable");
assert(audit.rows.every((row) => ["centralTargetMaxPrice", "stressBreakEvenMaxPrice", "capitalMaxPrice", "newOperationalLimit"].every((key) => Number.isFinite(row[key]) && row[key] >= 0)), "economic, stress, capital and operational caps remain separate");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
assert(appSource.includes("data/operational-limit-history.json") && !appSource.includes("pokeka-operational-limit-history"), "browsers use the same public smoothing history");
assert(appSource.includes("inspectionRateWhatIf(card)") && appSource.includes("本番判定には不反映"), "visual-screening uplift remains hypothetical");
execFileSync(process.execPath, [path.join(__dirname, "build_purchase_limit_audit.js"), "--verify"], { cwd: root, stdio: "pipe", timeout: 30000 });
console.log(JSON.stringify({ catalogCards: audit.catalogCards, analyzedCards: audit.analyzedCards, historyCards: Object.keys(history.cards).length }));
