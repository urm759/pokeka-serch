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

function jstDate() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseProductPage(html, productUrl) {
  const source = String(html || "");
  const h1 = (source.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "";
  const markdownTitle =
    (source.match(/^Title:\s*(.+)$/im) || [])[1] ||
    (source.match(/^#\s+(.+)$/m) || [])[1] ||
    "";
  const title = decodeHtml(h1 || markdownTitle);
  const stateMatch = title.match(/〔状態([A-D](?:-)?)〕/i);
  const state = stateMatch ? stateMatch[1].toUpperCase() : "A";
  const text = decodeHtml(source);
  const stockMatch = text.match(/在庫数\s*([0-9,]+)\s*枚/);
  const soldOut = /再入荷を知らせる|SOLD\s*OUT/i.test(text);
  const stock = stockMatch ? Number(stockMatch[1].replace(/,/g, "")) : soldOut ? 0 : null;
  const normalizedProductUrl = String(productUrl || "").match(/https?:\/\/www\.cardrush-pokemon\.jp\/product\/\d+/i)?.[0] || "";
  return {
    valid: !!title && !!normalizedProductUrl && (/販売価格/.test(text) || stock !== null),
    title,
    state,
    stock: Number.isFinite(stock) ? stock : null,
    productUrl: normalizedProductUrl,
  };
}

async function fetchProduct(url) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 22000);
    try {
      const readerUrl = `https://r.jina.ai/http://www.cardrush-pokemon.jp/product/${String(url).match(/\/product\/(\d+)/)?.[1] || ""}`;
      const response = await fetch(readerUrl, {
        headers: {
          "user-agent": "Mozilla/5.0",
          "x-return-format": "markdown",
        },
        redirect: "follow",
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return { html: await response.text(), finalUrl: url };
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 700));
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

function averageDailyDecrease(values, days) {
  const recent = values.slice(-Math.min(values.length, days + 1));
  let decreases = 0;
  let pairs = 0;
  for (let index = 1; index < recent.length; index += 1) {
    const previous = recent[index - 1];
    const current = recent[index];
    if (!Number.isFinite(previous) || !Number.isFinite(current)) continue;
    decreases += Math.max(0, previous - current);
    pairs += 1;
  }
  return pairs ? Math.round((decreases / pairs) * 100) / 100 : null;
}

function demandLabel(avg30, samples) {
  if (samples < 3 || !Number.isFinite(avg30)) return "蓄積中";
  if (avg30 >= 1) return "買う人が多い";
  if (avg30 >= 0.2) return "普通";
  return "少ない";
}

function writeOutputs({ cards, catalog, history, invalidUrls, recheckIds, paths }) {
  const currentDateIndex = history.dates.length - 1;
  const summaryCards = {};
  for (const card of cards) {
    const values = history.stocks[card.id];
    if (!Array.isArray(values)) continue;
    const samples = values.filter(Number.isFinite).length;
    const avg7 = averageDailyDecrease(values, 7);
    const avg30 = averageDailyDecrease(values, 30);
    const avg90 = averageDailyDecrease(values, 90);
    const stock = values[currentDateIndex];
    summaryCards[card.id] = {
      stock: Number.isFinite(stock) ? stock : null,
      avg7,
      avg30,
      avg90,
      demand: demandLabel(avg30, samples),
      samples,
    };
  }
  fs.writeFileSync(paths.data, JSON.stringify(cards), "utf8");
  fs.writeFileSync(paths.catalog, JSON.stringify(catalog), "utf8");
  fs.writeFileSync(paths.history, JSON.stringify(history), "utf8");
  fs.writeFileSync(paths.summary, JSON.stringify({ updatedAt: jstDate(), cards: summaryCards }), "utf8");
  fs.writeFileSync(paths.invalid, JSON.stringify([...invalidUrls]), "utf8");
  fs.writeFileSync(paths.recheck, JSON.stringify([...recheckIds]), "utf8");
}

async function main() {
  const siteRoot = resolveSiteRoot();
  const paths = {
    data: path.join(siteRoot, "data", "pokemon-cards.json"),
    summary: path.join(siteRoot, "data", "cardrush-stock-summary.json"),
    catalog: path.join(__dirname, "cardrush_catalog.json"),
    history: path.join(__dirname, "cardrush_stock_history.json"),
    invalid: path.join(__dirname, "cardrush_invalid_urls.json"),
    recheck: path.join(__dirname, "cardrush_recheck_ids.json"),
    misses: path.join(__dirname, "cardrush_stock_misses.json"),
  };
  const cards = safeReadJson(paths.data, []);
  const catalog = safeReadJson(paths.catalog, []);
  const history = safeReadJson(paths.history, { dates: [], stocks: {} });
  const invalidUrls = new Set(safeReadJson(paths.invalid, []));
  const recheckIds = new Set(safeReadJson(paths.recheck, []));
  const misses = safeReadJson(paths.misses, {});
  const allLinked = cards.filter((card) => card.cardrushUrl);
  const onlyId = String(process.env.CARDRUSH_STOCK_ONLY_ID || "").trim();
  const batchSize = Number(process.env.CARDRUSH_STOCK_BATCH || 0);
  const eligible = onlyId ? allLinked.filter((card) => card.id === onlyId) : allLinked;
  let linked = batchSize > 0 ? eligible.slice(0, batchSize) : eligible;
  const concurrency = Math.max(1, Number(process.env.CARDRUSH_STOCK_CONCURRENCY || 20));
  const checkpoint = Math.max(concurrency, Number(process.env.CARDRUSH_STOCK_CHECKPOINT || 100));
  const today = jstDate();
  let dateIndex = history.dates.indexOf(today);
  if (dateIndex < 0) {
    history.dates.push(today);
    dateIndex = history.dates.length - 1;
    for (const values of Object.values(history.stocks)) values.push(null);
  }
  while (history.dates.length > 91) {
    history.dates.shift();
    for (const values of Object.values(history.stocks)) values.shift();
    dateIndex -= 1;
  }
  linked = linked.filter((card) => !Number.isFinite(history.stocks[card.id]?.[dateIndex]));

  const catalogByUrl = new Map(catalog.map((entry) => [entry.detailUrl, entry]));
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const missedThisRun = new Set();
  const requireFreshCatalog = process.env.CARDRUSH_REQUIRE_FRESH === "1";
  let checked = 0;
  let stateRejected = 0;
  let broken = 0;
  let failed = 0;
  console.log(`cardrush stock targets: ${linked.length}`);

  if (process.env.CARDRUSH_STOCK_SOURCE !== "product") {
    for (const card of linked) {
      const entry = catalogByUrl.get(card.cardrushUrl);
      const fresh = entry?.observedAt === today;
      if (!entry || (requireFreshCatalog && !fresh)) {
        const key = card.cardrushUrl;
        if (!missedThisRun.has(key)) {
          misses[key] = (Number(misses[key]) || 0) + 1;
          missedThisRun.add(key);
        }
        recheckIds.add(card.id);
        if (misses[key] >= 2) {
          invalidUrls.add(key);
          delete card.cardrushUrl;
          broken += 1;
        }
        continue;
      }
      delete misses[card.cardrushUrl];
      if (String(entry.state || "A").toUpperCase() !== "A") {
        invalidUrls.add(card.cardrushUrl);
        recheckIds.add(card.id);
        delete card.cardrushUrl;
        stateRejected += 1;
        continue;
      }
      if (!Number.isFinite(entry.stock)) {
        recheckIds.add(card.id);
        continue;
      }
      recheckIds.delete(card.id);
      if (!history.stocks[card.id]) history.stocks[card.id] = Array(history.dates.length).fill(null);
      while (history.stocks[card.id].length < history.dates.length) history.stocks[card.id].unshift(null);
      history.stocks[card.id][dateIndex] = entry.stock;
      checked += 1;
    }
    writeOutputs({ cards, catalog, history, invalidUrls, recheckIds, paths });
    fs.writeFileSync(paths.misses, JSON.stringify(misses), "utf8");
    console.log(`cardrush stock complete: checked=${checked}, rejected=${stateRejected}, broken=${broken}, failed=0`);
    return;
  }

  for (let offset = 0; offset < linked.length; offset += checkpoint) {
    const chunk = linked.slice(offset, offset + checkpoint);
    const results = await mapLimit(chunk, concurrency, async (card) => {
      try {
        const fetched = await fetchProduct(card.cardrushUrl);
        return { card, page: parseProductPage(fetched.html, fetched.finalUrl), ok: true };
      } catch (error) {
        return { card, ok: false, status: error?.status || 0, error: error?.message || String(error) };
      }
    });

    for (const result of results) {
      const card = cardById.get(result.card.id);
      if (!result.ok) {
        failed += 1;
        if (result.status === 404 || result.status === 410) {
          recheckIds.add(card.id);
          invalidUrls.add(card.cardrushUrl);
          delete card.cardrushUrl;
          broken += 1;
        }
        continue;
      }
      checked += 1;
      const page = result.page;
      if (!page.valid) {
        invalidUrls.add(card.cardrushUrl);
        recheckIds.add(card.id);
        delete card.cardrushUrl;
        broken += 1;
        continue;
      }
      if (page.productUrl && page.productUrl !== card.cardrushUrl) {
        invalidUrls.add(card.cardrushUrl);
        card.cardrushUrl = page.productUrl;
      }
      const catalogEntry = catalogByUrl.get(card.cardrushUrl);
      if (catalogEntry) catalogEntry.state = page.state;
      if (page.state !== "A") {
        invalidUrls.add(card.cardrushUrl);
        recheckIds.add(card.id);
        delete card.cardrushUrl;
        stateRejected += 1;
        continue;
      }
      recheckIds.delete(card.id);
      if (!history.stocks[card.id]) history.stocks[card.id] = Array(history.dates.length).fill(null);
      while (history.stocks[card.id].length < history.dates.length) history.stocks[card.id].unshift(null);
      history.stocks[card.id][dateIndex] = page.stock;
    }

    writeOutputs({ cards, catalog, history, invalidUrls, recheckIds, paths });
    fs.writeFileSync(paths.misses, JSON.stringify(misses), "utf8");
    console.log(
      `cardrush stock progress: ${Math.min(offset + chunk.length, linked.length)}/${linked.length}, checked=${checked}, rejected=${stateRejected}, broken=${broken}, failed=${failed}`
    );
  }
  console.log(`cardrush stock complete: checked=${checked}, rejected=${stateRejected}, broken=${broken}, failed=${failed}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
