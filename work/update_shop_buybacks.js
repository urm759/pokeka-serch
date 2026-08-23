const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SHOP_ID = "torecabank";
const SHOP_NAME = "トレカバンク";
const SOURCE_URL = "https://store.torecabank.com/mail_buy_list?keyword=&category=1&types%5B%5D=1&min_price=0&max_price=&sort=price_asc";
const HISTORY_DAYS = 91;
const SUMMARY_PATH = path.join(ROOT, "data", "shop-buyback-summary.json");

function readJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return fallback; }
}

function jstDate() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[＆&]/g, "and")
    .replace(/[^a-z0-9ぁ-んァ-ヶ一-龠]/g, "");
}

function normalizeNumber(value) {
  const match = String(value || "").normalize("NFKC").match(/(\d{1,3})\s*\/\s*([a-z0-9-]{1,8}|\d{1,3})/i);
  if (!match) return "";
  return `${Number(match[1])}/${/^\d+$/.test(match[2]) ? Number(match[2]) : match[2].toUpperCase()}`;
}

function setCode(value) {
  const bracket = String(value || "").match(/\[([^\]]+)\]/)?.[1] || "";
  const candidate = bracket.match(/\b((?:M|SV|S|SM|XY|BW|DP|CP)[A-Z0-9+-]*(?:-[A-Z])?)\b/i)?.[1] || "";
  return candidate.toUpperCase();
}

function coreName(value) {
  return normalize(String(value || "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b\d{1,3}\s*\/\s*[A-Z0-9-]{1,8}\b/gi, " ")
    .replace(/\b(?:SAR|SR|UR|HR|AR|CHR|CSR|RRR|RR|R|U|C|PROMO|P)\b/gi, " ")
    .replace(/[:：]?\s*(?:1ED|EDなし|PSA10)/gi, " "));
}

function variant(value) {
  const text = String(value || "");
  if (/マスターボール/.test(text)) return "master";
  if (/モンスターボール/.test(text)) return "monster";
  if (/ミラー|ホイル加工/.test(text)) return "mirror";
  if (/SA|スペシャルアート/i.test(text)) return "sa";
  return "base";
}

function parseItems(html) {
  const items = [];
  const itemPattern = /<li\s+class="item\s*([^"]*)"([^>]*)>([\s\S]*?)<\/li>/gi;
  for (const match of String(html || "").matchAll(itemPattern)) {
    const attrs = match[2] || "";
    const body = match[3] || "";
    const id = attrs.match(/data-id="([^"]+)"/i)?.[1] || "";
    const max = Number(attrs.match(/data-max="([0-9]+)"/i)?.[1] || 0);
    const name = decodeHtml(body.match(/<p\s+class="name"[^>]*>([\s\S]*?)<\/p>/i)?.[1]);
    const tag = decodeHtml(body.match(/<p\s+class="tag"[^>]*>([\s\S]*?)<\/p>/i)?.[1]);
    const price = Number(decodeHtml(body.match(/<p\s+class="price"[^>]*>([\s\S]*?)<\/p>/i)?.[1]).replace(/[^0-9]/g, ""));
    if (!id || !name || tag !== "PSA10") continue;
    items.push({ shopItemId: id, name, price, max, active: max > 0 && price > 0 });
  }
  return items;
}

async function fetchPage(page) {
  const url = new URL(SOURCE_URL);
  url.searchParams.set("page", String(page));
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
      if (!response.ok) throw new Error(`${SHOP_NAME} page ${page}: HTTP ${response.status}`);
      return response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw lastError;
}

function buildMatcher(cards) {
  const prepared = cards.filter((card) => Number(card.snkPsa10Price) > 0 && !/未開封/.test(card.name || "")).map((card) => ({
    card,
    no: normalizeNumber(`${card.model || ""} ${card.name || ""}`),
    set: setCode(card.name),
    core: coreName(card.name),
    variant: variant(card.name),
  }));
  const byNumber = new Map();
  for (const entry of prepared) {
    if (!entry.no) continue;
    if (!byNumber.has(entry.no)) byNumber.set(entry.no, []);
    byNumber.get(entry.no).push(entry);
  }
  return (item) => {
    const no = normalizeNumber(item.name);
    const set = setCode(item.name);
    const core = coreName(item.name);
    const itemVariant = variant(item.name);
    let candidates = no ? byNumber.get(no) || [] : [];
    const sameSet = set ? candidates.filter((entry) => !entry.set || entry.set === set) : [];
    if (sameSet.length) candidates = sameSet;
    const compatible = candidates.filter((entry) => entry.variant === itemVariant);
    if (set && compatible.length === 1 && compatible[0].set === set) {
      return { card: compatible[0].card, score: 90 };
    }
    const scored = candidates.map((entry) => {
      if (entry.variant !== itemVariant) return { entry, score: -1 };
      let score = entry.core === core ? 100 : entry.core.includes(core) || core.includes(entry.core) ? 75 : 0;
      if (set && entry.set === set) score += 30;
      if (entry.variant === itemVariant) score += 10;
      return { entry, score };
    }).filter((result) => result.score >= 75).sort((a, b) => b.score - a.score);
    if (!scored.length || (scored[1] && scored[1].score === scored[0].score)) return null;
    return { card: scored[0].entry.card, score: scored[0].score };
  };
}

function countRecent(values, days) {
  return values.slice(-days).filter((value) => Number(value) > 0).length;
}

function demandLabel(count30, observedDays) {
  if (observedDays < 7) return "蓄積中";
  const rate = count30 / Math.min(30, observedDays);
  if (rate >= 0.7) return "買取掲載が多い";
  if (rate >= 0.3) return "買取掲載は普通";
  return "買取掲載が少ない";
}

async function main() {
  const cards = readJson(path.join(ROOT, "data", "pokemon-cards.json"), []);
  const historyPath = path.join(__dirname, "shop_buyback_history.json");
  const catalogPath = path.join(__dirname, "shop_buyback_catalog.json");
  const unmatchedPath = path.join(__dirname, "shop_buyback_unmatched.json");
  const history = readJson(historyPath, { dates: [], shops: {} });
  const firstPage = await fetchPage(1);
  const pageNumbers = [...firstPage.matchAll(/[?&]page=(\d+)/g)].map((match) => Number(match[1]));
  const maxPage = Math.max(1, ...pageNumbers);
  const pages = [firstPage];
  for (let page = 2; page <= maxPage; page += 1) pages.push(await fetchPage(page));
  const parsedItems = pages.flatMap(parseItems);
  const items = [...new Map(parsedItems.map((item) => [item.shopItemId, item])).values()];
  const matchCard = buildMatcher(cards);
  const matched = [];
  const unmatched = [];
  for (const item of items) {
    const result = matchCard(item);
    if (result) matched.push({ ...item, cardId: result.card.id, score: result.score });
    else unmatched.push(item);
  }

  const today = jstDate();
  let dateIndex = history.dates.indexOf(today);
  if (dateIndex < 0) {
    history.dates.push(today);
    dateIndex = history.dates.length - 1;
    for (const shop of Object.values(history.shops || {})) {
      for (const values of Object.values(shop)) values.push(null);
    }
  }
  while (history.dates.length > HISTORY_DAYS) {
    history.dates.shift();
    dateIndex -= 1;
    for (const shop of Object.values(history.shops || {})) {
      for (const values of Object.values(shop)) values.shift();
    }
  }
  if (!history.shops[SHOP_ID]) history.shops[SHOP_ID] = {};
  const shopHistory = history.shops[SHOP_ID];
  for (const values of Object.values(shopHistory)) {
    while (values.length < history.dates.length) values.push(null);
    values[dateIndex] = null;
  }
  for (const item of matched.filter((entry) => entry.active)) {
    if (!shopHistory[item.cardId]) shopHistory[item.cardId] = Array(history.dates.length).fill(null);
    shopHistory[item.cardId][dateIndex] = item.price;
  }

  const summaryCards = {};
  const observedDays = history.dates.length;
  for (const card of cards) {
    const shops = {};
    let total7 = 0;
    let total30 = 0;
    let total90 = 0;
    for (const [shopId, entries] of Object.entries(history.shops)) {
      const values = entries[card.id] || [];
      const c7 = countRecent(values, 7);
      const c30 = countRecent(values, 30);
      const c90 = countRecent(values, 90);
      if (!c7 && !c30 && !c90) continue;
      const currentPrice = Number(values[values.length - 1]) > 0 ? Number(values[values.length - 1]) : null;
      shops[shopId] = { c7, c30, c90, price: currentPrice };
      total7 += c7;
      total30 += c30;
      total90 += c90;
    }
    if (!Object.keys(shops).length) continue;
    summaryCards[card.id] = {
      shops,
      total7,
      total30,
      total90,
      demand: demandLabel(total30, observedDays),
    };
  }

  const shopMeta = {
    [SHOP_ID]: { name: SHOP_NAME, url: SOURCE_URL, observedDays, matched: matched.length, activeMatched: matched.filter((item) => item.active).length },
  };
  fs.writeFileSync(historyPath, JSON.stringify(history), "utf8");
  fs.writeFileSync(catalogPath, JSON.stringify({ updatedAt: today, shop: SHOP_ID, items: matched }), "utf8");
  fs.writeFileSync(unmatchedPath, JSON.stringify({ updatedAt: today, shop: SHOP_ID, items: unmatched }), "utf8");
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify({ updatedAt: today, dates: history.dates, shops: shopMeta, cards: summaryCards }), "utf8");
  console.log(`${SHOP_NAME}: pages=${maxPage}, items=${items.length}, matched=${matched.length}, activeMatched=${matched.filter((item) => item.active).length}, unmatched=${unmatched.length}`);
}

main().catch((error) => {
  if (fs.existsSync(SUMMARY_PATH)) {
    console.warn(`shop buyback refresh skipped; existing data was preserved: ${error.message || error}`);
    return;
  }
  console.error(error);
  process.exitCode = 1;
});
