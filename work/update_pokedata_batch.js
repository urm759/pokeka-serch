const fs = require("fs");
const path = require("path");
const { analyzeSales } = require("./pokedata_analysis.js");
const { loadSetState, setSlug, writeSetState } = require("./pokedata_storage.js");
const retryPolicy = require("./acquisition_retry.js");

const ROOT = path.join(__dirname, "..");
const BASE = "https://www.pokedata.io";
const SET_NAME = process.env.POKEDATA_SET || "Battle Partners";
const TARGET_COUNT = Math.max(1, Number(process.env.POKEDATA_TARGET || 132));
const BATCH_SIZE = Math.max(1, Number(process.env.POKEDATA_BATCH || TARGET_COUNT));
const INTERVAL_MS = Math.max(500, Number(process.env.POKEDATA_INTERVAL_MS || 1100));
const TIMEOUT_MS = Math.max(2000, Number(process.env.POKEDATA_TIMEOUT_MS || 10000));
const OUTPUT = path.join(ROOT, "data", "pokedata-summary.json");
const LINK_MAP = path.join(__dirname, "pokedata-link-map.json");
const PROGRESS = path.join(__dirname, SET_NAME === "Battle Partners" ? "pokedata-progress.json" : `pokedata-progress-${setSlug(SET_NAME)}.json`);
const CACHE = path.join(__dirname, "pokedata-page-cache.json");
const METRICS = path.join(__dirname, "pokedata-fetch-metrics.json");
const BROWSER_CAPTURES = path.join(__dirname, "pokedata-browser-captures.json");
const ACCESS_HOLD = path.join(__dirname, "pokedata-access-hold.json");
const SET_HOLD = path.join(__dirname, `pokedata-set-hold-${setSlug(SET_NAME)}.json`);
const sourceModeFor = (cardId, capturedIds) => capturedIds.has(Number(cardId))
  ? "認証済みChrome個別成約確認＋公開API"
  : "公開APIのみ・認証済み個別成約未確認";

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")); } catch { return fallback; }
}
function write(file, value) {
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value), "utf8");
  fs.renameSync(temporary, file);
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function normalizeSetCode(value) {
  const cleaned = String(value || "").normalize("NFKC").toUpperCase().replace(/[^A-Z0-9+-]/g, "");
  const numberedSet = cleaned.match(/^([A-Z]+)-?0*(\d+)$/);
  return numberedSet ? `${numberedSet[1]}${Number(numberedSet[2])}` : cleaned;
}
function normalizeNumber(value) { return String(value || "").normalize("NFKC").match(/\d{1,4}/)?.[0]?.replace(/^0+(?=\d)/, "") || ""; }
function normalizeName(value) {
  return String(value || "").normalize("NFKC").toLowerCase()
    .replace(/[’‘]/g, "'").replace(/[^a-z0-9'\u3040-\u30ff\u3400-\u9fff]+/g, " ").trim();
}
function cardVariant(value) {
  const source = String(value || "").normalize("NFKC").toLowerCase();
  if (/master\s*ball|マスターボール/.test(source)) return "master-ball";
  if (/poke\s*ball|pokeball|モンスターボール/.test(source)) return "poke-ball";
  if (/reverse\s*holo|reverse|ミラー/.test(source)) return "reverse-holo";
  return "standard";
}
function localIdentity(card) {
  const name = String(card?.name || "");
  const standard = name.match(/\[\s*([A-Za-z0-9+-]+)\s+(\d{1,4})(?:\s*[-/]\s*(\d{1,4}))?\s*\]/);
  const promo = name.match(/\[\s*(\d{1,4})\s+([A-Za-z0-9-]+-P)\s*\]/i);
  const setCode = normalizeSetCode(promo?.[2] || standard?.[1]);
  const number = normalizeNumber(promo?.[1] || standard?.[2]);
  const printedNumber = standard?.[3] ? `${standard[2]}/${standard[3]}` : promo ? `${promo[1]}/${promo[2]}` : number;
  const baseName = name.split("[")[0].trim();
  const rarity = (baseName.match(/\b(MUR|BWR|MA|SSR|CSR|CHR|SAR|UR|HR|SR|RRR|RR|AR|PR|P|H|C|U|R)\b/i) || [])[1] || null;
  return { setCode, number, printedNumber, baseName, rarity, variant: cardVariant(name) };
}
function sourceAverage(stats, source) {
  const row = (stats || []).find((item) => Number(item.source) === source);
  return Number.isFinite(Number(row?.avg)) ? Number(row.avg) : null;
}
function compare(overseasJpy, domesticJpy) {
  if (!(overseasJpy > 0) || !(domesticJpy > 0)) return { differenceJpy: null, ratio: null };
  return { differenceJpy: Math.round(overseasJpy - domesticJpy), ratio: Math.round(overseasJpy / domesticJpy * 1000) / 1000 };
}
function sourceUrl(card) {
  const setPart = encodeURIComponent(card.set_name).replace(/%20/g, "+");
  const cardPart = encodeURIComponent(`${card.name} ${card.num}`).replace(/%20/g, "+");
  return `${BASE}/card/${setPart}/${cardPart}`;
}
function nameTokens(name) {
  const ignored = new Set(["pokemon", "card", "japanese", "the", "ex", "v", "vmax", "vstar"]);
  return normalizeName(name).split(/\s+/).filter((token) => token.length >= 2 && !ignored.has(token)).slice(0, 4);
}
function isoDate(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}
function minimalTransactions(rows, fxRate) {
  return (rows || []).map((row) => ({
    rowId: String(row.id || ""), ebay_item_id: row.ebay_item_id || null,
    listingUrl: row.ebay_item_id ? `https://www.ebay.com/itm/${row.ebay_item_id}` : null,
    date_sold: isoDate(row.date_sold), title: row.title || null,
    psa_grade: row.psa_grade == null ? "Raw" : String(Math.trunc(Number(row.psa_grade))),
    sold_price: row.sold_price != null && Number.isFinite(Number(row.sold_price)) && Number(row.sold_price) > 0
      ? Math.round(Number(row.sold_price) * fxRate)
      : null,
  }));
}
function individualSalesStatus(summary) {
  const missingIdentityCount = Number(summary.excludedReasons?.["商品名Unavailable"] || 0);
  return summary.originalCount <= 0
    ? "実成約未取得"
    : summary.adoptedCount <= 0
      ? `信頼度不足（価格・商品名を確認できない成約 ${summary.originalCount}件）`
      : summary.adoptedCount < 3
        ? `信頼度不足（採用 ${summary.adoptedCount}件）`
        : missingIdentityCount > summary.adoptedCount
          ? "公開成約API・商品名不明が多いため参考値"
          : "公開成約API・取得範囲内をクリーニング済み";
}
function marketSummary(aggregateUsd, summary, fxRate, domesticPrice, sourceKind) {
  const aggregateJpy = aggregateUsd > 0 ? Math.round(aggregateUsd * fxRate) : null;
  return {
    pageDisplayJpy: aggregateJpy, apiAverageUsd: aggregateUsd, apiAverageJpy: aggregateJpy,
    aggregateSource: sourceKind, individualSalesStatus: individualSalesStatus(summary),
    usableIndividualMedian: summary.adoptedCount >= 3,
    decisionUsage: "海外相場は参考表示のみ・国内仕入れ判断へ未反映",
    ...summary, comparisonToDomestic: compare(summary.medianJpy || aggregateJpy, domesticPrice),
  };
}
function recordMetric(metric) {
  const state = read(METRICS, { version: 1, updatedAt: null, cards: [] });
  state.cards = [...(state.cards || []), metric].slice(-300);
  state.updatedAt = new Date().toISOString();
  write(METRICS, state);
}

let lastRequestAt = 0;
async function fetchJson(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const waitMs = Math.max(0, INTERVAL_MS - (Date.now() - lastRequestAt));
    if (waitMs) await sleep(waitMs);
    const started = Date.now();
    lastRequestAt = started;
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "PokecaBuyingGuide/1.0 (+read-only; low-rate)" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = await response.text();
      const metric = { url, httpStatus: response.status, retryCount: attempt, fetchMs: Date.now() - started, bytes: text.length };
      if (response.ok) {
        try { return { value: JSON.parse(text), metric }; }
        catch {
          const error = new Error("PokeDATA APIのJSON形式変更・手動確認待ち");
          error.manual = true; error.metric = metric;
          throw error;
        }
      }
      if ((response.status === 429 || response.status >= 500) && attempt < retries) {
        await sleep(1000 * (2 ** attempt));
        continue;
      }
      const error = new Error(`HTTP ${response.status}`);
      error.manual = response.status === 401 || response.status === 403;
      error.metric = metric;
      throw error;
    } catch (error) {
      if (error.manual || error.metric || attempt >= retries) throw error;
      await sleep(1000 * (2 ** attempt));
    }
  }
  throw new Error("retry exhausted");
}

function findDomestic(sourceCard, domesticByKey, aliases) {
  const alias = aliases.find((entry) => Number(entry.pokedataCardId) === Number(sourceCard.id) && entry.status !== "disabled");
  if (alias?.status === "confirmed") return { status: "manual-confirmed", localCardId: alias.localCardId, method: alias.method };
  const key = `${normalizeSetCode(sourceCard.set_code)}|${normalizeNumber(sourceCard.num)}`;
  const allCandidates = domesticByKey.get(key) || [];
  const sourceVariant = cardVariant(sourceCard.name);
  const exactVariant = allCandidates.filter((card) => localIdentity(card).variant === sourceVariant);
  if (alias && exactVariant.some((card) => card.id === alias.localCardId)) {
    return { status: "auto-confirmed", localCardId: alias.localCardId, method: alias.method };
  }
  const candidates = exactVariant;
  if (candidates.length === 1) return { status: "auto-matched", localCardId: candidates[0].id, method: "set-code+card-number+language" };
  if (candidates.length > 1) return { status: "ambiguous", candidates: candidates.map((card) => card.id), method: "set-code+card-number" };
  return {
    status: "domestic-base-missing", candidates: [], method: "set-code+card-number+variant",
    reason: allCandidates.length ? `variant-mismatch:${sourceVariant}` : "no-set-number-candidate",
  };
}

async function main() {
  if (fs.existsSync(ACCESS_HOLD)) throw new Error("PokeDATAアクセス・形式変更の手動確認待ち。保存済みチェックポイントを保持");
  if (fs.existsSync(SET_HOLD)) throw new Error("PokeDATA個別セットの形式・仕様確認待ち。他のセットは継続可能");
  const cards = read(path.join(ROOT, "data", "pokemon-cards.json"), []);
  const existing = read(OUTPUT, { version: 2, cards: {}, linkage: { records: [] } });
  const storedSet = loadSetState(ROOT, SET_NAME, existing);
  existing.cards = storedSet.cards;
  existing.linkage = { ...(existing.linkage || {}), records: storedSet.records };
  const linkMap = read(LINK_MAP, { version: 1, aliases: [], ambiguousCandidates: [] });
  const progress = read(PROGRESS, { version: 1, setName: SET_NAME, processedCardIds: [], failures: [] });
  if (progress.sourceRetry && !retryPolicy.eligible(progress.sourceRetry)) {
    console.log(JSON.stringify({ setName: SET_NAME, completionStatus: progress.sourceRetry.status, attempted: 0, fetched: 0, failed: 0, reason: "source-cooldown", nextRetryAt: progress.sourceRetry.nextRetryAt }));
    return;
  }
  progress.retryByCard ||= {};
  const cache = read(CACHE, { version: 1, entries: {} });
  const browserCaptures = read(BROWSER_CAPTURES, { cards: [] });
  const browserCapturedIds = new Set((browserCaptures.cards || []).map((card) => Number(card.id)));
  cache.entries ||= {};
  const domesticByKey = new Map();
  for (const card of cards) {
    const identity = localIdentity(card);
    if (!identity.setCode || !identity.number) continue;
    const key = `${identity.setCode}|${identity.number}`;
    if (!domesticByKey.has(key)) domesticByKey.set(key, []);
    domesticByKey.get(key).push(card);
  }

  let sourceResponse, fxResponse;
  try {
    cache.sets ||= {};
    const setCache = cache.sets[SET_NAME];
    sourceResponse = setCache && Date.now() - Date.parse(setCache.fetchedAt) < 86400000 ? { value: setCache.value }
      : await fetchJson(`${BASE}/api/cards?set_name=${encodeURIComponent(SET_NAME)}&stats=kwan`);
    if (sourceResponse.metric) cache.sets[SET_NAME] = { value: sourceResponse.value, fetchedAt: new Date().toISOString() };
    fxResponse = cache.fx && Date.now() - Date.parse(cache.fx.fetchedAt) < 6 * 3600000 ? { value: cache.fx.value }
      : await fetchJson("https://api.frankfurter.app/latest?from=USD&to=JPY");
    if (fxResponse.metric) cache.fx = { value: fxResponse.value, fetchedAt: new Date().toISOString() };
  } catch (error) {
    if (!error.manual) {
      const policy = retryPolicy.failure(progress.sourceRetry, { error: error.message, httpStatus: error.metric?.httpStatus });
      progress.sourceRetry = policy;
      write(PROGRESS, progress);
      console.log(JSON.stringify({ setName: SET_NAME, completionStatus: policy.status, stopReason: error.message, nextRetryAt: policy.nextRetryAt, attempted: 0, fetched: 0, failed: 1 }));
      return;
    }
    const hold = { setName: SET_NAME, url: error.metric?.url || `${BASE}/api/cards?set_name=${encodeURIComponent(SET_NAME)}&stats=kwan`,
      reason: error.message, httpStatus: error.metric?.httpStatus || null, at: new Date().toISOString(), resumeCardId: progress.lastCardId || null };
    write(ACCESS_HOLD, hold);
    progress.manualHold = hold;
    write(PROGRESS, progress);
    console.log(JSON.stringify({ setName: SET_NAME, completionStatus: "manual-action-required", stopReason: hold.reason, attempted: 0, fetched: 0, failed: 0 }));
    return;
  }
  if (!Array.isArray(sourceResponse.value) || sourceResponse.value.length < 1) {
    const hold = { setName: SET_NAME, url: `${BASE}/api/cards?set_name=${encodeURIComponent(SET_NAME)}&stats=kwan`,
      reason: "セット一覧が空または形式変更。旧データを保持して手動確認待ち", at: new Date().toISOString(), resumeCardId: progress.lastCardId || null };
    write(SET_HOLD, hold); progress.manualHold = hold; write(PROGRESS, progress);
    console.log(JSON.stringify({ setName: SET_NAME, completionStatus: "manual-action-required", stopReason: hold.reason, attempted: 0, fetched: 0, failed: 0 }));
    return;
  }
  const sourceCards = Array.isArray(sourceResponse.value) ? sourceResponse.value.filter((card) => card.language === "JAPANESE") : [];
  if (!sourceCards.length) {
    const hold = { setName: SET_NAME, reason: "日本語カード0件。セット名またはAPI形式を手動確認", at: new Date().toISOString(), resumeCardId: progress.lastCardId || null };
    write(SET_HOLD, hold); progress.manualHold = hold; write(PROGRESS, progress);
    console.log(JSON.stringify({ setName: SET_NAME, completionStatus: "manual-action-required", stopReason: hold.reason, attempted: 0, fetched: 0, failed: 0 }));
    return;
  }
  const expectedCode = normalizeSetCode(process.env.POKEDATA_SET_CODE || "");
  if (expectedCode && sourceCards.some((card) => normalizeSetCode(card.set_code) !== expectedCode || card.set_name !== SET_NAME)) {
    const hold = { setName: SET_NAME, url: `${BASE}/api/cards?set_name=${encodeURIComponent(SET_NAME)}&stats=kwan`,
      reason: `日本語セットのコードまたは名前が不一致（期待 ${expectedCode}）。手動確認待ち`, at: new Date().toISOString(), resumeCardId: progress.lastCardId || null };
    write(SET_HOLD, hold); progress.manualHold = hold; write(PROGRESS, progress);
    console.log(JSON.stringify({ setName: SET_NAME, completionStatus: "manual-action-required", stopReason: hold.reason, attempted: 0, fetched: 0, failed: 0 }));
    return;
  }
  const fxRate = Number(fxResponse.value?.rates?.JPY);
  if (!(fxRate > 0)) throw new Error("USD/JPY rate unavailable");
  delete progress.sourceRetry;
  const preferred = [...sourceCards].sort((a, b) => {
    const aMatch = (domesticByKey.get(`${normalizeSetCode(a.set_code)}|${normalizeNumber(a.num)}`) || []).length === 1 ? 0 : 1;
    const bMatch = (domesticByKey.get(`${normalizeSetCode(b.set_code)}|${normalizeNumber(b.num)}`) || []).length === 1 ? 0 : 1;
    return aMatch - bMatch || Number(a.num.replace(/\D/g, "")) - Number(b.num.replace(/\D/g, ""));
  });
  const lillie = preferred.find((card) => Number(card.id) === 73990);
  const ordered = lillie ? [lillie, ...preferred.filter((card) => card !== lillie)] : preferred;
  const targets = ordered.slice(0, Math.min(TARGET_COUNT, ordered.length));
  const processed = new Set((progress.processedCardIds || []).map(Number));
  const existingRecords = new Map((existing.linkage?.records || []).map((record) => [Number(record.pokedataCardId), {
    ...record,
    setCode: normalizeSetCode(record.setCode),
    cardNumber: String(record.cardNumber || "").padStart(3, "0"),
    normalizedName: normalizeName(record.pokedataName),
  }]));
  const linkedSourceIds = new Set([...existingRecords.values()].filter((record) => record.localCardId).map((record) => Number(record.pokedataCardId)));
  const refreshLinked = process.env.POKEDATA_REFRESH_LINKED === "1";
  const refreshTargets = targets.filter((card) => linkedSourceIds.has(Number(card.id)));
  const refreshStart = refreshTargets.length ? Math.max(0, Number(progress.refreshCursor || 0)) % refreshTargets.length : 0;
  const rotatedRefreshTargets = [...refreshTargets.slice(refreshStart), ...refreshTargets.slice(0, refreshStart)];
  const retryAllowed = (card) => {
    const state = retryPolicy.migrateLegacy(progress.retryByCard[card.id]);
    if (state) progress.retryByCard[card.id] = state;
    return retryPolicy.eligible(state);
  };
  const selected = (refreshLinked ? rotatedRefreshTargets : targets.filter((card) => !processed.has(Number(card.id))))
    .filter(retryAllowed).slice(0, BATCH_SIZE);
  if (!selected.length) {
    console.log(JSON.stringify({ setName: SET_NAME, sourceSetTotal: sourceCards.length, targetCount: targets.length,
      acquired: existingRecords.size, attempted: 0, fetched: 0, cacheHits: 0, failed: 0,
      completionStatus: "no-progress", reason: targets.every(card => processed.has(Number(card.id))) ? "first-pass-complete" : "retry-or-manual-queue-only",
      retryWaiting: Object.values(progress.retryByCard).filter(row => !row.manualReview).length,
      manualWaiting: Object.values(progress.retryByCard).filter(row => row.manualReview).length }));
    return;
  }
  let attempted = 0; let fetched = 0; let cached = 0; let failed = 0; let manualStop = null;

  for (const sourceCard of selected) {
    if (Number(process.env.POKEDATA_RUN_DEADLINE_MS) > 0 && Date.now() + TIMEOUT_MS * 3 + 5000 >= Number(process.env.POKEDATA_RUN_DEADLINE_MS)) break;
    attempted += 1;
    const url = `${BASE}/api/transactions?card_id=${sourceCard.id}&page=0`;
    const metric = { pokedataCardId: sourceCard.id, sourceUrl: sourceUrl(sourceCard), url, startedAt: new Date().toISOString(), stage: "fetch", status: "running" };
    try {
      let transactionData;
      const cachedEntry = cache.entries[sourceCard.id];
      const age = Date.now() - Date.parse(cachedEntry?.fetchedAt || "");
      if (cachedEntry && Number.isFinite(age) && age < 7 * 86400000 && process.env.POKEDATA_FORCE !== "1") {
        transactionData = cachedEntry.data;
        cached += 1;
        metric.fromCache = true;
        metric.httpStatus = cachedEntry.httpStatus;
        metric.fetchMs = 0;
        metric.retryCount = 0;
      } else {
        const response = await fetchJson(url);
        transactionData = response.value;
        Object.assign(metric, response.metric);
        fetched += 1;
        cache.entries[sourceCard.id] = {
          fetchedAt: new Date().toISOString(), httpStatus: response.metric.httpStatus,
          data: { page: transactionData.page, transactions: transactionData.transactions || [] },
        };
      }
      if (!transactionData || !Array.isArray(transactionData.transactions)) {
        const error = new Error("PokeDATA個別成約APIの形式変更・手動確認待ち");
        error.manual = true;
        throw error;
      }
      metric.stage = "match";
      const linkage = findDomestic(sourceCard, domesticByKey, linkMap.aliases || []);
      const domestic = linkage.localCardId ? cards.find((card) => card.id === linkage.localCardId) : null;
      const domesticIdentity = domestic ? localIdentity(domestic) : null;
      const record = {
        pokedataCardId: Number(sourceCard.id), pokedataName: sourceCard.name,
        setName: sourceCard.set_name, setCode: normalizeSetCode(sourceCard.set_code),
        cardNumber: String(sourceCard.num), language: sourceCard.language,
        normalizedName: normalizeName(sourceCard.name), rarity: domesticIdentity?.rarity || null,
        sourceUrl: sourceUrl(sourceCard), status: linkage.status, method: linkage.method,
        localCardId: linkage.localCardId || null, localCardName: domestic?.name || null,
        localDirectUrl: domestic ? `./?q=${encodeURIComponent(domestic.name)}` : null,
        candidates: linkage.candidates || [], checkedAt: new Date().toISOString(),
        failureReason: linkage.reason || null,
      };
      existingRecords.set(Number(sourceCard.id), record);
      if (domestic) {
        const currentDetailed = existing.cards?.[domestic.id];
        if (!browserCapturedIds.has(Number(sourceCard.id)) && currentDetailed?.acquisitionAudit?.method !== "authenticated-browser-dom") {
          const sales = minimalTransactions(transactionData.transactions, fxRate);
          const analysis = analyzeSales(sales, {
            number: sourceCard.num,
            setAliases: [sourceCard.set_name, sourceCard.set_code],
            nameTokens: nameTokens(sourceCard.name),
          }, fxRate);
          const rawAggregate = sourceAverage(sourceCard.stats, 12);
          const tcgAggregate = sourceAverage(sourceCard.stats, 0);
          const psa10Aggregate = sourceAverage(sourceCard.stats, 10);
          const psa9Aggregate = sourceAverage(sourceCard.stats, 9);
          existing.cards ||= {};
          existing.cards[domestic.id] = {
            localCardId: domestic.id, localCardName: domestic.name,
            linkStatus: linkage.status, linkageMethod: linkage.method,
            sourceMode: sourceModeFor(sourceCard.id, browserCapturedIds),
            sourceUrl: record.sourceUrl, pokedata: {
              pokedataCardId: Number(sourceCard.id), setId: sourceCard.set_id,
              setName: sourceCard.set_name, setCode: sourceCard.set_code,
              number: sourceCard.num, printedNumber: domesticIdentity.printedNumber,
              name: sourceCard.name, language: sourceCard.language, localCardId: domestic.id,
            },
            capturedAt: new Date().toISOString(),
            fx: { pair: "USD/JPY", rate: fxRate, source: "Frankfurter / ECB reference rates", sourceUrl: "https://api.frankfurter.app/latest?from=USD&to=JPY", rateDate: fxResponse.value.date, fetchedAt: cache.fx?.fetchedAt || new Date().toISOString(), cacheUsed: !fxResponse.metric },
            markets: {
              ebayRaw: marketSummary(rawAggregate, analysis.summaries.raw, fxRate, domestic.price, "PokeDATA eBay aggregate + public transaction page"),
              tcgplayerRaw: { pageDisplayJpy: tcgAggregate > 0 ? Math.round(tcgAggregate * fxRate) : null, apiAverageUsd: tcgAggregate, apiAverageJpy: tcgAggregate > 0 ? Math.round(tcgAggregate * fxRate) : null, transactionCount: null, transactionCountStatus: "取得不能", comparisonToDomestic: compare(tcgAggregate * fxRate, domestic.price) },
              ebayPsa10: marketSummary(psa10Aggregate, analysis.summaries.psa10, fxRate, domestic.snkPsa10Price, "PokeDATA eBay aggregate + public transaction page"),
              ebayPsa9: marketSummary(psa9Aggregate, analysis.summaries.psa9, fxRate, domestic.snkPsa9Price || domestic.price, "PokeDATA eBay aggregate + public transaction page"),
            },
            population: { status: "認証済み画面の個別取得未実施", psa10: null, psa9: null, psa8: null },
            domestic: { rawJpy: domestic.price || null, psa10Jpy: domestic.snkPsa10Price || null, psa9Jpy: domestic.snkPsa9Price || null },
            trend: { domestic: Number(domestic.chg30) > 3 ? "上昇" : Number(domestic.chg30) < -3 ? "下降" : "横ばい", overseas: analysis.summaries.psa10.trend.direction, status: "海外相場は参考指標・仕入れ上限へ未反映" },
            confidence: analysis.summaries.raw.adoptedCount >= 8 || analysis.summaries.psa10.adoptedCount >= 8 ? "中" : "参考値",
            referenceOnly: true, limitImpact: "仕入れ上限へ未反映",
          };
        }
        if (!(linkMap.aliases || []).some((entry) => Number(entry.pokedataCardId) === Number(sourceCard.id))) {
          linkMap.aliases.push({
            status: "auto-confirmed", method: linkage.method,
            pokedataCardId: Number(sourceCard.id), pokedataSetId: sourceCard.set_id,
            pokedataSet: sourceCard.set_name, pokedataSetCode: sourceCard.set_code,
            pokedataNumber: sourceCard.num, pokedataName: sourceCard.name,
            language: sourceCard.language, localCardId: domestic.id,
            verifiedAt: new Date().toISOString(), evidence: ["Japanese language", "exact set code", "exact card number", "unique domestic candidate"],
          });
        }
      }
      processed.add(Number(sourceCard.id));
      delete progress.retryByCard[sourceCard.id];
      progress.processedCardIds = [...processed];
      progress.lastCardId = Number(sourceCard.id);
      progress.lastSuccessfulCard = { id: Number(sourceCard.id), name: sourceCard.name, at: new Date().toISOString() };
      if (refreshLinked && refreshTargets.length) {
        progress.refreshCursor = (refreshTargets.findIndex((card) => Number(card.id) === Number(sourceCard.id)) + 1) % refreshTargets.length;
      }
      progress.lastFailure = null;
      metric.status = "success";
      metric.stage = "complete";
      metric.linkStatus = linkage.status;
      metric.localCardId = linkage.localCardId || null;
      metric.transactionRows = Number(transactionData.transactions?.length || 0);
      // Save the cache and data before advancing the checkpoint.
      existing.linkage = { records: [...existingRecords.values()] };
      write(CACHE, cache);
      writeSetState(ROOT, existing, {
        setName: SET_NAME, setCode: sourceCard.set_code,
        cards: existing.cards, records: [...existingRecords.values()],
        sourceCount: sourceCards.length, updatedAt: new Date().toISOString(),
      });
      write(LINK_MAP, linkMap);
      write(PROGRESS, progress);
    } catch (error) {
      if (!error.manual) failed += 1;
      Object.assign(metric, error.metric || {});
      metric.status = error.manual ? "manual-action-required" : "failed";
      metric.error = error.message;
      metric.exception = String(error.stack || error.message || error).slice(0, 1200);
      progress.lastFailure = { pokedataCardId: sourceCard.id, url, stage: metric.stage, httpStatus: metric.httpStatus || null, retryCount: metric.retryCount || 0, error: error.message, exception: metric.exception, at: new Date().toISOString() };
      progress.failures = [...(progress.failures || []), progress.lastFailure].slice(-50);
      const retry = retryPolicy.failure(progress.retryByCard[sourceCard.id], { error: error.message, httpStatus: metric.httpStatus });
      progress.retryByCard[sourceCard.id] = { ...retry, url };
      if (retry.manual && retry.scope === "source") {
        manualStop = { setName: SET_NAME, url, reason: error.message,
          httpStatus: metric.httpStatus || null, at: new Date().toISOString(), resumeCardId: sourceCard.id };
        progress.manualHold = manualStop;
        write(ACCESS_HOLD, manualStop);
      } else if (retry.kind === "rate-limit") {
        progress.sourceRetry = retry;
        manualStop = { reason: "HTTP 429・待機期限後に自動再試行", nextRetryAt: retry.nextRetryAt, temporary: true };
      }
      write(PROGRESS, progress);
    }
    metric.endedAt = new Date().toISOString();
    recordMetric(metric);
    if (manualStop) break;
  }

  const records = [...existingRecords.values()].filter((record) => targets.some((card) => Number(card.id) === Number(record.pokedataCardId)));
  const recordBySourceId = new Map(records.map((record) => [Number(record.pokedataCardId), record]));
  for (const [localCardId, detail] of Object.entries(existing.cards || {})) {
    const record = recordBySourceId.get(Number(detail?.pokedata?.pokedataCardId));
    if (!record?.localCardId || record.localCardId !== localCardId) delete existing.cards[localCardId];
  }
  for (const detail of Object.values(existing.cards || {})) {
    detail.sourceMode = sourceModeFor(detail.pokedata?.pokedataCardId, browserCapturedIds);
    for (const market of [detail.markets?.ebayRaw, detail.markets?.ebayPsa10, detail.markets?.ebayPsa9].filter(Boolean)) {
      market.individualSalesStatus = individualSalesStatus(market);
      market.usableIndividualMedian = Number(market.adoptedCount || 0) >= 3;
      market.decisionUsage = "海外相場は参考表示のみ・国内仕入れ判断へ未反映";
    }
    if (detail.markets?.tcgplayerRaw && detail.markets.tcgplayerRaw.transactionCount == null) {
      detail.markets.tcgplayerRaw.transactionCountStatus = "取得不能";
    }
  }
  const automaticMatched = records.filter((record) => record.status === "auto-matched" || record.status === "auto-confirmed").length;
  const manualMatched = records.filter((record) => record.status === "manual-confirmed").length;
  const ambiguous = records.filter((record) => record.status === "ambiguous").length;
  const domesticBaseMissing = records.filter((record) => record.status === "domestic-base-missing").length;
  const acquired = records.length;
  existing.version = 2;
  existing.updatedAt = new Date().toISOString();
  existing.source = "PokeDATA public set/stats/transaction APIs; authenticated Chrome validation for selected cards";
  existing.coverage = {
    sourceSetTotal: sourceCards.length, targetBatch: targets.length, sourceListed: targets.length,
    acquired, automaticMatched, manualMatched, ambiguous,
    unmatched: domesticBaseMissing, domesticBaseMissing,
    validationMatchRatePct: acquired > 0 ? Math.round((automaticMatched + manualMatched) / acquired * 10000) / 100 : null,
    totalDomesticCards: cards.length,
    totalCoveragePct: cards.length ? Math.round((automaticMatched + manualMatched) / cards.length * 10000) / 100 : null,
    status: "validation-partial",
    statusLabel: acquired >= sourceCards.length && failed === 0
      ? `${SET_NAME}完走（${acquired}件）／全体展開中`
      : `検証中／部分取得（${acquired}件）`,
    setComplete: acquired >= sourceCards.length && failed === 0,
    batchStatus: acquired >= targets.length && failed === 0 ? "complete" : "partial",
    batchStatusLabel: acquired >= targets.length && failed === 0 ? `検証対象${targets.length}件の処理完了` : `検証対象${targets.length}件を処理中`,
  };
  existing.linkage = { records };
  existing.crawl = {
    setName: SET_NAME, currentCursor: acquired, targetCount: targets.length,
    sourceSetTotal: sourceCards.length, remainingInBatch: Math.max(0, targets.length - acquired),
    attempted, fetched, cacheHits: cached, failed,
    transactionPageMode: "公開APIの先頭ページ（最大50件、追加ページは提供なし）",
    refreshCursor: refreshLinked ? Number(progress.refreshCursor || 0) : null,
    detailedDomesticCards: Object.keys(existing.cards || {}).length,
    usableRawMedianCards: Object.values(existing.cards || {}).filter((detail) => detail.markets?.ebayRaw?.usableIndividualMedian).length,
    usablePsa10MedianCards: Object.values(existing.cards || {}).filter((detail) => detail.markets?.ebayPsa10?.usableIndividualMedian).length,
    lastSuccessfulCard: progress.lastSuccessfulCard || null,
    lastFailure: progress.lastFailure || null,
  };
  progress.targetCount = targets.length;
  progress.sourceSetTotal = sourceCards.length;
  progress.lastRun = existing.crawl;
  const setCode = sourceCards.find((card) => card.set_code)?.set_code || null;
  writeSetState(ROOT, existing, {
    setName: SET_NAME, setCode, cards: existing.cards, records,
    sourceCount: sourceCards.length, updatedAt: existing.updatedAt,
    status: existing.coverage.setComplete ? "set-linked-individual-sales-partial" : "partial",
    acquisition: storedSet.entry?.acquisition || null,
  });
  write(LINK_MAP, linkMap); write(PROGRESS, progress); write(CACHE, cache);
  console.log(JSON.stringify({
    setName: SET_NAME, sourceSetTotal: sourceCards.length, targetCount: targets.length,
    acquired, automaticMatched, manualMatched, ambiguous, domesticBaseMissing,
    attempted, fetched, cacheHits: cached, failed,
    completionStatus: manualStop ? manualStop.temporary ? "retry-wait" : "manual-action-required" : acquired >= targets.length && failed === 0 ? "success" : "partial",
    stopReason: manualStop?.reason || null,
    httpRequests: fetched + Number(Boolean(sourceResponse.metric)) + Number(Boolean(fxResponse.metric)),
    nextRetryAt: manualStop?.nextRetryAt || null,
  }));
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { cardVariant, fetchJson, findDomestic, individualSalesStatus, localIdentity, minimalTransactions, normalizeName, normalizeNumber, normalizeSetCode, sourceModeFor };
