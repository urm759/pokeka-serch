const fs = require("fs");
const path = require("path");
const { productMatchesCard, stateFromTitle, parseProductPage: parseHareruya } = require("./update_hareruya2_stock.js");
const { parseProductPage: parseCardrush } = require("./update_cardrush_stock.js");
const { updateRun, appendRunHistory } = require("./source_observability.js");
const ROOT = path.join(__dirname, "..");
const read = (file, fallback = {}) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8")); } catch { return fallback; } };
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), JSON.stringify(value));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rarity = (name) => String(name || "").toUpperCase().match(/\b(MUR|BWR|SSR|CSR|CHR|SAR|UR|HR|SR|RRR|RR|AR)\b/)?.[1] || null;

function exactIdentity(card, product) {
  const name = String(product.title || "").replace(/〔/g, "【").replace(/〕/g, "】");
  const converted = { ...product, title: name.replace(/\{([^}]*\/[0-9]+)\}/g, "〈$1〉").replace(/【(MUR|BWR|SSR|CSR|CHR|SAR|UR|HR|SR|RRR|RR|AR)】/g, "($1)") };
  return stateFromTitle(name) === "A" && productMatchesCard(card, converted)
    && (!rarity(card.name) || rarity(card.name) === rarity(name))
    && (!/[:：]\s*SA\b/i.test(card.name) || /\bSA\b|スペシャルアート/i.test(name))
    && !/PSA|BGS|CGC|TAG|ACE|英語版|韓国版|未開封|セット商品/i.test(name);
}

function shopifyQuote(product, html, url) {
  // Shopify Ajax /products/*.js uses cents, unlike /products.json collection prices.
  const variants = (product.variants || []).filter((row) => stateFromTitle(row.title || "") === "A");
  const prices = variants.map((row) => Number(row.price) / 100).filter((value) => Number.isFinite(value) && value > 0);
  if (!prices.length) return null;
  const available = variants.some((row) => row.available === true);
  const page = html ? parseHareruya(html, url) : null;
  return { price: Math.min(...prices), stock: available ? page?.stock ?? null : 0, available };
}

function provenanceOnly() {
  let corrected = 0;
  const cards = read("data/pokemon-cards.json", []);
  for (const id of ["cardrush", "hareruya2"]) {
    const catalog = read(`work/${id}_catalog.json`, []);
    const byUrl = new Map(catalog.map((entry) => [entry.detailUrl, entry]));
    const byId = new Map(catalog.map((entry) => [entry.cardId, entry]));
    const data = read(`data/${id}-stock-summary.json`);
    for (const card of cards) {
      if (!data.cards?.[card.id]) continue;
      const entry = byId.get(card.id) || byUrl.get(card[`${id}Url`]);
      if (data.cards[card.id].updatedAt === undefined) {
        data.cards[card.id].updatedAt = entry?.observedAt || null; corrected += 1;
      }
    }
    write(`data/${id}-stock-summary.json`, data);
  }
  write("work/shop-provenance-correction.json", { at: new Date().toISOString(), corrected,
    baselineAt: read("work/acquisition-audit-baseline.json").at || null,
    reason: "全体の更新日をカード価格日に転用せず、各カタログの実観測日を使用。価格そのものは変更しない。" });
  console.log(JSON.stringify({ corrected, acquired: 0, mode: "provenance-only" }));
}

async function main() {
  if (process.argv.includes("--provenance-only")) return provenanceOnly();
  const sourceId = process.argv[2] || "hareruya2";
  if (!["cardrush", "hareruya2"].includes(sourceId)) throw new Error("Unsupported source");
  const cards = read("data/pokemon-cards.json", []);
  const baseline = read("work/acquisition-audit-baseline.json");
  const rows = baseline.availability?.rows || read("work/candidate-availability-history.json").runs?.at(-1)?.rows || {};
  const catalog = read(`work/${sourceId}_catalog.json`, []);
  const summary = read(`data/${sourceId}-stock-summary.json`);
  const history = read(`work/${sourceId}_stock_history.json`, { dates: [], stocks: {} });
  const cache = read("work/candidate-shop-refresh.json", { sources: {}, checkpoints: {} });
  cache.sources ||= {}; cache.checkpoints ||= {};
  const checkpoint = cache.checkpoints[sourceId] || { completedIds: [] };
  if (checkpoint.sourceBlocked && process.env.CANDIDATE_SHOP_RETRY_BLOCKED !== "1") {
    console.log(JSON.stringify({ status: "manual-wait", attemptedCount: 0, stopReason: checkpoint.sourceBlocked, nextId: checkpoint.nextId })); return;
  }
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
  const completed = new Set(!checkpoint.cycleDate || checkpoint.cycleDate === today ? checkpoint.completedIds || [] : []);
  const manualWait = checkpoint.manualWait || {};
  const candidates = cards.filter((card) => rows[card.id]?.status === "価格待ち" && card[`${sourceId}Url`])
    .sort((a, b) => Number(Boolean(rows[a.id].offerPrice)) - Number(Boolean(rows[b.id].offerPrice)) || (rows[a.id].gap ?? 0) - (rows[b.id].gap ?? 0));
  const pending = candidates.filter((card) => !completed.has(card.id) && manualWait[card.id]?.url !== card[`${sourceId}Url`]);
  const batch = pending.slice(0, Math.max(1, Number(process.env.CANDIDATE_SHOP_BATCH || 30)));
  const start = Date.now();
  const run = { startedAt: new Date(start).toISOString(), status: "running", attemptedCount: 0, refreshedCount: 0,
    newAcquiredCount: 0, newLinkedCount: 0, changedCount: 0, failedCount: 0, httpRequests: 0,
    candidateTargets: candidates.length, previouslyCompleted: completed.size, records: [], stopReason: null };
  const byUrl = new Map(catalog.map((entry) => [entry.detailUrl, entry]));
  const byId = new Map(catalog.map((entry) => [entry.cardId, entry]));
  const save = () => {
    run.endedAt = new Date().toISOString(); run.durationMs = Date.now() - start;
    run.nextId = candidates.find((card) => !completed.has(card.id) && manualWait[card.id]?.url !== card[`${sourceId}Url`])?.id || null;
    run.remaining = candidates.filter((card) => !completed.has(card.id)).length;
    run.manualWaitCount = Object.keys(manualWait).length;
    cache.sources[sourceId] = run;
    cache.checkpoints[sourceId] = { completedIds: [...completed], nextId: run.nextId, baselineAt: baseline.at,
      cycleDate: today, manualWait, sourceBlocked: run.sourceBlocked || checkpoint.sourceBlocked || null };
    write(`work/${sourceId}_catalog.json`, catalog);
    write(`data/${sourceId}-stock-summary.json`, summary);
    write(`work/${sourceId}_stock_history.json`, history);
    write("work/candidate-shop-refresh.json", cache);
  };
  async function request(url) {
    for (let retry = 0; retry < 3; retry += 1) {
      run.httpRequests += 1;
      const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "User-Agent": "PokemonSourcingAudit/1.0" } });
      if ([429, 500, 502, 503, 504].includes(response.status) && retry < 2) { await sleep(2000 * 2 ** retry); continue; }
      if (!response.ok) { const error = new Error(`HTTP ${response.status}`); error.status = response.status; throw error; }
      return response;
    }
  }
  for (const card of batch) {
    if (Date.now() - start > Number(process.env.CANDIDATE_SHOP_TIME_MS || 240000)) { run.stopReason = "時間上限・保存して安全停止"; break; }
    const url = card[`${sourceId}Url`];
    const record = { id: card.id, url, startedAt: new Date().toISOString(), status: "pending", error: null };
    run.attemptedCount += 1;
    try {
      let quote, name;
      if (sourceId === "hareruya2") {
        const product = await (await request(`${url}.js`)).json();
        name = product.title;
        if (!exactIdentity(card, product)) throw new Error("同一カード・番号・セット・レアリティ・仕様の一致を確認できない");
        const available = product.variants?.some((row) => row.available === true);
        const html = available ? await (await request(url)).text() : null;
        quote = shopifyQuote(product, html, url);
      } else {
        const page = parseCardrush(await (await request(url)).text(), url);
        name = page.title;
        if (!page.valid || !exactIdentity(card, { title: name })) throw new Error("商品形式または同一カードの一致を確認できない");
        quote = { price: page.price, stock: page.stock, available: Number(page.stock) > 0 };
      }
      if (!quote || !Number.isFinite(quote.price) || !(quote.price > 0)) throw new Error("実価格を解析できない");
      let entry = byId.get(card.id) || byUrl.get(url);
      const oldPrice = entry?.price ?? null, oldStock = entry?.stock ?? null;
      if (!entry) { entry = { cardId: card.id, detailUrl: url }; catalog.push(entry); byId.set(card.id, entry); byUrl.set(url, entry); run.newAcquiredCount += 1; }
      Object.assign(entry, { name, ...quote, state: "A", observedAt: run.endedAt = new Date().toISOString(), identityVerifiedAt: new Date().toISOString() });
      const previous = summary.cards?.[card.id] || {};
      summary.cards ||= {};
      summary.cards[card.id] = { ...previous, [`${sourceId}Price`]: quote.price, stock: quote.stock, available: quote.available,
        updatedAt: entry.observedAt, conditionAccepted: true, identityVerifiedAt: entry.identityVerifiedAt };
      // Do not fabricate a quantity from the boolean 'available' field.
      if (Number.isFinite(quote.stock)) {
        if (!history.dates.includes(today)) { history.dates.push(today); for (const values of Object.values(history.stocks)) values.push(null); }
        history.stocks[card.id] ||= Array(history.dates.length).fill(null);
        while (history.stocks[card.id].length < history.dates.length) history.stocks[card.id].push(null);
        history.stocks[card.id][history.dates.indexOf(today)] = quote.stock;
      }
      run.refreshedCount += 1;
      if (oldPrice !== quote.price || oldStock !== quote.stock) run.changedCount += 1;
      record.status = "verified"; Object.assign(record, { price: quote.price, stock: quote.stock, available: quote.available, oldPrice, oldStock });
      completed.add(card.id);
      run.lastSuccessAt = entry.observedAt;
    } catch (error) {
      run.failedCount += 1; record.status = "failed"; record.error = error.message; record.httpStatus = error.status || null;
      run.stopReason = `${card.id}: ${error.message}`;
      // Protected access, identity ambiguity and format changes require a human, never a proxy fallback.
      if ([401, 403].includes(error.status)) { run.status = "manual-wait"; run.sourceBlocked = run.stopReason; }
      else if (error.status === 404 || !error.status && !/timeout|fetch failed|aborted/i.test(error.message)) {
        manualWait[card.id] = { url, reason: error.message, checkedAt: new Date().toISOString() };
        record.status = "manual-wait";
        run.stopReason = null;
      }
    }
    run.records.push(record); save();
    if (run.stopReason) break;
    await sleep(Math.max(1000, Number(process.env.CANDIDATE_SHOP_INTERVAL_MS || 1200)));
  }
  run.status = run.status === "manual-wait" ? run.status : run.refreshedCount ? "partial" : run.stopReason ? "failed" : "no-progress";
  save();
  const tracked = updateRun(sourceId, { ...run, lastAttemptAt: run.startedAt, acquiredCount: catalog.length, updatedCount: run.changedCount,
    fetchFailureCount: run.failedCount, lastError: run.stopReason, sourceState: `${run.refreshedCount}件の状態A実価格を再確認・新規紐づけ${run.newLinkedCount}件・${run.status}`,
    ...(run.lastSuccessAt ? { lastSuccessAt: run.lastSuccessAt } : {}) });
  appendRunHistory(sourceId, tracked);
  console.log(JSON.stringify(run));
}
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { exactIdentity, shopifyQuote };
