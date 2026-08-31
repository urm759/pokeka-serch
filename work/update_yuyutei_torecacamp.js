const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const YUYUTEI = "https://yuyu-tei.jp";
const TORECA_CAMP = "https://torecacamp-pokemon.com";

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function write(file, value) { fs.writeFileSync(file, JSON.stringify(value), "utf8"); }
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
    .replace(/[:：]\s*(?:SA|プロモ|ミラー|英語版|旧裏|仕様)/gi, " "));
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
  if (!signature.cardNo || !numberMatches(signature.cardNo, cardNo)) return false;
  if (setCode && signature.setCode && signature.setCode !== normalizeSetCode(setCode)) return false;
  const productName = normalize(String(title || "").replace(/\d{1,4}\s*\/\s*\d{1,4}/g, ""));
  return Boolean(signature.base) && (productName.includes(signature.base) || signature.base.includes(productName));
}
function due(attempt, signature) {
  if (!attempt || attempt.signature !== signature) return true;
  const then = Date.parse(attempt.checkedAt || "");
  return !Number.isFinite(then) || Date.now() - then >= 30 * 86400000;
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function fetchText(url) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" }, signal: controller.signal });
      if (response.ok) return await response.text();
      if (response.status === 429 || response.status >= 500) { await sleep(1200 * (attempt + 1)); continue; }
      throw new Error(`HTTP ${response.status}`);
    } finally { clearTimeout(timer); }
  }
  throw new Error("retry exhausted");
}
async function fetchJson(url) { return JSON.parse(await fetchText(url)); }
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
  if (!progress.attemptedCards || typeof progress.attemptedCards !== "object") progress.attemptedCards = {};
  const byId = new Map(catalog.map((entry) => [entry.cardId, entry]));
  const onlyIds = new Set(String(process.env.YUYUTEI_ONLY_ID || "").split(",").map((value) => value.trim()).filter(Boolean));
  const targets = cards.filter((card) => (onlyIds.size ? onlyIds.has(card.id) : !byId.has(card.id) && due(progress.attemptedCards[card.id], JSON.stringify(cardSignature(card)))))
    .sort((a, b) => Number(b.tv30 || 0) - Number(a.tv30 || 0) || Number(b.price || 0) - Number(a.price || 0))
    .slice(0, Math.max(1, Number(process.env.YUYUTEI_SEARCH_BATCH || 100)));
  let linked = 0;
  await mapLimit(targets, Math.max(1, Number(process.env.YUYUTEI_CONCURRENCY || 3)), async (card) => {
    const signature = cardSignature(card); const signatureKey = JSON.stringify(signature);
    try {
      const query = `${signature.base} ${signature.cardNo}`;
      const searchUrl = `${YUYUTEI}/sell/poc/s/search?search_word=${encodeURIComponent(query)}&rare=&type=&kizu=0`;
      // Jina's URL parser needs the shop query separators encoded so it
      // forwards every filter, including the condition-A kizu=0 filter.
      const html = await fetchText(`https://r.jina.ai/http://${searchUrl.replace(/&/g, "%26")}`);
      const candidates = parseYuyuteiResults(html);
      const match = findYuyuteiCard(card, html) || candidates.find((row) => titleMatches(card, row.title, row.cardNo, row.setCode));
      if (process.env.YUYUTEI_DEBUG === "1") console.log(JSON.stringify({ card: card.id, signature, length: html.length, hasExpectedNumber: html.includes(signature.cardNo), matched: Boolean(match), candidates: candidates.slice(0, 3) }));
      progress.attemptedCards[card.id] = { signature: signatureKey, checkedAt: new Date().toISOString(), found: Boolean(match) };
      if (!match) return;
      byId.set(card.id, { cardId: card.id, ...match, observedAt: jstDate() }); linked += 1;
    } catch (error) { console.warn(`yuyutei search failed ${card.id}: ${error.message}`); }
  });
  catalog = [...byId.values()];
  const index = appendDate(history, jstDate());
  const stocks = catalog.filter((entry) => Number.isFinite(entry.stock));
  for (const entry of stocks) setStock(history, entry.cardId, index, entry.stock);
  const summary = historySummary(cards, catalog, history, "yuyuteiPrice");
  write(paths.catalog, catalog); write(paths.history, history); write(paths.progress, progress);
  write(paths.summary, { updatedAt: jstDate(), stockType: "point", cards: summary });
  return { linked, coverage: catalog.length };
}

function campA(variant) { return /(?:^|【\s*)状態A(?:\s*】|$)/.test(String(variant?.title || variant?.option1 || "")); }
function campSignature(product) {
  const title = String(product?.title || "");
  const number = (title.match(/(\d{1,4}(?:\s*[-/]\s*\d{1,4})?)\s*\/\s*\d{1,4}/) || [])[1] || "";
  const setCodes = (product?.tags || []).map((tag) => String(tag || "").replace(/^#/, "")).filter((tag) => /^[A-Za-z0-9-]+$/i.test(tag)).map(normalizeSetCode);
  return { title, cardNo: number.replace(/\s/g, ""), setCodes };
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
  const catalog = reset ? [] : read(paths.catalog, []); const progress = reset ? { page: 1, exhausted: false } : read(paths.progress, { page: 1, exhausted: false });
  const byId = new Map(catalog.map((entry) => [entry.cardId, entry]));
  const byNumber = new Map();
  for (const card of cards) { const signature = cardSignature(card); if (signature.cardNo) { if (!byNumber.has(signature.cardNo)) byNumber.set(signature.cardNo, []); byNumber.get(signature.cardNo).push(card); } }
  const pageCount = Math.max(1, Number(process.env.TORECACAMP_PAGES_PER_RUN || 6));
  let page = Math.max(1, Number(progress.page || 1)); let fetched = 0; let linked = 0;
  for (let count = 0; count < pageCount && !progress.exhausted; count += 1, page += 1) {
    let products = [];
    try { products = (await fetchJson(`${TORECA_CAMP}/products.json?limit=250&page=${page}`)).products || []; } catch (error) { console.warn(`torecacamp page ${page} failed: ${error.message}`); break; }
    fetched += products.length;
    if (products.length < 250) progress.exhausted = true;
    for (const product of products) {
      const variant = (product.variants || []).find(campA); if (!variant) continue;
      const sig = campSignature(product); const candidates = byNumber.get(sig.cardNo) || [];
      const card = candidates.find((row) => campMatchesCard(row, product));
      if (!card) continue;
      const entry = { cardId: card.id, title: product.title, detailUrl: `${TORECA_CAMP}/products/${encodeURIComponent(product.handle)}`, price: Number(variant.price) || null, available: variant.available === true, observedAt: jstDate() };
      if (!byId.has(card.id) || byId.get(card.id).detailUrl !== entry.detailUrl) linked += 1;
      byId.set(card.id, entry);
    }
  }
  progress.page = progress.exhausted ? 1 : page;
  if (progress.exhausted) progress.exhausted = false;
  const nextCatalog = [...byId.values()];
  const summary = {};
  for (const entry of nextCatalog) summary[entry.cardId] = { torecacampPrice: Number(entry.price) || null, available: entry.available, availabilityLabel: entry.available ? "在庫あり" : "在庫なし" };
  write(paths.catalog, nextCatalog); write(paths.progress, progress); write(paths.summary, { updatedAt: jstDate(), stockType: "availability", cards: summary });
  return { linked, fetched, coverage: nextCatalog.length };
}

async function main() {
  const cards = read(path.join(ROOT, "data", "pokemon-cards.json"), []);
  const yuyutei = await updateYuyutei(cards, {
    catalog: path.join(__dirname, "yuyutei_catalog.json"), history: path.join(__dirname, "yuyutei_stock_history.json"), progress: path.join(__dirname, "yuyutei_progress.json"), summary: path.join(ROOT, "data", "yuyutei-stock-summary.json"),
  });
  const torecacamp = await updateTorecaCamp(cards, {
    catalog: path.join(__dirname, "torecacamp_catalog.json"), progress: path.join(__dirname, "torecacamp_progress.json"), summary: path.join(ROOT, "data", "torecacamp-stock-summary.json"),
  });
  const latestCards = read(path.join(ROOT, "data", "pokemon-cards.json"), []);
  const yuyuteiById = new Map(read(path.join(__dirname, "yuyutei_catalog.json"), []).map((entry) => [entry.cardId, entry]));
  const campById = new Map(read(path.join(__dirname, "torecacamp_catalog.json"), []).map((entry) => [entry.cardId, entry]));
  const resetCamp = process.env.TORECACAMP_RESET === "1";
  const updatedCards = latestCards.map((card) => ({ ...card, yuyuteiUrl: yuyuteiById.get(card.id)?.detailUrl || card.yuyuteiUrl || null, torecacampUrl: campById.get(card.id)?.detailUrl || (resetCamp ? null : card.torecacampUrl) || null }));
  write(path.join(ROOT, "data", "pokemon-cards.json"), updatedCards);
  console.log(JSON.stringify({ yuyutei, torecacamp }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
