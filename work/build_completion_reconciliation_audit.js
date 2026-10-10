const fs = require('node:fs');
const path = require('node:path');
const { snapshot, compare } = require('./audit_completion_outcomes');
function build(root, baselineFile) {
  const before = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
  const after = snapshot(root);
  const result = { version: 1, generatedAt: after.at, ...compare(before, after),
    newlyAnalyzableIds: [], lostAnalyzableIds: [],
    explanation: '同じ掲載ID群の保存値比較。PSAはPC定期取得済みデータの厳密再照合、店舗は実HTTP取得。URL発見・再確認を必須補完完了とは数えない。48時間の監査鮮度は購入の6時間目標とは別。' };
  for (const [id, row] of Object.entries(after.rows)) {
    if (!before.rows[id]) continue;
    if (row.analysis && !before.rows[id].analysis) result.newlyAnalyzableIds.push(id);
    if (!row.analysis && before.rows[id].analysis) result.lostAnalyzableIds.push(id);
  }
  fs.writeFileSync(path.join(root, 'data/completion-reconciliation-audit.json'), JSON.stringify(result));
  return result;
}
if (require.main === module) console.log(JSON.stringify(build(path.join(__dirname, '..'), process.argv[2])));
module.exports = { build };
