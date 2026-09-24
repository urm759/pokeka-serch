const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const model = require("../snkr-raw-flip-model.js");

const ROOT = path.join(__dirname, "..");
const DATA_PATH = path.join(ROOT, "data", "snkr-raw-flip-summary.json");
const CACHE_PATH = path.join(__dirname, "snkr-raw-flip-cache.json");
const CHECKPOINT_PATH = path.join(__dirname, "snkr-raw-flip-checkpoint.json");
const COMPLETION_PATH = path.join(ROOT, "data", "card-catalog-completion.json");
const BUYBACK_PATH = path.join(ROOT, "data", "shop-buyback-summary.json");
const LIMIT = Math.max(1, Number(process.argv.find((value) => value.startsWith("--limit="))?.split("=")[1] || process.env.SNKR_RAW_LIMIT || 40));
const TARGET_IDS = new Set(String(process.argv.find((value) => value.startsWith("--ids="))?.slice(6) || "").split(",").map((value) => value.trim()).filter(Boolean));
const DELAY_MS = Math.max(100, Number(process.env.SNKR_RAW_DELAY_MS || 350));
const MAX_RUNTIME_MS = Math.max(30000, Number(process.env.SNKR_RAW_MAX_RUNTIME_MS || 8 * 60 * 1000));
const MAX_AGE_HOURS = Math.max(1, Number(process.env.SNKR_RAW_REFRESH_HOURS || 22));
const CONDITION_A_ID = 18;

function readJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")); } catch { return fallback; }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value));
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function hash(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function stripHtml(value) { return String(value || "").replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(); }
function normalize(value) { return String(value || "").normalize("NFKC").toUpperCase().replace(/[^0-9A-Z\u3040-\u30ff\u3400-\u9fff]+/g, ""); }
function productId(url) { return String(url || "").match(/snkrdunk\.com\/apparels\/(\d+)/i)?.[1] || null; }

function expectedIdentity(card) {
  const bracket = String(card.name || "").match(/\[\s*([A-Za-z0-9+-]+)\s+(\d{1,4}(?:-\d{1,4})?)\s*\/\s*(\d{1,4})\s*\]/i);
  const promo = String(card.name || "").match(/\[\s*(\d{1,4})\s+([A-Za-z0-9-]+-P)\s*\]/i);
  const setCode = String(promo?.[2] || bracket?.[1] || card.setCode || "").toUpperCase().replace(/\s/g, "");
  const number = String(promo?.[1] || bracket?.[2] || card.model?.split("/")[0] || "").replace(/\s/g, "");
  const rarity = String(card.rarity || card.name?.match(/\b(SAR|SR|UR|HR|SSR|CSR|CHR|AR|RRR|RR|R|MUR|BWR)\b/i)?.[1] || "").toUpperCase();
  const variant = /マスターボール/i.test(card.name) ? "masterball" : /モンスターボール/i.test(card.name) ? "monsterball" : /ミラー/i.test(card.name) ? "mirror" : "normal";
  return { setCode, number, rarity, variant, language: card.language || "ja" };
}

function parseProductIdentity(html) {
  const title = stripHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const code = stripHtml(html.match(/(?:管理番号|品番)[\s\S]{0,300}?(pkmn-tcg-[A-Za-z0-9+-]+-\d{1,4})/i)?.[1] || "");
  const codeMatch = code.match(/^pkmn-tcg-(.+)-(\d{1,4})$/i);
  const variant = /マスターボール/i.test(title) ? "masterball" : /モンスターボール/i.test(title) ? "monsterball" : /ミラー/i.test(title) ? "mirror" : "normal";
  const rarity = String(title.match(/\b(SAR|SR|UR|HR|SSR|CSR|CHR|AR|RRR|RR|R|MUR|BWR)\b/i)?.[1] || "").toUpperCase();
  return { title, productCode: code, setCode: String(codeMatch?.[1] || "").toUpperCase(), number: String(codeMatch?.[2] || ""), rarity, variant, language: "ja" };
}

function validateIdentity(card, observed) {
  const expected = expectedIdentity(card);
  const reasons = [];
  if (!expected.setCode || !expected.number) reasons.push("国内カードのセット・番号不足");
  if (!observed.setCode || !observed.number) reasons.push("スニダン管理番号を確認不能");
  if (expected.setCode && observed.setCode && normalize(expected.setCode) !== normalize(observed.setCode)) reasons.push("セットコード不一致");
  if (expected.number && observed.number && normalize(expected.number) !== normalize(observed.number)) reasons.push("カード番号不一致");
  if (expected.variant !== observed.variant) reasons.push("通常版・ミラー仕様不一致");
  if (expected.rarity && observed.rarity && expected.rarity !== observed.rarity) reasons.push("レアリティ不一致");
  if (/PSA|BGS|CGC|ARS|TAG|ACE|未開封|BOX|セット\s*品/i.test(observed.title) && !/PSA|BGS|CGC|ARS|TAG|ACE/.test(card.name || "")) reasons.push("鑑定品・未開封・複数枚疑い");
  return { valid: reasons.length === 0, confidence: reasons.length ? "rejected" : "exact", score: reasons.length ? 0 : 1, reasons, expected, observed };
}

function parseSaleDate(label, now) {
  const text = String(label || "").trim();
  let match = text.match(/^(\d+)分前$/);
  if (match) return new Date(now.getTime() - Number(match[1]) * 60000);
  match = text.match(/^(\d+)時間前$/);
  if (match) return new Date(now.getTime() - Number(match[1]) * 3600000);
  match = text.match(/^(\d+)日前$/);
  if (match) return new Date(now.getTime() - Number(match[1]) * 86400000);
  match = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (match) return new Date(`${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}T12:00:00+09:00`);
  return null;
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 15000);
  try {
    const response = await fetch(url, {
      headers: { Accept: options.accept || "text/html,application/json", Referer: options.referer || "https://snkrdunk.com/", "User-Agent": "Mozilla/5.0 (compatible; PokecaInventoryMonitor/1.0; +https://urm759.github.io/pokeka-serch/)" },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
    return { text, status: response.status, etag: response.headers.get("etag"), lastModified: response.headers.get("last-modified") };
  } finally { clearTimeout(timer); }
}

async function fetchWithRetry(url, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return { ...(await fetchText(url, options)), retries: attempt }; } catch (error) {
      lastError = error;
      if (![429, 500, 502, 503, 504].includes(Number(error.status)) || attempt === 2) break;
      await sleep(500 * (2 ** attempt));
    }
  }
  throw lastError;
}

function saleStats(history, now) {
  const rows = (history || []).map((row) => ({ ...row, price: Number(row.price), soldAt: parseSaleDate(row.date, now) }))
    .filter((row) => row.price > 0 && row.soldAt && row.condition === "A" && row.label === "中古");
  const since7 = now.getTime() - 7 * 86400000;
  const since30 = now.getTime() - 30 * 86400000;
  const rows7 = rows.filter((row) => row.soldAt.getTime() >= since7);
  const rows30 = rows.filter((row) => row.soldAt.getTime() >= since30);
  return {
    sold7Count: rows7.length,
    sold30Count: rows30.length,
    sold7Median: model.median(rows7.map((row) => row.price)),
    sold30Median: model.median(rows30.map((row) => row.price)),
    newestSaleAt: rows[0]?.soldAt?.toISOString() || null,
    oldestFetchedSaleAt: rows.at(-1)?.soldAt?.toISOString() || null,
    fetchedSaleRows: rows.length,
  };
}

async function collectCard(card, now) {
  const id = productId(card.snkUrl);
  if (!id) throw new Error("スニダン個別商品URL未取得");
  const productUrl = `https://snkrdunk.com/apparels/${id}`;
  const product = await fetchWithRetry(productUrl, { referer: productUrl });
  await sleep(DELAY_MS);
  const identity = validateIdentity(card, parseProductIdentity(product.text));
  if (!identity.valid) return { cardId: card.id, productId: id, productUrl, status: "identity-mismatch", identityValid: false, linkageMethod: "管理番号・セット・カード番号・仕様の完全一致", linkageConfidence: "rejected", linkageScore: 0, identity, fetchedAt: now.toISOString(), error: identity.reasons.join("／") };
  const chipsResult = await fetchWithRetry(`https://snkrdunk.com/v2/products/${id}/size-chips?type=apparel`, { accept: "application/json", referer: productUrl });
  await sleep(DELAY_MS);
  const chips = JSON.parse(chipsResult.text).chips || [];
  const conditionA = chips.find((chip) => Number(chip.conditionId) === CONDITION_A_ID && chip.conditionCode === "trading_card_single_nearly_unused");
  const history = [];
  let pages = 0;
  let historyComplete30d = false;
  for (let page = 1; page <= 5; page += 1) {
    const historyResult = await fetchWithRetry(`https://snkrdunk.com/v1/apparels/${id}/sales-history?page=${page}&per_page=100&condition_id=${CONDITION_A_ID}`, { accept: "application/json", referer: `${productUrl}/sales-histories` });
    pages += 1;
    const pageRows = JSON.parse(historyResult.text).history || [];
    history.push(...pageRows);
    const oldest = parseSaleDate(pageRows.at(-1)?.date, now);
    if (!pageRows.length || pageRows.length < 100 || (oldest && now.getTime() - oldest.getTime() > 30 * 86400000)) { historyComplete30d = true; break; }
    await sleep(DELAY_MS);
  }
  const stats = saleStats(history, now);
  return {
    cardId: card.id,
    productId: id,
    productUrl,
    status: "ok",
    identityValid: true,
    linkageMethod: "スニダン管理番号＋セット＋カード番号＋レアリティ＋仕様",
    linkageConfidence: "exact",
    linkageScore: 1,
    identity,
    currentListingPrice: Number(conditionA?.usedMinPrice) > 0 ? Number(conditionA.usedMinPrice) : null,
    listingAvailable: conditionA?.hasListing === true,
    listingCount: Number.isFinite(Number(conditionA?.listingCount)) ? Number(conditionA.listingCount) : null,
    ...stats,
    historyComplete30d,
    historyPages: pages,
    soldCountStatus: historyComplete30d ? "measured" : "partial",
    fetchedAt: now.toISOString(),
    http: { productStatus: product.status, productHash: hash(product.text), etag: product.etag, lastModified: product.lastModified, retries: product.retries },
  };
}

function priority(card, completion, previous, buybackCards) {
  const detail = completion?.cards?.[card.id] || {};
  const never = previous ? 0 : 1000000;
  const recent = detail.rr ? 300000 : 0;
  const releaseTime = Date.parse(detail.rd || "");
  const releaseAgeMonths = Number.isFinite(releaseTime) ? (Date.now() - releaseTime) / (30.4375 * 86400000) : null;
  const currentEra = releaseAgeMonths !== null && releaseAgeMonths >= 0 && releaseAgeMonths <= 36 ? 220000 : 0;
  const buyback = Math.min(250000, Number(buybackCards?.[card.id]?.total30 || 0) * 3500);
  const trades = Math.min(250000, Number(card.tv30 || 0) * 500);
  const value = Math.min(150000, Number(card.price || 0));
  return never + recent + currentEra + buyback + trades + value + Number(detail.p || 0);
}

async function main() {
  const startedAt = new Date();
  const cards = readJson(path.join(ROOT, "data", "pokemon-cards.json"), []);
  const completion = readJson(COMPLETION_PATH, { cards: {} });
  const buyback = readJson(BUYBACK_PATH, { cards: {} });
  const previous = readJson(DATA_PATH, { version: 1, cards: {}, coverage: {} });
  const cache = readJson(CACHE_PATH, { version: 1, cards: {} });
  const checkpoint = readJson(CHECKPOINT_PATH, { version: 1, processed: 0, cycles: 0 });
  const now = new Date();
  const eligible = cards.filter((card) => productId(card.snkUrl));
  const stale = eligible.filter((card) => {
    if (TARGET_IDS.size) return TARGET_IDS.has(String(card.id));
    const fetched = Date.parse(previous.cards?.[card.id]?.fetchedAt || "");
    return !Number.isFinite(fetched) || (now.getTime() - fetched) / 3600000 >= MAX_AGE_HOURS;
  });
  stale.sort((a, b) => priority(b, completion, previous.cards?.[b.id], buyback.cards) - priority(a, completion, previous.cards?.[a.id], buyback.cards));
  const queue = stale.slice(0, TARGET_IDS.size ? Math.max(LIMIT, TARGET_IDS.size) : LIMIT);
  let succeeded = 0;
  let failed = 0;
  let rejected = 0;
  for (const card of queue) {
    if (Date.now() - startedAt.getTime() >= MAX_RUNTIME_MS) break;
    try {
      const result = await collectCard(card, now);
      if (result.status === "ok") {
        previous.cards[card.id] = result;
        succeeded += 1;
      } else {
        previous.cards[card.id] = result;
        rejected += 1;
      }
      cache.cards[card.id] = { lastAttemptAt: now.toISOString(), status: result.status, productUrl: result.productUrl, contentHash: result.http?.productHash || null };
    } catch (error) {
      failed += 1;
      cache.cards[card.id] = { ...(cache.cards[card.id] || {}), lastAttemptAt: now.toISOString(), status: "failed", error: error.message, retryCount: Number(cache.cards[card.id]?.retryCount || 0) + 1 };
      if (previous.cards[card.id]?.status !== "ok") previous.cards[card.id] = { cardId: card.id, productUrl: card.snkUrl, status: "failed", fetchedAt: null, lastAttemptAt: now.toISOString(), error: error.message, sold7Count: null, sold30Count: null, sold7Median: null, sold30Median: null };
    }
    await sleep(DELAY_MS);
  }
  const rows = Object.values(previous.cards || {});
  const okRows = rows.filter((row) => row.status === "ok");
  const soldRows = okRows.filter((row) => Number(row.sold30Count) > 0 && Number(row.sold30Median) > 0);
  const listingRows = okRows.filter((row) => Number(row.currentListingPrice) > 0);
  previous.version = 1;
  previous.updatedAt = now.toISOString();
  previous.source = { name: "SNKRDUNK", condition: "A", conditionId: CONDITION_A_ID, listingEndpoint: "/v2/products/{id}/size-chips", salesEndpoint: "/v1/apparels/{id}/sales-history", soldCountsAreMeasured: true, psaMixed: false };
  previous.defaults = { feeRate: 7, shipping: 210, otherCost: 0, maxAgeHours: 48 };
  previous.coverage = {
    totalCards: cards.length,
    directProductLinks: eligible.length,
    attemptedCards: rows.length,
    exactMatchedCards: okRows.length,
    currentPriceCards: listingRows.length,
    sold30Cards: soldRows.length,
    identityRejectedCards: rows.filter((row) => row.status === "identity-mismatch").length,
    acquisitionFailureCards: rows.filter((row) => row.status === "failed").length,
    unattemptedCards: Math.max(0, eligible.length - rows.length),
    linkageRatePct: eligible.length ? Math.round(okRows.length / eligible.length * 10000) / 100 : 0,
    soldDataRatePct: eligible.length ? Math.round(soldRows.length / eligible.length * 10000) / 100 : 0,
    currentPriceRatePct: eligible.length ? Math.round(listingRows.length / eligible.length * 10000) / 100 : 0,
    completionStatus: rows.length >= eligible.length ? "success" : "partial",
    lastBatch: { requested: LIMIT, processed: succeeded + failed + rejected, succeeded, failed, rejected, startedAt: startedAt.toISOString(), endedAt: new Date().toISOString() },
  };
  checkpoint.updatedAt = now.toISOString();
  checkpoint.processed = Number(checkpoint.processed || 0) + succeeded + failed + rejected;
  checkpoint.lastBatchCardIds = queue.slice(0, succeeded + failed + rejected).map((card) => card.id);
  checkpoint.remaining = Math.max(0, eligible.length - rows.length);
  checkpoint.lastStatus = failed ? "partial" : "success";
  writeJson(DATA_PATH, previous);
  writeJson(CACHE_PATH, cache);
  writeJson(CHECKPOINT_PATH, checkpoint);
  console.log(JSON.stringify(previous.coverage, null, 2));
}

module.exports = { expectedIdentity, parseProductIdentity, validateIdentity, parseSaleDate, saleStats, productId };

if (require.main === module) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
