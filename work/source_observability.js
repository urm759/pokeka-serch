const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const RUNS_PATH = path.join(__dirname, "source-update-runs.json");
const RUN_HISTORY_PATH = path.join(__dirname, "source-update-history.json");

function readJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")); } catch { return fallback; }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value), "utf8");
}

function percent(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : null;
}

function cardSignature(card) {
  const name = String(card?.name || "");
  const standard = name.match(/\[\s*([A-Za-z0-9+-]+)\s+(\d{1,4}(?:\s*[-/]\s*\d{1,4})?)\s*\]/);
  const promo = name.match(/\[\s*(\d{1,4})\s+([A-Za-z0-9-]+-P)\s*\]/i);
  const setCode = String(promo?.[2] || standard?.[1] || "").toUpperCase().replace(/\s/g, "");
  const cardNo = String(promo?.[1] || standard?.[2] || "").replace(/\s/g, "");
  return setCode && cardNo ? `${setCode}|${cardNo}` : "";
}

function productSignature(name) {
  const source = String(name || "");
  const setCode = (source.match(/\[\s*([A-Za-z0-9+-]+)\s*\]/) || [])[1] || "";
  const cardNo = (source.match(/[<{]\s*(\d{1,4}(?:\s*[-/]\s*\d{1,4})?)\s*[>}]?/) || [])[1] || "";
  return setCode && cardNo ? `${setCode.toUpperCase()}|${cardNo.replace(/\s/g, "")}` : "";
}

function maxDate(values) {
  return values.filter(Boolean).sort().at(-1) || null;
}

function latestCatalogDate(catalog) {
  return maxDate((catalog || []).map((entry) => entry.observedAt));
}

function runFor(sourceId, runs) {
  return runs?.sources?.[sourceId] || {};
}

function reason(label, count) {
  return Number(count) > 0 ? { label, count: Number(count) } : null;
}

function attemptedStats(progress) {
  const attempts = [
    ...Object.values(progress?.attemptedCards || {}),
    ...Object.values(progress?.searchAttemptedCards || {}),
  ];
  return {
    attempted: attempts.length,
    notFound: attempts.filter((attempt) => attempt?.found === false).length,
  };
}

function ambiguousProgressCount(progress) {
  const entries = Array.isArray(progress) ? progress : Object.values(progress || {});
  return entries.filter((entry) => entry && typeof entry === "object" && (entry.ambiguous === true || (Array.isArray(entry.candidates) && entry.candidates.length > 1))).length;
}

function buildStoreCoverage(root = ROOT) {
  const cards = readJson(path.join(root, "data", "pokemon-cards.json"), []);
  const runs = readJson(path.join(root, "work", "source-update-runs.json"), { sources: {} });
  const aliasState = readJson(path.join(root, "work", "manual-card-aliases.json"), { aliases: [], ambiguousCandidates: [] });
  const linkageReview = readJson(path.join(root, "data", "linkage-review.json"), { sources: {} });
  const totalCards = cards.length;
  const signatureTargets = cards.filter((card) => cardSignature(card));
  const targetIds = new Set(signatureTargets.map((card) => card.id));
  const modernRules = require(path.join(root, "work", "cardrush_modern_rules.js"));

  const definitions = [
    {
      id: "cardrush", label: "カードラッシュ", urlField: "cardrushUrl",
      catalogFile: "cardrush_catalog.json", progressFile: "cardrush_recheck_ids.json",
      targets: cards.filter(modernRules.isModernCard),
    },
    {
      id: "hareruya2", label: "晴れる屋2", urlField: "hareruya2Url",
      catalogFile: "hareruya2_catalog.json", progressFile: "hareruya2_collection_progress.json",
      targets: signatureTargets,
    },
    {
      id: "yuyutei", label: "遊々亭", urlField: "yuyuteiUrl",
      catalogFile: "yuyutei_catalog.json", progressFile: "yuyutei_progress.json",
      targets: signatureTargets,
    },
    {
      id: "torecacamp", label: "トレカキャンプ", urlField: "torecacampUrl",
      catalogFile: "torecacamp_catalog.json", progressFile: "torecacamp_progress.json",
      targets: signatureTargets,
    },
  ];

  const stores = {};
  for (const definition of definitions) {
    const catalog = readJson(path.join(root, "work", definition.catalogFile), []);
    const progress = readJson(path.join(root, "work", definition.progressFile), {});
    const sourceSummary = readJson(path.join(root, "data", `${definition.id}-stock-summary.json`), {});
    const targetSet = new Set(definition.targets.map((card) => card.id));
    const matchedAll = cards.filter((card) => Boolean(card[definition.urlField])).length;
    const matchedTarget = cards.filter((card) => targetSet.has(card.id) && Boolean(card[definition.urlField])).length;
    const catalogCardIds = new Set(catalog.map((entry) => entry.cardId).filter(Boolean));
    const catalogUrls = new Set(catalog.map((entry) => entry.detailUrl).filter(Boolean));
    const fetchedMatchedProducts = definition.id === "cardrush"
      ? cards.filter((card) => card.cardrushUrl && catalogUrls.has(card.cardrushUrl)).length
      : catalog.filter((entry) => entry.cardId && targetIds.has(entry.cardId)).length;
    const fetchedUniqueCards = definition.id === "cardrush"
      ? new Set(catalog.map((entry) => productSignature(entry.name)).filter(Boolean)).size
      : catalogCardIds.size;
    const unmatched = Math.max(0, definition.targets.length - matchedTarget);
    const attempts = attemptedStats(progress);
    let reasons = [];
    if (definition.id === "cardrush") {
      const recheckCount = Array.isArray(progress) ? progress.length : 0;
      reasons = [
        reason("商品URL再確認待ち", Math.min(unmatched, recheckCount)),
        reason("状態A候補未確定", Math.max(0, unmatched - recheckCount)),
      ];
    } else if (definition.id === "torecacamp") {
      reasons = [reason("商品一覧巡回・型番照合待ち", unmatched)];
    } else {
      const pending = Number.isFinite(sourceSummary.crawl?.remainingSearchCount)
        ? Math.min(unmatched, Number(sourceSummary.crawl.remainingSearchCount))
        : Math.max(0, unmatched - attempts.notFound);
      const searchable = Number(sourceSummary.crawl?.searchableTargetCount || definition.targets.length);
      const notFound = Math.max(0, searchable - pending - matchedAll);
      const insufficientIdentity = Math.max(0, unmatched - pending - notFound);
      reasons = [
        reason("検索済み・一致候補なし", notFound),
        reason("未検索または再確認待ち", pending),
        reason("検索条件不足（型番・名称再確認）", insufficientIdentity),
      ];
    }
    const run = runFor(definition.id, runs);
    const manualIds = new Set((aliasState.aliases || [])
      .filter((entry) => entry.source === definition.id && entry.status !== "disabled" && targetSet.has(entry.cardId))
      .map((entry) => entry.cardId));
    const ambiguousAliases = (aliasState.ambiguousCandidates || []).filter((entry) => entry.source === definition.id).length;
    const manualMatched = [...manualIds].filter((cardId) => cards.find((card) => card.id === cardId)?.[definition.urlField]).length;
    const ambiguous = Math.max(ambiguousAliases + ambiguousProgressCount(progress), Number(linkageReview.sources?.[definition.id]?.ambiguousCount || 0));
    stores[definition.id] = {
      label: definition.label,
      fetchedProducts: catalog.length,
      fetchedUniqueCards,
      fetchedMatchedProducts,
      totalCards,
      targetCards: definition.targets.length,
      targetDefinition: definition.id === "cardrush" ? "2015年以降を中心とする照合対象" : "型番とカード番号を抽出できる全カード",
      matched: matchedTarget,
      automaticMatched: Math.max(0, matchedTarget - manualMatched),
      manualMatched,
      ambiguous,
      matchedAll,
      unmatched,
      fetchedProductMatchRatePct: percent(fetchedMatchedProducts, catalog.length),
      targetCoveragePct: percent(matchedTarget, definition.targets.length),
      totalCoveragePct: percent(matchedAll, totalCards),
      lastSuccessAt: run.lastSuccessAt || latestCatalogDate(catalog),
      fetchFailureCount: Number.isFinite(run.fetchFailureCount) ? run.fetchFailureCount : null,
      linkageMissCount: definition.id === "yuyutei" ? Number(sourceSummary.crawl?.linkageMissCount || 0) : null,
      diagnostics: sourceSummary.crawl || progress.lastRun || null,
      mainUnmatchedReasons: reasons.filter(Boolean),
    };
  }
  const psaRows = readJson(path.join(root, "data", "psa-official-populations.json"), { rows: [] }).rows || [];
  const psaSummary = readJson(path.join(root, "data", "psa-population-summary.json"), { cards: {} });
  const psaTargets = signatureTargets.filter((card) => Number(card.snkPsa10Price) > 0);
  const psaTargetIds = new Set(psaTargets.map((card) => card.id));
  const psaMatchedIds = new Set(Object.keys(psaSummary.cards || {}).filter((id) => psaTargetIds.has(id)));
  const psaManualIds = new Set((aliasState.aliases || [])
    .filter((entry) => entry.source === "psaOfficial" && entry.status !== "disabled" && psaTargetIds.has(entry.cardId))
    .map((entry) => entry.cardId));
  const psaManualMatched = [...psaManualIds].filter((id) => psaMatchedIds.has(id)).length;
  const psaMatchedAll = Object.keys(psaSummary.cards || {}).length;
  const psaOfficial = {
    label: "PSA公式",
    fetchedProducts: psaRows.length,
    fetchedUniqueCards: new Set(psaRows.map((row) => `${String(row.setCode || "").toUpperCase().replace(/\s/g, "")}|${String(row.cardNo || "").trim()}|${String(row.cardName || "").trim()}`).filter(Boolean)).size,
    fetchedMatchedProducts: psaMatchedIds.size,
    totalCards,
    targetCards: psaTargets.length,
    targetDefinition: "PSA10相場があり、セット・カード番号を抽出できるカード",
    matched: psaMatchedIds.size,
    matchedAll: psaMatchedAll,
    automaticMatched: Math.max(0, psaMatchedIds.size - psaManualMatched),
    manualMatched: psaManualMatched,
    ambiguous: Math.max(
      (aliasState.ambiguousCandidates || []).filter((entry) => entry.source === "psaOfficial").length,
      Number(linkageReview.sources?.psaOfficial?.ambiguousCount || 0)
    ),
    unmatched: Math.max(0, psaTargets.length - psaMatchedIds.size),
    fetchedProductMatchRatePct: percent(psaMatchedIds.size, psaRows.length),
    targetCoveragePct: percent(psaMatchedIds.size, psaTargets.length),
    totalCoveragePct: percent(psaMatchedAll, totalCards),
    lastSuccessAt: runFor("psaOfficial", runs).lastSuccessAt || maxDate(psaRows.map((row) => row.fetchedAt)),
    fetchFailureCount: Number.isFinite(runFor("psaOfficial", runs).fetchFailureCount) ? runFor("psaOfficial", runs).fetchFailureCount : null,
    mainUnmatchedReasons: [reason("PSAセット・英語名・仕様の照合待ち", Math.max(0, psaTargets.length - psaMatchedIds.size))].filter(Boolean),
  };
  const pokedata = readJson(path.join(root, "data", "pokedata-summary.json"), { coverage: {}, cards: {} });
  const pokedataManifest = readJson(path.join(root, "data", "pokedata", "manifest.json"), { sets: [] });
  const pokedataSetPayloads = (pokedataManifest.sets || []).map((entry) => ({
    entry,
    payload: readJson(path.join(root, ...String(entry.file || "").split("/")), { linkageRecords: [] }),
  }));
  const pokedataRecords = pokedataSetPayloads.flatMap(({ payload }) => payload.linkageRecords || []);
  const pokedataMatchedIds = new Set(pokedataRecords.map((record) => record.localCardId).filter(Boolean));
  const pokedataAutomatic = pokedataRecords.filter((record) => record.status === "auto-matched" || record.status === "auto-confirmed").length;
  const pokedataManual = pokedataRecords.filter((record) => record.status === "manual-confirmed").length;
  const pokedataAmbiguous = pokedataRecords.filter((record) => record.status === "ambiguous").length;
  const pokedataBaseMissing = pokedataRecords.filter((record) => record.status === "domestic-base-missing").length;
  const pokedataAcquisition = (pokedataManifest.sets || []).reduce((totals, entry) => {
    const acquisition = entry.acquisition || {};
    totals.browserValidatedCards += Number(acquisition.browserValidatedCards || 0);
    totals.usableRawMedianCards += Number(acquisition.usableRawMedianCards || 0);
    totals.usablePsa10MedianCards += Number(acquisition.usablePsa10MedianCards || 0);
    totals.usablePsa9MedianCards += Number(acquisition.usablePsa9MedianCards || 0);
    return totals;
  }, { browserValidatedCards: 0, usableRawMedianCards: 0, usablePsa10MedianCards: 0, usablePsa9MedianCards: 0 });
  const pokedataSourceTotal = (pokedataManifest.sets || []).reduce((sum, entry) => sum + Number(entry.sourceCount || 0), 0);
  const pokedataHasPartialSet = (pokedataManifest.sets || []).some((entry) => entry.status === "partial");
  const pokedataCoverage = pokedata.coverage || {};
  const pokedataSource = {
    label: "PokeDATA",
    fetchedProducts: Number(pokedataManifest.totalLinkageRecords || pokedataRecords.length),
    fetchedUniqueCards: Number(pokedataManifest.totalCards || pokedataMatchedIds.size),
    fetchedMatchedProducts: pokedataMatchedIds.size,
    totalCards,
    targetCards: totalCards,
    targetDefinition: "国内基礎データの全カード（現在は段階検証中）",
    matched: pokedataMatchedIds.size,
    matchedAll: pokedataMatchedIds.size,
    automaticMatched: pokedataAutomatic,
    manualMatched: pokedataManual,
    ambiguous: pokedataAmbiguous,
    unmatched: pokedataBaseMissing,
    totalUncovered: Math.max(0, totalCards - pokedataMatchedIds.size),
    sourceSetTotal: pokedataSourceTotal,
    batchTarget: Number(pokedataManifest.totalLinkageRecords || pokedataRecords.length),
    acquired: Number(pokedataManifest.totalLinkageRecords || pokedataRecords.length),
    validationMatchRatePct: percent(pokedataAutomatic + pokedataManual, pokedataRecords.length),
    status: "validation-partial",
    statusLabel: `${pokedataManifest.sets?.length || 0}セット段階取得（照合${pokedataRecords.length}件・詳細${pokedataMatchedIds.size}枚・実価格${pokedataAcquisition.browserValidatedCards}枚）`,
    fetchedProductMatchRatePct: percent(pokedataAutomatic + pokedataManual, pokedataRecords.length),
    targetCoveragePct: percent(pokedataMatchedIds.size, totalCards),
    totalCoveragePct: percent(pokedataMatchedIds.size, totalCards),
    lastSuccessAt: pokedataManifest.updatedAt || pokedata.updatedAt || null,
    fetchFailureCount: Number.isFinite(runFor("pokedata", runs).fetchFailureCount) ? runFor("pokedata", runs).fetchFailureCount : null,
    diagnostics: {
      ...(pokedata.crawl || {}),
      setCount: pokedataManifest.sets?.length || 0,
      setStatus: pokedataHasPartialSet ? "partial" : "linked",
      ...pokedataAcquisition,
      actualPriceCoveragePct: percent(pokedataAcquisition.browserValidatedCards, pokedataMatchedIds.size),
    },
    records: [],
    recordsStorage: "set-shards",
    browserValidatedCards: pokedataAcquisition.browserValidatedCards,
    usableRawMedianCards: pokedataAcquisition.usableRawMedianCards,
    usablePsa10MedianCards: pokedataAcquisition.usablePsa10MedianCards,
    usablePsa9MedianCards: pokedataAcquisition.usablePsa9MedianCards,
    actualPriceCoveragePct: percent(pokedataAcquisition.browserValidatedCards, pokedataMatchedIds.size),
    mainUnmatchedReasons: [
      reason("国内基礎データなし", pokedataBaseMissing),
      reason("曖昧候補", pokedataAmbiguous),
      reason("全カード展開待ち", Math.max(0, totalCards - pokedataMatchedIds.size)),
      reason("認証画面の実価格検証待ち", Math.max(0, pokedataMatchedIds.size - pokedataAcquisition.browserValidatedCards)),
    ].filter(Boolean),
  };
  const uniqueUnmatchedCards = cards.filter((card) => ["cardrushUrl", "hareruya2Url", "yuyuteiUrl", "torecacampUrl"]
    .some((field) => !card[field])).length;
  return {
    totalCards, comparableTargetCards: signatureTargets.length, uniqueUnmatchedCards,
    uniqueUnmatchedDefinition: "サイト全カードのうち、国内4ショップ（カードラッシュ・晴れる屋2・遊々亭・トレカキャンプ）の直リンクが1つでも未取得のカード数。各データ元の未紐付け件数の合計ではありません。",
    stores, linkageSources: { ...stores, psaOfficial }, overseasSources: { pokedata: pokedataSource },
  };
}

function countCurrentRecords(sourceId, root = ROOT) {
  if (sourceId === "pokedata") {
    const manifest = readJson(path.join(root, "data", "pokedata", "manifest.json"), {});
    return Number(manifest?.totalLinkageRecords || 0);
  }
  const files = {
    toreca: ["data/pokemon-cards.json", "array"],
    cardrush: ["work/cardrush_catalog.json", "array"],
    hareruya2: ["work/hareruya2_catalog.json", "array"],
    yuyutei: ["work/yuyutei_catalog.json", "array"],
    torecacamp: ["work/torecacamp_catalog.json", "array"],
    shopBuyback: ["data/shop-buyback-summary.json", "cards"],
    marketAnalysis: ["data/market-stability-summary.json", "cards"],
    psaJapan: ["data/psa-japan-services.json", "plans"],
  };
  const config = files[sourceId];
  if (!config) return null;
  const value = readJson(path.join(root, config[0]), config[1] === "array" ? [] : {});
  if (config[1] === "array") return Array.isArray(value) ? value.length : 0;
  const rows = value?.[config[1]];
  return Array.isArray(rows) ? rows.length : rows && typeof rows === "object" ? Object.keys(rows).length : 0;
}

function sourceArtifactPaths(sourceId, root = ROOT) {
  const files = {
    toreca: ["data/pokemon-cards.json"],
    cardrush: ["work/cardrush_catalog.json", "data/cardrush-stock-summary.json"],
    hareruya2: ["work/hareruya2_catalog.json", "data/hareruya2-stock-summary.json"],
    yuyutei: ["work/yuyutei_catalog.json", "data/yuyutei-stock-summary.json"],
    torecacamp: ["work/torecacamp_catalog.json", "work/torecacamp_sitemap_cache.json", "data/torecacamp-stock-summary.json"],
    shopBuyback: ["data/shop-buyback-summary.json"],
    marketAnalysis: ["data/market-stability-summary.json"],
    psaJapan: ["data/psa-japan-services.json"],
    pokedata: ["data/pokedata-summary.json", "data/pokedata/manifest.json", "data/pokedata-sales/pk-63635.json"],
  };
  return (files[sourceId] || []).map((relative) => path.join(root, relative));
}

function artifactFingerprint(sourceId, root = ROOT) {
  const hash = crypto.createHash("sha256");
  let found = false;
  for (const filePath of sourceArtifactPaths(sourceId, root)) {
    if (!fs.existsSync(filePath)) continue;
    found = true;
    hash.update(fs.readFileSync(filePath));
  }
  return found ? hash.digest("hex") : null;
}

function updateRun(sourceId, patch, root = ROOT) {
  const filePath = path.join(root, "work", "source-update-runs.json");
  const state = readJson(filePath, { updatedAt: null, sources: {} });
  state.sources ||= {};
  state.sources[sourceId] = { ...(state.sources[sourceId] || {}), ...patch };
  state.updatedAt = new Date().toISOString();
  writeJson(filePath, state);
  return state.sources[sourceId];
}

function appendRunHistory(sourceId, record, root = ROOT) {
  const filePath = path.join(root, "work", "source-update-history.json");
  const state = readJson(filePath, { version: 1, updatedAt: null, sources: {} });
  state.sources ||= {};
  const history = Array.isArray(state.sources[sourceId]) ? state.sources[sourceId] : [];
  history.push({ sourceId, ...record });
  state.sources[sourceId] = history.slice(-60);
  state.updatedAt = new Date().toISOString();
  writeJson(filePath, state);
  return state.sources[sourceId];
}

function nextScheduledAt(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  const currentMinutes = Number(parts.hour) * 60 + Number(parts.minute);
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const target = currentMinutes < 270 ? `${date}T04:30:00+09:00`
    : currentMinutes < 1020 ? `${date}T17:00:00+09:00`
      : null;
  if (target) return target;
  const tomorrowJst = new Date(now.getTime() + 9 * 3600000 + 86400000);
  const y = tomorrowJst.getUTCFullYear();
  const m = String(tomorrowJst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(tomorrowJst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}T04:30:00+09:00`;
}

module.exports = {
  ROOT, RUNS_PATH, RUN_HISTORY_PATH, readJson, writeJson, percent, cardSignature, productSignature,
  appendRunHistory, artifactFingerprint, buildStoreCoverage, countCurrentRecords, sourceArtifactPaths, updateRun, nextScheduledAt,
};
