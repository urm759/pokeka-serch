const fs = require("fs");
const path = require("path");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("C:/Users/polar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
}

const MANIFEST_PATH = path.join(__dirname, "psa_set_urls.json");
const STANDALONE_ROOT = path.join(__dirname, "..");
const SITE_ROOT = fs.existsSync(path.join(STANDALONE_ROOT, "index.html"))
  ? STANDALONE_ROOT
  : path.join(STANDALONE_ROOT, "outputs", "github-site");
const OUTPUT_DIR = path.join(SITE_ROOT, "data");
const OUTPUT_JSON = path.join(OUTPUT_DIR, "psa-official-populations.json");
const OUTPUT_JS = path.join(OUTPUT_DIR, "psa-official-populations.js");
const PRIORITY_QUEUE_PATH = process.env.PSA_PRIORITY_QUEUE_PATH || path.join(__dirname, "psa_priority_queue.json");
const MIN_TOTAL_POPULATION = Number(process.env.PSA_MIN_TOTAL_POPULATION || 0);
const MAX_PAGES = Number(process.env.PSA_MAX_PAGES || 200);
const CDP_ENDPOINT = String(process.env.PSA_CDP_ENDPOINT || "").trim();
const CHROME_EXECUTABLE =
  process.env.CHROME_EXECUTABLE_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";

const HEADLESS = String(process.env.PSA_HEADLESS || "1") !== "0";
const USER_DATA_DIR = process.env.PSA_USER_DATA_DIR || path.join(process.env.LOCALAPPDATA || __dirname, "PokekaPSAChromeProfile");
let priorityCards = new Set();

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function parseNumber(value) {
  const m = String(value || "").replace(/[,\s]/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function extractSetCode(name) {
  const match = String(name || "").match(/Pokemon Japanese\s+(.+?)$/i);
  if (!match) return "";
  return match[1].trim().replace(/\s+/g, " ").toUpperCase();
}

function buildPsaQuery(setCode, cardNo) {
  const cleanCardNo = String(cardNo || "").replace(/^#/, "").trim();
  if (!setCode || !cleanCardNo) return null;
  return `Pokemon Japanese ${setCode} ${cleanCardNo}`;
}

function safeFileName(value) {
  return String(value || "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

function cleanCardName(value) {
  return String(value || "")
    .replace(/\bShop with Affiliates\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSinglePopulation(bodyText, titleText, setCode) {
  const text = String(bodyText || "").replace(/\u00a0/g, " ");
  const title = String(titleText || "");
  const cardNoMatch = title.match(/#\s*([0-9A-Za-z]+)/) || text.match(/#\s*([0-9A-Za-z]+)/);
  const cardNameMatch = title.match(/^\s*(.+?)\s+#\s*[0-9A-Za-z]+\s*$/m) || text.match(/\n([^\n#]+?)\s+#\s*[0-9A-Za-z]+\s*\n/);
  const totalMatch = text.match(/TOTAL POP\s*([\d,]+)/i);
  const grade10Match = text.match(/\b10\s*[\t ]+([\d,]+)/i) || text.match(/\b10\s+([\d,]+)/i);
  const cardNo = cardNoMatch ? String(cardNoMatch[1]).trim() : null;
  const cardName = cardNameMatch ? String(cardNameMatch[1]).trim() : null;
  const psaTotal = totalMatch ? parseNumber(totalMatch[1]) : null;
  const psa10Count = grade10Match ? parseNumber(grade10Match[1]) : null;
  const psa10Rate = Number.isFinite(psa10Count) && Number.isFinite(psaTotal) && psaTotal > 0 ? (psa10Count / psaTotal) * 100 : null;
  if (!cardNo || !cardName || psa10Count == null || psaTotal == null) return null;
  return {
    cardNo,
    cardName,
    psa10Count,
    psaTotal,
    psa10Rate,
    psaQuery: buildPsaQuery(setCode, cardNo),
  };
}

function inferTableMetrics(headers, cells) {
  const headerNorms = headers.map(normalizeText);
  const cellText = cells.map((cell) => String(cell || "").replace(/\s+/g, " ").trim());
  const hasLeadingControl = cellText.length >= 4 && !cellText[0] && Boolean(cellText[1]);
  const headerFor = (patterns) => headerNorms.findIndex((h) => patterns.some((p) => p.test(h)));
  const cardNoIndex = headerFor([/^CARD\s*NO\.?$/]);
  const cardNameIndex = headerFor([/^NAME$/]);
  const psa10HeaderIndex = headerFor([/^10$/, /^PSA\s*10$/, /^GEM\s*MINT\s*10$/]);
  const totalHeaderIndex = headerFor([/^TOTAL$/, /^POPULATION$/, /^ALL\s*GRADES$/]);
  const cardNo = hasLeadingControl ? cellText[1] : (cardNoIndex >= 0 ? cellText[cardNoIndex] : null);
  const cardName = cleanCardName(hasLeadingControl ? cellText[2] : (cardNameIndex >= 0 ? cellText[cardNameIndex] : null));
  const psa10Count = hasLeadingControl ? parseNumber(cellText.at(-2)) : (psa10HeaderIndex >= 0 ? parseNumber(cellText[psa10HeaderIndex]) : null);
  const psaTotal = hasLeadingControl ? parseNumber(cellText.at(-1)) : (totalHeaderIndex >= 0 ? parseNumber(cellText[totalHeaderIndex]) : null);
  const rate = Number.isFinite(psa10Count) && Number.isFinite(psaTotal) && psaTotal > 0 ? (psa10Count / psaTotal) * 100 : null;
  return { cardNo, cardName, psa10Count, psaTotal, psa10Rate: rate };
}

async function getTableSnapshot(page) {
  const tables = await page.evaluate(() =>
    [...document.querySelectorAll("table")].map((table, index) => ({
      index,
      id: table.id || "",
      className: table.className || "",
      headers: [...table.querySelectorAll("thead th")].map((th) => th.textContent || ""),
      // DataTables keeps earlier pages in the DOM. Only capture the displayed
      // rows so the pagination loop can also reach secret rares on later pages.
      rows: [...table.querySelectorAll("tbody tr")]
        .filter((tr) => {
          const style = window.getComputedStyle(tr);
          return style.display !== "none" && style.visibility !== "hidden";
        })
        .map((tr) =>
        [...tr.querySelectorAll(":scope > td")].map((td) => {
          const parts = [...td.children].map((child) => (child.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean);
          return (parts.length ? parts.join(" | ") : (td.textContent || "")).replace(/\s+/g, " ").trim();
        })
      ),
    }))
  );
  const roleRows = await page.evaluate(() =>
    [...document.querySelectorAll('[role="row"]')].map((row) =>
      [...row.querySelectorAll("td")].map((td) => {
        const parts = [...td.children].map((child) => (child.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean);
        return (parts.length ? parts.join(" | ") : (td.textContent || "")).replace(/\s+/g, " ").trim();
      })
    )
  );
  const roleHeaders = await page.evaluate(() =>
    [...document.querySelectorAll('[role="row"] th')].map((th) => (th.textContent || "").replace(/\s+/g, " ").trim())
  );
  const candidate = tables.find((table) => table.rows && table.rows.length > 0 && table.headers && table.headers.length > 0) || tables.find((table) => table.rows && table.rows.length > 0);
  if (candidate) return candidate;
  if (roleRows.some((row) => row.length > 0)) {
    return {
      index: -1,
      id: "",
      className: "",
      headers: roleHeaders,
      rows: roleRows.filter((row) => row.length > 0),
    };
  }
  return null;
}

async function collectSet(context, entry) {
  const page = await context.newPage();
  const result = {
    name: entry.name,
    kind: entry.kind,
    url: entry.url,
    fetchedAt: new Date().toISOString(),
    setCode: String(entry.setCode || extractSetCode(entry.name)).toUpperCase(),
    headingID: null,
    categoryID: null,
    rows: [],
    error: null,
  };

  try {
    await page.goto(entry.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(8000);

    if (page.url().includes("signin")) {
      throw new Error("PSA sign-in page opened instead of the set page. Use a Chrome profile that is already logged in to PSA.");
    }

    const bodyText = await page.locator("body").innerText({ timeout: 15000 });
    if (/私はロボットではありません|VERIFY YOU ARE HUMAN|CLOUDFLARE/i.test(`${await page.title()}\n${bodyText}`)) {
      throw new Error("PSA Cloudflare verification blocked the automated browser.");
    }
    const headingMatch =
      bodyText.match(/headingID\s*[:=]\s*["']?(\d+)/i) ||
      bodyText.match(/headingID=(\d+)/i) ||
      entry.url.match(/\/(\d+)(?:\?.*)?$/);
    const categoryMatch = bodyText.match(/categoryID\s*[:=]\s*["']?(\d+)/i) || bodyText.match(/categoryID=(\d+)/i);

    result.headingID = headingMatch ? Number(headingMatch[1]) : null;
    result.categoryID = categoryMatch ? Number(categoryMatch[1]) : null;

    const pageLength = page.locator('select[name="tablePSA_length"]');
    if (await pageLength.count().catch(() => 0)) {
      const options = await pageLength.locator("option").allTextContents({ timeout: 5000 }).catch(() => []);
      if (options.some((value) => value.trim() === "500")) {
        await pageLength.selectOption("500", { timeout: 10000 });
        await page.waitForTimeout(1200);
      }
    }

    let rows = [];
    let lastHeaders = [];
    const seen = new Set();
    for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
      const snapshot = await getTableSnapshot(page);
      if (!snapshot || !snapshot.rows || snapshot.rows.length === 0) break;
      lastHeaders = snapshot.headers || lastHeaders;
      for (const cells of snapshot.rows) {
        const inferred = inferTableMetrics(snapshot.headers, cells);
        const psaQuery = buildPsaQuery(result.setCode, inferred.cardNo);
        const row = {
          setName: entry.name,
          setCode: result.setCode,
          headingID: result.headingID,
          categoryID: result.categoryID,
          psaQuery,
          cardNo: inferred.cardNo,
          cardName: inferred.cardName,
          psa10Count: inferred.psa10Count,
          psaTotal: inferred.psaTotal,
          psa10Rate: inferred.psa10Rate,
          headers: snapshot.headers,
          cells,
        };
        const dedupeKey = `${row.cardNo || ""}::${row.cardName || ""}::${row.psaQuery || ""}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        rows.push(row);
      }

      const dataTableNext = page.locator("#tablePSA_next");
      if (!(await dataTableNext.count().catch(() => 0))) break;
      if (!(await dataTableNext.isVisible().catch(() => false))) break;
      const nextClass = await dataTableNext.getAttribute("class").catch(() => "disabled");
      if (/disabled/i.test(nextClass || "")) break;
      await page.locator("#spinner-wrap").waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
      // The PSA loading overlay can briefly cover the pagination control even
      // after the table is ready. A DOM click avoids losing the whole set.
      await dataTableNext.evaluate((element) => element.click());
      await page.waitForTimeout(2000);
    }

    if ((!rows || rows.length === 0) && entry.kind !== "pop") {
      const fallback = parseSinglePopulation(bodyText, await page.title(), result.setCode);
      if (fallback) {
        rows = [
          {
            setName: entry.name,
            setCode: result.setCode,
            headingID: result.headingID,
            categoryID: result.categoryID,
            psaQuery: fallback.psaQuery,
            cardNo: fallback.cardNo,
            cardName: fallback.cardName,
            psa10Count: fallback.psa10Count,
            psaTotal: fallback.psaTotal,
            psa10Rate: fallback.psa10Rate,
            headers: [],
            cells: [],
          },
        ];
      }
    }
    if (!rows || rows.length === 0) {
      throw new Error(`Unable to find a populated table for ${entry.url}`);
    }

    result.rows = rows.filter((row) => {
      if (!row.cardNo || row.cardNo.toUpperCase() === "TOTAL") return false;
      const key = `${String(result.setCode || "").toUpperCase()}|${String(row.cardNo).replace(/^0+(?=\d)/, "")}`;
      // High-priority legacy cards remain available even below the normal 500-pop cutoff.
      return Number(row.psaTotal || 0) >= MIN_TOTAL_POPULATION || priorityCards.has(key);
    });
    result.headers = lastHeaders;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  } finally {
    await page.close().catch(() => {});
  }

  return result;
}

async function main() {
  const fullManifest = readJson(MANIFEST_PATH, []);
  const priorityQueue = readJson(PRIORITY_QUEUE_PATH, { rows: [], orderedSets: [] });
  priorityCards = new Set((priorityQueue.rows || []).map((row) => `${String(row.setCode || "").toUpperCase()}|${String(row.cardNo || "").replace(/^0+(?=\d)/, "")}`));
  const priorityOrder = new Map((priorityQueue.orderedSets || []).map((entry, index) => [String(entry.setCode || "").toUpperCase(), index]));
  const filterPattern = String(process.env.PSA_SET_FILTER || "").trim();
  const filterRegex = filterPattern ? new RegExp(filterPattern, "i") : null;
  const selectedManifest = filterRegex
    ? fullManifest.filter((entry) => filterRegex.test(`${entry.setCode || ""} ${entry.name || ""}`))
    : fullManifest;
  // Current buyback candidates are processed first, so an interrupted run still
  // refreshes the cards most relevant to sourcing today.
  const manifest = [...selectedManifest].sort((a, b) => {
    const aOrder = priorityOrder.get(String(a.setCode || "").toUpperCase());
    const bOrder = priorityOrder.get(String(b.setCode || "").toUpperCase());
    return (aOrder ?? Number.MAX_SAFE_INTEGER) - (bOrder ?? Number.MAX_SAFE_INTEGER);
  });
  const previousPayload = readJson(OUTPUT_JSON, { rows: [] });
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error(`No PSA set manifest found at ${MANIFEST_PATH}`);
  }

  let browser = null;
  let context = null;
  let ownsContext = false;
  if (CDP_ENDPOINT) {
    browser = await chromium.connectOverCDP(CDP_ENDPOINT, { timeout: 30000 });
    context = browser.contexts()[0] || null;
    if (!context) throw new Error(`No Chrome context found at ${CDP_ENDPOINT}`);
    console.log(`connected to regular Chrome at ${CDP_ENDPOINT}`);
  } else {
    const launchOptions = { headless: HEADLESS };
    if (fs.existsSync(CHROME_EXECUTABLE)) {
      launchOptions.executablePath = CHROME_EXECUTABLE;
    }
    context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      ...launchOptions,
      viewport: { width: 1400, height: 1200 },
    });
    ownsContext = true;
  }

  const collected = [];
  try {
    for (const entry of manifest) {
      if (!entry || !entry.url) {
        collected.push({
          name: entry?.name || "",
          kind: entry?.kind || "pending",
          url: entry?.url || "",
          fetchedAt: new Date().toISOString(),
          setCode: extractSetCode(entry?.name || ""),
          headingID: null,
          categoryID: null,
          rows: [],
          error: entry?.note || "Skipped because the manifest URL is empty.",
        });
        continue;
      }

      const record = await collectSet(context, entry);
      collected.push(record);
      console.log(`${record.name}: ${record.rows.length} rows${record.error ? ` (warning: ${record.error})` : ""}`);
    }
  } finally {
    if (ownsContext) await context.close().catch(() => {});
  }

  const freshRows = collected.flatMap((set) => set.rows.map((row) => ({
    cardNo: row.cardNo,
    cardName: cleanCardName(row.cardName),
    psa10Count: row.psa10Count,
    psaTotal: row.psaTotal,
    psa10Rate: row.psa10Rate,
    setCode: set.setCode,
    sourceSet: set.name,
    sourceUrl: set.url,
    fetchedAt: set.fetchedAt,
  })));
  if (freshRows.length < (filterRegex ? 1 : 100)) {
    throw new Error("No reliable fresh PSA population data was collected. Existing data was preserved.");
  }
  const successfulUrls = new Set(collected.filter((set) => !set.error && set.rows.length).map((set) => set.url).filter(Boolean));
  const preservedRows = (previousPayload.rows || []).filter((row) => !successfulUrls.has(row.sourceUrl));
  const rows = [...freshRows, ...preservedRows];

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceManifest: MANIFEST_PATH,
    totalSets: fullManifest.length,
    collectedSets: collected.length,
    totalRows: rows.length,
    rows,
    sets: collected.map((set) => ({ name: set.name, url: set.url, fetchedAt: set.fetchedAt, setCode: set.setCode, rowCount: set.rows.length, error: set.error })),
  };

  writeJson(OUTPUT_JSON, payload);
  fs.writeFileSync(OUTPUT_JS, `window.PSA_OFFICIAL_POPULATIONS = ${JSON.stringify({ generatedAt: payload.generatedAt, totalRows: payload.totalRows })};`, "utf8");

  console.log(`wrote ${OUTPUT_JSON}`);
  console.log(`wrote ${OUTPUT_JS}`);

  const unresolved = collected.filter((set) => set.error);
  if (unresolved.length > 0) {
    console.log(`unresolved sets: ${unresolved.length}`);
    for (const set of unresolved) {
      console.log(`- ${set.name}: ${set.error}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
