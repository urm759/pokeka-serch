const fs = require("fs");
const path = require("path");

const SHOP_ORIGIN = "https://www.hareruya2.com";
const READER_ORIGIN = "https://r.jina.ai/http://www.hareruya2.com";

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

function isAttemptDue(attempt, signature, now = Date.now()) {
  if (!attempt || attempt.signature !== signature) return true;
  const checkedAt = Date.parse(attempt.checkedAt || "");
  if (!Number.isFinite(checkedAt)) return true;
  return now - checkedAt >= 30 * 86400000;
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[‐−–—]/g, "-")
    .replace(/[「」『』【】\[\]〈〉(){}:：・,，.\s]/g, "")
    .replace(/&/g, "")
    .trim();
}

function packMatchKey(value) {
  return normalize(value)
    .replace(/(?:強化)?拡張パック/g, "")
    .replace(/ハイクラスパック/g, "")
    .replace(/(?:スターター|スタート)セット/g, "")
    .replace(/デッキビルドbox/g, "")
    .replace(/ポケモンカードゲーム/g, "")
    .replace(/プレミアムトレーナーボックス/g, "")
    .replace(/(?:ex|gx)$/, "")
    .trim();
}

function compactName(value) {
  return normalize(value)
    .replace(/(?:sar|hr|sr|ur|csr|chr|ar|rrr|rr|ssr|s|r|u|c|p|pr|h)$/i, "")
    .replace(/(?:sa|スペシャルアート)$/i, "");
}

function cardFinish(value) {
  const text = String(value || "");
  if (/マスターボールミラー|マスボ(?:ミラー)?/i.test(text)) return "master";
  if (/モンスターボールミラー|モンボ(?:ミラー)?/i.test(text)) return "monster";
  if (/SAR\s*仕様/i.test(text)) return "sar-style";
  if (/ミラー/i.test(text)) return "mirror";
  if (/旧裏/i.test(text)) return "old-back";
  if (/英語版/i.test(text)) return "english";
  if (/\b1ED\b|初版/i.test(text)) return "first";
  return "";
}

function stateFromTitle(title) {
  const text = String(title || "");
  if (/\b(?:PSA|BGS|CGC)\s*\d+/i.test(text) || /鑑定品/.test(text)) return "graded";
  const match = text.match(/【\s*状態\s*([A-D])\s*】/i);
  return match ? match[1].toUpperCase() : "A";
}

function extractCardSignature(card) {
  const source = String(card?.name || "").replace(/\s+/g, " ").trim();
  const sourceWithoutPack = source.replace(/\([^()]*\)\s*$/, "").trim();
  const setAndNumber = source.match(/\[\s*([A-Za-z0-9-]+)\s+(\d{1,4}(?:\s*[-/]\s*\d{1,4})?)\s*\]/);
  const promoNumberFirst = source.match(/\[\s*(\d{1,4})\s+([A-Za-z0-9-]+-P)\s*\]/i);
  const setCode = promoNumberFirst?.[2] || setAndNumber?.[1] || "";
  const cardNo = promoNumberFirst?.[1] || setAndNumber?.[2] || String(card?.model || "").replace(/^[A-Za-z-]+\s+/, "");
  const base = sourceWithoutPack
    .split("[")[0]
    .replace(/\b(?:MUR|BWR|MA|SSR|CSR|CHR|SAR|UR|HR|SR|RRR|RR|AR|PR|P|H|C|U|R)\b(?:\s*[:：]\s*SA)?/gi, " ")
    .replace(/[:：]\s*(?:SA|プロモ|ミラー|英語版|旧裏|仕様)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const pack = (source.match(/\(([^()]*)\)\s*$/) || [])[1] || "";
  return {
    setCode: normalize(setCode),
    cardNo: String(cardNo || "").replace(/\s/g, ""),
    base: compactName(base),
    finish: cardFinish(source),
    pack: normalize(pack),
  };
}

function extractProductSignature(product) {
  const title = String(product?.title || "").replace(/^【\s*状態\s*[A-D]\s*】/i, "").trim();
  const setCode = (title.match(/\[\s*([A-Za-z0-9-]+)\s*\]/) || [])[1] || "";
  const cardNo = (title.match(/〈\s*([^〉]+?)\s*〉/) || [])[1] || "";
  const base = title
    .split("{")[0]
    .split("〈")[0]
    .replace(/\([^)]*\)/g, " ")
    .replace(/[:：]\s*(?:SA|プロモ|ミラー|英語版|旧裏|仕様)/gi, " ")
    .replace(/#\d+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { setCode: normalize(setCode), cardNo: String(cardNo).replace(/\s/g, ""), base: compactName(base), finish: cardFinish(title) };
}

function sameCardNo(left, right) {
  const normalizePart = (part) => {
    const trimmed = String(part || "").trim();
    return /^\d+$/.test(trimmed) ? String(Number(trimmed)) : trimmed.toLowerCase();
  };
  const leftParts = String(left || "").split(/[/-]/).map(normalizePart).filter(Boolean);
  const rightParts = String(right || "").split(/[/-]/).map(normalizePart).filter(Boolean);
  if (!leftParts.length || !rightParts.length) return false;
  if (leftParts.length !== rightParts.length) return leftParts[0] === rightParts[0] && (leftParts.length === 1 || rightParts.length === 1);
  return leftParts.every((part, index) => part === rightParts[index]);
}

function productMatchesCard(card, product) {
  const cardSig = extractCardSignature(card);
  const productSig = extractProductSignature(product);
  if (!cardSig.setCode || !cardSig.cardNo || cardSig.setCode !== productSig.setCode || !sameCardNo(cardSig.cardNo, productSig.cardNo)) return false;
  if (cardSig.finish !== productSig.finish && (cardSig.finish || productSig.finish)) return false;
  if (!cardSig.base || !productSig.base) return true;
  return productSig.base.includes(cardSig.base) || cardSig.base.includes(productSig.base);
}

function productPrice(product) {
  const values = (product?.variants || []).map((variant) => Number(variant.price)).filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? Math.min(...values) : null;
}

function isAvailable(product) {
  return (product?.variants || []).some((variant) => variant.available === true);
}

function productUrl(product) {
  const handle = String(product?.handle || "").trim();
  return handle ? `${SHOP_ORIGIN}/products/${encodeURIComponent(handle)}` : "";
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJson(url) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" }, signal: controller.signal });
      if (response.ok) return await response.json();
      if ((response.status === 429 || response.status >= 500) && attempt < 4) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const retryDelay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 0;
        await sleep(Math.max(retryDelay, 1500 * (attempt + 1)));
        continue;
      }
      throw new Error(`HTTP ${response.status}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("HTTP retry exhausted");
}

function searchEraPriority(card) {
  const setCode = extractCardSignature(card).setCode.toUpperCase();
  if (/^(?:SV|S\d|S-P|SM|SM-P)/.test(setCode)) return 4;
  if (/^(?:XY|XY-P|BW|BW-P)/.test(setCode)) return 3;
  if (/^(?:DP|DP-P|PCG)/.test(setCode)) return 2;
  return 1;
}

async function fetchText(url) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0", "x-return-format": "markdown" },
        signal: controller.signal,
      });
      if (response.ok) return await response.text();
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw new Error(`HTTP ${response.status}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("HTTP retry exhausted");
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
  await Promise.all(Array.from({ length: Math.max(1, limit) }, worker));
  return results;
}

async function fetchAllCollections() {
  const collections = [];
  for (let page = 1; page <= 20; page += 1) {
    const payload = await fetchJson(`${SHOP_ORIGIN}/collections.json?limit=250&page=${page}`);
    const rows = Array.isArray(payload?.collections) ? payload.collections : [];
    collections.push(...rows);
    if (rows.length < 250) break;
  }
  return collections;
}

function findCollectionForPack(pack, collections) {
  if (!pack) return null;
  const packKey = packMatchKey(pack);
  const exact = collections.find((collection) => normalize(collection.title) === pack);
  if (exact) return exact;
  const normalizedExact = packKey && collections.find((collection) => packMatchKey(collection.title) === packKey);
  if (normalizedExact) return normalizedExact;
  const candidates = collections
    .filter((collection) => {
      const title = normalize(collection.title);
      const titleKey = packMatchKey(collection.title);
      return title.length >= 6 && (
        title.includes(pack) ||
        pack.includes(title) ||
        (packKey.length >= 4 && titleKey.length >= 4 && (titleKey.includes(packKey) || packKey.includes(titleKey)))
      );
    })
    .sort((left, right) => Math.abs(packMatchKey(left.title).length - packKey.length) - Math.abs(packMatchKey(right.title).length - packKey.length));
  return candidates[0] || null;
}

async function fetchCollectionProducts(handle) {
  const products = [];
  for (let page = 1; page <= 20; page += 1) {
    const payload = await fetchJson(`${SHOP_ORIGIN}/collections/${encodeURIComponent(handle)}/products.json?limit=250&page=${page}`);
    const rows = Array.isArray(payload?.products) ? payload.products : [];
    products.push(...rows);
    if (rows.length < 250) break;
  }
  return products;
}

async function fetchSearchProducts(card) {
  const signature = extractCardSignature(card);
  if (!signature.setCode || !signature.cardNo) return [];
  const query = `${signature.cardNo} ${signature.setCode}`;
  const markdown = await fetchText(`${READER_ORIGIN}/search?q=${encodeURIComponent(query)}&type=product`);
  const handles = [...new Set(
    [...String(markdown || "").matchAll(/\/products\/([^?#/\s)]+)/g)]
      .map((match) => decodeURIComponent(match[1]))
      .filter(Boolean)
  )].slice(0, 8);
  return mapLimit(handles, 3, async (handle) => {
    try {
      return await fetchJson(`${SHOP_ORIGIN}/products/${encodeURIComponent(handle)}.js`);
    } catch {
      return null;
    }
  }).then((rows) => rows.filter(Boolean));
}

function chooseProduct(products) {
  return [...products].sort((left, right) => {
    const availableDiff = Number(isAvailable(right)) - Number(isAvailable(left));
    if (availableDiff) return availableDiff;
    const genericDiff = Number(!/#\d+/.test(left.title || "")) - Number(!/#\d+/.test(right.title || ""));
    if (genericDiff) return -genericDiff;
    return Number(productPrice(left) || Infinity) - Number(productPrice(right) || Infinity);
  })[0] || null;
}

function parseProductPage(markdown, fallbackUrl) {
  const text = String(markdown || "");
  const title = (text.match(/^#\s+(.+)$/m) || text.match(/<h1[^>]*>\s*([\s\S]*?)\s*<\/h1>/i) || [])[1] || "";
  const state = stateFromTitle(title);
  const priceLabel = (text.match(/販売価格\s*[:：]\s*¥?([0-9,]+)/) || [])[1];
  const priceJson = (text.match(/"price"\s*:\s*([0-9]+)/) || [])[1];
  const price = Number(String(priceLabel || (priceJson ? Math.round(Number(priceJson) / 100) : "")).replace(/,/g, ""));
  const stockMatch = text.match(/(?:id="Inventory-[^"]+"[\s\S]{0,160}?>\s*)?在庫\s*([0-9,]+)/i);
  const stock = stockMatch ? Number(stockMatch[1].replace(/,/g, "")) : /SOLD OUT|売り切れ/i.test(text) ? 0 : null;
  return {
    valid: state === "A" && (Number.isFinite(stock) || Number.isFinite(price)),
    state,
    price: Number.isFinite(price) && price > 0 ? price : null,
    stock: Number.isFinite(stock) ? stock : null,
    url: fallbackUrl,
  };
}

function averageDailyDecrease(values, days) {
  const recent = values.slice(-Math.min(values.length, days + 1));
  let decrease = 0;
  let pairs = 0;
  for (let index = 1; index < recent.length; index += 1) {
    if (!Number.isFinite(recent[index - 1]) || !Number.isFinite(recent[index])) continue;
    decrease += Math.max(0, recent[index - 1] - recent[index]);
    pairs += 1;
  }
  return pairs ? Math.round(decrease / pairs * 100) / 100 : null;
}

function totalDecrease(values, days) {
  const recent = values.slice(-Math.min(values.length, days + 1));
  let decrease = 0;
  let pairs = 0;
  for (let index = 1; index < recent.length; index += 1) {
    if (!Number.isFinite(recent[index - 1]) || !Number.isFinite(recent[index])) continue;
    decrease += Math.max(0, recent[index - 1] - recent[index]);
    pairs += 1;
  }
  return pairs ? Math.round(decrease * 100) / 100 : null;
}

function quantile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * ratio)];
}

function learnDemandThresholds(history) {
  const rates = Object.values(history.stocks || []).map((values) => {
    if (values.filter(Number.isFinite).length < 7) return null;
    return averageDailyDecrease(values, 30);
  }).filter((value) => Number.isFinite(value) && value > 0);
  return {
    minimumSamples: 7,
    normalDaily: Math.max(0.2, Number(quantile(rates, 0.5) || 0)),
    highDaily: Math.max(0.75, Number(quantile(rates, 0.85) || 0)),
    normalTotal: 2,
    highTotal: 4,
    cohortSize: rates.length,
  };
}

function demandLabel(avg30, drop30, samples, model) {
  if (samples < model.minimumSamples || !Number.isFinite(avg30) || !Number.isFinite(drop30)) return "蓄積中";
  if (avg30 >= model.highDaily && drop30 >= model.highTotal) return "買う人が多い";
  if (avg30 >= model.normalDaily && drop30 >= model.normalTotal) return "普通";
  return "少ない";
}

function writeSummary(cards, catalog, history, paths) {
  const catalogById = new Map(catalog.map((entry) => [entry.cardId, entry]));
  const currentIndex = history.dates.length - 1;
  const model = learnDemandThresholds(history);
  const summary = {};
  for (const card of cards) {
    const entry = catalogById.get(card.id);
    const values = history.stocks[card.id] || [];
    if (!entry && !values.length) continue;
    const samples = values.filter(Number.isFinite).length;
    const avg30 = averageDailyDecrease(values, 30);
    const drop30 = totalDecrease(values, 30);
    summary[card.id] = {
      stock: Number.isFinite(values[currentIndex]) ? values[currentIndex] : Number.isFinite(entry?.stock) ? entry.stock : null,
      hareruya2Price: Number(entry?.price) > 0 ? Number(entry.price) : null,
      avg7: averageDailyDecrease(values, 7),
      avg30,
      avg90: averageDailyDecrease(values, 90),
      drop7: totalDecrease(values, 7),
      drop30,
      demand: demandLabel(avg30, drop30, samples, model),
      samples,
    };
  }
  fs.writeFileSync(paths.summary, JSON.stringify({ updatedAt: jstDate(), demandModel: model, cards: summary }), "utf8");
}

async function main() {
  const root = path.join(__dirname, "..");
  const paths = {
    cards: path.join(root, "data", "pokemon-cards.json"),
    meta: path.join(root, "data", "pokemon-cards-meta.json"),
    catalog: path.join(__dirname, "hareruya2_catalog.json"),
    history: path.join(__dirname, "hareruya2_stock_history.json"),
    progress: path.join(__dirname, "hareruya2_collection_progress.json"),
    summary: path.join(root, "data", "hareruya2-stock-summary.json"),
  };
  const cards = safeReadJson(paths.cards, []);
  const meta = safeReadJson(paths.meta, {});
  let catalog = safeReadJson(paths.catalog, []);
  const history = safeReadJson(paths.history, { dates: [], stocks: {} });
  const progress = safeReadJson(paths.progress, { completedHandles: [], attemptedCards: {} });
  if (!progress.attemptedCards || typeof progress.attemptedCards !== "object") progress.attemptedCards = {};
  if (!progress.searchAttemptedCards || typeof progress.searchAttemptedCards !== "object") progress.searchAttemptedCards = {};
  const catalogById = new Map(catalog.map((entry) => [entry.cardId, entry]));

  let collections = [];
  let collectionWarning = "";
  const skipCollectionDiscovery = process.env.HARERUYA2_SKIP_COLLECTION_DISCOVERY === "1";
  if (!skipCollectionDiscovery) {
    try {
      collections = await fetchAllCollections();
    } catch (error) {
      collectionWarning = error.message;
      console.warn(`hareruya2 collection discovery deferred: ${collectionWarning}`);
    }
  }
  const pendingGroups = new Map();
  const forceRecheck = process.env.HARERUYA2_RECHECK_ALL === "1";
  for (const card of cards.filter((row) => !catalogById.has(row.id))) {
    const signature = extractCardSignature(card);
    const signatureKey = [signature.setCode, signature.cardNo, signature.base, signature.finish].join("|");
    if (!forceRecheck && !isAttemptDue(progress.attemptedCards[card.id], signatureKey)) continue;
    const collection = findCollectionForPack(signature.pack, collections);
    if (!collection?.handle) continue;
    if (!pendingGroups.has(collection.handle)) pendingGroups.set(collection.handle, { collection, cards: [] });
    pendingGroups.get(collection.handle).cards.push({ card, signatureKey });
  }
  const completed = new Set(progress.completedHandles || []);
  const onlyCollection = String(process.env.HARERUYA2_COLLECTION_HANDLE || "").trim();
  const unprocessed = [...pendingGroups.values()].filter((group) => !onlyCollection || group.collection.handle === onlyCollection);
  const requestedBatch = Number(process.env.HARERUYA2_COLLECTION_BATCH || 0);
  const groups = requestedBatch > 0 ? unprocessed.slice(0, requestedBatch) : unprocessed;
  const collectionResults = await mapLimit(groups, Math.max(1, Number(process.env.HARERUYA2_COLLECTION_CONCURRENCY || 5)), async (group) => {
    try {
      return { group, products: await fetchCollectionProducts(group.collection.handle) };
    } catch (error) {
      return { group, products: [], error: error.message };
    }
  });
  let linked = 0;
  for (const result of collectionResults) {
    if (result.error) continue;
    completed.add(result.group.collection.handle);
    for (const target of result.group.cards) {
      const { card, signatureKey } = target;
      const matches = result.products.filter((product) => stateFromTitle(product.title) === "A" && productMatchesCard(card, product));
      const match = chooseProduct(matches);
      progress.attemptedCards[card.id] = { signature: signatureKey, checkedAt: new Date().toISOString(), found: Boolean(match) };
      if (!match) continue;
      const entry = {
        cardId: card.id,
        name: match.title,
        detailUrl: productUrl(match),
        handle: match.handle,
        state: "A",
        price: productPrice(match),
        stock: null,
        available: isAvailable(match),
        observedAt: jstDate(),
      };
      catalogById.set(card.id, entry);
      linked += 1;
    }
  }

  // Some older packs use a different collection name. Fall back to an exact
  // card-number search, while retaining attempts so daily refreshes stay small.
  const forceSearch = process.env.HARERUYA2_SEARCH_RECHECK_ALL === "1";
  const requestedSearchBatch = Number(process.env.HARERUYA2_SEARCH_BATCH || 40);
  const searchCandidates = cards
    .filter((card) => !catalogById.has(card.id))
    .filter((card) => {
      const signature = extractCardSignature(card);
      const signatureKey = [signature.setCode, signature.cardNo, signature.base, signature.finish].join("|");
      return signature.setCode && signature.cardNo && (forceSearch || isAttemptDue(progress.searchAttemptedCards[card.id], signatureKey));
    })
    .sort((left, right) => {
      const eraDiff = searchEraPriority(right) - searchEraPriority(left);
      if (eraDiff) return eraDiff;
      return Number(right.snkPsa10Price || right.price || 0) - Number(left.snkPsa10Price || left.price || 0);
    });
  let searchTargets = searchCandidates;
  if (requestedSearchBatch > 0 && searchTargets.length > requestedSearchBatch) {
    const cursor = Math.max(0, Number(progress.searchCursor || 0)) % searchTargets.length;
    searchTargets = [...searchTargets.slice(cursor), ...searchTargets.slice(0, cursor)].slice(0, requestedSearchBatch);
    progress.searchCursor = (cursor + searchTargets.length) % searchCandidates.length;
  }
  const searchResults = await mapLimit(searchTargets, Math.max(1, Number(process.env.HARERUYA2_SEARCH_CONCURRENCY || 3)), async (card) => {
    const signature = extractCardSignature(card);
    const signatureKey = [signature.setCode, signature.cardNo, signature.base, signature.finish].join("|");
    try {
      const products = await fetchSearchProducts(card);
      const matches = products.filter((product) => stateFromTitle(product.title) === "A" && productMatchesCard(card, product));
      const match = chooseProduct(matches);
      progress.searchAttemptedCards[card.id] = { signature: signatureKey, checkedAt: new Date().toISOString(), found: Boolean(match) };
      return { card, match };
    } catch (error) {
      return { card, error: error.message };
    }
  });
  let searchLinked = 0;
  for (const result of searchResults) {
    if (!result.match) continue;
    const match = result.match;
    catalogById.set(result.card.id, {
      cardId: result.card.id,
      name: match.title,
      detailUrl: productUrl(match),
      handle: match.handle,
      state: "A",
      price: productPrice(match),
      stock: null,
      available: isAvailable(match),
      observedAt: jstDate(),
    });
    linked += 1;
    searchLinked += 1;
  }
  catalog = [...catalogById.values()];
  const latestCatalogById = new Map(catalog.map((entry) => [entry.cardId, entry]));
  const nextCards = cards.map((card) => {
    const entry = latestCatalogById.get(card.id);
    if (!entry?.detailUrl) return card;
    return { ...card, hareruya2Url: entry.detailUrl };
  });

  // Save newly confirmed links before the slower stock pass. A network timeout
  // must not make the next run repeat the same matching work.
  progress.completedHandles = [...completed];
  progress.lastRun = {
    checkedCards: collectionResults.reduce((sum, result) => sum + result.group.cards.length, 0),
    searchChecked: searchTargets.length,
    linked,
    searchLinked,
    updatedAt: jstDate(),
  };
  fs.writeFileSync(paths.cards, JSON.stringify(nextCards), "utf8");
  fs.writeFileSync(paths.catalog, JSON.stringify(catalog), "utf8");
  fs.writeFileSync(paths.progress, JSON.stringify(progress), "utf8");

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
  const force = process.env.HARERUYA2_STOCK_FORCE === "1";
  const stockBatch = Number(process.env.HARERUYA2_STOCK_BATCH || 800);
  let stockTargets = nextCards.filter((card) => card.hareruya2Url && (force || !Number.isFinite(history.stocks[card.id]?.[dateIndex])));
  if (stockBatch > 0 && stockTargets.length > stockBatch) {
    const cursor = Math.max(0, Number(progress.stockCursor || 0)) % stockTargets.length;
    stockTargets = [...stockTargets.slice(cursor), ...stockTargets.slice(0, cursor)].slice(0, stockBatch);
    progress.stockCursor = (cursor + stockTargets.length) % Math.max(1, nextCards.filter((card) => card.hareruya2Url).length);
  }
  const stockResults = await mapLimit(stockTargets, Math.max(1, Number(process.env.HARERUYA2_STOCK_CONCURRENCY || 10)), async (card) => {
    try {
      const handle = String(card.hareruya2Url || "");
      const productHandle = encodeURIComponent(handle.split("/").pop());
      let page = parseProductPage(await fetchText(`${SHOP_ORIGIN}/products/${productHandle}`), card.hareruya2Url);
      if (!Number.isFinite(page.stock)) {
        page = parseProductPage(await fetchText(`${READER_ORIGIN}/products/${productHandle}`), card.hareruya2Url);
      }
      return { card, page };
    } catch (error) {
      return { card, error: error.message };
    }
  });
  let checked = 0;
  let rejected = 0;
  for (const result of stockResults) {
    if (result.error) continue;
    const entry = latestCatalogById.get(result.card.id);
    if (!entry || !result.page.valid) {
      if (result.page?.state && result.page.state !== "A") rejected += 1;
      continue;
    }
    entry.price = result.page.price || entry.price;
    entry.stock = result.page.stock;
    entry.available = result.page.stock !== 0;
    entry.observedAt = today;
    if (!history.stocks[result.card.id]) history.stocks[result.card.id] = Array(history.dates.length).fill(null);
    while (history.stocks[result.card.id].length < history.dates.length) history.stocks[result.card.id].unshift(null);
    history.stocks[result.card.id][dateIndex] = result.page.stock;
    checked += 1;
  }

  const coverage = nextCards.filter((card) => card.hareruya2Url).length;
  meta.hareruya2Coverage = { matched: coverage, total: nextCards.length, updatedAt: today };
  progress.completedHandles = [...completed];
  progress.lastRun = { checkedCards: collectionResults.reduce((sum, result) => sum + result.group.cards.length, 0), linked, stockChecked: checked, updatedAt: today };
  fs.writeFileSync(paths.cards, JSON.stringify(nextCards), "utf8");
  fs.writeFileSync(paths.meta, JSON.stringify(meta), "utf8");
  fs.writeFileSync(paths.catalog, JSON.stringify(catalog), "utf8");
  fs.writeFileSync(paths.history, JSON.stringify(history), "utf8");
  fs.writeFileSync(paths.progress, JSON.stringify(progress), "utf8");
  writeSummary(nextCards, catalog, history, paths);
  console.log(`hareruya2 collections=${groups.length}/${unprocessed.length} linked=${linked} search=${searchLinked}/${searchTargets.length} coverage=${coverage}/${nextCards.length} stock=${checked}/${stockTargets.length} rejected=${rejected}${collectionWarning ? ` collectionWarning=${collectionWarning}` : ""}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
