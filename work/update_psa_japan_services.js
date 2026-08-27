const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT, "data", "psa-japan-services.json");
const SOURCE_URL = "https://www.psacard.com/ja-JP/services/trad";
const HANDLING_FEE = 1000;

function number(value) {
  const parsed = Number(String(value || "").replace(/[^0-9]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function jstDate() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
}

function planFromText(text, id, name) {
  const start = text.indexOf(name);
  if (start < 0) return null;
  const block = text.slice(start, start + 500);
  const price = number(block.match(/￥\s*([0-9,]+)\s*\/枚/)?.[1]);
  const businessDays = number(block.match(/予定納期[：:]\s*([0-9,]+)\s*営業日/)?.[1]);
  const calendarDays = number(block.match(/日数換算[：:]\s*約\s*([0-9,]+)日/)?.[1]);
  const declaredValueMax = number(block.match(/申告価格[：:]\s*￥\s*([0-9,]+)以下/)?.[1]);
  if (!(price > 0) || !(businessDays > 0) || !(declaredValueMax > 0)) return null;
  return { id, name, price, businessDays, calendarDays, declaredValueMax, available: true };
}

async function main() {
  let response = await fetch(SOURCE_URL, { headers: { "user-agent": "Mozilla/5.0 PSA-Japan-plan-monitor" } });
  let fetchMethod = "official-direct";
  if (!response.ok) {
    response = await fetch(`https://r.jina.ai/http://www.psacard.com/ja-JP/services/trad`, { headers: { "user-agent": "Mozilla/5.0 PSA-Japan-plan-monitor" } });
    fetchMethod = "official-text-fallback";
  }
  if (!response.ok) throw new Error(`PSA Japan returned HTTP ${response.status}`);
  const html = await response.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&yen;|&#165;/gi, "￥")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ");
  const plans = [
    planFromText(text, "regular", "レギュラー"),
    planFromText(text, "express", "エクスプレス"),
  ].filter(Boolean);
  if (plans.length !== 2) throw new Error("Could not parse both PSA Japan service plans; existing data was preserved.");
  const suspendedPlans = ["バリュー・バルク", "バリュー", "バリュー・プラス", "バリュー・マックス"]
    .filter((name) => text.includes(name) && text.includes("受付停止中"));
  const payload = {
    updatedAt: jstDate(),
    checkedAt: jstDate(),
    checkStatus: "success",
    fetchMethod,
    sourceUrl: SOURCE_URL,
    handlingFee: HANDLING_FEE,
    plans,
    suspendedPlans,
  };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload), "utf8");
  console.log(JSON.stringify(payload));
}

main().catch((error) => {
  if (fs.existsSync(OUTPUT_PATH)) {
    const previous = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf8"));
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify({
      ...previous,
      checkedAt: jstDate(),
      checkStatus: "failed",
      checkError: String(error.message || error).slice(0, 240),
    }), "utf8");
    console.warn(`PSA Japan plan refresh skipped; existing data was preserved: ${error.message || error}`);
    return;
  }
  console.error(error);
  process.exitCode = 1;
});
