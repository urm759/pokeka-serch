const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const daily = fs.readFileSync(path.join(__dirname, "daily_fast_update.js"), "utf8");
const update = fs.readFileSync(path.join(__dirname, "update_pokemon_site.js"), "utf8");
const market = fs.readFileSync(path.join(__dirname, "build_market_analysis.js"), "utf8");
const fastWorkflow = fs.readFileSync(path.join(ROOT, ".github", "workflows", "daily-fast-update.yml"), "utf8");
const backfillWorkflow = fs.readFileSync(path.join(ROOT, ".github", "workflows", "backfill-data.yml"), "utf8");
const fullWorkflow = fs.readFileSync(path.join(ROOT, ".github", "workflows", "refresh-all-site-data.yml"), "utf8");

assert(update.includes('response.status === 304'));
assert(update.includes('content hash unchanged'));
assert(update.indexOf('fs.writeFileSync(HTTP_CACHE_PATH') > update.indexOf('fs.writeFileSync(jsonPath'), "HTTPキャッシュは更新成功後に確定する");
assert(update.includes('changed-card-ids.json'));
assert(market.includes('CHANGED_CARD_IDS_PATH'));
assert(market.includes('targetCards'));
assert(daily.includes('llmCalls: 0'));
assert(daily.includes('codexCalls: 0'));
assert(daily.includes('if (!sourceMetrics.changed)'));
assert(fastWorkflow.includes('30 19 * * *'));
assert(fastWorkflow.includes('0 8 * * *'));
assert(backfillWorkflow.includes('update_yuyutei_torecacamp.js'));
assert(backfillWorkflow.includes('update_pokedata_batch.js'));
assert(!fullWorkflow.includes('schedule:'), "巨大な全件更新は日次スケジュールから外す");
assert(!/openai|anthropic|gemini|llm/i.test(fastWorkflow), "高速更新にLLMを含めない");

console.log("daily fast update separation tests passed");
