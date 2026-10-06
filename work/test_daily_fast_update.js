const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const daily = fs.readFileSync(path.join(__dirname, "daily_fast_update.js"), "utf8");
const update = fs.readFileSync(path.join(__dirname, "update_pokemon_site.js"), "utf8");
const market = fs.readFileSync(path.join(__dirname, "build_market_analysis.js"), "utf8");
const fastWorkflow = fs.readFileSync(path.join(ROOT, ".github", "workflows", "daily-fast-update.yml"), "utf8");
const backfillWorkflow = fs.readFileSync(path.join(ROOT, ".github", "workflows", "backfill-data.yml"), "utf8");
const safeBackfillWorkflow = fs.readFileSync(path.join(ROOT, ".github", "workflows", "safe-checkpoint-backfill.yml"), "utf8");
const deepResolveWorkflow = fs.readFileSync(path.join(ROOT, ".github", "workflows", "resolve-unmatched-cards.yml"), "utf8");
const fullWorkflow = fs.readFileSync(path.join(ROOT, ".github", "workflows", "refresh-all-site-data.yml"), "utf8");

assert(update.includes('response.status === 304'));
assert(update.includes('content hash unchanged'));
assert(update.includes('FAST_DEEP_SCAN === "1"'));
assert(update.includes('みんトレ掲載数急減'));
assert(update.indexOf('fs.writeFileSync(HTTP_CACHE_PATH') > update.indexOf('fs.writeFileSync(jsonPath'), "HTTPキャッシュは更新成功後に確定する");
assert(update.includes('changed-card-ids.json'));
assert(market.includes('CHANGED_CARD_IDS_PATH'));
assert(market.includes('targetCards'));
assert(daily.includes('llmCalls: 0'));
assert(daily.includes('codexCalls: 0'));
assert(daily.includes('if (!sourceMetrics.changed)'));
assert(fastWorkflow.includes('30 19 * * *'));
assert(fastWorkflow.includes('0 8 * * *'));
assert(fastWorkflow.includes("github.event.schedule == '30 19 * * *'"));
assert(!backfillWorkflow.includes('update_yuyutei_torecacamp.js'), "05:30はPokeDATA専用");
assert(backfillWorkflow.includes('run_pokedata_backfill.js'));
assert(fs.readFileSync('work/run_pokedata_backfill.js', 'utf8').includes('update_pokedata_batch.js'));
assert(safeBackfillWorkflow.includes('0 17 * * *') && safeBackfillWorkflow.includes('run_safe_backfill.js'), "02:00が店舗巡回を担当");
assert(!deepResolveWorkflow.includes('update_yuyutei_torecacamp.js'), "09:00に店舗を重複巡回しない");
assert(!fullWorkflow.includes('schedule:'), "巨大な全件更新は日次スケジュールから外す");
assert(!/openai|anthropic|gemini|llm/i.test(fastWorkflow), "高速更新にLLMを含めない");

console.log("daily fast update separation tests passed");
