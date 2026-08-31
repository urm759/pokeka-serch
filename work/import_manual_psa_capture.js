const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CAPTURE_PATH = path.join(__dirname, "manual_psa_capture.json");
const MANIFEST_PATH = path.join(__dirname, "psa_set_urls.json");
const OUTPUT_PATH = path.join(ROOT, "data", "psa-official-populations.json");
const OUTPUT_JS_PATH = path.join(ROOT, "data", "psa-official-populations.js");

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function shortSet(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (/^(?:S8A-[PG]|(?:XY|SM|S|SV|M)-P)$/.test(raw)) return raw;
  return raw.split(/[-\s]/)[0];
}

function setFromName(value) {
  return shortSet(String(value || "").replace(/^\d{4}\s+Pokemon Japanese\s+/i, ""));
}

function setFromTitle(value) {
  const match = String(value || "").match(/^\d{4}\s+Pokemon Japanese\s+(.+?)\s+TCG Cards/i);
  return match ? shortSet(match[1]) : "";
}

function main() {
  const encodedCaptureIndex = process.argv.indexOf("--capture-base64");
  const encodedCapture = encodedCaptureIndex >= 0 ? process.argv[encodedCaptureIndex + 1] : "";
  const captureFiles = fs.readdirSync(__dirname)
    .filter((name) => /^manual_psa_capture.*\.json$/i.test(name))
    .map((name) => path.join(__dirname, name));
  const captures = captureFiles.map((filePath) => readJson(filePath, { sets: [] }));
  if (encodedCapture) {
    try {
      captures.push(JSON.parse(Buffer.from(encodedCapture, "base64").toString("utf8")));
    } catch {
      throw new Error("Invalid --capture-base64 payload");
    }
  }
  const capture = {
    generatedAt: captures.map((item) => item.generatedAt).filter(Boolean).sort().at(-1) || new Date().toISOString(),
    sets: captures.flatMap((item) => item.sets || []),
  };
  const manifest = readJson(MANIFEST_PATH, []);
  const manifestByName = new Map(manifest.map((entry) => [entry.name, entry]));
  const previous = readJson(OUTPUT_PATH, { rows: [] });
  const successfulUrls = new Set();
  const freshRows = [];
  const rejected = [];

  for (const set of capture.sets || []) {
    const manifestEntry = manifestByName.get(set.name) || {};
    const nameSet = setFromName(set.name);
    const expectedSet = shortSet(manifestEntry.setCode || nameSet);
    const actualSet = setFromTitle(set.title);
    const redirectedToDifferentCode = nameSet === expectedSet && expectedSet !== actualSet;
    if (!set.url || !Array.isArray(set.rows) || set.rows.length === 0 || redirectedToDifferentCode) {
      rejected.push({ name: set.name, expectedSet, actualSet, rows: set.rows?.length || 0 });
      continue;
    }
    successfulUrls.add(set.url);
    for (const row of set.rows) {
      const ten = Number(row.psa10Count);
      const total = Number(row.psaTotal);
      if (!row.cardNo || !row.cardName || !Number.isFinite(ten) || !Number.isFinite(total) || ten < 0 || total < ten) continue;
      freshRows.push({
        setCode: expectedSet,
        cardNo: String(row.cardNo).trim(),
        cardName: String(row.cardName).replace(/Shop with Affiliates/gi, "").trim(),
        psa10Count: ten,
        psaTotal: total,
        sourceUrl: set.url,
        fetchedAt: set.fetchedAt || capture.generatedAt || new Date().toISOString(),
      });
    }
  }

  const preservedRows = (previous.rows || []).filter((row) => !successfulUrls.has(row.sourceUrl));
  const deduped = new Map();
  for (const row of [...preservedRows, ...freshRows]) {
    const key = `${shortSet(row.setCode)}|${String(row.cardNo).toUpperCase()}|${String(row.cardName).toUpperCase()}|${row.sourceUrl || ""}`;
    deduped.set(key, row);
  }
  const rows = [...deduped.values()];
  const generatedAt = capture.generatedAt || new Date().toISOString();
  const payload = {
    v: 2,
    generatedAt,
    totalSets: new Set(rows.map((row) => row.sourceUrl).filter(Boolean)).size,
    totalRows: rows.length,
    rows,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload), "utf8");
  fs.writeFileSync(
    OUTPUT_JS_PATH,
    `window.PSA_OFFICIAL_POPULATIONS = ${JSON.stringify({ generatedAt, totalRows: rows.length })};`,
    "utf8"
  );
  console.log(JSON.stringify({ successfulSets: successfulUrls.size, totalSets: payload.totalSets, freshRows: freshRows.length, totalRows: rows.length, rejected }));
}

main();
