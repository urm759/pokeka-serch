const fs = require("fs");
const path = require("path");
const { isModernCard, isModernSetCode, coverage } = require("./cardrush_modern_rules");

let invalidCardrushUrls = new Set();

const KNOWN_CARD_OVERRIDES = new Map([
  ["pk-731", "https://www.cardrush-pokemon.jp/product/731"],
  ["pk-38030", "https://www.cardrush-pokemon.jp/product/38029"],
  ["pk-3123", "https://www.cardrush-pokemon.jp/product/3123"],
  ["pk-1180", "https://www.cardrush-pokemon.jp/product/1180"],
]);

function resolveSiteRoot() {
  const standaloneRoot = path.join(__dirname, "..");
  if (fs.existsSync(path.join(standaloneRoot, "index.html"))) {
    return standaloneRoot;
  }
  return path.join(standaloneRoot, "outputs", "github-site");
}

async function fetchText(url) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0" },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        const delay = String(err?.message || "").includes("HTTP 429") ? 30000 : attempt * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Failed to fetch ${url}: ${lastError?.message || "unknown error"}`);
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

function extractStock(value) {
  const text = String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const match = text.match(/在庫数\s*([0-9,]+)\s*枚/);
  if (match) return Number(match[1].replace(/,/g, ""));
  if (/SOLD\s*OUT|(?:^|\s)×(?:\s|$)/i.test(text)) return 0;
  return null;
}

function extractPrice(value) {
  const text = String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const matches = [...text.matchAll(/([0-9][0-9,]*)\s*円(?:\(税込\))?/g)];
  if (!matches.length) return null;
  return Number(matches[matches.length - 1][1].replace(/,/g, ""));
}

function normalizeLooseText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
    .replace(/[‐−–—]/g, "-")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function extractFinishKind(value) {
  const text = String(value || "");
  if (/マスターボールミラー|マスボ(?:ミラー)?/i.test(text)) return "master-ball-mirror";
  if (/モンスターボールミラー|モンボ(?:ミラー)?/i.test(text)) return "monster-ball-mirror";
  if (/SAR\s*仕様/i.test(text)) return "sar-style";
  if (/ミラー/i.test(text)) return "mirror";
  if (/旧裏/i.test(text)) return "old-back";
  if (/英語版/i.test(text)) return "english";
  if (/アンリミ/i.test(text)) return "unlimited";
  if (/(?:^|[^A-Z0-9])1ED(?:[^A-Z0-9]|$)/i.test(text)) return "first-edition";
  return "";
}

function finishLabel(kind) {
  return {
    "master-ball-mirror": "マスターボールミラー",
    "monster-ball-mirror": "モンスターボールミラー",
    "sar-style": "SAR仕様",
    mirror: "ミラー",
    "old-back": "旧裏",
    english: "英語版",
    unlimited: "アンリミ",
    "first-edition": "1ED",
  }[kind] || "";
}

function normalizeDisplayBase(value) {
  let text = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s*\(.+?\)\s*$/, "")
    .replace(/\s*[【\[].*$/, "")
    .trim();

  text = text
    .replace(/\s*\((?:マスターボールミラー|モンスターボールミラー|[^)]*ミラー|SAR\s*仕様|旧裏|英語版|アンリミ|1ED)\)\s*$/i, "")
    .replace(/\s*(?:マスターボールミラー|モンスターボールミラー|マスボ(?:ミラー)?|モンボ(?:ミラー)?|SAR\s*仕様|ミラー|旧裏|英語版|アンリミ|1ED)\s*$/i, "")
    .trim();

  const rarityPattern = "(?:MUR|BWR|MA|SSR|CSR|CHR|SAR|UR|HR|SR|RRR|RR|AR|PR|P|H|C|U|R)";
  text = text.replace(
    new RegExp(
      `\\s*(?:(?:${rarityPattern})(?:\\s*[:：]\\s*[^\\s\\[]+)?|[:：]\\s*(?:SA|プロモ|ミラー|英語版|旧裏|仕様)|(?:仕様|プロモ|ミラー|英語版|旧裏))\\s*$`,
      "i"
    ),
    ""
  );
  return text.trim();
}

function extractCardrushComponents(card) {
  const source = String(card?.name || card || "").replace(/\s+/g, " ").trim();
  const base = normalizeDisplayBase(source);
  const rarityPattern = "MUR|BWR|MA|SSR|CSR|CHR|SAR|UR|HR|SR|RRR|RR|AR|PR|P|H|C|U|R";
  const promoSetFirst = source.match(/\[\s*([A-Za-z0-9]+-P)\s+(\d{1,4})\s*\]/i);
  const promoNumberFirst = source.match(/\[\s*PROMO\s*(\d{1,4})\s+([A-Za-z0-9]+-P)\s*\]/i);
  const promoProduct = source.match(/\{\s*(\d{1,4})\/([A-Za-z0-9]+-P)\s*\}/i);
  const promoCardNo = (number, promoSet) =>
    String(promoSet || "").toUpperCase() === "S8A-P"
      ? `${number}/025`
      : `${number}/${String(promoSet || "").toUpperCase()}`;
  const setCode =
    promoSetFirst?.[1] ||
    promoNumberFirst?.[2] ||
    promoProduct?.[2] ||
    (source.match(/\[\s*([A-Za-z0-9-]+)\s+\d{1,4}(?:\/\d{1,4})?\s*\]/) || [])[1] ||
    (source.match(/\[([A-Za-z0-9-]+)\]/) || [])[1] ||
    "";
  const cardNo =
    (promoProduct ? `${promoProduct[1]}/${promoProduct[2].toUpperCase()}` : "") ||
    (promoSetFirst ? promoCardNo(promoSetFirst[2], promoSetFirst[1]) : "") ||
    (promoNumberFirst ? promoCardNo(promoNumberFirst[1], promoNumberFirst[2]) : "") ||
    (source.match(/\{(\d{1,4}\/(?:\d{1,4}|[A-Za-z0-9]+-P))\}/i) || [])[1] ||
    (source.match(/\[\s*[A-Za-z0-9-]+\s+(\d{1,4}\/\d{1,4})\s*\]/) || [])[1] ||
    (source.match(/\[(\d{1,4}\/\d{1,4})\]/) || [])[1] ||
    (String(card?.model || "").match(/(\d{1,4}\/\d{1,4})/) || [])[1] ||
    "";
  const rarity =
    (String(card?.rarity || "").match(new RegExp(`^(${rarityPattern})$`, "i")) || [])[1] ||
    (source.match(new RegExp(`【(${rarityPattern})】`, "i")) || [])[1] ||
    (source.includes("プロモ") || /(?:^|\s)[A-Za-z0-9-]*-P(?:\s|$)/i.test(source) || /(?:^|\s)PR(?:\s|$)/i.test(source)
      ? "P"
      : "") ||
    (source.match(new RegExp(`(?:^|\\s)(${rarityPattern})(?=\\s*(?:[:：]|\\[|\\{|$))`, "i")) || [])[1] ||
    (source.match(new RegExp(`\\[\\s*[A-Za-z0-9-]+\\s+\\d{1,4}\\/\\d{1,4}\\s*\\]\\s*(?:【)?(${rarityPattern})(?:】)?`, "i")) || [])[1] ||
    "";
  return {
    base,
    raw: normalizeLooseText(source),
    cardNo,
    rarity: String(rarity || "").toUpperCase(),
    setCode: String(setCode || "").trim(),
    finish: extractFinishKind(source),
  };
}

function buildCardrushDisplayName(card) {
  const sig = extractCardrushComponents(card);
  const base = sig.base || normalizeDisplayBase(card?.name || "");
  const finish = finishLabel(sig.finish);
  return `${base}${finish ? `(${finish})` : ""}${sig.rarity ? `【${sig.rarity}】` : ""}${sig.cardNo ? `{${sig.cardNo}}` : ""}${sig.setCode ? ` [${sig.setCode}]` : ""}`
    .replace(/\s+/g, " ")
    .trim();
}

function buildCardrushSearchUrl(card) {
  const query = buildCardrushDisplayName(card);
  return `https://www.cardrush-pokemon.jp/product-list?keyword=${encodeURIComponent(query)}`;
}

function extractSearchSeed(card) {
  const sig = extractCardrushComponents(card);
  if (sig.setCode) return sig.setCode.toUpperCase();
  const psa = String(card?.psaQuery || "").match(/^Pokemon Japanese\s+(.+?)\s+\d+/i);
  if (psa) return psa[1].trim().toUpperCase();
  return buildCardrushDisplayName(card);
}

function normalizeStateLabel(rawTitle) {
  const text = String(rawTitle || "").trim();
  const m = text.match(/^〔状態([A-D])(-)?〕/i);
  if (m) return `${m[1]}${m[2] || ""}`;
  return "A";
}

function stripStatePrefix(rawTitle) {
  return String(rawTitle || "").replace(/^〔状態[^〕]+〕/, "").trim();
}

function buildCatalogEntry(title, detailUrl, state, model, stock = null, price = null) {
  const full = `${stripStatePrefix(title)}${model ? ` [${model}]` : ""}`.replace(/\s+/g, " ").trim();
  const sig = extractCardrushComponents({ name: full });
  const matchKeys = [
    normalizeLooseText(full),
    normalizeLooseText(sig.base),
    normalizeLooseText(sig.cardNo),
    normalizeLooseText(sig.setCode),
    normalizeLooseText(sig.rarity),
    normalizeLooseText(`${sig.base}${sig.rarity}${sig.cardNo}${sig.setCode}`),
    normalizeLooseText(`${sig.base}${sig.cardNo}${sig.setCode}`),
  ].filter(Boolean);
  return {
    name: full,
    detailUrl,
    state: state || "A",
    stock: Number.isFinite(stock) ? stock : null,
    price: Number.isFinite(price) ? price : null,
    observedAt: jstDate(),
    matchKeys: [...new Set(matchKeys)],
  };
}

function extractCardrushItems(html) {
  if (String(html || "").includes("Markdown Content:")) {
    return extractCardrushMarkdownItems(html);
  }
  const items = [];
  const regex =
    /<li class="list_item_cell list_item_(\d+)\s*">[\s\S]*?<a href="(https:\/\/www\.cardrush-pokemon\.jp\/product\/\d+)" class="item_data_link">[\s\S]*?alt="([^"]+)"[^>]*>[\s\S]*?<span class="model_number_value">([^<]+)<\/span>/g;
  let match;
  while ((match = regex.exec(html))) {
    const [, id, detailUrl, alt, model] = match;
    const state = normalizeStateLabel(alt);
    const entry = buildCatalogEntry(alt, detailUrl, state, model, extractStock(match[0]), extractPrice(match[0]));
    entry.id = id;
    items.push(entry);
  }
  return items;
}

function extractCardrushMarkdownItems(markdown) {
  const items = [];
  for (const line of String(markdown || "").split(/\r?\n/)) {
    const product = line.match(/!\[Image \d+: ([^\]]+)\]\([^)]+\)\s*(.*?)\]\((https:\/\/www\.cardrush-pokemon\.jp\/product\/(\d+))\)\s*$/);
    const alt = product?.[1] || "";
    const visibleText = product?.[2] || "";
    const detailUrl = product?.[3] || "";
    const id = (detailUrl || "").match(/\/(\d+)$/)?.[1];
    if (!alt || !detailUrl || !id) continue;
    const model = (line.match(/\}\[(?:\*\*)?([A-Za-z0-9-]+)(?:\*\*)?\]/) || [])[1] || "";
    const state = /^〔状態[^〕]+〕/.test(visibleText) ? normalizeStateLabel(visibleText) : "A";
    const entry = buildCatalogEntry(alt, detailUrl, state, model, extractStock(line), extractPrice(line));
    entry.id = id;
    items.push(entry);
  }
  return items;
}

function extractTotalPages(html) {
  const direct = html.match(/class="to_last_page pager_btn">(\d+)</);
  if (direct) return Number(direct[1]) || 1;
  const pages = [...html.matchAll(/[?&]page=(\d+)/g)].map((m) => Number(m[1])).filter(Number.isFinite);
  return pages.length ? Math.max(...pages) : 1;
}

function isMatchableState(state) {
  return String(state || "A").toUpperCase() === "A";
}

function isMatchableEntry(entry) {
  if (!isMatchableState(entry?.state)) return false;
  return !/(?:PSA|ARS|CGC|BGS|ACE)\s*10|鑑定済/i.test(String(entry?.name || ""));
}

async function crawlCardrushSeed(keyword, maxPages = Number.POSITIVE_INFINITY) {
  const directUrl = `http://www.cardrush-pokemon.jp/product-list?keyword=${encodeURIComponent(keyword)}`;
  const firstUrl = `https://r.jina.ai/${directUrl}`;
  let html;
  let totalPages = 1;
  try {
    html = await fetchText(firstUrl);
    totalPages = Math.min(extractTotalPages(html), maxPages);
    console.log(`seed ${keyword}: ${totalPages} page(s)`);
  } catch (err) {
    console.warn(`skip seed ${keyword}: ${err.message}`);
    return { items: [], complete: false };
  }

  const items = [];
  let complete = true;
  const firstItems = extractCardrushItems(html);
  items.push(...firstItems);
  const seenPageUrls = new Set(firstItems.map((item) => item.detailUrl));
  if (maxPages <= 1) return { items, complete };

  if (String(html).includes("Markdown Content:") && totalPages === 1) {
    if (firstItems.length < 50) return { items, complete };
    for (let start = 2; start <= 100; start += 4) {
      const pages = [start, start + 1, start + 2, start + 3];
      const results = await Promise.allSettled(
        pages.map((page) => fetchText(`${firstUrl}&page=${page}`))
      );
      let reachedEnd = false;
      for (const result of results) {
        if (result.status !== "fulfilled") {
          complete = false;
          console.warn(`skip cached page for ${keyword}: ${result.reason?.message || result.reason}`);
          continue;
        }
        const pageItems = extractCardrushItems(result.value);
        const freshItems = pageItems.filter((item) => !seenPageUrls.has(item.detailUrl));
        if (!pageItems.length || !freshItems.length) reachedEnd = true;
        for (const item of freshItems) {
          seenPageUrls.add(item.detailUrl);
          items.push(item);
        }
      }
      if (reachedEnd) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return { items, complete };
  }

  for (let start = 2; start <= totalPages; start += 2) {
    const pages = Array.from({ length: Math.min(2, totalPages - start + 1) }, (_, index) => start + index);
    const results = await Promise.allSettled(
      pages.map((page) => fetchText(`${firstUrl}&page=${page}`))
    );
    for (const result of results) {
      if (result.status === "fulfilled") items.push(...extractCardrushItems(result.value));
      else {
        complete = false;
        console.warn(`skip page for ${keyword}: ${result.reason?.message || result.reason}`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return { items, complete };
}

async function crawlCardrushCatalog(
  seedList,
  maxPages = Number.POSITIVE_INFINITY,
  concurrency = 2,
  initialCatalog = [],
  checkpointPath = "",
  progressPath = ""
) {
  const catalog = mergeCatalogs(initialCatalog);
  const seenUrls = new Set(catalog.map((entry) => entry.detailUrl));
  const catalogIndexByUrl = new Map(catalog.map((entry, index) => [entry.detailUrl, index]));
  const progress = safeReadJson(progressPath, { completedSeeds: [] });
  const refreshAll = process.env.CARDRUSH_REFRESH_ALL === "1";
  const skipSeeds = process.env.CARDRUSH_SKIP_SEEDS === "1";
  const completedSeeds = new Set(refreshAll ? [] : progress.completedSeeds || []);
  const runLimit = Number(process.env.CARDRUSH_SEED_BATCH || 12);
  const allPendingSeeds = seedList.filter((seed) => !completedSeeds.has(seed));
  const pendingSeeds = skipSeeds ? [] : runLimit > 0 ? allPendingSeeds.slice(0, runLimit) : allPendingSeeds;

  for (let i = 0; i < pendingSeeds.length; i += concurrency) {
    const batch = pendingSeeds.slice(i, i + concurrency).map((seed) => String(seed || "").trim()).filter(Boolean);
    const results = await Promise.all(batch.map((seed) => crawlCardrushSeed(seed, maxPages)));
    for (const result of results) {
      for (const item of result.items) {
        if (seenUrls.has(item.detailUrl)) {
          const existingIndex = catalogIndexByUrl.get(item.detailUrl);
          if (Number.isInteger(existingIndex)) catalog[existingIndex] = item;
          continue;
        }
        seenUrls.add(item.detailUrl);
        catalogIndexByUrl.set(item.detailUrl, catalog.length);
        catalog.push(item);
      }
    }
    results.forEach((result, index) => {
      if (result.complete) completedSeeds.add(batch[index]);
    });
    if (checkpointPath) fs.writeFileSync(checkpointPath, JSON.stringify(catalog), "utf8");
    if (progressPath) {
      fs.writeFileSync(progressPath, JSON.stringify({ completedSeeds: [...completedSeeds] }, null, 2), "utf8");
    }
    console.log(`crawl progress: ${completedSeeds.size}/${seedList.length}, catalog=${catalog.length}`);
  }

  return catalog;
}

function buildCatalogIndex(catalog) {
  const exact = new Map();
  const byCardNo = new Map();
  for (const entry of catalog || []) {
    const sig = extractCardrushComponents(entry);
    const cardNo = normalizeLooseText(sig.cardNo);
    const setCode = normalizeLooseText(sig.setCode);
    if (cardNo) {
      if (!byCardNo.has(cardNo)) byCardNo.set(cardNo, []);
      byCardNo.get(cardNo).push(entry);
    }
    if (cardNo && setCode) {
      const key = `${cardNo}|${setCode}`;
      if (!exact.has(key)) exact.set(key, []);
      exact.get(key).push(entry);
    }
  }
  return { exact, byCardNo };
}

function resolveCardrushMatch(card, catalog, catalogIndex = null) {
  const cardDisplayName = buildCardrushDisplayName(card);
  const cardSig = extractCardrushComponents(card);
  const cardName = normalizeLooseText(cardDisplayName);
  const cardBase = normalizeLooseText(cardSig.base);
  const cardCardNo = normalizeLooseText(cardSig.cardNo);
  const cardSet = normalizeLooseText(cardSig.setCode);
  const cardRarity = normalizeLooseText(cardSig.rarity);
  const cardFinish = cardSig.finish;
  let best = null;
  const exactKey = cardCardNo && cardSet ? `${cardCardNo}|${cardSet}` : "";
  const candidates = catalogIndex
    ? (exactKey && catalogIndex.exact.get(exactKey)) || catalogIndex.byCardNo.get(cardCardNo) || []
    : catalog || [];

  for (const entry of candidates) {
    if (!isMatchableEntry(entry)) continue;
    if (invalidCardrushUrls.has(entry.detailUrl)) continue;
    const entryName = normalizeLooseText(entry.name);
    const entrySig = extractCardrushComponents(entry);
    const entryBase = normalizeLooseText(entrySig.base);
    const entryCardNo = normalizeLooseText(entrySig.cardNo);
    const entrySet = normalizeLooseText(entrySig.setCode);
    const entryRarity = normalizeLooseText(entrySig.rarity);
    const entryFinish = entrySig.finish;
    const entryState = String(entry.state || "A").toUpperCase();
    const stateRank = entryState === "A" ? 2 : entryState === "A-" ? 1 : 0;

    if ((cardFinish || entryFinish) && cardFinish !== entryFinish) continue;

    let score = 0;
    if (cardName && entryName && (cardName === entryName || cardName.includes(entryName) || entryName.includes(cardName))) score += 10;
    if (cardBase && entryBase && (cardBase === entryBase || cardBase.includes(entryBase) || entryBase.includes(cardBase))) score += 6;
    if (cardCardNo && entryCardNo && cardCardNo === entryCardNo) score += 10;
    if (cardSet && entrySet && cardSet === entrySet) score += 4;
    if (cardRarity && entryRarity && cardRarity === entryRarity) score += 2;
    for (const key of entry.matchKeys || []) {
      const norm = normalizeLooseText(key);
      if (norm && cardName.includes(norm)) score += Math.min(2, norm.length / 8);
    }
    if (score < 11) continue;
    if (!best || score > best.score || (score === best.score && stateRank > (best.stateRank || 0))) {
      best = { ...entry, score, stateRank };
    }
  }

  return best;
}

function buildSeedList(cards) {
  const setCounts = new Map();
  for (const card of cards || []) {
    const sig = extractCardrushComponents(card);
    if (sig.setCode && (isModernSetCode(sig.setCode) || isPromoCard(card))) {
      const key = String(sig.setCode).trim().toUpperCase();
      setCounts.set(key, (setCounts.get(key) || 0) + 1);
    }
  }
  const configuredLimit = Number(process.env.CARDRUSH_TOP_SETS || 0);
  const sorted = [...setCounts.entries()]
    .sort((a, b) => {
      const aPromo = /-P$/i.test(a[0]) ? 1 : 0;
      const bPromo = /-P$/i.test(b[0]) ? 1 : 0;
      return bPromo - aPromo || b[1] - a[1] || a[0].localeCompare(b[0]);
    })
    .map(([setCode]) => setCode)
    .filter(Boolean);
  return configuredLimit > 0 ? sorted.slice(0, configuredLimit) : sorted;
}

function mergeCatalogs(...catalogs) {
  const byUrl = new Map();
  for (const catalog of catalogs) {
    for (const entry of catalog || []) {
      if (!entry?.detailUrl) continue;
      byUrl.set(entry.detailUrl, entry);
    }
  }
  return [...byUrl.values()];
}

function buildTargetQuery(card) {
  const sig = extractCardrushComponents(card);
  if (/\/[^0-9]/.test(sig.cardNo)) return sig.cardNo;
  return sig.cardNo && sig.setCode ? `${sig.cardNo} ${sig.setCode}` : "";
}

function isPromoCard(card) {
  const source = String(card?.name || "");
  const sig = extractCardrushComponents(card);
  return /プロモ|PROMO/i.test(source) || /-P$/i.test(sig.setCode) || /\bP\b/.test(source);
}

async function crawlUnmatchedCards(cards, catalog, concurrency = 1, checkpointPath = "", progressPath = "", recheckIds = new Set()) {
  const progress = safeReadJson(progressPath, { attemptedQueries: [] });
  const attemptedQueries = new Set(progress.attemptedQueries || []);
  const catalogIndex = buildCatalogIndex(catalog);
  const unmatched = cards.filter(
    (card) => (isModernCard(card) || isPromoCard(card)) && !resolveCardrushMatch(card, catalog, catalogIndex)
  );
  console.log(`cardrush targeted searches: ${unmatched.length}`);
  const found = [];
  const seenQueries = new Set();
  const queries = [];

  for (const card of unmatched) {
    const query = buildTargetQuery(card);
    const key = normalizeLooseText(query);
    const force = recheckIds.has(card.id);
    if (!key || seenQueries.has(key) || (attemptedQueries.has(key) && !force)) continue;
    seenQueries.add(key);
    queries.push({ query, key, promo: isPromoCard(card), force });
  }
  queries.sort((a, b) => Number(b.force) - Number(a.force) || Number(b.promo) - Number(a.promo));
  const targetLimit = Number(process.env.CARDRUSH_TARGET_BATCH || 40);
  const selectedQueries = targetLimit > 0 ? queries.slice(0, targetLimit) : queries;

  for (let i = 0; i < selectedQueries.length; i += concurrency) {
    const batch = selectedQueries.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(({ query }) => crawlCardrushSeed(query, 1)));
    for (const result of results) {
      found.push(...result.items.filter(isMatchableEntry));
    }
    batch.forEach(({ key }) => attemptedQueries.add(key));
    // Targeted result pages can have abbreviated names. Keep the richer set-list
    // entry when the same product URL is already present.
    const merged = mergeCatalogs(found, catalog);
    if (checkpointPath) fs.writeFileSync(checkpointPath, JSON.stringify(merged), "utf8");
    if (progressPath) {
      fs.writeFileSync(progressPath, JSON.stringify({ attemptedQueries: [...attemptedQueries] }, null, 2), "utf8");
    }
    if ((i + concurrency) % 100 === 0 || i + concurrency >= selectedQueries.length) {
      console.log(`targeted progress: ${Math.min(i + concurrency, selectedQueries.length)}/${selectedQueries.length}, found=${found.length}`);
    }
  }
  return mergeCatalogs(found, catalog);
}

function injectKnownOverrides(catalog) {
  const overrides = [
    {
      name: "ブラッキーVMAX【CSR】{245/184} [S8b]",
      detailUrl: "https://www.cardrush-pokemon.jp/product/23021",
      state: "A",
      matchKeys: ["ブラッキーVMAX", "245184", "S8b", "CSR"],
    },
    { name: "シロナ【SR】{070/066} [SM5M]", detailUrl: KNOWN_CARD_OVERRIDES.get("pk-731"), state: "A", matchKeys: ["シロナ", "070066", "SM5M", "SR"] },
    { name: "ピカチュウ【P】{323/S-P} [S-P]", detailUrl: KNOWN_CARD_OVERRIDES.get("pk-38030"), state: "A", matchKeys: ["ピカチュウ", "323SP", "SP", "P"] },
    { name: "ブルーの探索【SR】{061/054} [SM9b]", detailUrl: KNOWN_CARD_OVERRIDES.get("pk-3123"), state: "A", matchKeys: ["ブルーの探索", "061054", "SM9b", "SR"] },
    { name: "ひかるレックウザ【H】{057/072} [SM3+]", detailUrl: KNOWN_CARD_OVERRIDES.get("pk-1180"), state: "A", matchKeys: ["ひかるレックウザ", "057072", "SM3+", "H"] },
  ];
  const existing = new Set((catalog || []).map((entry) => String(entry.detailUrl || "")));
  for (const entry of overrides) {
    if (!existing.has(entry.detailUrl)) {
      catalog.push(entry);
    }
  }
  return catalog;
}

async function main() {
  const base = path.join(resolveSiteRoot(), "data");
  const dataPath = path.join(base, "pokemon-cards.json");
  const metaPath = path.join(base, "pokemon-cards-meta.json");
  const catalogPath = path.join(__dirname, "cardrush_catalog.json");
  const progressPath = path.join(__dirname, "cardrush_crawl_progress.json");
  const targetProgressPath = path.join(__dirname, "cardrush_target_progress.json");
  const invalidPath = path.join(__dirname, "cardrush_invalid_urls.json");
  const recheckPath = path.join(__dirname, "cardrush_recheck_ids.json");

  const cards = safeReadJson(dataPath, []);
  if (!Array.isArray(cards)) throw new Error("pokemon-cards.json is not an array");
  invalidCardrushUrls = new Set(safeReadJson(invalidPath, []));
  const recheckIds = new Set(safeReadJson(recheckPath, []));

  const seedList = buildSeedList(cards);
  console.log(`cardrush seeds: ${seedList.length}`);
  const savedCatalog = safeReadJson(catalogPath, []);
  const maxPages = Number(process.env.CARDRUSH_MAX_PAGES || 0) || Number.POSITIVE_INFINITY;
  const concurrency = Number(process.env.CARDRUSH_CONCURRENCY || 1);
  const relinkOnly = process.argv.includes("--relink-only");
  let crawledCatalog = savedCatalog;
  if (!relinkOnly) {
    crawledCatalog = await crawlCardrushCatalog(
      seedList,
      maxPages,
      concurrency,
      savedCatalog,
      catalogPath,
      progressPath
    );
    crawledCatalog = await crawlUnmatchedCards(
      cards,
      crawledCatalog,
      concurrency,
      catalogPath,
      targetProgressPath,
      recheckIds
    );
  }
  crawledCatalog = injectKnownOverrides(crawledCatalog);
  console.log(`cardrush crawled: ${crawledCatalog.length}`);
  const catalogIndex = buildCatalogIndex(crawledCatalog);
  const catalogByUrl = new Map(crawledCatalog.map((entry) => [entry.detailUrl, entry]));

  const updated = cards.map((card) => {
    const knownUrl = KNOWN_CARD_OVERRIDES.get(String(card.id));
    const match = resolveCardrushMatch(card, crawledCatalog, catalogIndex);
    const existingEntry = catalogByUrl.get(card.cardrushUrl);
    const preservedUrl =
      existingEntry &&
      isMatchableEntry(existingEntry) &&
      !invalidCardrushUrls.has(card.cardrushUrl)
        ? card.cardrushUrl
        : "";
    const next = { ...card };
    if (knownUrl) {
      next.cardrushUrl = knownUrl;
    } else if (match) {
      next.cardrushUrl = match.detailUrl;
    } else if (preservedUrl) {
      next.cardrushUrl = preservedUrl;
    } else {
      delete next.cardrushUrl;
    }
    delete next.cardrushSearchUrl;
    delete next.cardrushQueryName;
    delete next.cardrushState;
    delete next.cardrushName;
    return next;
  });

  fs.writeFileSync(dataPath, JSON.stringify(updated), "utf8");
  fs.writeFileSync(catalogPath, JSON.stringify(crawledCatalog), "utf8");

  const matched = updated.filter((card) => card.cardrushUrl).length;
  const modernCoverage = coverage(updated);
  const siteMeta = safeReadJson(metaPath, {});
  siteMeta.cardrushCoverage = modernCoverage;
  fs.writeFileSync(metaPath, JSON.stringify(siteMeta, null, 2), "utf8");
  const remainingRechecks = [...recheckIds].filter((id) => !updated.find((card) => card.id === id && card.cardrushUrl));
  fs.writeFileSync(recheckPath, JSON.stringify(remainingRechecks), "utf8");
  console.log(`cardrush matched: ${matched}/${updated.length}`);
  console.log(`modern coverage: ${JSON.stringify(modernCoverage)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
