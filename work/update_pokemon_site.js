const fs = require("fs");
const path = require("path");
const vm = require("vm");

function resolveSiteRoot() {
  const standaloneRoot = path.join(__dirname, "..");
  if (fs.existsSync(path.join(standaloneRoot, "index.html"))) {
    return standaloneRoot;
  }
  return path.join(standaloneRoot, "outputs", "github-site");
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, limit) }, () => worker()));
  return results;
}

function pickScriptUrls(html) {
  return [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"'\\s]+\.js(?:\?dpl=[^"'\\s]+)?/g)].map((m) => m[0]))];
}

function resolveCardsChunkUrl(html, runtime) {
  const chunkPathMatch = runtime.match(/static\/chunks\/"\+e\+"\.([a-z0-9]+)\.js"/);
  if (!chunkPathMatch) {
    throw new Error("Unable to read current chunk hash from webpack runtime");
  }
  return `https://toreca-souba.com/_next/static/chunks/280.${chunkPathMatch[1]}.js`;
}

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

const MIN_OFFICIAL_PSA_RATE = Number(process.env.PSA_MIN_OFFICIAL_RATE || 1);
const MIN_OFFICIAL_PSA_TOTAL = Number(process.env.PSA_MIN_OFFICIAL_TOTAL || 500);

function buildPsaQuery(name) {
  const match = String(name || "").match(/\[([^\]]+)\]/);
  if (!match) return null;
  const raw = match[1].trim();
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const setCode = parts[0].toUpperCase();
    const cardNo = String(parts[1]).split("/")[0].replace(/^#/, "").toUpperCase();
    if (setCode && cardNo) {
      return `Pokemon Japanese ${setCode} ${cardNo}`;
    }
  }
  const codeOnly = raw.match(/^([A-Za-z0-9-]+)$/);
  if (codeOnly) {
    return `Pokemon Japanese ${codeOnly[1].toUpperCase()}`;
  }
  return null;
}

function buildTorecaCardUrl(id) {
  return `https://toreca-souba.com/cards/${id}`;
}

function extractSnkrProductUrl(html) {
  const candidates = [];
  const regexes = [
    /snkrdunk\.com\/(?:apparels|trading-cards|products)\/\d+(?:\/used\/\d+)?/gi,
    /https?:\/\/snkrdunk\.com\/(?:apparels|trading-cards|products)\/\d+(?:\/used\/\d+)?/gi,
    /href=["']([^"']*\/(?:apparels|trading-cards|products)\/\d+(?:\/used\/\d+)?)["']/gi,
  ];
  for (const regex of regexes) {
    for (const match of String(html || "").matchAll(regex)) {
      const raw = match[1] || match[0] || "";
      if (!raw) continue;
      const normalized = raw.startsWith("http")
        ? raw
        : raw.startsWith("snkrdunk.com/")
          ? `https://${raw}`
          : `https://snkrdunk.com${raw.startsWith("/") ? raw : `/${raw}`}`;
      candidates.push(normalized.replace(/\/used\/\d+.*$/i, ""));
    }
  }
  return [...new Set(candidates)].find(Boolean) || "";
}

function isSnkrProductUrl(value) {
  return /^https?:\/\/(?:www\.)?snkrdunk\.com\/(?:apparels|trading-cards|products)\/\d+/i.test(String(value || ""));
}

function buildSnkrSearchUrl(card) {
  const query = String(card?.name || card?.psaQuery || "")
    .split("[")[0]
    .replace(/\(.+?\)/g, "")
    .trim();
  return query
    ? `https://snkrdunk.com/search?brandId=pokemon&categoryId=25&isUnderRetail=false&keywords=${encodeURIComponent(query)}`
    : "https://snkrdunk.com/search/";
}

async function resolveSnkrUrlFromPage(pageUrl, fallbackCard) {
  const result = { snkrUrl: "" };
  try {
    const html = await fetchText(pageUrl);
    const direct = extractSnkrProductUrl(html);
    if (direct) {
      result.snkrUrl = direct;
      return result;
    }
  } catch {
    // Fall back below.
  }
  result.snkrUrl = buildSnkrSearchUrl(fallbackCard);
  return result;
}

function normalizeCardNo(cardNo) {
  const raw = String(cardNo || "").trim().replace(/^#/, "").toUpperCase();
  if (!raw) return "";
  const stripped = raw.replace(/^0+/, "");
  return stripped || raw;
}

function psaQueryCandidates(query) {
  const match = String(query || "").match(/^Pokemon Japanese\s+(.+?)\s+([A-Z0-9-]+)$/i);
  if (!match) return query ? [query] : [];
  const setCode = match[1].trim().toUpperCase();
  const cardNo = normalizeCardNo(match[2]);
  const padded = String(match[2]).trim().replace(/^#/, "").toUpperCase();
  const candidates = [];
  if (setCode && padded) candidates.push(`Pokemon Japanese ${setCode} ${padded}`);
  if (setCode && cardNo && cardNo !== padded) candidates.push(`Pokemon Japanese ${setCode} ${cardNo}`);
  return [...new Set(candidates)];
}

function jstDate() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function safeReadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function readPsaSetManifest() {
  const manifestPath = path.join(__dirname, "psa_set_urls.json");
  const fallback = [];
  const manifest = safeReadJson(manifestPath, fallback);
  return Array.isArray(manifest) ? manifest : fallback;
}

function readCardrushCatalog() {
  const catalogPath = path.join(__dirname, "cardrush_catalog.json");
  const fallback = [];
  const catalog = safeReadJson(catalogPath, fallback);
  return Array.isArray(catalog) ? catalog : fallback;
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

function resolveCardrushMatch(card, catalog) {
  const haystack = normalizeLooseText(
    [
      card.name,
      card.model,
      card.variant,
      card.rarity,
      card.psaQuery,
    ]
      .filter(Boolean)
      .join(" ")
  );
  const cardFinish = extractFinishKind(card.name);
  for (const entry of catalog || []) {
    if (String(entry.state || "A").toUpperCase() !== "A") continue;
    const entryFinish = extractFinishKind(entry.name);
    if ((cardFinish || entryFinish) && cardFinish !== entryFinish) continue;
    const keys = Array.isArray(entry.matchKeys) ? entry.matchKeys : [];
    if (keys.length && keys.every((key) => haystack.includes(normalizeLooseText(key)))) {
      return entry;
    }
  }
  return null;
}

function readOfficialPsaPopulation() {
  const filePath = path.join(resolveSiteRoot(), "data", "psa-official-populations.json");
  const data = safeReadJson(filePath, null);
  if (!data || typeof data !== "object") return {};
  return data.byQuery && typeof data.byQuery === "object" ? data.byQuery : {};
}

function extractSetCodeFromLabel(label) {
  const match = String(label || "").match(/Pokemon Japanese\s+(.+?)$/i);
  if (!match) return "";
  return match[1].trim().replace(/\s+/g, " ").toUpperCase();
}

function buildOfficialPsaAliases(byQuery) {
  function shortCodeFromOfficial(rest) {
    const token = String(rest || "").trim().split(/\s+/)[0] || "";
    if (!token) return "";
    if (/^(?:SV|SM|XY|S|M|PCG|PMCG|CP|E)\-P$/i.test(token)) return token.toUpperCase();
    if (/^PMCG\d*\-\d+$/i.test(token)) return token.toUpperCase();
    const hyphen = token.indexOf("-");
    if (hyphen > 0) {
      const head = token.slice(0, hyphen).toUpperCase();
      const tail = token.slice(hyphen + 1).toUpperCase();
      if (head.length <= 3 && tail.length <= 3) return token.toUpperCase();
      return head;
    }
    return token.toUpperCase();
  }

  const aliases = {};
  for (const [query, row] of Object.entries(byQuery || {})) {
    const match = String(query || "").match(/^Pokemon Japanese\s+(.+?)\s+(\d+)$/i);
    const cardNo = match ? match[2] : String(row?.cardNo || "").trim();
    const derivedSources = [];
    if (match) derivedSources.push(match[1]);
    const sourceSet = extractSetCodeFromLabel(row?.sourceSet || "");
    if (sourceSet) derivedSources.push(sourceSet);
    for (const source of derivedSources) {
      const shortCode = shortCodeFromOfficial(source);
      if (!shortCode || !cardNo) continue;
      aliases[`Pokemon Japanese ${shortCode} ${cardNo}`] = row;
    }
  }
  return aliases;
}

async function main() {
  const sourceUrl = "https://toreca-souba.com/cards";
  const cardsHtml = await fetchText(sourceUrl);
  const scriptUrls = pickScriptUrls(cardsHtml);
  const runtimePath = scriptUrls.find((u) => u.includes("/webpack-"));
  if (!runtimePath) {
    throw new Error("Unable to find webpack runtime script on cards page");
  }
  const runtimeUrl = `https://toreca-souba.com${runtimePath}`;
  const runtime = await fetchText(runtimeUrl);
  const chunkUrl = resolveCardsChunkUrl(cardsHtml, runtime);
  const chunk = await fetchText(chunkUrl);
  const psaSetManifest = readPsaSetManifest();
  const cardrushCatalog = readCardrushCatalog();
  const officialPsaByQuery = readOfficialPsaPopulation();
  const officialPsaAliases = buildOfficialPsaAliases(officialPsaByQuery);
  const base = path.join(resolveSiteRoot(), "data");
  const jsonPath = path.join(base, "pokemon-cards.json");
  const previousCards = safeReadJson(jsonPath, []);
  const previousById = new Map((Array.isArray(previousCards) ? previousCards : []).map((card) => [card.id, card]));

  let moduleMap = null;
  const sandbox = {
    self: {
      webpackChunk_N_E: {
        push(args) {
          moduleMap = args[1];
          return args;
        },
      },
    },
  };
  vm.runInNewContext(chunk, sandbox, { timeout: 30000 });
  if (!moduleMap || typeof moduleMap[93280] !== "function") {
    throw new Error("Unable to locate data module 93280");
  }

  const mod = { exports: {} };
  moduleMap[93280](mod);
  const all = mod.exports;
  const pokemonSource = all.filter((c) => c.title === "ポケモン");
  const sourceIds = new Set(pokemonSource.map((card) => card.id));
  const addedCards = pokemonSource.filter((card) => !previousById.has(card.id));
  const removedIds = [...previousById.keys()].filter((id) => !sourceIds.has(id));
  const isPromo = (card) => /プロモ|PROMO|(?:^|\s)[A-Z0-9-]+-P(?:\s|\]|$)/i.test(`${card.name || ""} ${card.model || ""}`);
  const snkrBatch = Math.max(0, Number(process.env.SNKR_BATCH || 500));
  const snkrPending = new Set(
    pokemonSource
      .filter((card) => !isSnkrProductUrl(previousById.get(card.id)?.snkUrl))
      .slice(0, snkrBatch || 0)
      .map((card) => card.id)
  );
  const snkrConcurrency = Math.max(1, Number(process.env.SNKR_CONCURRENCY || 8));
  console.log(`snkr direct lookup: ${snkrPending.size} card(s)`);
  const pokemonRows = await mapLimit(
    pokemonSource,
    snkrConcurrency,
    async (c) => {
        const psaQuery = buildPsaQuery(c.name);
        const officialRow =
          psaQueryCandidates(psaQuery).map((key) => officialPsaByQuery[key] || officialPsaAliases[key]).find(Boolean) || null;
        const previous = previousById.get(c.id) || {};
        // Cardrush matching scans its public catalog. Preserve existing links and
        // skip cards without a PSA10 market price, which cannot affect this site's
        // profit decisions and made a source refresh needlessly expensive.
        const cardrushMatch = previous.cardrushUrl || !Number(c.snkPsa10Price)
          ? null
          : resolveCardrushMatch(c, cardrushCatalog);
        const officialRate = num(officialRow?.psa10Rate);
        const officialTotal = num(officialRow?.psaTotal);
        const officialCount = num(officialRow?.psa10Count);
        const keepOfficial =
          Number.isFinite(officialRate) &&
          Number.isFinite(officialTotal) &&
          Number.isFinite(officialCount) &&
          officialTotal >= MIN_OFFICIAL_PSA_TOTAL &&
          officialRate >= MIN_OFFICIAL_PSA_RATE;
        const pageUrl = buildTorecaCardUrl(c.id);
        const previousSnkrUrl = previous.snkUrl || "";
        const pageMeta = snkrPending.has(c.id)
          ? await resolveSnkrUrlFromPage(pageUrl, c)
          : { snkrUrl: previousSnkrUrl || buildSnkrSearchUrl(c) };
        return {
          id: c.id,
          title: c.title,
          name: c.name,
          pageUrl,
          model: c.model,
          variant: c.variant || "",
          rarity: c.rarity || "",
          psaQuery,
          img: c.img,
          snkrUrl: pageMeta.snkrUrl || "",
          price: num(c.price),
          snkPrice: num(c.snkPrice),
          snkPsa10Price: num(c.snkPsa10Price),
          snkPsa9Price: num(c.snkPsa9Price),
          snkPsa10Min: num(c.snkPsa10Min),
          snkPsa10Count: num(c.snkPsa10Count),
          officialPsa10Count: keepOfficial ? officialCount : null,
          officialPsaTotal: keepOfficial ? officialTotal : null,
          officialPsaRate: keepOfficial ? officialRate : null,
          tv7: num(c.tv7),
          tv30: num(c.tv30),
          p10tv7: num(c.p10tv7),
          p10tv30: num(c.p10tv30),
          chg7: num(c.chg7),
          chg30: num(c.chg30),
          tvel: num(c.tvel),
          days: num(c.days),
          kaitori: num(c.kaitori),
          tLast: num(c.tLast),
          tLastAt: c.tLastAt || "",
          rawBacked: c.rawBacked ? 1 : 0,
          snkListings: num(c.snkListings),
          cardrushUrl: previous.cardrushUrl || cardrushMatch?.detailUrl || null,
          cardrushState: cardrushMatch?.state || null,
          cardrushName: cardrushMatch?.name || null,
          hareruya2Url: previous.hareruya2Url || null,
          yuyuteiUrl: previous.yuyuteiUrl || null,
          torecacampUrl: previous.torecacampUrl || null,
        };
    }
  );
  const pokemon = pokemonRows.sort((a, b) => (b.tv30 || 0) - (a.tv30 || 0) || (b.price || 0) - (a.price || 0));
  const sitePokemon = pokemon.map((card) => ({
    id: card.id,
    name: card.name,
    model: card.model,
    img: card.img,
    snkUrl: card.snkrUrl,
    price: card.price,
    snkPsa10Price: card.snkPsa10Price,
    snkPsa10Min: card.snkPsa10Min,
    tv7: card.tv7,
    tv30: card.tv30,
    p10tv7: card.p10tv7,
    p10tv30: card.p10tv30,
    chg7: card.chg7,
    chg30: card.chg30,
    tvel: card.tvel,
    days: card.days,
    tLastAt: card.tLastAt,
    snkListings: card.snkListings,
    cardrushUrl: card.cardrushUrl || null,
    hareruya2Url: card.hareruya2Url || null,
    yuyuteiUrl: card.yuyuteiUrl || null,
    torecacampUrl: card.torecacampUrl || null,
  }));

  fs.mkdirSync(base, { recursive: true });

  const metaJsonPath = path.join(base, "pokemon-cards-meta.json");
  const previousMeta = safeReadJson(metaJsonPath, {});

  const updatedAt = jstDate();
  fs.writeFileSync(jsonPath, JSON.stringify(sitePokemon), "utf8");
  fs.writeFileSync(
    path.join(__dirname, "toreca_source_diff.json"),
    JSON.stringify({
      updatedAt,
      sourceTotal: sitePokemon.length,
      added: addedCards.map((card) => ({ id: card.id, name: card.name, promo: isPromo(card) })),
      removedIds,
      addedPromoCount: addedCards.filter(isPromo).length,
    }),
    "utf8"
  );
  fs.writeFileSync(
    metaJsonPath,
    JSON.stringify(
      {
        ...previousMeta,
        sourceUrl,
        chunkUrl,
        updatedAt,
        generatedAt: new Date().toISOString(),
        totalCards: sitePokemon.length,
      },
      null,
      2
    ),
    "utf8"
  );
  console.log(`pokemon cards: ${sitePokemon.length}`);
  console.log(jsonPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
