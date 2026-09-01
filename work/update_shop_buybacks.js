const fs = require("fs");
const path = require("path");

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
    name: "買取ホムラ（郵送）",
    url: "https://kaitori-homura.com/products?q%5Bproduct_sub_category_id_eq%5D=182&q%5Bproduct_sub_category_product_category_id_eq%5D=21&sort=price_desc",
    fetchItems: fetchKaitoriHomura,
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
      const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
      if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
      return response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
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

function countRecent(values, days) {
  return values.slice(-days).filter((value) => Number(value) > 0).length;
}

function averageRecent(values, days) {
  const prices = values.slice(-days).filter((value) => Number(value) > 0).map(Number);
  return prices.length ? Math.round(prices.reduce((sum, value) => sum + value, 0) / prices.length) : null;
}

function demandLabel(count30, observedDays, shopCount) {
  if (observedDays < 7) return "買取掲載数：蓄積中";
  const rate = count30 / (Math.min(30, observedDays) * Math.max(1, shopCount));
  if (rate >= 0.7) return "買取掲載数：多い";
  if (rate >= 0.3) return "買取掲載数：普通";
  return "買取掲載数：少ない";
}

async function main() {
  const cards = readJson(path.join(ROOT, "data", "pokemon-cards.json"), []);
  const historyPath = path.join(__dirname, "shop_buyback_history.json");
  const catalogPath = path.join(__dirname, "shop_buyback_catalog.json");
  const unmatchedPath = path.join(__dirname, "shop_buyback_unmatched.json");
  const itemMatchesPath = path.join(__dirname, "shop_buyback_item_matches.json");
  const imageMatchesPath = path.join(__dirname, "shop_buyback_image_matches.json");
  const imageMatches = readJson(imageMatchesPath, {});
  const itemMatches = readJson(itemMatchesPath, {});
  const history = readJson(historyPath, { dates: [], shops: {} });
  const activeShopIds = new Set(SHOPS.map((shop) => shop.id));
  // A removed shop must not continue to affect historical averages or demand.
  for (const shopId of Object.keys(history.shops || {})) {
    if (!activeShopIds.has(shopId)) delete history.shops[shopId];
  }
  for (const cache of [imageMatches, itemMatches]) {
    for (const sourceKey of Object.keys(cache)) {
      if (sourceKey.startsWith("toreca-birth-store:")) delete cache[sourceKey];
    }
  }
  const matchCard = buildMatcher(cards);
  const results = [];
  for (const shop of SHOPS) {
    try {
      const fetched = await shop.fetchItems(shop);
      const matched = [];
      const unmatched = [];
      for (const item of fetched.items) {
        const sourceKey = `${shop.id}:${item.shopItemId}`;
        const verifiedCard = item.verifiedCardId ? cards.find((card) => card.id === item.verifiedCardId) : null;
        const manualCardId = imageMatches[sourceKey];
        const imageCard = manualCardId ? cards.find((card) => card.id === manualCardId) : null;
        const cachedCardId = itemMatches[sourceKey];
        const cachedCard = cachedCardId ? cards.find((card) => card.id === cachedCardId) : null;
        const result = verifiedCard || imageCard || cachedCard ? null : matchCard(item);
        if (verifiedCard) {
          itemMatches[sourceKey] = verifiedCard.id;
          matched.push({ ...item, cardId: verifiedCard.id, score: 100, matchMethod: "image-reviewed" });
        } else if (imageCard) {
          itemMatches[sourceKey] = imageCard.id;
          matched.push({ ...item, cardId: imageCard.id, score: 100, matchMethod: "image-reviewed" });
        } else if (cachedCard) matched.push({ ...item, cardId: cachedCard.id, score: 100, matchMethod: "confirmed-cache" });
        else if (result) {
          if (result.score >= 90) itemMatches[sourceKey] = result.card.id;
          matched.push({ ...item, cardId: result.card.id, score: result.score, matchMethod: "text" });
        }
        else unmatched.push(item);
      }
      results.push({ shop, pages: fetched.pages, items: fetched.items, matched, unmatched });
      console.log(`${shop.name}: pages=${fetched.pages}, items=${fetched.items.length}, matched=${matched.length}, activeMatched=${matched.filter((item) => item.active).length}, unmatched=${unmatched.length}`);
    } catch (error) {
      console.warn(`${shop.name}: existing data was preserved: ${error.message || error}`);
    }
  }
  if (!results.length) throw new Error("全店舗の取得に失敗しました");

  const today = jstDate();
  const previousDates = [...history.dates];
  const observedDates = results.flatMap((result) => result.items.map((item) => item.observedDate || today));
  const targetDates = [...new Set([...previousDates, today, ...observedDates])]
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
    const shopId = result.shop.id;
    currentLinksByShop[shopId] = new Map();
    if (!history.shops[shopId]) history.shops[shopId] = {};
    const shopHistory = history.shops[shopId];
    for (const values of Object.values(shopHistory)) {
      while (values.length < history.dates.length) values.push(null);
    }
    const refreshedDates = [...new Set(result.items.map((item) => item.observedDate || today))];
    for (const values of Object.values(shopHistory)) {
      for (const date of refreshedDates) {
        const index = history.dates.indexOf(date);
        if (index >= 0) values[index] = null;
      }
    }
    for (const item of result.matched.filter((entry) => entry.active)) {
      if (!shopHistory[item.cardId]) shopHistory[item.cardId] = Array(history.dates.length).fill(null);
      const itemDate = item.observedDate || today;
      const itemDateIndex = history.dates.indexOf(itemDate);
      if (itemDateIndex < 0) continue;
      const previous = Number(shopHistory[item.cardId][itemDateIndex] || 0);
      if (item.price >= previous) {
        shopHistory[item.cardId][itemDateIndex] = item.price;
        const previousLink = currentLinksByShop[shopId].get(item.cardId);
        if (!previousLink || itemDate > previousLink.date || (itemDate === previousLink.date && item.price >= previousLink.price)) {
          currentLinksByShop[shopId].set(item.cardId, {
            url: item.itemUrl || "",
            date: itemDate,
            price: item.price,
            matchMethod: item.matchMethod || "unknown",
            matchScore: Number(item.score || 0),
          });
        }
      }
    }
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
      const latestPriceIndex = values.findLastIndex((value) => Number(value) > 0);
      const currentPrice = latestPriceIndex >= 0 ? Number(values[latestPriceIndex]) : null;
      const currentMatch = currentLinksByShop[shopId]?.get(card.id) || null;
      shops[shopId] = {
        c7, c30, c90, price: currentPrice,
        priceDate: latestPriceIndex >= 0 ? history.dates[latestPriceIndex] : null,
        url: currentMatch?.url || "",
        matchMethod: currentMatch?.matchMethod || null,
        matchScore: currentMatch?.matchScore || null,
        matchConfidence: currentMatch && currentMatch.matchScore < 90 ? "low" : currentMatch ? "high" : null,
        avg7: averageRecent(values, 7),
        avg30: averageRecent(values, 30),
        avg90: averageRecent(values, 90),
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

  const previousSummary = readJson(SUMMARY_PATH, { shops: {} });
  const shopMeta = {};
  for (const shop of SHOPS) {
    const result = results.find((entry) => entry.shop.id === shop.id);
    const previous = previousSummary.shops?.[shop.id] || {};
    shopMeta[shop.id] = {
      name: shop.name,
      url: shop.url,
      observedDays,
      matched: result ? result.matched.length : Number(previous.matched || 0),
      activeMatched: result ? result.matched.filter((item) => item.active).length : Number(previous.activeMatched || 0),
      refreshed: Boolean(result),
    };
  }
  const catalog = Object.fromEntries(results.map((result) => [result.shop.id, result.matched]));
  const unmatched = Object.fromEntries(results.map((result) => [result.shop.id, result.unmatched]));
  fs.writeFileSync(historyPath, JSON.stringify(history), "utf8");
  fs.writeFileSync(catalogPath, JSON.stringify({ updatedAt: today, shops: catalog }), "utf8");
  fs.writeFileSync(unmatchedPath, JSON.stringify({ updatedAt: today, shops: unmatched }), "utf8");
  fs.writeFileSync(itemMatchesPath, JSON.stringify(itemMatches), "utf8");
  fs.writeFileSync(imageMatchesPath, JSON.stringify(imageMatches), "utf8");
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify({ updatedAt: today, dates: history.dates, shops: shopMeta, cards: summaryCards }), "utf8");
}

main().catch((error) => {
  if (fs.existsSync(SUMMARY_PATH)) {
    console.warn(`shop buyback refresh skipped; existing data was preserved: ${error.message || error}`);
    return;
  }
  console.error(error);
  process.exitCode = 1;
});
