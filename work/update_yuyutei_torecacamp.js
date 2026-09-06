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
function jstDate(value = new Date()) { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)); }
function updateProgressHealth(progress, currentValue) {
  const previousValue = Number(progress.progressHealth?.value);
  const stagnantRuns = Number.isFinite(previousValue) && currentValue <= previousValue
    ? Number(progress.progressHealth?.stagnantRuns || 0) + 1
    : 0;
  progress.progressHealth = {
    value: currentValue,
    previousValue: Number.isFinite(previousValue) ? previousValue : null,
    stagnantRuns,
    status: stagnantRuns >= 3 ? "stalled" : "progressing",
    checkedAt: new Date().toISOString(),
  };
  return progress.progressHealth;
}
function guardCatalogDrop(previousCatalog, nextCatalog) {
  const previousCount = previousCatalog.length;
  const proposedCount = nextCatalog.length;
  const abruptDrop = previousCount >= 20 && proposedCount < Math.floor(previousCount * 0.7);
  return { abruptDrop, previousCount, proposedCount, catalog: abruptDrop ? previousCatalog : nextCatalog };
}
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

function yuyuteiPriority(card, buybackCards = {}) {
  const price = Number(card.price || 0);
  const psa10 = Number(card.snkPsa10Price || 0);
  const expectedGross = psa10 > 0 && price > 0 ? psa10 * 0.92 - price - 12980 : -Infinity;
  const currentCandidate = expectedGross >= 0 && Number(card.tv30 || 0) >= 30;
  const hasPsa10Market = psa10 > 0;
  const hasBuyback = Object.values(buybackCards[card.id]?.shops || {})
    .some((shop) => Number(shop.price || 0) > 0 && !shop.quarantined);
  const rank = currentCandidate ? 0 : hasPsa10Market ? 1 : hasBuyback ? 2 : price >= 30000 ? 3 : 4;
  const labels = ["現在の候補カード", "PSA10相場あり", "買取掲載あり", "高価格帯", "残り全件"];
  return {
    rank,
    label: labels[rank],
    expectedGross: Number.isFinite(expectedGross) ? Math.round(expectedGross) : null,
    secondaryScore: Number(card.tv30 || 0) * 1000000 + price,
  };
}

async function updateYuyutei(cards, paths) {
  let catalog = read(paths.catalog, []);
  const previousCatalog = [...catalog];
  const history = read(paths.history, { dates: [], stocks: {} });
  const progress = read(paths.progress, { attemptedCards: {} });
  const pageCache = read(paths.cache, { version: 1, entries: {} });
  if (!progress.attemptedCards || typeof progress.attemptedCards !== "object") progress.attemptedCards = {};
  progress.retryQueue = Array.isArray(progress.retryQueue) ? progress.retryQueue : [];
  if (!pageCache.entries || typeof pageCache.entries !== "object") pageCache.entries = {};
  const byId = new Map(catalog.map((entry) => [entry.cardId, entry]));
  const buybackCards = read(path.join(ROOT, "data", "shop-buyback-summary.json"), { cards: {} }).cards || {};
  const onlyIds = new Set(String(process.env.YUYUTEI_ONLY_ID || "").split(",").map((value) => value.trim()).filter(Boolean));
  const batchLimit = Math.max(1, Number(process.env.YUYUTEI_SEARCH_BATCH || 100));
  const eligibleTargets = cards.filter((card) => {
    const signature = cardSignature(card);
    const searchable = Boolean(signature.setCode && signature.cardNo && signature.base);
    return searchable && (onlyIds.size ? onlyIds.has(card.id) : !byId.has(card.id) && due(progress.attemptedCards[card.id], JSON.stringify(signature)));
  })
    .sort((left, right) => {
      const a = yuyuteiPriority(left, buybackCards);
      const b = yuyuteiPriority(right, buybackCards);
      return a.rank - b.rank || b.secondaryScore - a.secondaryScore || String(left.id).localeCompare(String(right.id));
    });
  const targets = eligibleTargets.slice(0, batchLimit);
  progress.priorityOrder = ["現在の候補カード", "PSA10相場あり", "買取掲載あり", "高価格帯", "残り全件"];
  progress.batchLimit = batchLimit;
  progress.resumePosition = Math.max(0, cards.length - eligibleTargets.length);
  progress.lastBatchTargets = targets.map((card) => ({ cardId: card.id, ...yuyuteiPriority(card, buybackCards) }));
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
    const priority = yuyuteiPriority(card, buybackCards);
    const pageKey = `${signature.setCode || "unknown"}/${signature.cardNo || card.id}`;
    const query = `${signature.base} ${signature.cardNo}`;
    const searchUrl = `${YUYUTEI}/sell/poc/s/search?${new URLSearchParams({ search_word: query, rare: "", type: "", kizu: "0" })}`;
    const key = cacheKey(searchUrl);
    const metric = {
      source: "yuyutei", pageKey, setCode: signature.setCode, cardId: card.id,
      priorityRank: priority.rank, priorityLabel: priority.label,
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
      progress.attemptedCards[card.id] = { signature: signatureKey, checkedAt: new Date().toISOString(), found: Boolean(match), priorityRank: priority.rank, priorityLabel: priority.label };
      progress.retryQueue = progress.retryQueue.filter((entry) => entry.cardId !== card.id);
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
      progress.retryQueue = [...progress.retryQueue.filter((entry) => entry.cardId !== card.id), failure].slice(-500);
      runFailures.push(failure);
      write(paths.progress, progress);
      console.warn(`yuyutei search failed ${card.id}: ${error.message}`);
    }
    metric.endedAt = new Date().toISOString();
    recordFetchMetric("yuyutei", metric);
  }
  const catalogGuard = guardCatalogDrop(previousCatalog, [...byId.values()]);
  catalog = catalogGuard.catalog;
  const searchableCards = cards.filter((card) => {
    const signature = cardSignature(card);
    return Boolean(signature.setCode && signature.cardNo && signature.base);
  });
  const remainingSearchCount = searchableCards.filter((card) => {
    if (byId.has(card.id)) return false;
    const signatureKey = JSON.stringify(cardSignature(card));
    return due(progress.attemptedCards[card.id], signatureKey);
  }).length;
  const searchedCurrentCount = Math.max(0, searchableCards.length - remainingSearchCount);
  const progressHealth = updateProgressHealth(progress, searchedCurrentCount);
  const completionStatus = failed > 0 || remainingSearchCount > 0 ? "partial" : "success";
  const priorityRemaining = searchableCards.reduce((counts, card) => {
    if (byId.has(card.id) || !due(progress.attemptedCards[card.id], JSON.stringify(cardSignature(card)))) return counts;
    const priority = yuyuteiPriority(card, buybackCards);
    counts[priority.label] = (counts[priority.label] || 0) + 1;
    return counts;
  }, {});
  const index = appendDate(history, jstDate());
  const stocks = catalog.filter((entry) => Number.isFinite(entry.stock));
  for (const entry of stocks) setStock(history, entry.cardId, index, entry.stock);
  const summary = historySummary(cards, catalog, history, "yuyuteiPrice");
  progress.lastRun = {
    startedTargetCount: targets.length, succeededPages: targets.length - failed,
    searchableTargetCount: searchableCards.length, searchedCurrentCount, remainingSearchCount,
    batchLimit, resumePosition: searchedCurrentCount, priorityOrder: progress.priorityOrder,
    priorityRemaining, batchPriorityCounts: targets.reduce((counts, card) => {
      const label = yuyuteiPriority(card, buybackCards).label;
      counts[label] = (counts[label] || 0) + 1;
      return counts;
    }, {}),
    fetchFailureCount: failed, linkageMissCount: linkageMisses.length,
    matchedCount: matched, newLinkCount: linked, updatedCount: updated,
    noCandidateCount: linkageMisses.filter((entry) => entry.reason === "no_candidate").length,
    identityMismatchCount: linkageMisses.filter((entry) => entry.reason === "identity_mismatch").length,
    ambiguousCount: linkageMisses.filter((entry) => entry.reason === "ambiguous").length,
    retryQueueCount: progress.retryQueue.length,
    abruptDropDetected: catalogGuard.abruptDrop,
    previousCatalogCount: catalogGuard.previousCount,
    proposedCatalogCount: catalogGuard.proposedCount,
    progressHealth,
    lastSuccessfulPage: progress.lastSuccessfulPage || null,
    lastFailure: runFailures.at(-1) || null,
    linkageMisses: linkageMisses.slice(-20), completionStatus, completedAt: new Date().toISOString(),
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
    searchableTargetCount: searchableCards.length, searchedCurrentCount,
    remainingSearchCount, completionStatus,
  };
}

function campA(variant) { return /(?:^|【\s*)状態A(?:\s*】|$)/.test(String(variant?.title || variant?.option1 || "")); }
function campVariantPrice(variant) {
  const minorUnits = Number(variant?.price);
  return Number.isFinite(minorUnits) && minorUnits > 0 ? minorUnits / 100 : null;
}
function campPriceQuarantine(card, price) {
  const value = Number(price);
  const anchor = Number(card?.price);
  if (!(value > 0) || !(anchor > 0)) return { quarantined: false, ratio: null, reason: null };
  const ratio = value / anchor;
  // Low prices are useful purchase candidates when identity and condition
  // match. Only quarantine implausibly high prices here; identity mismatches,
  // graded products and multi-item products are rejected by separate checks.
  const quarantined = ratio >= 10;
  return {
    quarantined,
    ratio,
    reason: quarantined ? `みんトレ状態A相場の${ratio.toFixed(1)}倍。桁違い・別商品・複数枚セット・誤紐付け疑い` : null,
  };
}
function migrateCampCatalogPrices(catalog, cards) {
  const byId = new Map(cards.map((card) => [String(card.id), card]));
  let correctedCount = 0;
  let preCorrectionExtremeCount = 0;
  const examples = [];
  const migrated = catalog.map((row) => {
    let entry = { ...row };
    if (entry.sourceSitemap && entry.priceUnit !== "JPY" && Number(entry.price) > 0) {
      const before = Number(entry.price);
      const card = byId.get(String(entry.cardId));
      const beforeRatio = Number(card?.price) > 0 ? before / Number(card.price) : null;
      if (Number.isFinite(beforeRatio) && beforeRatio >= 10) preCorrectionExtremeCount += 1;
      entry.price = before / 100;
      entry.priceUnit = "JPY";
      entry.priceMigration = "shopify-minor-unit-to-jpy-v1";
      correctedCount += 1;
      if (examples.length < 20) examples.push({ cardId: entry.cardId, title: entry.title, before, after: entry.price, url: entry.detailUrl });
    }
    const quarantine = campPriceQuarantine(byId.get(String(entry.cardId)), entry.price);
    entry.priceQuarantined = quarantine.quarantined;
    entry.quarantineReason = quarantine.reason;
    entry.marketPriceRatio = Number.isFinite(quarantine.ratio) ? Math.round(quarantine.ratio * 1000) / 1000 : null;
    return entry;
  });
  return {
    catalog: migrated,
    audit: {
      version: 1,
      updatedAt: new Date().toISOString(),
      correctedCount,
      cumulativeCorrectedCount: migrated.filter((entry) => entry.priceMigration === "shopify-minor-unit-to-jpy-v1").length,
      preCorrectionExtremeCount,
      quarantinedCount: migrated.filter((entry) => entry.priceQuarantined).length,
      examples,
    },
  };
}
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

function decodeXml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

function parseProductSitemapIndex(xml) {
  return [...String(xml || "").matchAll(/<loc>([^<]*sitemap_products_[^<]+)<\/loc>/g)]
    .map((match) => decodeXml(match[1]));
}

function parseProductSitemap(xml) {
  const rows = [];
  for (const match of String(xml || "").matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const block = match[1];
    const url = decodeXml((block.match(/<loc>([^<]+)<\/loc>/) || [])[1]);
    if (!/\/products\//.test(url)) continue;
    const title = decodeXml((block.match(/<image:title>([\s\S]*?)<\/image:title>/) || [])[1]);
    const lastModified = decodeXml((block.match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1]);
    const handle = decodeURIComponent((url.match(/\/products\/([^/?#]+)/) || [])[1] || "");
    if (handle) rows.push({ url, handle, title, lastModified });
  }
  return rows;
}

function preferCampEntry(previous, candidate) {
  if (!previous) return candidate;
  if (previous.detailUrl === candidate.detailUrl) return candidate;
  if (previous.priceQuarantined !== candidate.priceQuarantined) return candidate.priceQuarantined ? previous : candidate;
  if (candidate.available !== previous.available) return candidate.available ? candidate : previous;
  const previousPrice = Number(previous.price);
  const candidatePrice = Number(candidate.price);
  if (candidatePrice > 0 && (!(previousPrice > 0) || candidatePrice < previousPrice)) return candidate;
  return previous;
}

async function updateTorecaCamp(cards, paths) {
  const reset = process.env.TORECACAMP_RESET === "1";
  const loadedCatalog = reset ? [] : read(paths.catalog, []);
  const priceMigration = migrateCampCatalogPrices(loadedCatalog, cards);
  let catalog = priceMigration.catalog;
  write(path.join(__dirname, "torecacamp_price_migration_audit.json"), priceMigration.audit);
  const previousCatalog = [...catalog];
  const progress = reset ? {} : read(paths.progress, {});
  const sitemapCache = reset ? { version: 1 } : read(paths.sitemapCache, { version: 1 });
  const migratedFromCollectionApi = progress.paginationMode !== "sitemap";
  if (migratedFromCollectionApi) {
    progress.legacyCollectionApi = {
      processedPages: Number(progress.processedPages?.length || 0),
      products: 25000,
      matchedCardsPreserved: catalog.length,
      stoppedAt: progress.lastFailure?.at || null,
    };
    progress.lastFailure = null;
    progress.stoppingReason = null;
  }
  progress.paginationMode = "sitemap";
  if (progress.lastFailure?.reasonCode === "public_collection_api_25000_limit") progress.lastFailure = null;
  progress.failures = (progress.failures || []).filter((failure) => {
    return failure.reasonCode !== "public_collection_api_25000_limit"
      && !/\/collections\/all\/products\.json/.test(String(failure.url || ""));
  });
  progress.processedSitemaps = Array.isArray(progress.processedSitemaps) ? progress.processedSitemaps : [];
  progress.failedSitemaps = progress.failedSitemaps && typeof progress.failedSitemaps === "object" ? progress.failedSitemaps : {};
  progress.sitemapProductCounts = progress.sitemapProductCounts && typeof progress.sitemapProductCounts === "object" ? progress.sitemapProductCounts : {};
  progress.seenProductUrls = Array.isArray(progress.seenProductUrls) ? progress.seenProductUrls : [];
  progress.seenProductIds = Array.isArray(progress.seenProductIds) ? progress.seenProductIds : [];
  progress.currentSitemapIndex = Math.max(0, Number(progress.currentSitemapIndex || 0));
  progress.currentEntryIndex = Math.max(0, Number(progress.currentEntryIndex || 0));
  const byId = new Map(catalog.map((entry) => [entry.cardId, entry]));
  const seenProductUrls = new Set(progress.seenProductUrls);
  const seenProductIds = new Set(progress.seenProductIds.map(String));
  const byNumber = new Map();
  for (const card of cards) { const signature = cardSignature(card); if (signature.cardNo) { if (!byNumber.has(signature.cardNo)) byNumber.set(signature.cardNo, []); byNumber.get(signature.cardNo).push(card); } }
  const sitemapLimit = Math.max(1, Number(process.env.TORECACAMP_SITEMAPS_PER_RUN || 1));
  const detailLimit = Math.max(1, Number(process.env.TORECACAMP_PRODUCT_DETAIL_BATCH || 100));
  const runtimeLimitMs = Math.max(30000, Number(process.env.TORECACAMP_RUNTIME_LIMIT_MS || 480000));
  const stopBy = Date.now() + runtimeLimitMs;
  const forcedSitemap = Math.max(0, Number(process.env.TORECACAMP_RETRY_SITEMAP || 0) - 1);
  let sitemapUrls = [];
  let listedProducts = 0; let detailFetched = 0; let parsed = 0; let stateA = 0;
  let linked = 0; let updated = 0; let failed = 0; let cacheHits = 0; let sitemapsSucceeded = 0;
  let duplicateUrls = 0; let duplicateProductIds = 0;
  let stoppingReason = null;
  const excluded = { noStateA: 0, gradedProduct: 0, noCardNumber: 0, noLocalCandidate: 0, identityMismatch: 0, ambiguous: 0 };
  try {
    const indexResponse = await fetchText(`${TORECA_CAMP}/sitemap.xml`, { intervalMs: 1100 });
    sitemapUrls = parseProductSitemapIndex(indexResponse.text);
    if (!sitemapUrls.length) throw new Error("商品サイトマップが見つかりません");
    progress.totalSitemaps = sitemapUrls.length;
    progress.sitemapUrls = sitemapUrls;
  } catch (error) {
    failed += 1;
    progress.lastFailure = { pageKey: "sitemap-index", url: `${TORECA_CAMP}/sitemap.xml`, stage: "fetch-index", httpStatus: error.metric?.httpStatus || null, retryCount: error.metric?.retryCount || 0, error: error.message, at: new Date().toISOString() };
    progress.failures = [...(progress.failures || []), progress.lastFailure].slice(-50);
  }

  for (let runIndex = 0; runIndex < sitemapLimit && sitemapUrls.length && detailFetched < detailLimit && failed === 0; runIndex += 1) {
    let sitemapIndex = forcedSitemap >= 0 && process.env.TORECACAMP_RETRY_SITEMAP
      ? forcedSitemap
      : progress.currentSitemapIndex;
    while (sitemapIndex < sitemapUrls.length && progress.processedSitemaps.includes(sitemapIndex + 1)) sitemapIndex += 1;
    if (sitemapIndex >= sitemapUrls.length) break;
    const sitemapUrl = sitemapUrls[sitemapIndex];
    const pageKey = `sitemap-${sitemapIndex + 1}`;
    const metric = { source: "torecacamp", pageKey, sitemapNumber: sitemapIndex + 1, url: sitemapUrl, startedAt: new Date().toISOString(), status: "running", stage: "fetch-sitemap", retryCount: 0 };
    let entries = [];
    try {
      const cacheAge = Date.now() - Date.parse(sitemapCache.fetchedAt || "");
      if (sitemapCache.url === sitemapUrl && Array.isArray(sitemapCache.entries) && Number.isFinite(cacheAge) && cacheAge < 86400000 && process.env.TORECACAMP_FORCE !== "1") {
        entries = sitemapCache.entries;
        cacheHits += 1;
        metric.fromCache = true;
      } else {
        const response = await fetchText(sitemapUrl, { intervalMs: 1100 });
        Object.assign(metric, response.metric);
        metric.stage = "parse-sitemap";
        entries = parseProductSitemap(response.text);
        sitemapCache.url = sitemapUrl;
        sitemapCache.fetchedAt = new Date().toISOString();
        sitemapCache.entries = entries;
        write(paths.sitemapCache, sitemapCache);
      }
      progress.sitemapProductCounts[sitemapIndex + 1] = entries.length;
      listedProducts += entries.length;
      const startingEntry = progress.currentSitemapIndex === sitemapIndex ? progress.currentEntryIndex : 0;
      for (let entryIndex = startingEntry; entryIndex < entries.length; entryIndex += 1) {
        if (Date.now() >= stopBy - 5000) {
          stoppingReason = `安全停止時間 ${Math.round(runtimeLimitMs / 1000)}秒に到達`;
          break;
        }
        const sitemapEntry = entries[entryIndex];
        progress.currentSitemapIndex = sitemapIndex;
        progress.currentEntryIndex = entryIndex;
        if (seenProductUrls.has(sitemapEntry.url)) { duplicateUrls += 1; progress.currentEntryIndex = entryIndex + 1; continue; }
        parsed += 1;
        const stub = { title: sitemapEntry.title, handle: sitemapEntry.handle, tags: [] };
        const sig = campSignature(stub);
        if (!sig.cardNo) { excluded.noCardNumber += 1; seenProductUrls.add(sitemapEntry.url); progress.currentEntryIndex = entryIndex + 1; continue; }
        const candidates = byNumber.get(sig.cardNo) || [];
        if (!candidates.length) { excluded.noLocalCandidate += 1; seenProductUrls.add(sitemapEntry.url); progress.currentEntryIndex = entryIndex + 1; continue; }
        const matches = candidates.filter((row) => campMatchesCard(row, stub));
        if (matches.length !== 1) { excluded[matches.length > 1 ? "ambiguous" : "identityMismatch"] += 1; seenProductUrls.add(sitemapEntry.url); progress.currentEntryIndex = entryIndex + 1; continue; }
        if (detailFetched >= detailLimit) {
          stoppingReason = `商品詳細の1回上限 ${detailLimit}件に到達`;
          break;
        }
        metric.stage = "fetch-product";
        const productResponse = await fetchJson(`${sitemapEntry.url}.js`, { intervalMs: 1100 });
        detailFetched += 1;
        const product = productResponse.value;
        if (seenProductIds.has(String(product.id))) { duplicateProductIds += 1; seenProductUrls.add(sitemapEntry.url); progress.currentEntryIndex = entryIndex + 1; continue; }
        const variant = (product.variants || []).find(campA);
        if (!variant) { excluded.noStateA += 1; seenProductUrls.add(sitemapEntry.url); seenProductIds.add(String(product.id)); progress.currentEntryIndex = entryIndex + 1; continue; }
        stateA += 1;
        const card = matches[0];
        const entry = {
          cardId: card.id, productId: String(product.id), title: product.title,
          detailUrl: sitemapEntry.url, price: campVariantPrice(variant), priceUnit: "JPY",
          available: variant.available === true, observedAt: jstDate(),
          sourceSitemap: sitemapIndex + 1, lastModified: sitemapEntry.lastModified || null,
        };
        const quarantine = campPriceQuarantine(card, entry.price);
        entry.priceQuarantined = quarantine.quarantined;
        entry.quarantineReason = quarantine.reason;
        entry.marketPriceRatio = Number.isFinite(quarantine.ratio) ? Math.round(quarantine.ratio * 1000) / 1000 : null;
        const previousEntry = byId.get(card.id);
        const chosen = preferCampEntry(previousEntry, entry);
        if (!previousEntry && chosen === entry) linked += 1;
        else if (chosen === entry && (previousEntry.detailUrl !== entry.detailUrl || previousEntry.price !== entry.price || previousEntry.available !== entry.available)) updated += 1;
        byId.set(card.id, chosen);
        seenProductUrls.add(sitemapEntry.url);
        seenProductIds.add(String(product.id));
        progress.currentEntryIndex = entryIndex + 1;
        progress.seenProductUrls = [...seenProductUrls];
        progress.seenProductIds = [...seenProductIds];
        catalog = [...byId.values()];
        write(paths.catalog, catalog);
        write(paths.progress, progress);
      }
      if (!stoppingReason && progress.currentEntryIndex >= entries.length) {
        progress.processedSitemaps = [...new Set([...progress.processedSitemaps, sitemapIndex + 1])].sort((a, b) => a - b);
        progress.lastSuccessfulSitemap = sitemapIndex + 1;
        progress.currentSitemapIndex = sitemapIndex + 1;
        progress.currentEntryIndex = 0;
        delete progress.failedSitemaps[sitemapIndex + 1];
        progress.lastFailure = null;
        sitemapsSucceeded += 1;
      }
      metric.status = "success";
      metric.stage = stoppingReason ? "checkpoint" : "complete";
      metric.productCount = entries.length;
      metric.detailFetched = detailFetched;
    } catch (error) {
      failed += 1;
      Object.assign(metric, error.metric || {});
      metric.status = "failed";
      metric.error = error.message;
      metric.exceptionName = error.name || "Error";
      metric.exception = String(error.stack || error.message || error).slice(0, 1200);
      const failure = { sitemapNumber: sitemapIndex + 1, pageKey, url: metric.url, productEntry: progress.currentEntryIndex, httpStatus: metric.httpStatus || null, stage: metric.stage, retryCount: metric.retryCount || 0, timedOut: Boolean(metric.timedOut), exceptionName: metric.exceptionName, error: error.message, exception: metric.exception, at: new Date().toISOString(), lastSuccessfulSitemap: progress.lastSuccessfulSitemap || null };
      progress.failedSitemaps[sitemapIndex + 1] = failure;
      progress.lastFailure = failure;
      progress.failures = [...(progress.failures || []), failure].slice(-50);
      stoppingReason = `サイトマップ${sitemapIndex + 1}の${metric.stage}で停止。次回は同じ商品から再開`;
    }
    progress.seenProductUrls = [...seenProductUrls];
    progress.seenProductIds = [...seenProductIds];
    write(paths.catalog, [...byId.values()]);
    write(paths.progress, progress);
    metric.endedAt = new Date().toISOString();
    recordFetchMetric("torecacamp", metric);
    if (stoppingReason || failed > 0 || process.env.TORECACAMP_RETRY_SITEMAP) break;
  }
  const catalogGuard = guardCatalogDrop(previousCatalog, [...byId.values()]);
  const nextCatalog = catalogGuard.catalog;
  const summary = {};
  for (const entry of nextCatalog) summary[entry.cardId] = {
    torecacampPrice: Number(entry.price) || null,
    available: entry.available,
    availabilityLabel: entry.available ? "在庫あり" : "在庫なし",
    detailUrl: entry.detailUrl || null,
    observedAt: entry.observedAt || null,
    priceQuarantined: entry.priceQuarantined === true,
    quarantineReason: entry.quarantineReason || null,
    marketPriceRatio: Number.isFinite(entry.marketPriceRatio) ? entry.marketPriceRatio : null,
  };
  const processedSitemapCount = progress.processedSitemaps.length;
  const knownProducts = Object.values(progress.sitemapProductCounts).reduce((total, count) => total + Number(count || 0), 0);
  const knownSitemaps = Object.keys(progress.sitemapProductCounts).length;
  const estimatedTotalProducts = knownSitemaps > 0 ? Math.round(knownProducts / knownSitemaps * Number(progress.totalSitemaps || knownSitemaps)) : 0;
  const estimatedRemainingProducts = estimatedTotalProducts > 0 ? Math.max(0, estimatedTotalProducts - seenProductUrls.size) : null;
  const crawlComplete = Boolean(progress.totalSitemaps && processedSitemapCount >= progress.totalSitemaps);
  const progressHealth = updateProgressHealth(progress, seenProductUrls.size);
  if (crawlComplete) stoppingReason = null;
  progress.lastRun = {
    paginationMode: "sitemap", currentCursor: progress.currentSitemapIndex + 1,
    currentSitemapIndex: progress.currentSitemapIndex + 1, currentEntryIndex: progress.currentEntryIndex,
    currentSitemapUrl: sitemapUrls[progress.currentSitemapIndex] || null,
    processedSitemapCount, processedSitemaps: progress.processedSitemaps.slice(-44),
    totalSitemaps: progress.totalSitemaps || sitemapUrls.length || 44,
    cumulativeProductCount: seenProductUrls.size, estimatedTotalProducts, estimatedRemainingProducts,
    cumulativeMatchedCount: nextCatalog.length, hasMorePages: !crawlComplete, crawlComplete,
    priceMigration: priceMigration.audit,
    quarantinedPriceCount: nextCatalog.filter((entry) => entry.priceQuarantined).length,
    sitemapsSucceeded, listedProducts, detailFetched, parsed, stateA, newLinkCount: linked,
    updatedCount: updated, fetchFailureCount: failed, duplicateUrlCount: duplicateUrls,
    duplicateProductIdCount: duplicateProductIds,
    abruptDropDetected: catalogGuard.abruptDrop,
    previousCatalogCount: catalogGuard.previousCount,
    proposedCatalogCount: catalogGuard.proposedCount,
    progressHealth,
    lastSuccessfulPage: progress.lastSuccessfulSitemap ? `サイトマップ ${progress.lastSuccessfulSitemap}` : null,
    lastFailure: progress.lastFailure || null,
    failedSitemaps: Object.values(progress.failedSitemaps),
    stoppingReason,
    completionStatus: crawlComplete && failed === 0 ? "success" : "partial",
    completedAt: new Date().toISOString(),
  };
  write(paths.catalog, nextCatalog); write(paths.progress, progress); write(paths.sitemapCache, sitemapCache);
  write(paths.summary, {
    updatedAt: new Date().toISOString(), stockType: "availability", cards: summary,
    crawl: { ...progress.lastRun, recentFailures: (progress.failures || []).slice(-10) },
  });
  return {
    sitemapsSucceeded, listedProducts, detailFetched, parsed, stateA, linked, updated, failed, cacheHits, excluded,
    duplicateUrls, duplicateProductIds, progressHealth,
    coverage: nextCatalog.length, lastSuccessfulPage: progress.lastRun.lastSuccessfulPage,
    currentCursor: progress.currentSitemapIndex + 1, processedSitemapCount,
    totalSitemaps: progress.totalSitemaps || sitemapUrls.length || 44,
    estimatedRemainingProducts, cumulativeProductCount: seenProductUrls.size,
    cumulativeMatchedCount: nextCatalog.length, crawlComplete,
    completionStatus: crawlComplete && failed === 0 ? "success" : "partial",
  };
}

async function main() {
  const cards = read(path.join(ROOT, "data", "pokemon-cards.json"), []);
  const sourceOnly = String(process.env.SHOP_SOURCE_ONLY || "all").toLowerCase();
  const yuyutei = sourceOnly === "all" || sourceOnly === "yuyutei" ? await updateYuyutei(cards, {
    catalog: path.join(__dirname, "yuyutei_catalog.json"), history: path.join(__dirname, "yuyutei_stock_history.json"), progress: path.join(__dirname, "yuyutei_progress.json"), cache: path.join(__dirname, "yuyutei_page_cache.json"), summary: path.join(ROOT, "data", "yuyutei-stock-summary.json"),
  }) : null;
  const torecacamp = sourceOnly === "all" || sourceOnly === "torecacamp" ? await updateTorecaCamp(cards, {
    catalog: path.join(__dirname, "torecacamp_catalog.json"), progress: path.join(__dirname, "torecacamp_progress.json"), cache: path.join(__dirname, "torecacamp_page_cache.json"), sitemapCache: path.join(__dirname, "torecacamp_sitemap_cache.json"), summary: path.join(ROOT, "data", "torecacamp-stock-summary.json"),
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
  campA, campMatchesCard, campPriceQuarantine, campSignature, campVariantPrice, cardSignature, migrateCampCatalogPrices, normalizeSetCode,
  guardCatalogDrop, updateProgressHealth,
  parseProductSitemap, parseProductSitemapIndex, preferCampEntry,
  yuyuteiPriority,
  numberMatches, parseYuyuteiResults, titleMatches,
};
