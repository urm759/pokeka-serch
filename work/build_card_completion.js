const fs = require("fs");
const path = require("path");
const { canonicalIdentity } = require("./card_identity");
const { normalizeSetCode, resolveRelease, lifecycleFlags, classifyPsa9, retryAt } = require("./catalog_semantics");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const CATALOG = path.join(DATA, "card-catalog");
const CHUNKS = path.join(CATALOG, "chunks");
const CHUNK_SIZE = Math.max(100, Number(process.env.CARD_CATALOG_CHUNK_SIZE || 250));
const NEW_DAYS = Math.max(1, Number(process.env.CARD_NEW_DAYS || 30));
const RECENT_RELEASE_DAYS = Math.max(30, Number(process.env.CARD_RECENT_RELEASE_DAYS || 365));

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8")); } catch { return fallback; }
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function iso(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function daysSince(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? Math.max(0, (Date.now() - parsed) / 86400000) : Infinity;
}

function sourceTimes(updateStatus, source) {
  const row = updateStatus?.sources?.[source] || {};
  return { attempt: iso(row.lastAttemptAt), success: iso(row.lastSuccessAt), status: row.status || null, error: row.lastError || null };
}

function item(status, source, times, reason = null) {
  return {
    status,
    source,
    lastAttemptAt: times.attempt,
    lastSuccessAt: status === "取得済み" ? times.success : null,
    retryCount: status === "取得失敗" || status === "再試行待ち" ? 1 : 0,
    failureReason: reason,
    nextRetryAt: ["取得元にデータなし", "定期再確認", "再試行待ち"].includes(status) ? retryAt(times.attempt || times.success, status === "取得元にデータなし" ? 7 : 1) : null,
  };
}

function previousItemsFor(previousQueue, id) {
  const row = previousQueue.cards?.[id] || {};
  if (row.items) return row.items;
  return Object.fromEntries(Object.entries(row.i || {}).map(([key, value]) => [key, Array.isArray(value) ? {
    status: value[0],
    lastAttemptAt: value[1] || null,
    lastSuccessAt: value[2] || null,
    retryCount: Number(value[3] || 0),
    failureReason: value[4] || null,
    nextRetryAt: value[5] || null,
  } : value]));
}

function readPokedataSales() {
  const dir = path.join(DATA, "pokedata-sales");
  const rows = new Map();
  if (!fs.existsSync(dir)) return rows;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const payload = read(`data/pokedata-sales/${name}`, null);
    if (payload?.localCardId) rows.set(String(payload.localCardId), payload);
  }
  return rows;
}

function main() {
  const generatedAt = new Date().toISOString();
  const cards = read("data/pokemon-cards.json", []);
  const inventory = read("work/toreca-source-inventory.json", { cards: [] });
  const diff = read("work/toreca_source_diff.json", { added: [] });
  const arrivals = read("work/card-new-arrivals.json", { cards: {} });
  const lifecycle = read("work/card-lifecycle.json", { cards: {} });
  const updates = read("data/update-status.json", { sources: {} });
  const psa = read("data/psa-population-summary.json", { cards: {} });
  const buyback = read("data/shop-buyback-summary.json", { cards: {} });
  const cardrush = read("data/cardrush-stock-summary.json", { cards: {} });
  const hareruya2 = read("data/hareruya2-stock-summary.json", { cards: {} });
  const yuyutei = read("data/yuyutei-stock-summary.json", { cards: {} });
  const torecacamp = read("data/torecacamp-stock-summary.json", { cards: {} });
  const pokedata = read("data/pokedata/manifest.json", { sets: [] });
  const modernAudit = read("data/modern-high-rarity-audit.json", { manualReview: {} });
  const previousQueue = read("work/card-completion-queue.json", { cards: {} });
  const pokedataSales = readPokedataSales();
  const addedIds = new Set((diff.added || []).map((row) => String(row.id)));
  const pokedataIds = new Set((pokedata.sets || []).flatMap((set) => Array.isArray(set.localCardIds) ? set.localCardIds : String(set.localCardIds || "").split(/\s+/).filter(Boolean)));
  const expandedPokedataSets = new Set((pokedata.sets || []).map((set) => normalizeSetCode(set.setCode)));
  const knownReleaseById = new Map();
  for (const row of modernAudit.records || []) if (row.releaseYear || row.releaseDate) knownReleaseById.set(String(row.domesticId), row);
  for (const row of modernAudit.manualReview?.releaseYearUnknown || []) if (row.releaseYear || row.releaseDate) knownReleaseById.set(String(row.domesticId), row);
  const sourceTotal = Number(inventory.total || diff.sourceTotal || 0);
  const siteIds = new Set(cards.map((card) => String(card.id)));
  const inventoryIds = new Set((inventory.cards || []).map((card) => String(card.id)));
  const sourceMissing = [...inventoryIds].filter((id) => !siteIds.has(id));
  const firstSeenCounts = cards.reduce((counts, card) => {
    const value = String(card.firstSeenAt || "").slice(0, 10);
    if (value) counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
  const baselineFirstSeenAt = Object.entries(firstSeenCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const seenIdentity = new Map();
  const duplicateIds = [];

  const times = {
    toreca: sourceTimes(updates, "toreca"),
    psa: sourceTimes(updates, "psaOfficial"),
    cardrush: sourceTimes(updates, "cardrush"),
    hareruya2: sourceTimes(updates, "hareruya2"),
    yuyutei: sourceTimes(updates, "yuyutei"),
    torecacamp: sourceTimes(updates, "torecacamp"),
    buyback: sourceTimes(updates, "shopBuyback"),
    pokedata: sourceTimes(updates, "pokedata"),
  };
  const statusById = {};
  const queueCards = {};
  const queueRows = [];
  const summary = {
    total: cards.length, newCards: 0, siteNewCards: 0, recentReleaseCards: 0, relistedCards: 0,
    analyzable: 0, analyzableComplete: 0, analyzablePartial: 0, completionInProgress: 0,
    dataShortage: 0, reviewRequired: 0, completableAfterNext: 0,
    releaseDateKnown: 0, releaseYearOnly: 0, releaseUnknown: 0,
    releaseSourceCounts: {},
    siteNewRetentionDays: NEW_DAYS, recentReleaseDays: RECENT_RELEASE_DAYS,
  };
  const itemTotals = {};
  const dataTypeTotals = {
    raw: { actual: 0, aggregate: 0, estimate: 0, missing: 0 },
    psa10: { actual: 0, aggregate: 0, estimate: 0, missing: 0 },
    psa9: { actual: 0, aggregate: 0, estimate: 0, missing: 0 },
    pokedata: { compatibleWaiting: 0, compatibleUnmatched: 0, unexpandedSet: 0, unsupportedOrUnconfirmed: 0, linked: 0 },
  };

  for (const card of cards) {
    const id = String(card.id);
    const identity = card.identityKey ? {
      key: card.identityKey,
      setCode: card.setCode || "",
      cardNumber: card.cardNumber || "",
      rarity: card.rarity || "",
      variant: card.variant || "",
      language: card.language || "ja",
      reviewRequired: Boolean(card.identityReviewRequired),
    } : canonicalIdentity(card);
    if (seenIdentity.has(identity.key) && !identity.reviewRequired) duplicateIds.push([seenIdentity.get(identity.key), id]);
    else seenIdentity.set(identity.key, id);
    const firstSeenAt = String(card.firstSeenAt || "").slice(0, 10);
    const registeredArrival = arrivals.cards?.[id]?.firstSeenAt || null;
    const auditRelease = knownReleaseById.get(id) || null;
    const release = resolveRelease(card, auditRelease);
    const life = lifecycle.cards?.[id] || {};
    const flags = lifecycleFlags({
      arrival: { firstSeenAt: registeredArrival || (firstSeenAt !== baselineFirstSeenAt ? firstSeenAt : null) },
      release,
      removedAt: life.lastRemovedAt,
      reappearedAt: life.reappearedAt,
      siteNewDays: NEW_DAYS,
      recentReleaseDays: RECENT_RELEASE_DAYS,
    });
    const isSiteNew = Boolean(flags.siteNew || addedIds.has(id));
    const isRecentRelease = Boolean(flags.recentRelease);
    const isRelisted = Boolean(flags.relisted && daysSince(life.reappearedAt) <= NEW_DAYS);
    const shopFound = Boolean(card.cardrushUrl || card.hareruya2Url || card.yuyuteiUrl || card.torecacampUrl || cardrush.cards?.[id] || hareruya2.cards?.[id] || yuyutei.cards?.[id] || torecacamp.cards?.[id]);
    const buybackRow = buyback.cards?.[id];
    const official = psa.cards?.[id];
    const releaseKnown = Boolean(release.date || release.year);
    const domesticPrice = finite(card.price) && card.price > 0;
    const domesticTx = finite(card.tv7) && finite(card.tv30);
    const psa10Price = finite(card.snkPsa10Price) && card.snkPsa10Price > 0;
    const psa10Tx = finite(card.p10tv7) && finite(card.p10tv30);
    const sales = pokedataSales.get(id);
    const rawActualCount = Number(sales?.summaries?.raw?.adoptedCount || 0);
    const psa10ActualCount = Number(sales?.summaries?.psa10?.adoptedCount || 0);
    const psa9ActualCount = Number(sales?.summaries?.psa9?.adoptedCount || 0);
    const psa9Kind = classifyPsa9({ pokedataSummary: sales?.summaries?.psa9, aggregatePrice: card.snkPsa9Price, estimatedPrice: domesticPrice ? card.price * 0.75 : null });
    const setCode = normalizeSetCode(card.setCode);
    const pokedataState = pokedataIds.has(id) ? "linked"
      : expandedPokedataSets.has(setCode) ? "compatible-unmatched"
        : /^(?:M\d|SV\d|S\d|SM\d|XY\d|CP\d)/.test(setCode) ? "unexpanded-set"
          : "unsupported-or-unconfirmed";
    dataTypeTotals.raw[rawActualCount > 0 ? "actual" : domesticPrice ? "aggregate" : "missing"] += 1;
    dataTypeTotals.psa10[psa10ActualCount > 0 ? "actual" : psa10Price ? "aggregate" : "missing"] += 1;
    dataTypeTotals.psa9[psa9Kind.kind] += 1;
    if (pokedataState === "linked") dataTypeTotals.pokedata.linked += 1;
    else if (pokedataState === "compatible-unmatched") dataTypeTotals.pokedata.compatibleUnmatched += 1;
    else if (pokedataState === "unexpanded-set") dataTypeTotals.pokedata.unexpandedSet += 1;
    else dataTypeTotals.pokedata.unsupportedOrUnconfirmed += 1;
    const entries = {
      domesticPrice: item(domesticPrice ? "取得済み" : "取得元にデータなし", "みんトレ", times.toreca, domesticPrice ? null : "美品価格の掲載なし"),
      domesticTrades: item(domesticTx ? "取得済み" : "定期再確認", "みんトレ", times.toreca, domesticTx ? null : "現在取引なし・次回定期更新で再確認"),
      psa10Price: item(psa10Price ? "取得済み" : "取得元にデータなし", "みんトレ／スニダン", times.toreca, psa10Price ? null : "PSA10相場の掲載なし"),
      psa10Trades: item(psa10Tx ? "取得済み" : "定期再確認", "みんトレ／スニダン", times.toreca, psa10Tx ? null : "現在取引なし・次回定期更新で再確認"),
      rawActualSales: item(rawActualCount > 0 ? "取得済み" : pokedataState === "unsupported-or-unconfirmed" ? "取得不能" : "取得待ち", "PokeDATA個別成約", times.pokedata, rawActualCount > 0 ? `${rawActualCount}件` : "Raw実成約未取得"),
      psa10ActualSales: item(psa10ActualCount > 0 ? "取得済み" : pokedataState === "unsupported-or-unconfirmed" ? "取得不能" : "取得待ち", "PokeDATA個別成約", times.pokedata, psa10ActualCount > 0 ? `${psa10ActualCount}件` : "PSA10実成約未取得"),
      psa9Sales: item(psa9ActualCount > 0 ? "取得済み" : pokedataState === "unsupported-or-unconfirmed" ? "取得不能" : "取得待ち", "PokeDATA個別成約", times.pokedata, psa9ActualCount > 0 ? `${psa9ActualCount}件` : psa9Kind.kind === "aggregate" ? "集計値はあるが個別実成約は未取得" : "PSA9実成約を優先取得"),
      psa9Aggregate: item(psa9Kind.kind === "actual" || psa9Kind.kind === "aggregate" ? "取得済み" : psa9Kind.kind === "estimate" ? "推定値" : "取得待ち", "みんトレ／スニダン", times.toreca, psa9Kind.label),
      psaOfficial: item(official && finite(official.rate) ? "取得済み" : "取得待ち", "PSA公式", times.psa, official ? "TOTALまたはPSA10率が不足" : "公式Population未紐付け"),
      shopStateA: item(shopFound ? "取得済み" : "取得待ち", "国内ショップ", times.cardrush, shopFound ? null : "ショップ巡回・紐付け待ち"),
      buyback: item(buybackRow ? "取得済み" : "定期再確認", "Web買取表", times.buyback, buybackRow ? null : "現在掲載なし・次回定期更新で再確認"),
      pokedata: item(pokedataState === "linked" ? "取得済み" : pokedataState === "compatible-unmatched" ? "再試行待ち" : pokedataState === "unexpanded-set" ? "取得待ち" : "取得不能", "PokeDATA", times.pokedata, pokedataState === "linked" ? null : pokedataState === "compatible-unmatched" ? "対応セットだがカード未一致" : pokedataState === "unexpanded-set" ? "未展開セット" : "PokeDATA非対応／存在未確認"),
      release: item(releaseKnown ? "取得済み" : "取得待ち", "セット発売日マスタ", times.toreca, releaseKnown ? null : "発売日未確定"),
      identity: item(identity.reviewRequired ? "再試行待ち" : "取得済み", "みんトレ", times.toreca, identity.reviewRequired ? "セットまたはカード番号を確定できない" : null),
    };
    const previousItems = previousItemsFor(previousQueue, id);
    for (const [key, entry] of Object.entries(entries)) {
      const previous = previousItems[key];
      if (entry.status !== "取得済み" && previous && ["取得失敗", "再試行待ち"].includes(previous.status)) {
        entry.status = previous.status;
        entry.lastAttemptAt = previous.lastAttemptAt || entry.lastAttemptAt;
        entry.retryCount = Number(previous.retryCount || 0);
        entry.failureReason = previous.failureReason || entry.failureReason;
      }
    }
    const values = Object.values(entries);
    const acquired = values.filter((entry) => entry.status === "取得済み").length;
    const completionPct = Number((acquired / values.length * 100).toFixed(1));
    const requiredReady = domesticPrice && domesticTx && psa10Price && psa10Tx && official && finite(official.rate) && !identity.reviewRequired;
    const inProgress = values.some((entry) => ["取得待ち", "巡回中", "取得失敗", "再試行待ち", "定期再確認"].includes(entry.status));
    const hardShortage = !domesticPrice || !domesticTx || !psa10Price || !psa10Tx || identity.reviewRequired;
    const buyback30 = Number(buybackRow?.total30 || 0);
    const buyback90 = Number(buybackRow?.total90 || 0);
    const requiredKeys = ["domesticPrice", "domesticTrades", "psa10Price", "psa10Trades", "psaOfficial", "identity"];
    const missingRequired = requiredKeys.filter((key) => entries[key]?.status !== "取得済み");
    const fetchableMissing = missingRequired.filter((key) => entries[key]?.status !== "取得不能");
    const completableAfterNext = !requiredReady && missingRequired.length === 1 && fetchableMissing.length === 1;
    const nextItem = fetchableMissing[0] || Object.keys(entries).find((key) => ["取得待ち", "再試行待ち", "定期再確認"].includes(entries[key].status)) || null;
    let priority = 0;
    priority += Math.min(600, buyback30 * 20 + buyback90 * 4);
    priority += isRecentRelease ? 500 : 0;
    priority += missingRequired.length > 0 && missingRequired.length <= 2 ? 400 : 0;
    priority += shopFound ? 90 : 0;
    priority += isSiteNew ? 80 : 0;
    priority += Math.min(160, Number(card.tv30 || 0) * 2);
    priority += Math.min(160, Number(card.p10tv30 || 0) * 4);
    priority += Math.min(120, Number(card.snkPsa10Price || 0) / 2500);
    priority += Math.min(120, Math.max(0, Number(card.snkPsa10Price || 0) - Number(card.price || 0) - 13000) / 2000);
    priority += !requiredReady ? 80 : 0;
    const reasons = [];
    if (buyback30 > 0) reasons.push(`買取表30日${buyback30}日`);
    if (isRecentRelease) reasons.push(`最近発売（${release.date}）`);
    if (missingRequired.length > 0 && missingRequired.length <= 2) reasons.push(`必須不足${missingRequired.length}項目・補完で分析可能に近い`);
    if (isSiteNew) reasons.push("サイト新着");
    if (Number(card.tv30 || 0) >= 10) reasons.push(`美品取引30日${card.tv30}件`);
    if (Number(card.p10tv30 || 0) >= 5) reasons.push(`PSA10取引30日${card.p10tv30}件`);
    if (!requiredReady) reasons.push("仕入れ判断の必須項目が不足");
    if (!reasons.length) reasons.push("通常補完キュー");
    const classification = requiredReady ? "分析可能" : hardShortage ? "データ不足" : inProgress ? "データ補完中" : "データ不足";
    statusById[id] = {
      c: completionPct,
      s: classification,
      n: isSiteNew ? 1 : 0,
      rr: isRecentRelease ? 1 : 0,
      rl: isRelisted ? 1 : 0,
      rd: release.date,
      ry: release.year,
      rs: release.source,
      p: Math.round(priority),
      r: reasons.slice(0, 4),
      m: missingRequired,
      x: nextItem,
      a: completableAfterNext ? 1 : 0,
      l: values.map((entry) => entry.lastAttemptAt).filter(Boolean).sort().at(-1) || null,
      pk: pokedataState,
      p9: psa9Kind.kind,
      i: Object.fromEntries(Object.entries(entries).map(([key, entry]) => [key, entry.status])),
    };
    queueCards[id] = {
      c: completionPct,
      s: classification,
      n: isSiteNew ? 1 : 0,
      rr: isRecentRelease ? 1 : 0,
      rl: isRelisted ? 1 : 0,
      rd: release.date,
      ry: release.year,
      rs: release.source,
      p: Math.round(priority),
      r: reasons,
      m: missingRequired,
      x: nextItem,
      a: completableAfterNext ? 1 : 0,
      l: values.map((entry) => entry.lastAttemptAt).filter(Boolean).sort().at(-1) || null,
      pk: pokedataState,
      p9: psa9Kind.kind,
      i: Object.fromEntries(Object.entries(entries).map(([key, entry]) => [key, [
        entry.status,
        entry.lastAttemptAt,
        entry.lastSuccessAt,
        entry.retryCount,
        entry.failureReason,
        entry.nextRetryAt,
      ]])),
    };
    queueRows.push({ id, name: card.name, classification, priority: Math.round(priority), missingRequired, nextItem, completableAfterNext, reasons });
    if (isSiteNew) summary.newCards += 1;
    if (isSiteNew) summary.siteNewCards += 1;
    if (isRecentRelease) summary.recentReleaseCards += 1;
    if (isRelisted) summary.relistedCards += 1;
    if (requiredReady) summary.analyzable += 1;
    if (requiredReady && acquired === values.length) summary.analyzableComplete += 1;
    if (requiredReady && acquired < values.length) summary.analyzablePartial += 1;
    if (completableAfterNext) summary.completableAfterNext += 1;
    if (inProgress) summary.completionInProgress += 1;
    if (classification === "データ不足") summary.dataShortage += 1;
    if (identity.reviewRequired) summary.reviewRequired += 1;
    if (release.precision === "date") summary.releaseDateKnown += 1;
    else if (release.precision === "year") summary.releaseYearOnly += 1;
    else summary.releaseUnknown += 1;
    summary.releaseSourceCounts[release.source] = (summary.releaseSourceCounts[release.source] || 0) + 1;
    for (const [key, entry] of Object.entries(entries)) {
      itemTotals[key] ||= { total: 0, acquired: 0, pending: 0, noData: 0, failed: 0 };
      itemTotals[key].total += 1;
      if (entry.status === "取得済み") itemTotals[key].acquired += 1;
      else if (entry.status === "取得元にデータなし" || entry.status === "取得不能") itemTotals[key].noData += 1;
      else if (entry.status === "取得失敗" || entry.status === "再試行待ち") itemTotals[key].failed += 1;
      else itemTotals[key].pending += 1;
    }
  }

  for (const value of Object.values(itemTotals)) value.acquiredPct = Number((value.acquired / Math.max(1, value.total) * 100).toFixed(1));
  const queue = queueRows.sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name, "ja"));
  summary.sourceTotal = sourceTotal;
  summary.siteTotal = cards.length;
  summary.unlisted = sourceMissing.length;
  summary.listingRatePct = sourceTotal ? Number((cards.length / sourceTotal * 100).toFixed(3)) : null;
  summary.analysisCompletionPct = cards.length ? Number((summary.analyzable / cards.length * 100).toFixed(1)) : null;
  summary.priorityQueueRemaining = queue.filter((row) => row.classification !== "分析可能").length;
  summary.addedThisRun = addedIds.size;
  summary.completeIdentityMatches = cards.length - summary.reviewRequired;
  summary.duplicateCount = duplicateIds.length;
  summary.progressThisRun = Number(diff.added?.length || 0);
  summary.releaseDateCompletenessPct = Number((summary.releaseDateKnown / Math.max(1, cards.length) * 100).toFixed(1));
  summary.releaseKnownCompletenessPct = Number(((summary.releaseDateKnown + summary.releaseYearOnly) / Math.max(1, cards.length) * 100).toFixed(1));

  fs.mkdirSync(CHUNKS, { recursive: true });
  for (const old of fs.readdirSync(CHUNKS).filter((name) => name.endsWith(".json"))) fs.unlinkSync(path.join(CHUNKS, old));
  const index = [];
  const files = [];
  for (let offset = 0; offset < cards.length; offset += CHUNK_SIZE) {
    const chunkNo = Math.floor(offset / CHUNK_SIZE);
    const file = `chunks/${String(chunkNo).padStart(3, "0")}.json`;
    const rows = cards.slice(offset, offset + CHUNK_SIZE);
    fs.writeFileSync(path.join(CATALOG, file), JSON.stringify(rows), "utf8");
    files.push({ file: `data/card-catalog/${file}`, count: rows.length, firstId: rows[0]?.id || null, lastId: rows.at(-1)?.id || null });
    for (const card of rows) {
      const completion = statusById[card.id];
      index.push({ id: card.id, name: card.name, model: card.model || null, rarity: card.rarity || null, variant: card.variant || null, setCode: card.setCode || null, cardNumber: card.cardNumber || null, language: card.language || "ja", chunk: chunkNo, status: completion.s, completionPct: completion.c, priority: completion.p, isNew: completion.n, siteNew: completion.n, recentRelease: completion.rr, relisted: completion.rl, releaseDate: completion.rd, releaseYear: completion.ry });
    }
  }
  const analysisCards = cards.filter((card) => statusById[card.id]?.s === "分析可能");
  fs.writeFileSync(path.join(CATALOG, "index.json"), JSON.stringify({ generatedAt, cards: index }), "utf8");
  fs.writeFileSync(path.join(CATALOG, "analysis.json"), JSON.stringify(analysisCards), "utf8");
  fs.writeFileSync(path.join(CATALOG, "manifest.json"), JSON.stringify({ version: 1, generatedAt, totalCards: cards.length, analysisCards: analysisCards.length, chunkSize: CHUNK_SIZE, files }), "utf8");
  fs.writeFileSync(path.join(DATA, "card-catalog-completion.json"), JSON.stringify({ version: 2, generatedAt, summary, itemTotals, dataTypeTotals, cards: statusById, unlistedIds: sourceMissing, duplicateIds }), "utf8");
  fs.writeFileSync(path.join(__dirname, "card-completion-queue.json"), JSON.stringify({
    version: 3,
    generatedAt,
    itemSchema: ["status", "lastAttemptAt", "lastSuccessAt", "retryCount", "failureReason", "nextRetryAt"],
    sourceByItem: {
      domesticPrice: "みんトレ", domesticTrades: "みんトレ", psa10Price: "みんトレ／スニダン",
      psa10Trades: "みんトレ／スニダン", rawActualSales: "PokeDATA／個別成約", psa10ActualSales: "PokeDATA／個別成約", psa9Sales: "PokeDATA／個別成約", psa9Aggregate: "みんトレ／スニダン", psaOfficial: "PSA公式",
      shopStateA: "国内ショップ", buyback: "Web買取表", pokedata: "PokeDATA",
      release: "セット発売日マスタ", identity: "みんトレ",
    },
    summary,
    itemTotals,
    dataTypeTotals,
    cards: queueCards,
    queue: queue.map((row) => row.id),
  }), "utf8");
  console.log(JSON.stringify({ summary, itemTotals, chunkFiles: files.length }, null, 2));
}

main();
