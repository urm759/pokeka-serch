const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const POPULATION_PATH = path.join(ROOT, "data", "psa-official-populations.json");
const BATCH_PATTERN = /^psa_browser_batch_.*\.json$/i;

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeNumber(value) {
  const raw = String(value || "").trim().toUpperCase();
  return /^\d+$/.test(raw) ? raw.replace(/^0+(?=\d)/, "") : raw;
}

function normalizeName(value) {
  return String(value || "")
    .replace(/Shop with Affiliates/gi, "")
    .replace(/[|\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRow(row) {
  const psa10Count = Number(row?.psa10Count);
  const psaTotal = Number(row?.psaTotal);
  if (!row?.setCode || !row?.sourceUrl || !Number.isFinite(psa10Count) || !Number.isFinite(psaTotal)) return null;
  if (psaTotal < 500 || psa10Count < 0 || psa10Count > psaTotal) return null;
  const cardNo = normalizeNumber(row.cardNo);
  const cardName = normalizeName(row.cardName);
  if (!cardNo || !cardName) return null;
  return {
    setCode: String(row.setCode).trim().toUpperCase(),
    cardNo,
    cardName,
    psa10Count,
    psaTotal,
    sourceUrl: String(row.sourceUrl),
    fetchedAt: row.fetchedAt || new Date().toISOString(),
  };
}

function rowKey(row) {
  return `${row.sourceUrl}|${normalizeNumber(row.cardNo)}|${normalizeName(row.cardName).toLowerCase()}`;
}

const existing = readJson(POPULATION_PATH, { v: 2, rows: [] });
const batches = fs.readdirSync(__dirname)
  .filter((name) => BATCH_PATTERN.test(name))
  .map((name) => path.join(__dirname, name));
const incoming = batches.flatMap((filePath) => readJson(filePath, []))
  .map(normalizeRow)
  .filter(Boolean);
const rows = new Map();
for (const row of existing.rows || []) {
  const normalized = normalizeRow(row);
  if (!normalized) continue;
  rows.set(rowKey(normalized), normalized);
}
let inserted = 0;
let updated = 0;
for (const row of incoming) {
  const key = rowKey(row);
  const previous = rows.get(key);
  if (!previous) inserted += 1;
  else if (String(previous.fetchedAt) > String(row.fetchedAt)) continue;
  else if (previous.psa10Count !== row.psa10Count || previous.psaTotal !== row.psaTotal || previous.fetchedAt !== row.fetchedAt) updated += 1;
  rows.set(key, row);
}
const merged = [...rows.values()].sort((a, b) =>
  a.setCode.localeCompare(b.setCode) || a.cardNo.localeCompare(b.cardNo, undefined, { numeric: true }) || a.cardName.localeCompare(b.cardName)
);
const uniqueSets = new Set(merged.map((row) => row.sourceUrl));
fs.writeFileSync(POPULATION_PATH, JSON.stringify({
  v: 2,
  generatedAt: new Date().toISOString(),
  totalSets: uniqueSets.size,
  totalRows: merged.length,
  rows: merged,
}), "utf8");
console.log(JSON.stringify({ batches: batches.length, incoming: incoming.length, inserted, updated, totalRows: merged.length, totalSets: uniqueSets.size }));
