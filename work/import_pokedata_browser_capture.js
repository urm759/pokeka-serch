const fs = require("fs");
const path = require("path");
const { analyzeSales } = require("./pokedata_analysis.js");
const { loadSetState, writeSetState } = require("./pokedata_storage.js");

const ROOT = path.join(__dirname, "..");
const CAPTURES = path.join(__dirname, "pokedata-browser-captures.json");
const CACHE = path.join(__dirname, "pokedata-page-cache.json");
const SUMMARY = path.join(ROOT, "data", "pokedata-summary.json");
const SALES_DIR = path.join(ROOT, "data", "pokedata-sales");
const LINK_COVERAGE = path.join(ROOT, "data", "link-coverage.json");

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")); } catch { return fallback; }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value), "utf8");
  fs.renameSync(temporary, file);
}

function normalizeName(value) {
  return String(value || "").normalize("NFKC").toLowerCase()
    .replace(/[’‘]/g, "'").replace(/[^a-z0-9'\u3040-\u30ff\u3400-\u9fff]+/g, " ").trim();
}

function nameTokens(name) {
  const ignored = new Set(["pokemon", "card", "japanese", "the", "ex", "v", "vmax", "vstar"]);
  return normalizeName(name).split(/\s+/).filter((token) => token.length >= 2 && !ignored.has(token)).slice(0, 4);
}

function priceJpy(value) {
  const parsed = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function listingId(row) {
  return String(row.listing || row.links?.[0]?.text || "").match(/eBay:\s*(\d+)/i)?.[1] || null;
}

function seller(row) {
  return row.links?.find((link) => /\/usr\//.test(link.href || ""))?.text || null;
}

function capturedRows(card) {
  return (card.rows || []).map((row, index) => {
    const price = priceJpy(row.priceText);
    const id = listingId(row);
    return {
      rowId: `browser:${card.id}:${id || `${row.dateSold}:${index}`}`,
      ebay_item_id: id,
      listingUrl: row.links?.find((link) => /\/itm\//.test(link.href || ""))?.href || null,
      date_sold: row.dateSold || null,
      title: row.title && row.title !== "none" ? row.title : null,
      psa_grade: row.grade || null,
      sold_price: price,
      priceParseFailed: Boolean(row.priceText) && price == null,
      displayCurrency: card.displayCurrency || "JPY",
      marketplace: card.sourceMarket || "eBay",
      seller: seller(row),
      observedAt: card.observedAt || null,
    };
  });
}

function priorRows(localCardId) {
  const prior = readJson(path.join(SALES_DIR, `${localCardId}.json`), null);
  if (!prior?.rows?.length) return [];
  return prior.rows.map((row) => ({
    rowId: row.rowId,
    ebay_item_id: row.listingId,
    listingUrl: row.listingUrl,
    date_sold: row.date,
    title: row.title,
    psa_grade: row.displayedGrade,
    sold_price: row.priceJpy,
    displayCurrency: row.displayCurrency || "JPY",
    marketplace: row.marketplace || "eBay",
    seller: row.seller || null,
    observedAt: row.observedAt || prior.capturedAt,
  }));
}

function comparison(overseasJpy, domesticJpy) {
  if (!(overseasJpy > 0) || !(domesticJpy > 0)) return { differenceJpy: null, ratio: null };
  return { differenceJpy: Math.round(overseasJpy - domesticJpy), ratio: Math.round(overseasJpy / domesticJpy * 1000) / 1000 };
}

function status(summary) {
  if (summary.adoptedCount >= 8) return "認証済み画面の実成約をクリーニング済み";
  if (summary.adoptedCount >= 3) return `実成約少数（採用 ${summary.adoptedCount}件）`;
  if (summary.originalCount > 0) return `信頼度不足（採用 ${summary.adoptedCount}件）`;
  return "実成約未取得";
}

function market(existing, summary, domesticPrice) {
  return {
    ...(existing || {}),
    aggregateSource: "PokeDATA authenticated Chrome transaction table / eBay",
    priceSource: "actual-sale",
    sourceCurrency: "PokeDATA表示JPY",
    individualSalesStatus: status(summary),
    usableIndividualMedian: summary.adoptedCount >= 3,
    decisionUsage: "海外相場は参考表示のみ・国内仕入れ判断へ未反映",
    ...summary,
    comparisonToDomestic: comparison(summary.medianJpy || existing?.apiAverageJpy, domesticPrice),
  };
}

function missingCauseAudit(card, rows, publicRows) {
  const browserByListing = new Map(rows.map((row) => [String(row.ebay_item_id || ""), row]).filter(([id]) => id));
  let matchedRows = 0;
  let retrievalMethodIssue = 0;
  let publicPricePresent = 0;
  for (const row of publicRows) {
    const publicHasPrice = row.sold_price != null && Number.isFinite(Number(row.sold_price)) && Number(row.sold_price) > 0;
    if (publicHasPrice) publicPricePresent += 1;
    const browserRow = browserByListing.get(String(row.ebay_item_id || ""));
    if (!browserRow) continue;
    matchedRows += 1;
    if (!publicHasPrice && Number.isFinite(browserRow.sold_price)) retrievalMethodIssue += 1;
  }
  const formatParseFailure = rows.filter((row) => row.priceParseFailed).length;
  const sourcePriceMissing = rows.filter((row) => row.sold_price == null && !row.priceParseFailed).length;
  const titleUnavailable = rows.filter((row) => !row.title).length;
  return {
    method: "authenticated-browser-dom",
    pageReportedTransactions: Number(card.reportedTotal || rows.length),
    browserRowsCaptured: rows.length,
    browserPricedRows: rows.filter((row) => Number.isFinite(row.sold_price)).length,
    captureCoveragePct: card.reportedTotal ? Math.round(rows.length / card.reportedTotal * 10000) / 100 : null,
    publicApiRows: publicRows.length,
    publicApiPricePresent: publicPricePresent,
    publicApiPriceMissing: publicRows.length - publicPricePresent,
    matchedRows,
    missingCauseCounts: {
      "取得方法の問題（未認証APIまたはページ範囲）": retrievalMethodIssue || Math.max(0, publicRows.length - publicPricePresent),
      "元データ価格欠損": sourcePriceMissing,
      "価格形式解析失敗": formatParseFailure,
      "商品名確認不能": titleUnavailable,
    },
    conclusion: sourcePriceMissing > 0 || formatParseFailure > 0
      ? "認証画面でも一部価格を取得できない"
      : "認証画面では価格取得可能。公開APIの価格マスクとページ範囲が主因",
    observedAt: card.observedAt || null,
  };
}

function main() {
  const capture = readJson(CAPTURES, { cards: [] });
  if (!capture.cards?.length) throw new Error("No authenticated browser captures found");
  const summary = readJson(SUMMARY, { version: 2, linkage: { records: [] } });
  const cache = readJson(CACHE, { entries: {} });
  const domestic = new Map(readJson(path.join(ROOT, "data", "pokemon-cards.json"), []).map((card) => [card.id, card]));
  const setNames = [...new Set(capture.cards.map((card) => card.setName).filter(Boolean))];
  const report = [];

  for (const setName of setNames) {
    const stored = loadSetState(ROOT, setName, summary);
    const cards = { ...stored.cards };
    const captures = capture.cards.filter((card) => card.setName === setName);
    let imported = 0;
    for (const captureCard of captures) {
      const detailEntry = Object.entries(cards).find(([localCardId, detail]) =>
        Number(detail?.pokedata?.pokedataCardId) === Number(captureCard.id) || localCardId === captureCard.localId);
      if (!detailEntry) continue;
      const [localCardId, detail] = detailEntry;
      const freshRows = capturedRows(captureCard);
      const savedRows = priorRows(localCardId);
      const rows = savedRows.length > freshRows.length ? savedRows : freshRows;
      const analysis = analyzeSales(rows, {
        number: captureCard.number,
        setAliases: [setName, detail.pokedata?.setCode || "SV9"],
        nameTokens: nameTokens(captureCard.name),
      }, Number(detail.fx?.rate || 1));
      const publicRows = cache.entries?.[String(captureCard.id)]?.data?.transactions || [];
      const local = domestic.get(localCardId) || {};
      detail.localCardName ||= local.name || null;
      detail.sourceMode = "認証済みChrome実成約 + PokeDATA公開集計";
      detail.capturedAt = captureCard.observedAt || capture.updatedAt || new Date().toISOString();
      detail.markets = {
        ...(detail.markets || {}),
        ebayRaw: market(detail.markets?.ebayRaw, analysis.summaries.raw, local.price),
        ebayPsa10: market(detail.markets?.ebayPsa10, analysis.summaries.psa10, local.snkPsa10Price),
        ebayPsa9: market(detail.markets?.ebayPsa9, analysis.summaries.psa9, local.snkPsa9Price || local.price),
      };
      detail.acquisitionAudit = missingCauseAudit(captureCard, rows, publicRows);
      detail.acquisitionAudit.classificationCounts = analysis.classified.reduce((counts, row) => {
        counts[row.reviewClass] = (counts[row.reviewClass] || 0) + 1;
        return counts;
      }, { "auto-matched": 0, ambiguous: 0, "out-of-scope": 0, unverifiable: 0 });
      detail.confidence = analysis.summaries.raw.adoptedCount >= 8 || analysis.summaries.psa10.adoptedCount >= 8 ? "中" : "参考値";
      detail.referenceOnly = true;
      detail.limitImpact = "仕入れ上限へ未反映";
      cards[localCardId] = detail;
      writeJson(path.join(SALES_DIR, `${localCardId}.json`), {
        version: 2,
        capturedAt: detail.capturedAt,
        sourceUrl: detail.sourceUrl,
        localCardId,
        pokedataCardId: Number(captureCard.id),
        displayCurrency: "JPY",
        reportedTotal: Number(captureCard.reportedTotal || rows.length),
        totalRows: rows.length,
        acquisitionAudit: detail.acquisitionAudit,
        summaries: analysis.summaries,
        rows: analysis.classified,
      });
      imported += 1;
    }

    for (const detail of Object.values(cards)) {
      if (detail.acquisitionAudit) continue;
      const sourceId = String(detail.pokedata?.pokedataCardId || "");
      const publicRows = cache.entries?.[sourceId]?.data?.transactions || [];
      const publicPricePresent = publicRows.filter((row) =>
        row.sold_price != null && Number.isFinite(Number(row.sold_price)) && Number(row.sold_price) > 0).length;
      detail.acquisitionAudit = {
        method: "public-api-unvalidated",
        pageReportedTransactions: null,
        browserRowsCaptured: 0,
        browserPricedRows: 0,
        captureCoveragePct: null,
        publicApiRows: publicRows.length,
        publicApiPricePresent: publicPricePresent,
        publicApiPriceMissing: publicRows.length - publicPricePresent,
        matchedRows: 0,
        missingCauseCounts: {
          "取得方法の問題（未認証APIまたはページ範囲）": publicRows.length - publicPricePresent,
          "元データ価格欠損": null,
          "価格形式解析失敗": 0,
          "商品名確認不能": publicRows.filter((row) => !row.title || row.title === "none").length,
        },
        conclusion: "認証済みChrome画面の実価格検証待ち",
        observedAt: null,
      };
    }

    const details = Object.values(cards);
    const acquisition = {
      linkedCards: details.length,
      browserValidatedCards: details.filter((detail) => detail.acquisitionAudit?.method === "authenticated-browser-dom").length,
      browserPricedCards: details.filter((detail) => detail.acquisitionAudit?.browserPricedRows > 0).length,
      browserCapturedRows: details.reduce((sum, detail) => sum + Number(detail.acquisitionAudit?.browserRowsCaptured || 0), 0),
      browserPricedRows: details.reduce((sum, detail) => sum + Number(detail.acquisitionAudit?.browserPricedRows || 0), 0),
      pageReportedTransactions: details.reduce((sum, detail) => sum + Number(detail.acquisitionAudit?.pageReportedTransactions || 0), 0),
      publicApiPricePresent: details.reduce((sum, detail) => sum + Number(detail.acquisitionAudit?.publicApiPricePresent || 0), 0),
      publicApiMaskedRows: details.reduce((sum, detail) => sum + Number(detail.acquisitionAudit?.publicApiPriceMissing || 0), 0),
      titleUnavailableRows: details.reduce((sum, detail) => sum + Number(detail.acquisitionAudit?.missingCauseCounts?.["商品名確認不能"] || 0), 0),
      sourcePriceMissingRows: details.reduce((sum, detail) => sum + Number(detail.acquisitionAudit?.missingCauseCounts?.["元データ価格欠損"] || 0), 0),
      formatParseFailureRows: details.reduce((sum, detail) => sum + Number(detail.acquisitionAudit?.missingCauseCounts?.["価格形式解析失敗"] || 0), 0),
      adoptedRawRows: details.reduce((sum, detail) => sum + Number(detail.markets?.ebayRaw?.adoptedCount || 0), 0),
      adoptedPsa10Rows: details.reduce((sum, detail) => sum + Number(detail.markets?.ebayPsa10?.adoptedCount || 0), 0),
      adoptedPsa9Rows: details.reduce((sum, detail) => sum + Number(detail.markets?.ebayPsa9?.adoptedCount || 0), 0),
      classificationCounts: details.reduce((totals, detail) => {
        Object.entries(detail.acquisitionAudit?.classificationCounts || {}).forEach(([key, count]) => {
          totals[key] = (totals[key] || 0) + Number(count || 0);
        });
        return totals;
      }, { "auto-matched": 0, ambiguous: 0, "out-of-scope": 0, unverifiable: 0 }),
      usableRawMedianCards: details.filter((detail) => detail.markets?.ebayRaw?.usableIndividualMedian).length,
      usablePsa10MedianCards: details.filter((detail) => detail.markets?.ebayPsa10?.usableIndividualMedian).length,
      usablePsa9MedianCards: details.filter((detail) => detail.markets?.ebayPsa9?.usableIndividualMedian).length,
      actualPriceCoveragePct: details.length ? Math.round(details.filter((detail) => detail.acquisitionAudit?.browserPricedRows > 0).length / details.length * 10000) / 100 : null,
      updatedAt: new Date().toISOString(),
    };
    summary.updatedAt = acquisition.updatedAt;
    summary.coverage = { ...(summary.coverage || {}), browserValidatedCards: acquisition.browserValidatedCards, actualPriceCoveragePct: acquisition.actualPriceCoveragePct };
    summary.crawl = { ...(summary.crawl || {}), ...acquisition };
    writeSetState(ROOT, summary, {
      setName,
      setCode: stored.entry?.setCode || details.find((detail) => detail.pokedata?.setCode)?.pokedata?.setCode || null,
      cards,
      records: stored.records,
      sourceCount: stored.entry?.sourceCount || stored.records.length,
      updatedAt: acquisition.updatedAt,
      status: "set-linked-individual-sales-partial",
      acquisition,
    });
    const coverage = readJson(LINK_COVERAGE, {});
    coverage.overseasSources ||= {};
    coverage.overseasSources.pokedata = {
      ...(coverage.overseasSources.pokedata || {}),
      browserValidatedCards: acquisition.browserValidatedCards,
      usableRawMedianCards: acquisition.usableRawMedianCards,
      usablePsa10MedianCards: acquisition.usablePsa10MedianCards,
      usablePsa9MedianCards: acquisition.usablePsa9MedianCards,
      actualPriceCoveragePct: acquisition.actualPriceCoveragePct,
      acquisitionUpdatedAt: acquisition.updatedAt,
      acquisitionStatus: acquisition.browserValidatedCards >= acquisition.linkedCards ? "complete" : "partial",
    };
    writeJson(LINK_COVERAGE, coverage);
    report.push({ setName, imported, ...acquisition });
  }
  console.log(JSON.stringify({ status: "success", sets: report }));
}

if (require.main === module) main();

module.exports = { capturedRows, missingCauseAudit, priceJpy };
