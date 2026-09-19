const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const finalizer = fs.readFileSync(path.join(root, "work", "finalize_update_status.js"), "utf8");
const fast = fs.readFileSync(path.join(root, "work", "daily_fast_update.js"), "utf8");
const market = fs.readFileSync(path.join(root, "market-analysis.js"), "utf8");

assert.match(index, /data-preset="curated"/);
assert.match(index, /おまかせ総合に攻め候補を含める/);
assert.match(app, /const curated = combinedEligible/);
assert.match(app, /const broadEligible = catalogReady/);
assert.match(app, /renderPresetAudit\(calculated\)/);
assert.match(market, /高回転だが価格下落警戒/);
assert.match(app, /自動更新なし/);
assert.match(finalizer, /sourceTiming/);
assert.match(fast, /externalFetchedCards/);
assert.match(fast, /recalculatedCards/);
assert.match(fast, /unchangedCards/);

console.log(JSON.stringify({ refreshDemandUi: "ok" }));
