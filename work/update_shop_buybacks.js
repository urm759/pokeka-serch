const fs = require("fs");
const path = require("path");
const decisionModel = require("../decision-model.js");
const marketModel = require("../market-analysis.js");

const ROOT = path.join(__dirname, "..");
const SHOPS = [
  {
    id: "torecabank",
    name: "トレカバンク",
    url: "https://store.torecabank.com/mail_buy_list?keyword=&category=1&types%5B%5D=1&min_price=0&max_price=&sort=price_asc",
    fetchItems: fetchTorecaBank,
  },
  {
    id: "toreca-lounge",
    name: "トレカラウンジ",
    url: "https://kaitori.toreca-lounge.com/pokemon",
    fetchItems: fetchTorecaLounge,
  },
  {
    id: "bluerocket",
    name: "ブルーロケット",
    url: "https://bluerocket-tcg.com/products?q%5Bproduct_sub_category_id_eq%5D=13&q%5Bproduct_sub_category_product_category_id_eq%5D=2",
    fetchItems: fetchBlueRocket,
  },
  {
    id: "shinsoku",
    name: "シンソク",
    url: "https://shinsoku-tcg.com/yuso-kaitori?title=%E3%83%9D%E3%82%B1%E3%83%A2%E3%83%B3",
    fetchItems: fetchShinsoku,
  },
  {
    id: "torecaclub",
    name: "トレカクラブ",
    url: "https://torecaclub.com/",
    fetchItems: fetchTorecaClub,
  },
  {
    id: "toreca-birth-mail",
    name: "トレカバース（郵送）",
    url: "https://birth-kaitori.vercel.app/",
    priceKey: "mailPrice",
    fetchItems: fetchTorecaBirth,
  },
  {
    id: "kaitori-homura-mail",
    adapterVersion: 'homura-public-v3',
    name: "買取ホムラ（郵送）",
    url: "https://kaitori-homura.com/products?q%5Bproduct_sub_category_id_eq%5D=182&q%5Bproduct_sub_category_product_category_id_eq%5D=21&sort=price_desc",
    fetchItems: shop => require('./homura_public_feed').fetchItems(shop,fetchJson,readJson(path.join(ROOT,'data/pokemon-cards.json'),[])),
  },
  {
    id:'fukufuku-mail',name:'福福トレカ（郵送窓口）',fulfilment:'mail',
    branch:'中央郵送窓口（実店舗への持込不可）',merchantId:'fukufuku',
    acceptanceUrl:'https://fukufuku-toreka.com/faq/',
    conditions:'郵送申込後に発送・到着時価格で査定。指定窓口への持込不可',
    url:'https://fukufuku-toreka.com/tradingcard/pokemon-1/',
    adapterVersion:require('./public_mail_buybacks').VERSION,
    fetchItems:shop=>require('./public_mail_buybacks').fetchFukufuku(shop,fetchText,readJson(path.join(ROOT,'data/pokemon-cards.json'),[])),
  },
];
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
  if (/(?:^|[^A-Z])SA(?:[^A-Z]|$)|スペシャルアート/i.test(text)) return "sa";
  return "base";
}

function parseTorecaBankItems(html) {
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
    const imageUrl = body.match(/<img[^>]+src="([^"]+)"/i)?.[1] || "";
    if (!id || !name || tag !== "PSA10") continue;
    items.push({ shopItemId: id, name, price, max, imageUrl, active: max > 0 && price > 0 });
  }
  return items;
}

async function fetchText(url, label) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "PokekaDataCollector/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) { const error = new Error(`${label}: HTTP ${response.status}`); error.status = response.status; throw error; }
      return await response.text();
    } catch (error) {
      lastError = error;
      if (!(error.status === 429 || error.status >= 500 || /timeout|abort|fetch failed/i.test(error.message))) break;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

async function fetchJson(url, label) {
  const text = await fetchText(url, label);
  try { return JSON.parse(text); } catch { throw new Error(`${label}: JSONの解析に失敗しました`); }
}

async function fetchTorecaBank(shop) {
  const fetchPage = (page) => {
    const url = new URL(shop.url);
    url.searchParams.set("page", String(page));
    return fetchText(url, `${shop.name} page ${page}`);
  };
  const firstPage = await fetchPage(1);
  const pageNumbers = [...firstPage.matchAll(/[?&]page=(\d+)/g)].map((match) => Number(match[1]));
  const maxPage = Math.max(1, ...pageNumbers);
  const pages = [firstPage];
  for (let page = 2; page <= maxPage; page += 1) pages.push(await fetchPage(page));
  const parsed = pages.flatMap(parseTorecaBankItems);
  return { pages: maxPage, items: [...new Map(parsed.map((item) => [item.shopItemId, item])).values()] };
}

async function fetchTorecaLounge(shop) {
  const html = await fetchText(shop.url, shop.name);
  const objects = html.match(/\{\\"productFormat\\":\\"PSA\\"[^{}]*?\}/g) || [];
  const items = objects.map((source) => {
    try { return JSON.parse(source.replace(/\\"/g, '"')); } catch { return null; }
  }).filter((raw) => raw?.brand === "POKEMON" && raw.grade === "PSA10").map((raw) => {
    const price = Number(raw.buyPrice || 0);
    return {
      shopItemId: String(raw.productId || ""),
      name: `${raw.productName || ""} ${raw.rarity || ""} [${raw.seriesCode || ""} ${raw.modelNumber || ""}]`.trim(),
      price,
      imageUrl: raw.imageUrl || "",
      itemUrl: "",
      active: price > 0,
    };
  }).filter((item) => item.shopItemId && item.name);
  return { pages: 1, items: [...new Map(items.map((item) => [item.shopItemId, item])).values()] };
}

function parseBlueRocketItems(html, shop) {
  const items = [];
  const pattern = /data-product-id="(\d+)"[\s\S]{0,1200}?data-product-name="([^"]+)"[\s\S]{0,600}?data-product-price="(\d+)"/gi;
  for (const match of String(html || "").matchAll(pattern)) {
    const name = decodeHtml(match[2]);
    if (!/^PSA\s*10\b/i.test(name)) continue;
    items.push({
      shopItemId: match[1],
      name: name.replace(/^PSA\s*10\s*/i, ""),
      price: Number(match[3]),
      imageUrl: "",
      itemUrl: `https://bluerocket-tcg.com/products/${match[1]}`,
      active: Number(match[3]) > 0,
    });
  }
  return items;
}

async function fetchBlueRocket(shop) {
  const fetchPage = (page) => {
    const url = new URL(shop.url);
    url.searchParams.set("page", String(page));
    return fetchText(url, `${shop.name} page ${page}`);
  };
  const firstPage = await fetchPage(1);
  const pageNumbers = [...firstPage.matchAll(/[?&](?:amp;)?page=(\d+)/g)].map((match) => Number(match[1]));
  const maxPage = Math.max(1, ...pageNumbers);
  const pages = [firstPage];
  for (let page = 2; page <= maxPage; page += 1) pages.push(await fetchPage(page));
  const parsed = pages.flatMap((html) => parseBlueRocketItems(html, shop));
  return { pages: maxPage, items: [...new Map(parsed.map((item) => [item.shopItemId, item])).values()] };
}

async function fetchShinsoku(shop) {
  const items = [];
  let page = 0;
  let hasMore = true;
  while (hasMore && page < 200) {
    const params = new URLSearchParams({
      postal_only: "true", sort: "price_desc", type: "PSA", brand: "ポケモン",
      page: String(page), limit: "100",
    });
    const response = await fetchJson(`https://shinsoku-tcg.com/api/items?${params}`, `${shop.name} page ${page}`);
    const data = response?.data || response || {};
    for (const raw of data.items || []) {
      const isPsa10 = (raw.tags || []).some((tag) => String(tag.slug || tag.label).toLowerCase().replace(/\s/g, "") === "psa10");
      if (raw.brand !== "ポケモン" || raw.type !== "PSA" || !isPsa10) continue;
      const price = Number(raw.postal_purchase_price_s || 0);
      items.push({
        shopItemId: String(raw.item_id || raw.id || ""),
        name: `${raw.name_processed || raw.name || ""} ${raw.rarity || ""} ${raw.modelno || ""}`.trim(),
        price,
        imageUrl: raw.image_url_public || "",
        itemUrl: `${shop.url}&s=${encodeURIComponent(raw.name_processed || raw.name || "")}`,
        active: raw.is_postal_buy_target !== false && price > 0,
      });
    }
    hasMore = Boolean(data.has_more);
    page += 1;
  }
  return { pages: page, items: [...new Map(items.map((item) => [item.shopItemId, item])).values()] };
}

async function fetchTorecaClub(shop) {
  // The page HTML includes only its first 20 cards. The public API is paginated,
  // so follow its cursor to avoid undercounting this shop's active buyback list.
  const items = [];
  let cursor = "";
  let pages = 0;
  do {
    const params = new URLSearchParams({ sort: "price_desc", limit: "50" });
    if (cursor) params.set("cursor", cursor);
    const response = await fetchJson(`https://torecaclub.com/api/cards/search?${params}`, `${shop.name} page ${pages + 1}`);
    const data = response?.data || {};
    for (const raw of data.cards || []) {
      const cardId = String(raw.card_id || "");
      const cardCode = String(raw.card_code || "");
      const productId = String(raw.product_id || "");
      const cardName = String(raw.card_name || "");
      const imageUrl = String(raw.image_url || "");
      const rawPrice = raw.price;
      if (!cardId || !cardName) continue;
      const suffix = cardId.replace(/^ca\d+_/, "");
      const productParts = productId.split("/");
      const isPromo = productParts.length === 3 && /^[A-Z]{1,3}$/i.test(productParts[1]) && productParts[2].toUpperCase() === "P";
      const normalizedCode = isPromo ? `${productParts[0]}/${productParts[1]}-${productParts[2]}` : cardCode;
      const set = isPromo ? `${productParts[1]}-${productParts[2]}` : productParts.length >= 3 ? productParts[2] : "";
      const price = Number(rawPrice || 0);
      if (/wildcard/i.test(cardId) || /保証対象/.test(cardName)) continue;
      items.push({
        shopItemId: cardId,
        name: `${cardName} ${normalizedCode}${set ? ` [${set}]` : ""}`.trim(),
        price,
        imageUrl,
        itemUrl: `https://torecaclub.com/pokemon/cards/psa10/${encodeURIComponent(suffix)}/`,
        active: price > 0,
      });
    }
    pages += 1;
    cursor = data.pagination?.hasMore ? String(data.pagination.nextCursor || "") : "";
  } while (cursor && pages < 500);
  return { pages, items: [...new Map(items.map((item) => [item.shopItemId, item])).values()] };
}

function parseTorecaBirthItems(html, shop) {
  // The site embeds its published buyback list in the Next.js response. Each
  // source entry carries both mail and in-store offers for the same card.
  const pattern = /\{\\"title\\":\\"pokemon\\"[^{}]*?\\"mailPrice\\":\d+[^{}]*?\}/g;
  const items = [];
  for (const match of String(html || "").matchAll(pattern)) {
    let raw;
    try {
      raw = JSON.parse(match[0].replace(/\\"/g, '"'));
    } catch {
      continue;
    }
    if (!Array.isArray(raw.features) || !raw.features.includes("PSA10")) continue;
    const price = Number(raw[shop.priceKey] || 0);
    const id = String(raw.id || raw.uid || "");
    if (!id || !raw.name) continue;
    items.push({
      shopItemId: id,
      name: String(raw.name),
      price,
      imageUrl: raw.imageUrl || "",
      itemUrl: shop.url,
      active: price > 0,
    });
  }
  return [...new Map(items.map((item) => [item.shopItemId, item])).values()];
}

async function fetchTorecaBirth(shop) {
  const html = await fetchText(shop.url, shop.name);
  return { pages: 1, items: parseTorecaBirthItems(html, shop) };
}

function parseKaitoriHomuraItems(html) {
  const items = [];
  const pattern = /data-product-id="(\d+)"[\s\S]{0,1400}?data-product-name="([^"]+)"[\s\S]{0,1400}?data-product-price="(\d+)"/gi;
  for (const match of String(html || "").matchAll(pattern)) {
    const name = decodeHtml(match[2]);
    if (!/^PSA\s*10\b/i.test(name)) continue;
    const shopItemId = String(match[1]);
    const price = Number(match[3]);
    items.push({
      shopItemId,
      name: name.replace(/^PSA\s*10\s*/i, ""),
      price,
      imageUrl: "",
      itemUrl: `https://kaitori-homura.com/products/${shopItemId}`,
      active: price > 0,
    });
  }
  return items;
}

async function fetchKaitoriHomura(shop) {
  const fetchPage = (page) => {
    const url = new URL(shop.url);
    url.searchParams.set("page", String(page));
    return fetchText(url, `${shop.name} page ${page}`);
  };
  const firstPage = await fetchPage(1);
  const pageNumbers = [...firstPage.matchAll(/[?&](?:amp;)?page=(\d+)/g)].map((match) => Number(match[1]));
  const maxPage = Math.max(1, ...pageNumbers);
  const pages = [firstPage];
  for (let page = 2; page <= maxPage; page += 1) pages.push(await fetchPage(page));
  const parsed = pages.flatMap(parseKaitoriHomuraItems);
  if (!parsed.length && pages.some(page=>page.includes('/_expo/static/js/'))) {
    throw new Error('形式変更・正規一覧にPSA10商品属性がない。自動確定せず取得経路の確認待ち・正常データ保持');
  }
  return { pages: maxPage, items: [...new Map(parsed.map((item) => [item.shopItemId, item])).values()] };
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

function recentIndexes(dates, days) {
  if (!dates.length) return [];
  const latest = Date.parse(`${dates.at(-1)}T00:00:00Z`);
  return dates.map((date, index) => ({ index, timestamp: Date.parse(`${date}T00:00:00Z`) }))
    .filter((entry) => Number.isFinite(entry.timestamp) && latest - entry.timestamp < days * 86400000)
    .map((entry) => entry.index);
}

function countRecent(values, dates, days) {
  return recentIndexes(dates, days).filter((index) => Number(values[index]) > 0).length;
}

function averageRecent(values, dates, days) {
  const prices = recentIndexes(dates, days).map((index) => values[index]).filter((value) => Number(value) > 0).map(Number);
  return prices.length ? Math.round(prices.reduce((sum, value) => sum + value, 0) / prices.length) : null;
}

function observedRecent(observedDates, latestDate, days) {
  const latest = Date.parse(`${latestDate}T00:00:00Z`);
  return (observedDates || []).filter((date) => {
    const timestamp = Date.parse(`${date}T00:00:00Z`);
    return Number.isFinite(timestamp) && latest - timestamp < days * 86400000;
  }).length;
}

function demandLabel(count30, observedDays, shopCount) {
  if (observedDays < 7) return "買取掲載数：蓄積中";
  const rate = count30 / (Math.min(30, observedDays) * Math.max(1, shopCount));
  if (rate >= 0.7) return "買取掲載数：多い";
  if (rate >= 0.3) return "買取掲載数：普通";
  return "買取掲載数：少ない";
}

function savedMatchConfidence(match) {
  if (!match) return null;
  const score = match.matchScore;
  if (score == null || score === "" || !Number.isFinite(Number(score))) return null;
  return decisionModel.matchConfidenceLabel(score);
}
function freshUsablePrice(row,meta,now=Date.now()) {
  const at=Date.parse(row?.observedAt || row?.priceDate || '');
  return row?.listingActive===true && row.price>0 && row.matchConfidence==='high' && !row.quarantined
    && !meta?.reviewStatus && !['pending','retired'].includes(meta?.acquisitionPermission)
    && Number.isFinite(at) && at<=now && now-at<=48*3600000;
}

function buildPriceTrust(history, cards, results) {
  const cardById = new Map(cards.map((card) => [String(card.id), card]));
  const quarantine = {};
  const stats = {};
  for (const [shopId, entries] of Object.entries(history.shops || {})) {
    const shopStats = { priceObservations: 0, outliers: 0, quarantinedPairs: 0 };
    for (const [cardId, values] of Object.entries(entries || {})) {
      const marketPrice = Number(cardById.get(String(cardId))?.snkPsa10Price || 0);
      if (!(marketPrice > 0)) continue;
      for (let index = 0; index < values.length; index += 1) {
        const observedPrice = Number(values[index] || 0);
        if (!(observedPrice > 0)) continue;
        shopStats.priceObservations += 1;
        const state = marketModel.extremePriceState(marketPrice, observedPrice);
        if (state.ratio < 0.4 || state.ratio > 1.35) shopStats.outliers += 1;
      }
    }
    stats[shopId] = shopStats;
  }
  for (const result of results || []) {
    const shopId = result.shop.id;
    if (!stats[shopId]) stats[shopId] = { priceObservations: 0, outliers: 0, quarantinedPairs: 0 };
    const pairs = new Set();
    for (const item of result.matched || []) {
      if (decisionModel.matchConfidenceLabel(item.score) !== "low" && item.cardMismatchSuspected !== true) continue;
      const key = `${shopId}:${item.cardId}`;
      quarantine[key] = {
        shopId,
        cardId: item.cardId,
        shopItemId: item.shopItemId,
        reason: "カード番号・セット・レアリティの紐付けを要確認",
      };
      pairs.add(key);
    }
    stats[shopId].quarantinedPairs = pairs.size;
  }
  return { quarantine, stats };
}

async function main({ rebuildSaved = false } = {}) {
  const cards = readJson(path.join(ROOT, "data", "pokemon-cards.json"), []);
  const historyPath = path.join(__dirname, "shop_buyback_history.json");
  const catalogPath = path.join(__dirname, "shop_buyback_catalog.json");
  const unmatchedPath = path.join(__dirname, "shop_buyback_unmatched.json");
  const itemMatchesPath = path.join(__dirname, "shop_buyback_item_matches.json");
  const imageMatchesPath = path.join(__dirname, "shop_buyback_image_matches.json");
  const quarantinePath = path.join(__dirname, "shop_buyback_quarantine.json");
  const imageMatches = readJson(imageMatchesPath, {});
  const itemMatches = readJson(itemMatchesPath, {});
  const history = readJson(historyPath, { dates: [], shops: {}, observedByShop: {} });
  const previousSummary = readJson(SUMMARY_PATH, { shops: {}, cards: {} });
  if (process.env.SHOP_BUYBACK_PRESERVE_REF) {
    const baseline = JSON.parse(require("child_process").execFileSync("git", ["show", `${process.env.SHOP_BUYBACK_PRESERVE_REF}:data/shop-buyback-summary.json`], { cwd: ROOT, maxBuffer: 30000000, encoding: "utf8" }));
    for (const [id, card] of Object.entries(baseline.cards || {})) {
      previousSummary.cards[id] ||= { shops: {} };
      for (const [shopId, row] of Object.entries(card.shops || {})) if (shopId !== process.env.SHOP_BUYBACK_SOURCE_ONLY) previousSummary.cards[id].shops[shopId] = row;
    }
  }
  const previousCatalog = readJson(catalogPath, { shops: {} }).shops || {};
  const previousUnmatched = readJson(unmatchedPath, { shops: {} }).shops || {};
  const failures = [];
  if (!history.observedByShop || typeof history.observedByShop !== "object") history.observedByShop = {};
  // Older history predates per-shop success tracking. Seed once from the known daily runs,
  // then future refreshes maintain exact successful observation dates per shop.
  for (const shopId of Object.keys(history.shops || {})) {
    if (!Array.isArray(history.observedByShop[shopId])) history.observedByShop[shopId] = [...(history.dates || [])];
  }
  const activeShopIds = new Set(SHOPS.map((shop) => shop.id));
  // Preserve removed origins' raw history; only active origins enter new summaries.
  const retiredPath=path.join(__dirname,'.private','retired-buyback-history.json');
  fs.mkdirSync(path.dirname(retiredPath),{recursive:true});
  const retired=readJson(retiredPath,{version:1,shops:{}});
  for(const id of Object.keys(history.shops||{})) if(!activeShopIds.has(id) && !retired.shops[id]) {
    retired.shops[id]={archivedAt:new Date().toISOString(),dates:[...history.dates],
      history:history.shops[id],observedDays:history.observedByShop[id],metadata:previousSummary.shops?.[id],
      quotes:Object.fromEntries(Object.entries(previousSummary.cards||{}).filter(([,c])=>c.shops?.[id]).map(([k,c])=>[k,c.shops[id]]))};
  }
  require('./acquisition_retry').atomicWrite(retiredPath,retired);
  for (const cache of [imageMatches, itemMatches]) {
    for (const sourceKey of Object.keys(cache)) {
      if (sourceKey.startsWith("toreca-birth-store:")) delete cache[sourceKey];
    }
  }
  const matchCard = buildMatcher(cards);
  const results = [];
  for (const shop of SHOPS) {
    if (process.env.SHOP_BUYBACK_SOURCE_ONLY && process.env.SHOP_BUYBACK_SOURCE_ONLY !== shop.id) continue;
    if (rebuildSaved) {
      const permission=readJson(path.join(__dirname,'buyback-source-permissions.json'),{}).sources?.[shop.id];
      const saved=['pending','retired'].includes(permission?.status)?{matched:previousCatalog[shop.id]||[],unmatched:previousUnmatched[shop.id]||[],recovered:[]}:
        require('./reconcile_saved_buyback_items').reconcile(previousCatalog[shop.id]||[],previousUnmatched[shop.id]||[],cards);
      if (previousCatalog[shop.id]) results.push({shop, savedReplay:true, savedIdentityRecovered:saved.recovered,
        fullListing:previousSummary.shops?.[shop.id]?.coverageComplete === true,
        items:saved.matched, matched:saved.matched, unmatched:saved.unmatched});
      continue;
    }
    const permission = readJson(path.join(__dirname, 'buyback-source-permissions.json'), {}).sources?.[shop.id];
    if (['pending','retired'].includes(permission?.status)) {
      failures.push({ source: shop.id, error: permission.reason, permissionWait: true });
      continue;
    }
    const review=previousSummary.shops?.[shop.id];
    const legacyHomura=shop.adapterVersion?.startsWith('homura-public-') && (shop.adapterVersion!==review?.reviewAdapterVersion
      || /公開一覧の欠落・重複/.test(review?.error||'') && readJson(path.join(__dirname,'homura-public-checkpoint.json'),{}).nextPage>readJson(path.join(__dirname,'homura-public-checkpoint.json'),{}).pages);
    if(review?.reviewStatus && !(review.reviewStatus==='format-review' && legacyHomura)) {
      failures.push({source:shop.id,error:review.error,reviewWait:true});
      continue;
    }
    if(shop.adapterVersion && review?.adapterVersion===shop.adapterVersion && require('./psa10_observation_evidence').calendarDay(review.lastSuccess)===jstDate()) continue;
    try {
      const fetched = await shop.fetchItems(shop);
      if (!fetched.items?.length) throw new Error("取得0件。正常データは保持");
      const previousCount = previousSummary.shops?.[shop.id]?.fetched;
      if (previousCount >= 20 && fetched.items.length < previousCount * 0.5) throw new Error("取得件数が前回の半分未満。急減を隔離し正常データ保持");
      const matched = [];
      const unmatched = [];
      for (const item of fetched.items) {
        item.observedAt ||= new Date().toISOString();
        const sourceKey = `${shop.id}:${item.shopItemId}`;
        if (item.strictIdentity && !item.verifiedCardId) { unmatched.push(item); continue; }
        const verifiedCard = item.verifiedCardId ? cards.find((card) => card.id === item.verifiedCardId) : null;
        const manualCardId = imageMatches[sourceKey];
        const imageCard = manualCardId ? cards.find((card) => card.id === manualCardId) : null;
        const cachedCardId = itemMatches[sourceKey];
        const cachedCard = cachedCardId ? cards.find((card) => card.id === cachedCardId) : null;
        const freshMatch = verifiedCard || imageCard ? null : matchCard(item);
        const cacheConflict = cachedCard && freshMatch && freshMatch.card.id !== cachedCard.id;
        const result = verifiedCard || imageCard || (cachedCard && !cacheConflict) ? null : freshMatch;
        if (verifiedCard) {
          itemMatches[sourceKey] = verifiedCard.id;
          matched.push({ ...item, cardId: verifiedCard.id, score: 100, matchMethod: item.matchMethod || "image-reviewed" });
        } else if (imageCard) {
          itemMatches[sourceKey] = imageCard.id;
          matched.push({ ...item, cardId: imageCard.id, score: 100, matchMethod: "image-reviewed" });
        } else if (cacheConflict) {
          delete itemMatches[sourceKey];
          if (freshMatch.score >= 90) {
            itemMatches[sourceKey] = freshMatch.card.id;
            matched.push({ ...item, cardId: freshMatch.card.id, score: freshMatch.score, matchMethod: "text-cache-corrected" });
          } else {
            unmatched.push({ ...item, previousCardId: cachedCard.id, candidateCardId: freshMatch.card.id, mismatchReason: "保存済み紐付けと最新照合が不一致" });
          }
        } else if (cachedCard) matched.push({ ...item, cardId: cachedCard.id, score: 100, matchMethod: "confirmed-cache" });
        else if (result) {
          if (result.score >= 90) itemMatches[sourceKey] = result.card.id;
          matched.push({ ...item, cardId: result.card.id, score: result.score, matchMethod: "text" });
        }
        else unmatched.push(item);
      }
      results.push({ shop, ...fetched, matched, unmatched });
      console.log(`${shop.name}: pages=${fetched.pages}, items=${fetched.items.length}, matched=${matched.length}, activeMatched=${matched.filter((item) => item.active).length}, unmatched=${unmatched.length}`);
    } catch (error) {
      failures.push({ source: shop.id, attemptedAt: new Date().toISOString(), error: String(error.message || error),
        accessHold:[401,403].includes(error.status) || /HTTP\s+(401|403)/.test(String(error.message)) });
      console.warn(`${shop.name}: existing data was preserved: ${error.message || error}`);
    }
  }
  if (!results.length && !failures.length) return {status:'正常取得済み・日次再取得不要',llmCalls:0,codexCalls:0};
  if (!results.length) {
    for (const failure of failures) previousSummary.shops[failure.source] = { ...previousSummary.shops[failure.source], lastAttempt: failure.attemptedAt || previousSummary.shops[failure.source]?.lastAttempt || null, error: failure.error, refreshed: false,
      reviewStatus:failure.accessHold?'access-review':/形式変更/.test(failure.error||'')?'format-review':previousSummary.shops[failure.source]?.reviewStatus || null,
      reviewAdapterVersion:SHOPS.find(s=>s.id===failure.source)?.adapterVersion || null };
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify(previousSummary), "utf8");
    throw new Error("全店舗の取得に失敗しました。正常データを保持・失敗時刻を記録");
  }

  const today = jstDate();
  const previousDates = [...history.dates];
  const observedDates = results.filter(result=>!result.savedReplay).flatMap((result) => result.items.map((item) => item.observedDate || today));
  const targetDates = [...new Set([...previousDates, ...(rebuildSaved ? [] : [today, ...observedDates])])]
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort()
    .slice(-HISTORY_DAYS);
  if (targetDates.join("|") !== previousDates.join("|")) {
    for (const entries of Object.values(history.shops || {})) {
      for (const [cardId, values] of Object.entries(entries)) {
        const previous = new Map(previousDates.map((date, index) => [date, values[index] ?? null]));
        entries[cardId] = targetDates.map((date) => previous.get(date) ?? null);
      }
    }
    history.dates = targetDates;
  }
  const currentLinksByShop = {};
  for (const result of results) {
    currentLinksByShop[result.shop.id] = require('./buyback_listing_refresh').refresh(history, result, today, previousCatalog[result.shop.id]);
  }

  const priceTrust = buildPriceTrust(history, cards, results);
  const quarantine = priceTrust.quarantine;

  const summaryCards = {};
  const observedDays = history.dates.length;
  const latestHistoryDate = history.dates.at(-1) || today;
  for (const card of cards) {
    const shops = {};
    let total7 = 0;
    let total30 = 0;
    let total90 = 0;
    for (const [shopId, entries] of Object.entries(history.shops)) {
      if(!activeShopIds.has(shopId)) continue;
      const values = entries[card.id] || [];
      const c7 = countRecent(values, history.dates, 7);
      const c30 = countRecent(values, history.dates, 30);
      const c90 = countRecent(values, history.dates, 90);
      const preserved = previousSummary.cards?.[card.id]?.shops?.[shopId];
      if (!results.some((result) => result.shop.id === shopId) && preserved) {
        shops[shopId] = { ...preserved, fulfilment: SHOPS.find((s) => s.id === shopId)?.fulfilment || "mail" };
        total7 += Number(preserved.c7 || 0); total30 += Number(preserved.c30 || 0); total90 += Number(preserved.c90 || 0);
        continue;
      }
      if (!c7 && !c30 && !c90) continue;
      const latestPriceIndex = values.findLastIndex((value) => Number(value) > 0);
      const currentListingAbsent = require('./buyback_listing_refresh').unavailable(results.find(result => result.shop.id === shopId), currentLinksByShop[shopId], card.id, preserved);
      const currentPrice = currentListingAbsent ? null : latestPriceIndex >= 0 ? Number(values[latestPriceIndex]) : null;
      const previousMatch = previousSummary.cards?.[card.id]?.shops?.[shopId];
      const currentMatch = currentLinksByShop[shopId]?.get(card.id) || (previousMatch ? { ...previousMatch, matchScore: previousMatch.matchScore } : null);
      const identityHeld=currentMatch?.identityHeld === true || !currentLinksByShop[shopId]?.has(card.id) && preserved?.identityHeld === true;
      const quarantined = quarantine[`${shopId}:${card.id}`] || (identityHeld ? {reason:'最新取得で商品照合が変更・保留。旧対応を価格へ再採用しない'} : null);
      shops[shopId] = {
        c7, c30, c90, price: currentPrice,
        listingActive: identityHeld ? null : currentListingAbsent ? false : currentPrice > 0 ? true : null,
        fulfilment: SHOPS.find((s) => s.id === shopId)?.fulfilment || "mail",
        priceDate: latestPriceIndex >= 0 ? history.dates[latestPriceIndex] : null,
        observedAt:currentMatch?.observedAt || null,
        sourceUpdatedAt:currentMatch?.sourceUpdatedAt || null,
        ...(currentMatch?.pageUpdatedAt ? {pageUpdatedAt:currentMatch.pageUpdatedAt,quoteUpdatedAt:currentMatch.quoteUpdatedAt || null} : {}),
        url: currentMatch?.url || "",
        matchMethod: currentMatch?.matchMethod || null,
        matchScore: currentMatch?.matchScore || null,
        matchConfidence: savedMatchConfidence(currentMatch),
        quarantined: Boolean(quarantined),
        quarantineReason: quarantined?.reason || null,
        ...(identityHeld ? {identityHeld:true} : {}),
        observed7: observedRecent(history.observedByShop[shopId], latestHistoryDate, 7),
        observed30: observedRecent(history.observedByShop[shopId], latestHistoryDate, 30),
        observed90: observedRecent(history.observedByShop[shopId], latestHistoryDate, 90),
        avg7: averageRecent(values, history.dates, 7),
        avg30: averageRecent(values, history.dates, 30),
        avg90: averageRecent(values, history.dates, 90),
      };
      total7 += c7;
      total30 += c30;
      total90 += c90;
    }
    if (!Object.keys(shops).length) continue;
    const shopEntries = Object.entries(shops);
    for (const [shopId, shop] of shopEntries) {
      const peers = shopEntries.filter(([peerId, peer]) => peerId !== shopId && Number(peer.avg30) > 0).map(([, peer]) => Number(peer.avg30));
      if (!peers.length || !(shop.avg30 > 0)) {
        shop.comparison = "比較店舗蓄積中";
        shop.peerAvg30 = null;
        shop.diffPct = null;
        continue;
      }
      const peerAvg30 = Math.round(peers.reduce((sum, value) => sum + value, 0) / peers.length);
      const diffPct = Math.round((shop.avg30 / peerAvg30 - 1) * 100);
      shop.peerAvg30 = peerAvg30;
      shop.diffPct = diffPct;
      shop.comparison = diffPct >= 10 ? "他店より高い" : diffPct <= -10 ? "他店より安い" : "他店平均くらい";
    }
    const averageAcrossShops = (key) => {
      const values = shopEntries.map(([, shop]) => shop[key]).filter((value) => Number(value) > 0);
      return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
    };
    summaryCards[card.id] = {
      shops,
      total7,
      total30,
      total90,
      shop7: shopEntries.filter(([, shop]) => shop.c7 > 0).length,
      shop30: shopEntries.filter(([, shop]) => shop.c30 > 0).length,
      shop90: shopEntries.filter(([, shop]) => shop.c90 > 0).length,
      currentShops: shopEntries.filter(([, shop]) => Number(shop.price) > 0).length,
      avg7: averageAcrossShops("avg7"),
      avg30: averageAcrossShops("avg30"),
      avg90: averageAcrossShops("avg90"),
      demand: demandLabel(total30, observedDays, shopEntries.length),
    };
  }

  for (const [id, card] of Object.entries(previousSummary.cards || {})) {
    for (const [shopId, row] of Object.entries(card.shops || {})) {
      if (!activeShopIds.has(shopId) || results.some((result) => result.shop.id === shopId) || summaryCards[id]?.shops?.[shopId]) continue;
      summaryCards[id] ||= { shops: {}, total7: 0, total30: 0, total90: 0 };
      summaryCards[id].shops[shopId] = { ...row, fulfilment: SHOPS.find((s) => s.id === shopId)?.fulfilment || "mail" };
      for (const days of [7, 30, 90]) summaryCards[id][`total${days}`] += Number(row[`c${days}`] || 0);
    }
  }
  for (const card of Object.values(summaryCards)) {
    const rows = Object.values(card.shops);
    for (const days of [7, 30, 90]) {
      card[`shop${days}`] = rows.filter((row) => Number(row[`c${days}`]) > 0).length;
      const values = rows.map((row) => row[`avg${days}`]).filter((value) => Number(value) > 0).map(Number);
      card[`avg${days}`] = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
    }
    card.currentShops = rows.filter((row) => Number(row.price) > 0).length;
  }

  const shopMeta = {};
  for (const shop of SHOPS) {
    const result = results.find((entry) => entry.shop.id === shop.id);
    const confirmedAt=new Date().toISOString();
    const previous = previousSummary.shops?.[shop.id] || {};
    if (result?.savedReplay) {
      shopMeta[shop.id] = {...previous,matched:result.matched.length,
        activeMatched:result.matched.filter(item=>item.active===true).length,unmatched:result.unmatched.length};
      continue;
    }
    const trustStats = priceTrust.stats[shop.id] || { priceObservations: 0, outliers: 0, quarantinedPairs: 0 };
    const matchedItems = result ? result.matched.length : Number(previous.matched || 0);
    const mismatchSuspicions = result
      ? result.matched.filter((item) => decisionModel.matchConfidenceLabel(item.score) === "low").length
      : Number(previous.mismatchSuspicions || 0);
    const reliability = marketModel.sourceReliability({
      scheduledDays: history.dates.filter((date) => date >= (history.observedByShop[shop.id]?.[0] || date)).length,
      successfulDays: (history.observedByShop[shop.id] || []).length,
      priceObservations: trustStats.priceObservations,
      outliers: trustStats.outliers,
      matchedItems,
      mismatchSuspicions,
    });
    shopMeta[shop.id] = {
      name: shop.name,
      url: shop.url,
      fulfilment: shop.fulfilment || "mail",
      merchantId: shop.merchantId || shop.id.replace(/-(?:store|mail)$/, ''),
      branch:shop.branch || previous.branch || null,
      acceptanceUrl:shop.acceptanceUrl || previous.acceptanceUrl || null,
      conditions:shop.conditions || previous.conditions || null,
      acquisitionPermission: readJson(path.join(__dirname, 'buyback-source-permissions.json'), {}).sources?.[shop.id]?.status || null,
      permissionCheckedAt: readJson(path.join(__dirname, 'buyback-source-permissions.json'), {}).sources?.[shop.id]?.checkedAt || null,
      lastAttempt: result || failures.some((f) => f.source === shop.id && !f.permissionWait && !f.reviewWait) ? confirmedAt : previous.lastAttempt || null,
      reviewStatus:result?null:failures.find(f=>f.source===shop.id)?.accessHold?'access-review':/形式変更/.test(failures.find(f=>f.source===shop.id)?.error||'')?'format-review':previous.reviewStatus || null,
      adapterVersion:result?.adapterVersion || previous.adapterVersion || null,
      coverageComplete:result?result.fullListing===true:previous.coverageComplete ?? null,
      duplicateSourceIds:result?.duplicateSourceIds ?? previous.duplicateSourceIds ?? null,
      reviewAdapterVersion:shop.adapterVersion || null,
      lastSuccess: result ? confirmedAt : previous.lastSuccess || null,
      fullListingConfirmedAt: result?.fullListing === true ? null : previous.fullListingConfirmedAt || null,
      sourceTotal: result?.sourceTotal ?? previous.sourceTotal ?? null,
      fetched: result?.items?.length ?? previous.fetched ?? null,
      attempted: result?.items?.length ?? null,
      newAcquired: result ? result.items.filter((item) => ![...(previousCatalog[shop.id] || []), ...(previousUnmatched[shop.id] || [])].some((old) => old.shopItemId === item.shopItemId)).length : null,
      newLinked: result ? new Set(result.matched.filter((item) => !previousSummary.cards?.[item.cardId]?.shops?.[shop.id]).map((item) => item.cardId)).size : null,
      usableNet: result ? new Set(result.matched.filter((item) => item.active && !quarantine[`${shop.id}:${item.cardId}`] && decisionModel.matchConfidenceLabel(item.score)==='high').map((item) => item.cardId)).size
        - Object.values(previousSummary.cards || {}).filter(card=>freshUsablePrice(card.shops?.[shop.id],previous)).length : null,
      unmatched: result?.unmatched?.length ?? previous.unmatched ?? null,
      sourceUpdatedAt: result ? null : previous.sourceUpdatedAt || null,
      pagination: result?.pagination || previous.pagination || null,
      error: result ? result.coverageWarning || null : readJson(path.join(__dirname, 'buyback-source-permissions.json'), {}).sources?.[shop.id]?.reason || failures.find((f) => f.source === shop.id)?.error || previous.error || null,
      observedDays: (history.observedByShop[shop.id] || []).length,
      matched: result ? result.matched.length : Number(previous.matched || 0),
      activeMatched: result ? result.matched.filter((item) => item.active).length : Number(previous.activeMatched || 0),
      refreshed: Boolean(result),
      observed7: observedRecent(history.observedByShop[shop.id], latestHistoryDate, 7),
      observed30: observedRecent(history.observedByShop[shop.id], latestHistoryDate, 30),
      observed90: observedRecent(history.observedByShop[shop.id], latestHistoryDate, 90),
      priceObservations: trustStats.priceObservations,
      outliers: trustStats.outliers,
      mismatchSuspicions,
      quarantinedPairs: trustStats.quarantinedPairs,
      reliability,
    };
  }
  const catalog = { ...readJson(catalogPath, {}).shops, ...Object.fromEntries(results.map((result) => [result.shop.id, result.matched])) };
  const unmatched = { ...readJson(unmatchedPath, {}).shops, ...Object.fromEntries(results.map((result) => [result.shop.id, result.unmatched])) };
  for (const result of results) if (!result.savedReplay && (result.fullListing === true || result.coverageComplete === true)) {
    shopMeta[result.shop.id].fullListingConfirmedAt = shopMeta[result.shop.id].lastSuccess;
    history.identityIncompleteByShop ||= {};
    const dates = new Set(history.identityIncompleteByShop[result.shop.id] || []);
    if (result.unmatched.length) dates.add(today); else dates.delete(today);
    history.identityIncompleteByShop[result.shop.id] = [...dates].sort();
  }
  fs.writeFileSync(historyPath, JSON.stringify(history), "utf8");
  fs.writeFileSync(catalogPath, JSON.stringify({ updatedAt: today, shops: catalog }), "utf8");
  fs.writeFileSync(unmatchedPath, JSON.stringify({ updatedAt: today, shops: unmatched }), "utf8");
  fs.writeFileSync(itemMatchesPath, JSON.stringify(itemMatches), "utf8");
  fs.writeFileSync(imageMatchesPath, JSON.stringify(imageMatches), "utf8");
  fs.writeFileSync(quarantinePath, JSON.stringify({ updatedAt: today, pairs: quarantine }), "utf8");
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify({ updatedAt: today, dates: history.dates, shops: shopMeta, cards: summaryCards }), "utf8");
  if (failures.length) throw new Error(`一部取得失敗（正常データ保持）: ${failures.map((f) => `${f.source}: ${f.error}`).join("; ")}`);
}

if (require.main === module) main({rebuildSaved:process.argv.includes('--rebuild-saved')}).catch((error) => {
  if (fs.existsSync(SUMMARY_PATH)) {
    console.warn(`shop buyback refresh skipped; existing data was preserved: ${error.message || error}`);
    process.exitCode = 1;
    return;
  }
  console.error(error);
  process.exitCode = 1;
});
module.exports = { main, SHOPS, fetchText, savedMatchConfidence, freshUsablePrice };
