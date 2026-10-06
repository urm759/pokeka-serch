const fs = require("node:fs");
const path = require("node:path");
function key(row) { return [row.setCode, row.cardNo, row.cardName, row.sourceUrl].join("|"); }
function merge(previous, incoming, now = Date.now()) {
  const map = new Map(previous.map((row) => [key(row), row]));
  const audit = { added: 0, refreshed: 0, changed: 0, rejected: 0, olderOrSame: 0, evidence: [] };
  for (const row of incoming) {
    const date = Date.parse(row.fetchedAt), old = map.get(key(row));
    if (!/^https:\/\/www\.psacard\.com\/(?:pop\/tcg-cards\/|spec\/psa\/\d+(?:[/?#]|$))/.test(row.sourceUrl || "") || !row.setCode || !row.cardNo || !row.cardName
      || !Number.isInteger(row.psaTotal) || row.psaTotal <= 0 || !Number.isInteger(row.psa10Count) || row.psa10Count < 0 || row.psa10Count > row.psaTotal || !Number.isFinite(date) || date > now) { audit.rejected++; continue; }
    if (old && date <= Date.parse(old.fetchedAt || "")) { audit.olderOrSame++; continue; }
    if (!old) audit.added++; else {
      audit.refreshed++;
      if (old.psaTotal !== row.psaTotal || old.psa10Count !== row.psa10Count) audit.changed++;
    }
    map.set(key(row), row);
    audit.evidence.push({ key: key(row), beforeFetchedAt: old?.fetchedAt || null, fetchedAt: row.fetchedAt, sourceUrl: row.sourceUrl });
  }
  return { rows: [...map.values()], audit };
}
if (require.main === module) {
  const root = path.join(__dirname, ".."), file = path.join(root, "data/psa-official-populations.json");
  if (!process.argv[2]) throw new Error("Explicit saved PSA file required");
  const before = JSON.parse(fs.readFileSync(file)), incoming = JSON.parse(fs.readFileSync(process.argv[2]));
  const result = merge(before.rows, incoming.rows);
  fs.writeFileSync(file, JSON.stringify({ ...before, rows: result.rows, totalRows: result.rows.length }));
  fs.writeFileSync(path.join(root, "data/psa-saved-recovery.json"), JSON.stringify({ recoveredAt: new Date().toISOString(), newHttpRequests: 0, ...result.audit, note: "PCで保存済み・未公開だった正常行のみ統合。取得日時は元の値を保持。今回の新規通信ではない" }));
  console.log(JSON.stringify({ ...result.audit, evidence: undefined }));
}
module.exports = { merge };
