const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CAPTURE_PATH = path.join(__dirname, "manual_psa_capture.json");
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
  return String(value || "").trim().toUpperCase().split(/[-\s]/)[0];
}

function setFromName(value) {
  return shortSet(String(value || "").replace(/^\d{4}\s+Pokemon Japanese\s+/i, ""));
}

function setFromTitle(value) {
  const match = String(value || "").match(/^\d{4}\s+Pokemon Japanese\s+(.+?)\s+TCG Cards/i);
  return match ? shortSet(match[1]) : "";
}

function main() {
  const capture = readJson(CAPTURE_PATH, { sets: [] });
  const previous = readJson(OUTPUT_PATH, { rows: [] });
  const successfulUrls = new Set();
  const freshRows = [];
  const rejected = [];

  for (const set of capture.sets || []) {
    const expectedSet = setFromName(set.name);
    const actualSet = setFromTitle(set.title);
    if (!set.url || !Array.isArray(set.rows) || set.rows.length === 0 || expectedSet !== actualSet) {
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
    totalSets: successfulUrls.size,
    totalRows: rows.length,
    rows,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload), "utf8");
  fs.writeFileSync(
    OUTPUT_JS_PATH,
    `window.PSA_OFFICIAL_POPULATIONS = ${JSON.stringify({ generatedAt, totalRows: rows.length })};`,
    "utf8"
  );
  console.log(JSON.stringify({ successfulSets: successfulUrls.size, freshRows: freshRows.length, totalRows: rows.length, rejected }));
}

main();
