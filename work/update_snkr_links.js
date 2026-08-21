const fs = require("fs");
const path = require("path");

function resolveSiteRoot() {
  const standaloneRoot = path.join(__dirname, "..");
  if (fs.existsSync(path.join(standaloneRoot, "index.html"))) return standaloneRoot;
  return path.join(standaloneRoot, "outputs", "github-site");
}

function safeReadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function isDirectUrl(value) {
  return /^https?:\/\/(?:www\.)?snkrdunk\.com\/(?:apparels|trading-cards|products)\/\d+/i.test(String(value || ""));
}

function extractDirectUrl(html) {
  const match = String(html || "").match(
    /https?:\/\/(?:www\.)?snkrdunk\.com\/(?:apparels|trading-cards|products)\/\d+(?:\/used\/\d+)?/i
  );
  return match ? match[0].replace(/\/used\/\d+.*$/i, "") : "";
}

async function fetchText(url) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 600));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error("request failed");
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, limit) }, () => worker()));
  return results;
}

function isDue(entry, now, recheckDays) {
  if (!entry?.checkedAt) return true;
  const checkedAt = Date.parse(entry.checkedAt);
  if (!Number.isFinite(checkedAt)) return true;
  return now - checkedAt >= recheckDays * 86400000;
}

async function main() {
  const siteRoot = resolveSiteRoot();
  const dataPath = path.join(siteRoot, "data", "pokemon-cards.json");
  const progressPath = path.join(__dirname, "snkr_link_progress.json");
  const cards = safeReadJson(dataPath, []);
  const progress = safeReadJson(progressPath, { checked: {} });
  if (!Array.isArray(cards)) throw new Error("pokemon-cards.json is not an array");
  if (!progress.checked || typeof progress.checked !== "object") progress.checked = {};

  const now = Date.now();
  const recheckDays = Math.max(1, Number(process.env.SNKR_RECHECK_DAYS || 30));
  const allPending = cards.filter(
    (card) => !isDirectUrl(card.snkUrl) && isDue(progress.checked[card.id], now, recheckDays)
  );
  const requestedBatch = Number(process.env.SNKR_BATCH || 0);
  const pending = requestedBatch > 0 ? allPending.slice(0, requestedBatch) : allPending;
  const concurrency = Math.max(1, Number(process.env.SNKR_CONCURRENCY || 20));
  const checkpointSize = Math.max(concurrency, Number(process.env.SNKR_CHECKPOINT || 100));
  const cardIndex = new Map(cards.map((card, index) => [card.id, index]));

  console.log(`snkr pending: ${pending.length}/${allPending.length}, direct=${cards.filter((card) => isDirectUrl(card.snkUrl)).length}`);
  let found = 0;
  let failed = 0;
  for (let offset = 0; offset < pending.length; offset += checkpointSize) {
    const chunk = pending.slice(offset, offset + checkpointSize);
    const results = await mapLimit(chunk, concurrency, async (card) => {
      try {
        const html = await fetchText(`https://toreca-souba.com/cards/${card.id}`);
        return { card, directUrl: extractDirectUrl(html), ok: true };
      } catch (error) {
        return { card, directUrl: "", ok: false, error: error?.message || String(error) };
      }
    });

    for (const result of results) {
      if (!result.ok) {
        failed += 1;
        continue;
      }
      progress.checked[result.card.id] = {
        checkedAt: new Date().toISOString(),
        found: !!result.directUrl,
      };
      if (result.directUrl) {
        const index = cardIndex.get(result.card.id);
        cards[index].snkUrl = result.directUrl;
        found += 1;
      }
    }

    fs.writeFileSync(dataPath, JSON.stringify(cards), "utf8");
    fs.writeFileSync(progressPath, JSON.stringify(progress), "utf8");
    console.log(`snkr progress: ${Math.min(offset + chunk.length, pending.length)}/${pending.length}, found=${found}, failed=${failed}`);
  }

  const direct = cards.filter((card) => isDirectUrl(card.snkUrl)).length;
  console.log(`snkr direct: ${direct}/${cards.length}, added=${found}, failed=${failed}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
