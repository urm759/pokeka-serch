const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const YUYUTEI = "https://yuyu-tei.jp";
const TORECA_CAMP = "https://torecacamp-pokemon.com";
const USER_AGENT = "PokecaBuyingGuide/1.0 (+read-only; low-rate)";
const FETCH_METRICS_PATH = path.join(__dirname, "source-fetch-metrics.json");

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function write(file, value) {
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value), "utf8");
  fs.renameSync(temporary, file);
}
function jstDate() { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function normalize(value) {
  return String(value || "").toLowerCase()
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[‐−–—]/g, "-")
    .replace(/[「」『』【】\[\]〈〉(){}:：・,，.\s]/g, "")
    .replace(/(?:状態a|状態b|状態c|状態d|キズなし|美品)/g, "")
    .trim();
}
function cardSignature(card) {
  const name = String(card?.name || "");
  const standard = name.match(/\[\s*([A-Za-z0-9-]+)\s+(\d{1,4}(?:\s*[-/]\s*\d{1,4})?)\s*\]/);
  const promo = name.match(/\[\s*(\d{1,4})\s+([A-Za-z0-9-]+-P)\s*\]/i);
  const setCode = normalizeSetCode(promo?.[2] || standard?.[1] || "");
  const cardNo = String(promo?.[1] || standard?.[2] || "").replace(/\s/g, "");
  const base = normalize(name.split("[")[0]
    .replace(/\b(?:MUR|BWR|MA|SSR|CSR|CHR|SAR|UR|HR|SR|RRR|RR|AR|PR|P|H|C|U|R)\b(?:\s*[:：]\s*SA)?/gi, " ")
    .replace(/[:：]\s*(?:SA|プロモ|ミラー|英語版|旧裏|仕様)/gi, " ")
    .replace(/(?:SAR)?仕様|スペシャルアート/gi, " "));
  return { setCode, cardNo, base };
}
function normalizeSetCode(value) {
  return String(value || "").toLowerCase().replace(/([a-z]+)0+(\d)/i, "$1$2");
}
function numberMatches(left, right) {
  const parts = (value) => String(value || "").split(/[/-]/).map((item) => /^\d+$/.test(item) ? String(Number(item)) : item.toLowerCase()).filter(Boolean);
  const a = parts(left); const b = parts(right);
  return a.length > 0 && b.length > 0 && a.length === b.length && a.every((value, index) => value === b[index]);
}
function titleMatches(card, title, cardNo, setCode = "") {
  const signature = cardSignature(card);
  const promoNumber = String(cardNo || "").match(/^\s*(\d{1,4})\s*\/\s*([A-Za-z]+-P)\s*$/i);
  const comparableNumber = promoNumber?.[1] || cardNo;
  const comparableSetCode = promoNumber?.[2] || setCode;
  if (!signature.cardNo || !numberMatches(signature.cardNo, comparableNumber)) return false;
  if (comparableSetCode && signature.setCode && signature.setCode !== normalizeSetCode(comparableSetCode)) return false;
  const productName = normalize(String(title || "").replace(/\d{1,4}\s*\/\s*\d{1,4}/g, ""));
  return Boolean(signature.base) && (productName.includes(signature.base) || signature.base.includes(productName));
}
function due(attempt, signature) {
  if (!attempt || attempt.signature !== signature) return true;
  const then = Date.parse(attempt.checkedAt || "");
  return !Number.isFinite(then) || Date.now() - then >= 30 * 86400000;
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
let lastRequestAt = 0;
async function fetchText(url, options = {}) {
  const retryLimit = Math.max(0, Number(options.retries ?? process.env.SHOP_FETCH_RETRIES ?? 2));
  const timeoutMs = Math.max(2000, Number(options.timeoutMs ?? process.env.SHOP_FETCH_TIMEOUT_MS ?? 10000));
  const intervalMs = Math.max(0, Number(options.intervalMs ?? process.env.SHOP_ACCESS_INTERVAL_MS ?? 1100));
  let lastMetric = null;
  for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
    const waitMs = Math.max(0, intervalMs - (Date.now() - lastRequestAt));
    if (waitMs) await sleep(waitMs);
    const startedAt = Date.now();
    lastRequestAt = startedAt;
    try {
      const response = await fetch(url, {
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await response.text();
      lastMetric = {
        url, httpStatus: response.status, fetchMs: Date.now() - startedAt,
        bytes: text.length, retryCount: attempt, timedOut: false,
      };
      if (response.ok) return { text, metric: lastMetric };
      if ((response.status === 429 || response.status >= 500) && attempt < retryLimit) {
        await sleep(1000 * (2 ** attempt));
        continue;
      }
      const error = new Error(`HTTP ${response.status}`);
      error.metric = lastMetric;
      throw error;
    } catch (error) {
      if (error.metric) throw error;
      lastMetric = {
        url, httpStatus: null, fetchMs: Date.now() - startedAt,
        bytes: 0, retryCount: attempt, timedOut: error.name === "TimeoutError",
        error: error.message,
      };
      // Network errors and local timeouts are not retried automatically. This
      // avoids repeatedly hammering a source that is unavailable.
      error.metric = lastMetric;
      throw error;
    }
  }
  const error = new Error("retry exhausted");
  error.metric = lastMetric;
  throw error;
}
async function fetchJson(url, options) {
  const result = await fetchText(url, options);
  return { value: JSON.parse(result.text), metric: result.metric };
}
function cacheKey(url) { return crypto.createHash("sha1").update(url).digest("hex"); }
function recordFetchMetric(sourceId, metric) {
  const state = read(FETCH_METRICS_PATH, { version: 1, updatedAt: null, sources: {} });
  state.sources ||= {};
  const source = state.sources[sourceId] || { pages: [], lastSuccessfulPage: null, lastFailure: null };
  source.pages = [...(source.pages || []), metric].slice(-200);
  if (metric.status === "success") source.lastSuccessfulPage = metric.pageKey ?? metric.page ?? null;
  if (metric.status === "failed") {
    source.lastFailure = metric;
    source.failures = [...(source.failures || []), metric].slice(-50);
  }
  source.updatedAt = new Date().toISOString();
  state.sources[sourceId] = source;
  state.updatedAt = source.updatedAt;
  write(FETCH_METRICS_PATH, state);
}
async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length); let cursor = 0;
  async function worker() { while (cursor < items.length) { const index = cursor; cursor += 1; results[index] = await mapper(items[index]); } }
  await Promise.all(Array.from({ length: Math.max(1, limit) }, worker));
  return results;
}
function parseYuyuteiResults(html) {
  if (String(html || "").startsWith("Title:")) {
    const source = String(html); const rows = []; const seen = new Set();
    for (const match of source.matchAll(/\]\((https:\/\/yuyu-tei\.jp\/sell\/poc\/card\/([^/]+)\/[^)]+)\)/g)) {
      if (seen.has(match[1])) continue;
      seen.add(match[1]);
      const block = source.slice(match.index, match.index + 900);
      const cardNo = (block.match(/\)(\d{1,4}\s*\/\s*\d{1,4})/) || [])[1];
      const title = (block.match(/####\s*\[([^\]]+)\]\(/) || [])[1];
      const price = Number(((block.match(/\*\*([0-9,]+)\s*円\*\*/) || [])[1] || "").replace(/,/g, ""));
      const stock = Number(((block.match(/在庫\s*:\s*([0-9,]+)\s*点/) || [])[1] || "").replace(/,/g, ""));
      if (cardNo && title && Number.isFinite(price) && Number.isFinite(stock)) rows.push({ detailUrl: match[1], setCode: match[2], cardNo, title, price, stock });
    }
    return rows;
  }
  const cards = []; const source = String(html || ""); const seen = new Set();
  const pattern = /href="(https:\/\/yuyu-tei\.jp\/sell\/poc\/card\/[^"?#]+)"/g;
  for (const found of source.matchAll(pattern)) {
    const url = found[1];
    if (!url || seen.has(url)) continue;
    seen.add(url);
    // The first link in each card tile is followed by its condition-A fields.
    const block = source.slice(found.index, found.index + 2600);
    const imageAlt = (block.match(/<img[^>]*\salt="\s*([^"<]+?)\s*"/i) || [])[1] || "";
    const cardNo = (block.match(/<span[^>]*>\s*([^<]+\/[^<]+)\s*<\/span>/) || imageAlt.match(/\d{1,4}\s*\/\s*\d{1,4}/) || [])[1];
    const title = (block.match(/<h[1-5][^>]*>\s*([^<]+?)\s*<\/h[1-5]>/i) || [])[1] || imageAlt.replace(/^\s*\d{1,4}\s*\/\s*\d{1,4}\s+(?:MUR|BWR|MA|SSR|CSR|CHR|SAR|UR|HR|SR|RRR|RR|AR|PR|P|H|C|U|R)\s+/i, "");
    const priceText = (block.match(/(?:<strong[^>]*>|販売価格[^0-9]{0,30})\s*([0-9,]+)\s*円/i) || block.match(/([0-9,]+)\s*円/) || [])[1];
    const stockText = (block.match(/在庫\s*:\s*([0-9,]+)\s*点/) || [])[1];
    const parts = String(url || "").match(/\/card\/([^/]+)\//);
    const price = Number(String(priceText || "").replace(/,/g, ""));
    const stock = Number(String(stockText || "").replace(/,/g, ""));
    if (title && cardNo && Number.isFinite(price)) cards.push({ title, cardNo, setCode: parts?.[1] || "", detailUrl: url, price, stock: Number.isFinite(stock) ? stock : null });
  }
  return cards;
}
function findYuyuteiCard(card, html) {
  const signature = cardSignature(card); const source = String(html || ""); let offset = 0;
  while (offset >= 0) {
    offset = source.indexOf(signature.cardNo, offset);
    if (offset < 0) break;
    const block = source.slice(Math.max(0, offset - 500), offset + 1800);
    const url = (block.match(/https:\/\/yuyu-tei\.jp\/sell\/poc\/card\/([^/]+)\/[^)\s]+/) || []);
    const price = Number(((block.match(/\*\*([0-9,]+)\s*円\*\*/) || [])[1] || "").replace(/,/g, ""));
    const stock = Number(((block.match(/在庫\s*:\s*([0-9,]+)\s*点/) || [])[1] || "").replace(/,/g, ""));
    if (url[0] && normalizeSetCode(url[1]) === signature.setCode && Number.isFinite(price) && Number.isFinite(stock) && normalize(block).includes(signature.base)) {
      return { detailUrl: url[0], setCode: url[1], cardNo: signature.cardNo, title: card.name.split("[")[0].trim(), price, stock };
    }
    offset += signature.cardNo.length;
  }
  return null;
}
function historySummary(cards, catalog, history, field) {
  const latest = history.dates.length - 1;
  const catalogById = new Map(catalog.map((entry) => [entry.cardId, entry]));
  const output = {};
  for (const card of cards) {
    const entry = catalogById.get(card.id); const values = history.stocks[card.id] || [];
    if (!entry && !values.length) continue;
    const current = Number.isFinite(values[latest]) ? values[latest] : entry?.stock ?? null;
    output[card.id] = { [field]: Number(entry?.price) || null, stock: current, samples: values.filter(Number.isFinite).length };
  }
  return output;
}
function appendDate(history, date) {
  if (history.dates.at(-1) !== date) {
    history.dates.push(date);
    for (const values of Object.values(history.stocks)) values.push(null);
  }
  return history.dates.length - 1;
}
function setStock(history, cardId, index, value) {
  if (!history.stocks[cardId]) history.stocks[cardId] = Array(index + 1).fill(null);
  while (history.stocks[cardId].length <= index) history.stocks[cardId].push(null);
  history.stocks[cardId][index] = value;
}

async function updateYuyutei(cards, paths) {
  let catalog = read(paths.catalog, []);
  const history = read(paths.history, { dates: [], stocks: {} });
  const progress = read(paths.progress, { attemptedCards: {} });
  const pageCache = read(paths.cache, { version: 1, entries: {} });
  if (!progress.attemptedCards || typeof progress.attemptedCards !== "object") progress.attemptedCards = {};
  if (!pageCache.entries || typeof pageCache.entries !== "object") pageCache.entries = {};
  const byId = new Map(catalog.map((entry) => [entry.cardId, entry]));
  const onlyIds = new Set(String(process.env.YUYUTEI_ONLY_ID || "").split(",").map((value) => value.trim()).filter(Boolean));
  const selectedTargets = cards.filter((card) => (onlyIds.size ? onlyIds.has(card.id) : !byId.has(card.id) && due(progress.attemptedCards[card.id], JSON.stringify(cardSignature(card)))))
    .sort((a, b) => Number(b.tv30 || 0) - Number(a.tv30 || 0) || Number(b.price || 0) - Number(a.price || 0))
    .slice(0, Math.max(1, Number(process.env.YUYUTEI_SEARCH_BATCH || 100)));
  // Group the selected work by set so every checkpoint has a stable resume key.
  const targets = selectedTargets.sort((a, b) => {
    const left = cardSignature(a); const right = cardSignature(b);
    return left.setCode.localeCompare(right.setCode) || left.cardNo.localeCompare(right.cardNo);
  });
  let linked = 0;
  let matched = 0;
  let updated = 0;
  let failed = 0;
  let fetchedPages = 0;
  let cachedPages = 0;
  let parsedProducts = 0;
  const runFailures = [];
  const linkageMisses = [];
  for (const card of targets) {
    const signature = cardSignature(card); const signatureKey = JSON.stringify(signature);
    const pageKey = `${signature.setCode || "unknown"}/${signature.cardNo || card.id}`;
    const query = `${signature.base} ${signature.cardNo}`;
    const searchUrl = `${YUYUTEI}/sell/poc/s/search?${new URLSearchParams({ search_word: query, rare: "", type: "", kizu: "0" })}`;
    const key = cacheKey(searchUrl);
    const metric = {
      source: "yuyutei", pageKey, setCode: signature.setCode, cardId: card.id,
      url: searchUrl, startedAt: new Date().toISOString(), status: "running",
      httpStatus: null, retryCount: 0, fetchMs: 0, parseMs: 0, matchMs: 0, saveMs: 0,
      stage: "fetch",
    };
    try {
      const cached = pageCache.entries[key];
      const cacheAge = Date.now() - Date.parse(cached?.fetchedAt || "");
      let candidates;
      if (cached && Number.isFinite(cacheAge) && cacheAge < 7 * 86400000 && process.env.YUYUTEI_FORCE !== "1") {
        candidates = cached.candidates || [];
        cachedPages += 1;
        metric.fromCache = true;
        metric.httpStatus = cached.httpStatus;
      } else {
        const response = await fetchText(searchUrl, { intervalMs: 1100 });
        fetchedPages += 1;
        Object.assign(metric, response.metric);
        metric.stage = "parse";
        const parseStartedAt = Date.now();
        candidates = parseYuyuteiResults(response.text);
        metric.parseMs = Date.now() - parseStartedAt;
        pageCache.entries[key] = {
          url: searchUrl, fetchedAt: new Date().toISOString(), httpStatus: response.metric.httpStatus,
          candidates: candidates.slice(0, 100),
        };
      }
      parsedProducts += candidates.length;
      metric.stage = "match";
      const matchStartedAt = Date.now();
      const matches = candidates.filter((row) => titleMatches(card, row.title, row.cardNo, row.setCode));
      const match = matches.length === 1 ? matches[0] : null;
      metric.matchMs = Date.now() - matchStartedAt;
      metric.candidateCount = candidates.length;
      metric.matchCount = matches.length;
      metric.stage = "save";
      progress.attemptedCards[card.id] = { signature: signatureKey, checkedAt: new Date().toISOString(), found: Boolean(match) };
      if (!match) {
        linkageMisses.push({
          cardId: card.id, cardName: card.name, pageKey, url: searchUrl,
          reason: matches.length > 1 ? "ambiguous" : candidates.length ? "identity_mismatch" : "no_candidate",
          candidateCount: candidates.length, matchCount: matches.length, checkedAt: new Date().toISOString(),
        });
      }
      if (match) {
        matched += 1;
        const previousEntry = byId.get(card.id);
        if (!previousEntry || previousEntry.detailUrl !== match.detailUrl) linked += 1;
        else if (previousEntry.price !== match.price || previousEntry.stock !== match.stock) updated += 1;
        byId.set(card.id, { cardId: card.id, ...match, observedAt: jstDate() });
      }
      progress.lastSuccessfulPage = pageKey;
      catalog = [...byId.values()];
      const saveStartedAt = Date.now();
      write(paths.catalog, catalog);
      write(paths.progress, progress);
      write(paths.cache, pageCache);
      metric.saveMs = Date.now() - saveStartedAt;
      metric.status = "success";
      metric.stage = "complete";
    } catch (error) {
      failed += 1;
      Object.assign(metric, error.metric || {});
      metric.status = "failed";
      metric.stage = metric.stage || "fetch";
      metric.error = error.message;
      metric.exceptionName = error.name || "Error";
      metric.exception = String(error.stack || error.message || error).slice(0, 1200);
      const failure = {
        pageKey, cardId: card.id, cardName: card.name, url: searchUrl,
        httpStatus: metric.httpStatus, stage: metric.stage, retryCount: metric.retryCount,
        timedOut: Boolean(metric.timedOut), exceptionName: metric.exceptionName,
        error: error.message, exception: metric.exception, at: new Date().toISOString(),
        lastSuccessfulPage: progress.lastSuccessfulPage || null,
      };
      progress.lastFailure = failure;
      progress.failures = [...(progress.failures || []), failure].slice(-50);
      runFailures.push(failure);
      write(paths.progress, progress);
      console.warn(`yuyutei search failed ${card.id}: ${error.message}`);
    }
    metric.endedAt = new Date().toISOString();
    recordFetchMetric("yuyutei", metric);
  }
  catalog = [...byId.values()];
  const index = appendDate(history, jstDate());
  const stocks = catalog.filter((entry) => Number.isFinite(entry.stock));
  for (const entry of stocks) setStock(history, entry.cardId, index, entry.stock);
  const summary = historySummary(cards, catalog, history, "yuyuteiPrice");
  progress.lastRun = {
    startedTargetCount: targets.length, succeededPages: targets.length - failed,
    fetchFailureCount: failed, linkageMissCount: linkageMisses.length,
    matchedCount: matched, newLinkCount: linked, updatedCount: updated,
    lastSuccessfulPage: progress.lastSuccessfulPage || null,
    lastFailure: runFailures.at(-1) || null,
    linkageMisses: linkageMisses.slice(-20), completedAt: new Date().toISOString(),
  };
  write(paths.catalog, catalog); write(paths.history, history); write(paths.progress, progress); write(paths.cache, pageCache);
  write(paths.summary, {
    updatedAt: new Date().toISOString(), stockType: "point", cards: summary,
    crawl: { ...progress.lastRun, recentFailures: (progress.failures || []).slice(-10) },
  });
  return {
    linked, matched, updated, attempted: targets.length, fetchedPages, cachedPages, parsedProducts, failed,
    linkageMissCount: linkageMisses.length, coverage: catalog.length,
    lastSuccessfulPage: progress.lastSuccessfulPage || null,
    lastFailure: runFailures.at(-1) || null,
  };
}

function campA(variant) { return /(?:^|【\s*)状態A(?:\s*】|$)/.test(String(variant?.title || variant?.option1 || "")); }
function campSignature(product) {
  const title = String(product?.title || "");
  const standard = title.match(/(\d{1,4}(?:\s*-\s*\d{1,4})?\s*\/\s*\d{1,4})/);
  const promo = title.match(/(\d{1,4})\s*\/\s*([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*-P)\b/i);
  const titleSet = title.match(/(?:^|\s)([A-Za-z]{1,5}\d{0,3}[A-Za-z]?(?:-[A-Za-z0-9]+)?)\s+\d{1,4}(?:\s*-\s*\d{1,4})?\s*\/\s*\d{1,4}/i);
  const tagCodes = (product?.tags || []).map((tag) => {
    const clean = String(tag || "").replace(/^#/, "").trim();
    const prefix = clean.split("_")[0];
    return /^[A-Za-z0-9+-]+$/i.test(prefix) ? normalizeSetCode(prefix) : "";
  }).filter(Boolean);
  const setCodes = [...new Set([
    ...tagCodes,
    titleSet?.[1] ? normalizeSetCode(titleSet[1]) : "",
    promo?.[2] ? normalizeSetCode(promo[2]) : "",
  ].filter(Boolean))];
  return { title, cardNo: String(standard?.[1] || promo?.[1] || "").replace(/\s/g, ""), setCodes };
}
function campMatchesCard(card, product) {
  const signature = cardSignature(card); const productSig = campSignature(product);
  if (/\b(?:PSA|BGS|CGC)\s*\d+|鑑定品/i.test(productSig.title)) return false;
  if (!titleMatches(card, productSig.title, productSig.cardNo)) return false;
  // Product titles are not a reliable substitute for a set code. Requiring a
  // tag match avoids linking same-name promotions and reprints by card number.
  return productSig.setCodes.includes(signature.setCode);
}
async function updateTorecaCamp(cards, paths) {
  const reset = process.env.TORECACAMP_RESET === "1";
  let catalog = reset ? [] : read(paths.catalog, []);
  const progress = reset ? { page: 1, exhausted: false } : read(paths.progress, { page: 1, exhausted: false });
  const pageCache = reset ? { version: 1, entries: {} } : read(paths.cache, { version: 1, entries: {} });
  pageCache.entries ||= {};
  const byId = new Map(catalog.map((entry) => [entry.cardId, entry]));
  const byNumber = new Map();
  for (const card of cards) { const signature = cardSignature(card); if (signature.cardNo) { if (!byNumber.has(signature.cardNo)) byNumber.set(signature.cardNo, []); byNumber.get(signature.cardNo).push(card); } }
  const pageCount = Math.max(1, Number(process.env.TORECACAMP_PAGES_PER_RUN || 6));
  const forcedStart = Number(process.env.TORECACAMP_START_PAGE || 0);
  let page = forcedStart > 0 ? forcedStart : Math.max(1, Number(progress.page || 1));
  progress.processedPages = Array.isArray(progress.processedPages)
    ? [...new Set(progress.processedPages.filter(Number.isFinite))]
    : Object.keys(pageCache.entries).map(Number).filter(Number.isFinite);
  // Page 100 returned a full 250 rows during the source capability probe. It
  // is a lower bound, not a claim that the source contains exactly 100 pages.
  progress.estimatedMinimumPages = Math.max(Number(progress.estimatedMinimumPages || 0), 100);
  progress.pageSize = 250;
  let cycleCompleted = false;
  let fetched = 0; let parsed = 0; let stateA = 0; let linked = 0; let updated = 0; let failed = 0; let cacheHits = 0; let pagesSucceeded = 0;
  const excluded = { noStateA: 0, gradedProduct: 0, noCardNumber: 0, noLocalCandidate: 0, identityMismatch: 0, ambiguous: 0 };
  for (let count = 0; count < pageCount && !progress.exhausted; count += 1, page += 1) {
    const url = `${TORECA_CAMP}/collections/all/products.json?limit=250&page=${page}`;
    const metric = {
      source: "torecacamp", page, pageKey: `page-${page}`, url,
      startedAt: new Date().toISOString(), status: "running", stage: "fetch",
      httpStatus: null, retryCount: 0, fetchMs: 0, parseMs: 0, matchMs: 0, saveMs: 0,
    };
    let products = [];
    try {
      const cached = pageCache.entries[page];
      const cacheAge = Date.now() - Date.parse(cached?.fetchedAt || "");
      if (cached && Number.isFinite(cacheAge) && cacheAge < 86400000 && process.env.TORECACAMP_FORCE !== "1") {
        products = cached.products || [];
        cacheHits += 1;
        metric.fromCache = true;
        metric.httpStatus = cached.httpStatus;
      } else {
        const response = await fetchJson(url, { intervalMs: 1100 });
        Object.assign(metric, response.metric);
        metric.stage = "parse";
        const parseStartedAt = Date.now();
        products = response.value.products || [];
        metric.parseMs = Date.now() - parseStartedAt;
        pageCache.entries[page] = {
          fetchedAt: new Date().toISOString(), httpStatus: response.metric.httpStatus,
          products: products.map((product) => ({
            title: product.title, handle: product.handle, tags: product.tags,
            variants: (product.variants || []).filter(campA).map((variant) => ({
              title: variant.title, option1: variant.option1, price: variant.price, available: variant.available,
            })),
          })),
        };
      }
    } catch (error) {
      failed += 1;
      Object.assign(metric, error.metric || {});
      metric.status = "failed";
      metric.error = error.message;
      metric.exceptionName = error.name || "Error";
      metric.exception = String(error.stack || error.message || error).slice(0, 1200);
      const failure = {
        page, pageKey: `page-${page}`, url, httpStatus: metric.httpStatus,
        stage: metric.stage, retryCount: metric.retryCount, timedOut: Boolean(metric.timedOut),
        exceptionName: metric.exceptionName, error: error.message, exception: metric.exception,
        at: new Date().toISOString(), lastSuccessfulPage: progress.lastSuccessfulPage || null,
      };
      progress.lastFailure = failure;
      progress.failures = [...(progress.failures || []), failure].slice(-50);
      write(paths.progress, progress);
      metric.endedAt = new Date().toISOString();
      recordFetchMetric("torecacamp", metric);
      console.warn(`torecacamp page ${page} failed: ${error.message}`);
      break;
    }
    fetched += products.length;
    parsed += products.length;
    metric.productCount = products.length;
    metric.stage = "match";
    const matchStartedAt = Date.now();
    const pageMatches = new Map();
    for (const product of products) {
      const variant = (product.variants || []).find(campA);
      if (!variant) { excluded.noStateA += 1; continue; }
      stateA += 1;
      if (/\b(?:PSA|BGS|CGC)\s*\d+|鑑定品/i.test(String(product.title || ""))) { excluded.gradedProduct += 1; continue; }
      const sig = campSignature(product);
      if (!sig.cardNo) { excluded.noCardNumber += 1; continue; }
      const candidates = byNumber.get(sig.cardNo) || [];
      if (!candidates.length) { excluded.noLocalCandidate += 1; continue; }
      const matches = candidates.filter((row) => campMatchesCard(row, product));
      if (matches.length !== 1) { excluded[matches.length > 1 ? "ambiguous" : "identityMismatch"] += 1; continue; }
      const card = matches[0];
      const entry = { cardId: card.id, title: product.title, detailUrl: `${TORECA_CAMP}/products/${encodeURIComponent(product.handle)}`, price: Number(variant.price) || null, available: variant.available === true, observedAt: jstDate() };
      if (!pageMatches.has(card.id)) pageMatches.set(card.id, []);
      pageMatches.get(card.id).push(entry);
    }
    for (const [cardId, matches] of pageMatches) {
      if (matches.length !== 1) { excluded.ambiguous += matches.length; continue; }
      const entry = matches[0];
      const previousEntry = byId.get(cardId);
      if (!previousEntry || previousEntry.detailUrl !== entry.detailUrl) linked += 1;
      else if (previousEntry.price !== entry.price || previousEntry.available !== entry.available) updated += 1;
      byId.set(cardId, entry);
    }
    metric.matchMs = Date.now() - matchStartedAt;
    metric.matchCount = [...pageMatches.values()].filter((matches) => matches.length === 1).length;
    metric.stage = "save";
    pagesSucceeded += 1;
    const nextProgress = {
      ...progress,
      lastSuccessfulPage: page,
      page: page + 1,
      processedPages: [...new Set([...(progress.processedPages || []), page])].sort((a, b) => a - b),
      lastFailure: null,
    };
    if (products.length < 250) {
      nextProgress.exhausted = true;
      nextProgress.totalPages = page;
      nextProgress.cycleCompletedAt = new Date().toISOString();
      cycleCompleted = true;
    }
    catalog = [...byId.values()];
    const saveStartedAt = Date.now();
    write(paths.catalog, catalog);
    write(paths.cache, pageCache);
    // The checkpoint is written last. A failed catalog/cache save therefore
    // cannot skip a page on the next run.
    write(paths.progress, nextProgress);
    Object.assign(progress, nextProgress);
    metric.saveMs = Date.now() - saveStartedAt;
    metric.status = "success";
    metric.stage = "complete";
    metric.endedAt = new Date().toISOString();
    recordFetchMetric("torecacamp", metric);
  }
  if (progress.exhausted && failed === 0) {
    progress.page = 1;
    progress.exhausted = false;
  }
  const nextCatalog = [...byId.values()];
  const summary = {};
  for (const entry of nextCatalog) summary[entry.cardId] = { torecacampPrice: Number(entry.price) || null, available: entry.available, availabilityLabel: entry.available ? "在庫あり" : "在庫なし" };
  const processedPageCount = new Set(progress.processedPages || []).size;
  const estimatedMinimumProducts = Number(progress.estimatedMinimumPages || 0) * Number(progress.pageSize || 250);
  const estimatedRemainingProducts = Math.max(0, estimatedMinimumProducts - processedPageCount * Number(progress.pageSize || 250));
  progress.lastRun = {
    currentCursor: progress.page || null, processedPageCount,
    processedPages: (progress.processedPages || []).slice(-100),
    totalPages: progress.totalPages || null,
    estimatedMinimumPages: progress.estimatedMinimumPages || null,
    estimatedMinimumProducts, estimatedRemainingProducts,
    pagesSucceeded, fetched, parsed, stateA, newLinkCount: linked,
    updatedCount: updated, fetchFailureCount: failed,
    lastSuccessfulPage: progress.lastSuccessfulPage || null,
    lastFailure: progress.lastFailure || null, completedAt: new Date().toISOString(),
  };
  write(paths.catalog, nextCatalog); write(paths.progress, progress); write(paths.cache, pageCache);
  if (pagesSucceeded > 0) write(paths.summary, {
    updatedAt: new Date().toISOString(), stockType: "availability", cards: summary,
    crawl: { ...progress.lastRun, recentFailures: (progress.failures || []).slice(-10) },
  });
  return {
    pagesSucceeded, fetched, parsed, stateA, linked, updated, failed, cacheHits, excluded,
    coverage: nextCatalog.length, lastSuccessfulPage: progress.lastSuccessfulPage || null,
    currentCursor: progress.page || null, processedPageCount,
    estimatedMinimumPages: progress.estimatedMinimumPages || null,
    estimatedRemainingProducts,
    completionStatus: cycleCompleted ? "success" : "partial",
  };
}

async function main() {
  const cards = read(path.join(ROOT, "data", "pokemon-cards.json"), []);
  const sourceOnly = String(process.env.SHOP_SOURCE_ONLY || "all").toLowerCase();
  const yuyutei = sourceOnly === "all" || sourceOnly === "yuyutei" ? await updateYuyutei(cards, {
    catalog: path.join(__dirname, "yuyutei_catalog.json"), history: path.join(__dirname, "yuyutei_stock_history.json"), progress: path.join(__dirname, "yuyutei_progress.json"), cache: path.join(__dirname, "yuyutei_page_cache.json"), summary: path.join(ROOT, "data", "yuyutei-stock-summary.json"),
  }) : null;
  const torecacamp = sourceOnly === "all" || sourceOnly === "torecacamp" ? await updateTorecaCamp(cards, {
    catalog: path.join(__dirname, "torecacamp_catalog.json"), progress: path.join(__dirname, "torecacamp_progress.json"), cache: path.join(__dirname, "torecacamp_page_cache.json"), summary: path.join(ROOT, "data", "torecacamp-stock-summary.json"),
  }) : null;
  const latestCards = read(path.join(ROOT, "data", "pokemon-cards.json"), []);
  const yuyuteiById = new Map(read(path.join(__dirname, "yuyutei_catalog.json"), []).map((entry) => [entry.cardId, entry]));
  const campById = new Map(read(path.join(__dirname, "torecacamp_catalog.json"), []).map((entry) => [entry.cardId, entry]));
  const resetCamp = process.env.TORECACAMP_RESET === "1";
  const updatedCards = latestCards.map((card) => ({ ...card, yuyuteiUrl: yuyuteiById.get(card.id)?.detailUrl || card.yuyuteiUrl || null, torecacampUrl: campById.get(card.id)?.detailUrl || (resetCamp ? null : card.torecacampUrl) || null }));
  write(path.join(ROOT, "data", "pokemon-cards.json"), updatedCards);
  console.log(JSON.stringify({ sourceOnly, yuyutei, torecacamp }));
}
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = {
  campA, campMatchesCard, campSignature, cardSignature, normalizeSetCode,
  numberMatches, parseYuyuteiResults, titleMatches,
};
