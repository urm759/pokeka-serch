const fs = require("fs");
const path = require("path");
const retryPolicy = require("./acquisition_retry.js");
const { shortSet, normalizeNo, cleanName } = require("./build_psa_history.js");

function loadChromium() {
  try { return require("playwright").chromium; } catch (error) {
    if (process.env.PLAYWRIGHT_MODULE_PATH) return require(process.env.PLAYWRIGHT_MODULE_PATH).chromium;
    if (process.platform === "win32") {
      const bundled = path.join(process.env.USERPROFILE || "", ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules", "playwright");
      if (fs.existsSync(bundled)) return require(bundled).chromium;
    }
    throw new Error(`PSA browser dependency unavailable: ${error.code || error.message}`);
  }
}

const MANIFEST_PATH = process.env.PSA_MANIFEST_PATH || path.join(__dirname, "psa_set_urls.json");
const STANDALONE_ROOT = path.join(__dirname, "..");
const SITE_ROOT = fs.existsSync(path.join(STANDALONE_ROOT, "index.html"))
  ? STANDALONE_ROOT
  : path.join(STANDALONE_ROOT, "outputs", "github-site");
const OUTPUT_DIR = path.join(SITE_ROOT, "data");
const OUTPUT_JSON = path.join(OUTPUT_DIR, "psa-official-populations.json");
const OUTPUT_JS = path.join(OUTPUT_DIR, "psa-official-populations.js");
const PROGRESS_PATH = path.join(__dirname, "psa-fetch-progress.json");
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
  retryPolicy.atomicWrite(filePath, value);
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

function rowObjects(set) {
  return set.rows.map((row) => ({ cardNo: normalizeNo(row.cardNo), cardName: cleanCardName(row.cardName),
    psa10Count: row.psa10Count, psaTotal: row.psaTotal, psa10Rate: row.psa10Rate,
    setCode: shortSet(set.setCode), sourceSet: set.name, sourceUrl: set.url, fetchedAt: set.fetchedAt }));
}

function mergeRows(before, after) {
  const key = (row) => `${shortSet(row.setCode)}|${normalizeNo(row.cardNo)}|${cleanName(row.cardName)}`;
  const map = new Map(before.map((row) => [key(row), row]));
  let newCount = 0, changedCount = 0;
  for (const row of after) {
    const old = map.get(key(row));
    if (old && Number.isFinite(Date.parse(old.fetchedAt)) && !(Date.parse(row.fetchedAt) > Date.parse(old.fetchedAt))) continue;
    if (!old) newCount += 1;
    else if (old.psa10Count !== row.psa10Count || old.psaTotal !== row.psaTotal) changedCount += 1;
    map.set(key(row), row);
  }
  return { rows: [...map.values()], newCount, changedCount };
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
    const response = await page.goto(entry.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    result.httpStatus = response?.status() ?? null;
    if (result.httpStatus >= 400) throw new Error(`PSA HTTP ${result.httpStatus}; acquisition stopped without bypass.`);
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

    result.parsedRows = rows.length;
    result.rows = rows.filter((row) => {
      if (!row.cardNo || row.cardNo.toUpperCase() === "TOTAL") return false;
      if (!Number.isFinite(row.psaTotal) || row.psaTotal <= 0 || !Number.isFinite(row.psa10Count) || row.psa10Count < 0 || row.psa10Count > row.psaTotal) return false;
      const key = `${String(result.setCode || "").toUpperCase()}|${String(row.cardNo).replace(/^0+(?=\d)/, "")}`;
      // High-priority legacy cards remain available even below the normal 500-pop cutoff.
      return Number(row.psaTotal || 0) >= MIN_TOTAL_POPULATION || priorityCards.has(key);
    });
    result.excludedRows = rows.length - result.rows.length;
    result.headers = lastHeaders;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  } finally {
    await page.close().catch(() => {});
  }

  return result;
}

async function main() {
  const startedAt = new Date().toISOString();
  const checkpoint = readJson(PROGRESS_PATH, { completedUrls: [] });
  if (checkpoint.sourceRetry && !retryPolicy.eligible(checkpoint.sourceRetry)) {
    if (checkpoint.sourceRetry.kind !== "authentication" && checkpoint.sourceRetry.kind !== "access") throw new Error(`PSA待機期限未到達: ${checkpoint.sourceRetry.nextRetryAt || checkpoint.sourceRetry.reason}`);
  }
  const priorCompleted = new Set(checkpoint.completedUrls || []);
  const audit = { startedAt, endedAt: null, cycleDate: startedAt.slice(0, 10), status: "running", attemptedCount: 0,
    newAcquiredCount: 0, changedCount: 0, refreshedCount: 0, completedUrls: [...priorCompleted], records: [], nextUrl: null, stopReason: null,
    retryByUrl: checkpoint.retryByUrl || {}, lastSuccessAt: checkpoint.lastSuccessAt || null, authRecovery: null };
  const saveProgress = () => writeJson(PROGRESS_PATH, { ...audit, durationMs: Date.now() - Date.parse(startedAt) });
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
  const orderedManifest = [...selectedManifest].sort((a, b) => {
    const aOrder = priorityOrder.get(String(a.setCode || "").toUpperCase());
    const bOrder = priorityOrder.get(String(b.setCode || "").toUpperCase());
    return (aOrder ?? Number.MAX_SAFE_INTEGER) - (bOrder ?? Number.MAX_SAFE_INTEGER);
  });
  if (!filterRegex && orderedManifest.filter((entry) => entry.url).every((entry) => priorCompleted.has(entry.url))) priorCompleted.clear();
  audit.completedUrls = [...priorCompleted];
  audit.unregisteredSetCount = orderedManifest.filter((entry) => !entry.url).length;
  const focusSetUrls = new Set(priorityQueue.focusSetUrls || []);
  const pendingManifest = orderedManifest.filter((entry) => entry.url && (!priorCompleted.has(entry.url) || focusSetUrls.has(entry.url)) && retryPolicy.eligible(audit.retryByUrl[entry.url]));
  const manifest = require("./focus_monitor.js").fairBatch(pendingManifest, Math.max(1, Number(process.env.PSA_SET_BATCH || 8)), (entry) => focusSetUrls.has(entry.url), priorityQueue.maxFocusedShare ?? 0.4);
  audit.focusedSelected = manifest.filter((entry) => focusSetUrls.has(entry.url)).length;
  audit.normalSelected = manifest.length - audit.focusedSelected;
  audit.pendingSets = pendingManifest.length;
  audit.nextUrl = manifest[0]?.url || null;
  saveProgress();
  const previousPayload = readJson(OUTPUT_JSON, { rows: [] });
  if (!Array.isArray(orderedManifest) || orderedManifest.length === 0) {
    throw new Error(`No PSA set manifest found at ${MANIFEST_PATH}`);
  }
  const authPending = checkpoint.sourceRetry?.kind === "authentication" || checkpoint.sourceRetry?.kind === "access" || (checkpoint.status === "manual-wait" && /sign-in|401|403|Cloudflare|robot|verification|認証済みChrome/i.test(checkpoint.stopReason || ""));
  if (!manifest.length && !authPending) { audit.status = "no-progress"; audit.endedAt = new Date().toISOString(); audit.stopReason = "選択対象0件・URL未登録または個別再試行待ち。取得成功ではない"; saveProgress(); throw new Error(audit.stopReason); }

  let browser = null;
  let context = null;
  let ownsContext = false;
  try {
  const chromium = loadChromium();
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
  } catch (error) {
    audit.sourceRetry = retryPolicy.failure(checkpoint.sourceRetry, { error: error.message });
    audit.status = audit.sourceRetry.status; audit.stopReason = `Chrome接続工程: ${error.message}`;
    audit.endedAt = new Date().toISOString(); saveProgress(); throw error;
  }

  const collected = [];
  try {
    // A login click alone is not recovery. A real population table on a known URL must parse successfully.
    if (authPending) {
      const knownUrls = new Set((previousPayload.rows || []).map(row => row.sourceUrl).filter(Boolean));
      const probes = orderedManifest.filter(entry => entry.url && knownUrls.has(entry.url)).slice(0, 2);
      if (!probes.length && manifest[0]) probes.push(manifest[0]);
      let probeEntry, probe;
      for (const candidate of probes) {
        probeEntry = candidate; probe = await collectSet(context, candidate);
        if (!probe.error && Number(probe.parsedRows) > 0) break;
        const failure = retryPolicy.failure(audit.retryByUrl[candidate.url], { error: probe.error, httpStatus: probe.httpStatus });
        if (failure.scope === "source") break;
        audit.retryByUrl[candidate.url] = { ...failure, url: candidate.url, setCode: candidate.setCode };
      }
      if (!probe) throw new Error("PSA認証復帰確認用の登録済み正規URLなし");
      audit.authRecovery = { checkedAt: probe.fetchedAt, url: probeEntry.url, verified: !probe.error && Number(probe.parsedRows) > 0, error: probe.error || null };
      if (!audit.authRecovery.verified) {
        const policy = retryPolicy.classify({ error: probe.error, httpStatus: probe.httpStatus });
        audit.status = "manual-wait"; audit.stopReason = checkpoint.stopReason;
        audit.authRecovery.failureScope = policy.scope;
        audit.endedAt = new Date().toISOString(); saveProgress();
        throw new Error(`PSA認証の正規ページ確認未完了: ${probe.error}`);
      }
      delete audit.sourceRetry;
      audit.authRecovery.resumedFromCheckpoint = true;
      probeEntry.preverifiedRecord = probe;
      if (!manifest.includes(probeEntry)) manifest.unshift(probeEntry);
      saveProgress();
    }
    for (const entry of manifest) {
      if (Date.now() - Date.parse(startedAt) > Number(process.env.PSA_TIME_LIMIT_MS || 600000)) {
        audit.status = "partial"; audit.stopReason = "時間上限・安全停止"; break;
      }
      audit.nextUrl = entry.url || null;
      saveProgress();
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
        audit.records.push({ setCode: entry?.setCode, url: null, status: "url-unregistered", error: entry?.note || "セットURL未登録" });
        saveProgress();
        continue;
      }

      const record = entry.preverifiedRecord || await collectSet(context, entry);
      audit.attemptedCount += 1;
      collected.push(record);
      audit.records.push({ setCode: record.setCode, url: record.url, httpStatus: record.httpStatus ?? null,
        fetchedAt: record.fetchedAt, rowCount: record.rows.length, parsedRows: record.parsedRows ?? null,
        excludedRows: record.excludedRows ?? null, minimumPopulation: MIN_TOTAL_POPULATION, error: record.error });
      if (!record.error && record.parsedRows > 0) {
        const staged = mergeRows(previousPayload.rows || [], collected.flatMap(rowObjects));
        writeJson(OUTPUT_JSON, { ...previousPayload, generatedAt: new Date().toISOString(), totalRows: staged.rows.length, rows: staged.rows });
        // Only checkpoint sets after their values have actually been saved.
        if (!audit.completedUrls.includes(entry.url)) audit.completedUrls.push(entry.url);
        audit.lastSuccessAt = record.fetchedAt;
        delete audit.retryByUrl[entry.url];
      }
      if (record.error) {
        const retry = retryPolicy.failure(audit.retryByUrl[entry.url], { error: record.error, httpStatus: record.httpStatus });
        audit.retryByUrl[entry.url] = { ...retry, url: entry.url, setCode: entry.setCode };
        Object.assign(audit.records.at(-1), { failureKind: retry.kind, stopScope: retry.scope, nextRetryAt: retry.nextRetryAt, retryAttempts: retry.attempts });
        if (retry.scope === "source") {
          audit.sourceRetry = retry; audit.status = retry.status; audit.stopReason = record.error; saveProgress(); break;
        }
      }
      saveProgress();
      console.log(`${record.name}: ${record.rows.length} rows${record.error ? ` (warning: ${record.error})` : ""}`);
    }
  } finally {
    if (ownsContext) await context.close().catch(() => {});
  }

  const freshRows = collected.flatMap(rowObjects);
  audit.endedAt = new Date().toISOString();
  audit.nextUrl = orderedManifest.find((entry) => !audit.completedUrls.includes(entry.url))?.url || null;
  if (!freshRows.length) {
    audit.status = ["manual-wait", "retry-wait"].includes(audit.status) ? audit.status : "failed";
    audit.stopReason ||= "新しい有効Populationは0件・前回正常値を保持"; saveProgress();
    throw new Error("No reliable fresh PSA population data was collected. Existing data was preserved.");
  }
  const merged = mergeRows(previousPayload.rows || [], freshRows);
  audit.newAcquiredCount = merged.newCount; audit.changedCount = merged.changedCount;
  const rows = merged.rows;
  audit.refreshedCount = freshRows.length;
  audit.status = ["manual-wait", "retry-wait"].includes(audit.status) ? audit.status : audit.nextUrl || Object.keys(audit.retryByUrl).length ? "partial" : "success";
  saveProgress();

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

async function exclusiveMain() {
  const release = retryPolicy.lock(path.join(__dirname, "psa-acquisition.lock"));
  try { return await main(); } finally { release(); }
}
if (require.main === module) exclusiveMain()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
module.exports = { inferTableMetrics, parseSinglePopulation, mergeRows, collectSet };
