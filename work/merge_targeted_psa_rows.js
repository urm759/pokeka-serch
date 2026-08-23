const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const INPUT_PATH = path.join(__dirname, "targeted_psa_rows.json");
const OUTPUT_PATH = path.join(ROOT, "data", "psa-official-populations.json");
const OUTPUT_JS_PATH = path.join(ROOT, "data", "psa-official-populations.js");

function normalizeSet(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeNo(value) {
  return String(value || "").replace(/^#/, "").trim().replace(/^0+(?=\d)/, "");
}

function identity(row) {
  return `${normalizeSet(row.setCode)}|${normalizeNo(row.cardNo)}|${String(row.cardName || "").trim().toUpperCase()}`;
}

function main() {
  const payload = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf8"));
  const targeted = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));
  const fetchedAt = new Date().toISOString();
  const rows = new Map((payload.rows || []).map((row) => [identity(row), row]));

  for (const row of targeted.rows || []) {
    const psa10Count = Number(row.psa10Count);
    const psaTotal = Number(row.psaTotal);
    if (!Number.isFinite(psa10Count) || !Number.isFinite(psaTotal) || psa10Count < 0 || psaTotal < psa10Count) {
      throw new Error(`Invalid PSA population row: ${identity(row)}`);
    }
    rows.set(identity(row), {
      ...row,
      setCode: normalizeSet(row.setCode),
      cardNo: normalizeNo(row.cardNo),
      psa10Count,
      psaTotal,
      fetchedAt,
    });
  }

  const mergedRows = [...rows.values()];
  const output = {
    ...payload,
    generatedAt: fetchedAt,
    totalRows: mergedRows.length,
    rows: mergedRows,
  };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output), "utf8");
  if (fs.existsSync(OUTPUT_JS_PATH)) {
    fs.writeFileSync(
      OUTPUT_JS_PATH,
      `window.PSA_OFFICIAL_POPULATIONS = ${JSON.stringify({ generatedAt: fetchedAt, totalRows: mergedRows.length })};`,
      "utf8"
    );
  }
  console.log(JSON.stringify({ merged: targeted.rows?.length || 0, totalRows: mergedRows.length, generatedAt: fetchedAt }));
}

main();
