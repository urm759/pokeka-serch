const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CARDS_PATH = path.join(ROOT, "data", "pokemon-cards.json");
const CACHE_PATH = path.join(__dirname, "snkr_english_names.json");
const BATCH = Math.max(0, Number(process.env.PSA_ENGLISH_BATCH || 120));
const CONCURRENCY = Math.max(1, Number(process.env.PSA_ENGLISH_CONCURRENCY || 6));

function readJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return fallback; }
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function extractEnglishName(html) {
  const description = String(html || "").match(/<meta\s+name=["']description["']\s+content=["']([^"']*(?:&quot;[^"']*)*)["']/i)?.[1] || "";
  const decoded = decodeHtml(description);
  const match = decoded.match(/（([^）]+)）の在庫/);
  return match ? match[1].trim() : "";
}

async function fetchEnglish(card) {
  const url = String(card.snkUrl || card.snkrUrl || "");
  if (!/^https?:\/\/(?:www\.)?snkrdunk\.com\/(?:apparels|trading-cards|products)\/\d+/i.test(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const englishName = extractEnglishName(await response.text());
    return englishName ? { englishName, url, fetchedAt: new Date().toISOString() } : null;
  } finally { clearTimeout(timer); }
}

async function mapLimit(items, limit, mapper) {
  let cursor = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await mapper(items[index], index);
    }
  }));
}

async function main() {
  const cards = readJson(CARDS_PATH, []);
  const cache = readJson(CACHE_PATH, { version: 1, cards: {} });
  cache.cards ||= {};
  const pending = cards.filter((card) => !cache.cards[card.id] && /snkrdunk\.com\/(?:apparels|trading-cards|products)\/\d+/i.test(card.snkUrl || card.snkrUrl || "")).slice(0, BATCH || cards.length);
  let saved = 0;
  await mapLimit(pending, CONCURRENCY, async (card) => {
    try {
      const result = await fetchEnglish(card);
      if (result) { cache.cards[card.id] = result; saved += 1; }
    } catch (error) {
      console.warn(`${card.id}: ${error.message}`);
    }
  });
  cache.updatedAt = new Date().toISOString();
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache), "utf8");
  console.log(JSON.stringify({ checked: pending.length, saved, total: Object.keys(cache.cards).length }));
}

main().catch((error) => { console.error(error); process.exit(1); });
