const fs = require("fs");
const path = require("path");
const { canonicalIdentity } = require("./card_identity");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const CATALOG = path.join(DATA, "card-catalog");
const CHUNKS = path.join(CATALOG, "chunks");
const CHUNK_SIZE = Math.max(100, Number(process.env.CARD_CATALOG_CHUNK_SIZE || 250));
const NEW_DAYS = Math.max(1, Number(process.env.CARD_NEW_DAYS || 30));

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
  } : value]));
}

function main() {
  const generatedAt = new Date().toISOString();
  const cards = read("data/pokemon-cards.json", []);
  const inventory = read("work/toreca-source-inventory.json", { cards: [] });
  const diff = read("work/toreca_source_diff.json", { added: [] });
  const arrivals = read("work/card-new-arrivals.json", { cards: {} });
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
  const addedIds = new Set((diff.added || []).map((row) => String(row.id)));
  const pokedataIds = new Set((pokedata.sets || []).flatMap((set) => Array.isArray(set.localCardIds) ? set.localCardIds : String(set.localCardIds || "").split(/\s+/).filter(Boolean)));
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
  const summary = { total: cards.length, newCards: 0, analyzable: 0, completionInProgress: 0, dataShortage: 0, reviewRequired: 0 };
  const itemTotals = {};

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
    const isNew = Boolean((registeredArrival && daysSince(registeredArrival) <= NEW_DAYS) || card.isNew || addedIds.has(id)
      || firstSeenAt && firstSeenAt !== baselineFirstSeenAt && daysSince(firstSeenAt) <= NEW_DAYS);
    const shopFound = Boolean(card.cardrushUrl || card.hareruya2Url || card.yuyuteiUrl || card.torecacampUrl || cardrush.cards?.[id] || hareruya2.cards?.[id] || yuyutei.cards?.[id] || torecacamp.cards?.[id]);
    const buybackRow = buyback.cards?.[id];
    const official = psa.cards?.[id];
    const officialYear = String(official?.u || "").match(/\/(19|20)(\d{2})\//);
    const explicitYear = String(card.name || "").match(/(?:^|[^0-9])((?:19|20)\d{2})年/);
    const releaseKnown = Boolean(card.releaseDate || card.releaseYear || knownReleaseById.get(id)?.releaseYear || officialYear || explicitYear);
    const domesticPrice = finite(card.price) && card.price > 0;
    const domesticTx = finite(card.tv7) && finite(card.tv30);
    const psa10Price = finite(card.snkPsa10Price) && card.snkPsa10Price > 0;
    const psa10Tx = finite(card.p10tv7) && finite(card.p10tv30);
    const psa9Measured = finite(card.snkPsa9Price) && card.snkPsa9Price > 0;
    const entries = {
      domesticPrice: item(domesticPrice ? "取得済み" : "取得元にデータなし", "みんトレ", times.toreca, domesticPrice ? null : "美品価格の掲載なし"),
      domesticTrades: item(domesticTx ? "取得済み" : "取得元にデータなし", "みんトレ", times.toreca, domesticTx ? null : "取引件数の掲載なし"),
      psa10Price: item(psa10Price ? "取得済み" : "取得元にデータなし", "みんトレ／スニダン", times.toreca, psa10Price ? null : "PSA10相場の掲載なし"),
      psa10Trades: item(psa10Tx ? "取得済み" : "取得元にデータなし", "みんトレ／スニダン", times.toreca, psa10Tx ? null : "PSA10取引件数の掲載なし"),
      psa9Sales: item(psa9Measured ? "取得済み" : "取得待ち", "PokeDATA／個別成約", times.pokedata, psa9Measured ? null : "PSA9実成約を優先取得"),
      psaOfficial: item(official && finite(official.rate) ? "取得済み" : "取得待ち", "PSA公式", times.psa, official ? "TOTALまたはPSA10率が不足" : "公式Population未紐付け"),
      shopStateA: item(shopFound ? "取得済み" : "取得待ち", "国内ショップ", times.cardrush, shopFound ? null : "ショップ巡回・紐付け待ち"),
      buyback: item(buybackRow ? "取得済み" : "取得元にデータなし", "Web買取表", times.buyback, buybackRow ? null : "現在の買取表に掲載なし"),
      pokedata: item(pokedataIds.has(id) ? "取得済み" : "取得待ち", "PokeDATA", times.pokedata, pokedataIds.has(id) ? null : "対象セットの展開待ち"),
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
    const inProgress = values.some((entry) => ["取得待ち", "巡回中", "取得失敗", "再試行待ち"].includes(entry.status));
    const hardShortage = !domesticPrice || !domesticTx || !psa10Price || !psa10Tx || identity.reviewRequired;
    const buyback30 = Number(buybackRow?.total30 || 0);
    const buyback90 = Number(buybackRow?.total90 || 0);
    let priority = isNew ? 1000 : 0;
    priority += Math.min(300, buyback30 * 12 + buyback90 * 3);
    priority += Math.min(160, Number(card.tv30 || 0) * 2);
    priority += Math.min(160, Number(card.p10tv30 || 0) * 4);
    priority += Math.min(120, Number(card.snkPsa10Price || 0) / 2500);
    priority += !requiredReady ? 80 : 0;
    const reasons = [];
    if (isNew) reasons.push("新着カード");
    if (buyback30 > 0) reasons.push(`買取表30日${buyback30}日`);
    if (Number(card.tv30 || 0) >= 10) reasons.push(`美品取引30日${card.tv30}件`);
    if (Number(card.p10tv30 || 0) >= 5) reasons.push(`PSA10取引30日${card.p10tv30}件`);
    if (!requiredReady) reasons.push("仕入れ判断の必須項目が不足");
    if (!reasons.length) reasons.push("通常補完キュー");
    const classification = requiredReady ? "分析可能" : hardShortage ? "データ不足" : inProgress ? "データ補完中" : "データ不足";
    statusById[id] = {
      c: completionPct,
      s: classification,
      n: isNew ? 1 : 0,
      p: Math.round(priority),
      r: reasons.slice(0, 4),
      i: Object.fromEntries(Object.entries(entries).map(([key, entry]) => [key, entry.status])),
    };
    queueCards[id] = {
      c: completionPct,
      s: classification,
      n: isNew ? 1 : 0,
      p: Math.round(priority),
      r: reasons,
      i: Object.fromEntries(Object.entries(entries).map(([key, entry]) => [key, [
        entry.status,
        entry.lastAttemptAt,
        entry.lastSuccessAt,
        entry.retryCount,
        entry.failureReason,
      ]])),
    };
    queueRows.push({ id, name: card.name, classification, priority: Math.round(priority) });
    if (isNew) summary.newCards += 1;
    if (requiredReady) summary.analyzable += 1;
    if (inProgress) summary.completionInProgress += 1;
    if (classification === "データ不足") summary.dataShortage += 1;
    if (identity.reviewRequired) summary.reviewRequired += 1;
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
      index.push({ id: card.id, name: card.name, model: card.model || null, rarity: card.rarity || null, variant: card.variant || null, setCode: card.setCode || null, cardNumber: card.cardNumber || null, language: card.language || "ja", chunk: chunkNo, status: completion.s, completionPct: completion.c, priority: completion.p, isNew: completion.n });
    }
  }
  const analysisCards = cards.filter((card) => statusById[card.id]?.s === "分析可能");
  fs.writeFileSync(path.join(CATALOG, "index.json"), JSON.stringify({ generatedAt, cards: index }), "utf8");
  fs.writeFileSync(path.join(CATALOG, "analysis.json"), JSON.stringify(analysisCards), "utf8");
  fs.writeFileSync(path.join(CATALOG, "manifest.json"), JSON.stringify({ version: 1, generatedAt, totalCards: cards.length, analysisCards: analysisCards.length, chunkSize: CHUNK_SIZE, files }), "utf8");
  fs.writeFileSync(path.join(DATA, "card-catalog-completion.json"), JSON.stringify({ version: 1, generatedAt, summary, itemTotals, cards: statusById, unlistedIds: sourceMissing, duplicateIds }), "utf8");
  fs.writeFileSync(path.join(__dirname, "card-completion-queue.json"), JSON.stringify({
    version: 2,
    generatedAt,
    itemSchema: ["status", "lastAttemptAt", "lastSuccessAt", "retryCount", "failureReason"],
    sourceByItem: {
      domesticPrice: "みんトレ", domesticTrades: "みんトレ", psa10Price: "みんトレ／スニダン",
      psa10Trades: "みんトレ／スニダン", psa9Sales: "PokeDATA／個別成約", psaOfficial: "PSA公式",
      shopStateA: "国内ショップ", buyback: "Web買取表", pokedata: "PokeDATA",
      release: "セット発売日マスタ", identity: "みんトレ",
    },
    summary,
    itemTotals,
    cards: queueCards,
    queue: queue.map((row) => row.id),
  }), "utf8");
  console.log(JSON.stringify({ summary, itemTotals, chunkFiles: files.length }, null, 2));
}

main();
