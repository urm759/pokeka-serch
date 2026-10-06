const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname,'..');
const read = file => JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const current = read('work/purchase-price-observation-snapshot.json');
const baselineFile = 'work/purchase-price-recovery-baseline.json';
if (process.argv.includes('--baseline')) {
  fs.writeFileSync(path.join(root,baselineFile),JSON.stringify(current));
  console.log(JSON.stringify({baselineAt:current.at,cards:Object.keys(current.rows).length}));
} else {
  const before = read(baselineFile);
  const ids = Object.keys(before.rows).filter(id => current.rows[id]);
  const recovered = ids.filter(id => before.rows[id].status !== 'available' && current.rows[id].status === 'available');
  const lost = ids.filter(id => before.rows[id].status === 'available' && current.rows[id].status !== 'available');
  const freshnessOnly = ids.filter(id => before.rows[id].status === 'available' && current.rows[id].status === 'available' && before.rows[id].at !== current.rows[id].at);
  const output = { generatedAt:current.at,baselineAt:before.at, fixedCohort:ids.length,
    purchasableBefore:ids.filter(id=>before.rows[id].status==='available').length,purchasableAfter:ids.filter(id=>current.rows[id].status==='available').length,
    freshnessRecovered:recovered.length,freshnessReconfirmed:freshnessOnly.length,lost:lost.length,
    analyzedBefore:before.analyzed,analyzedAfter:current.analyzed,newAnalyzable:Math.max(0,current.analyzed-before.analyzed),
    rows:[...recovered,...lost].map(id=>({id,before:before.rows[id],after:current.rows[id]})),
    sourceRuns:Object.fromEntries(Object.entries(read('work/candidate-shop-refresh.json').sources).map(([id,r])=>[id,{startedAt:r.startedAt,inComparisonWindow:Date.parse(r.startedAt)>=Date.parse(before.at),attempted:r.attemptedCount,refreshed:r.refreshedCount,newLinks:r.newLinkedCount,durationMs:r.durationMs,httpRequests:r.httpRequests,stopReason:r.stopReason}])),
    llmCalls:0, note:'同一ID群・同一条件。再確認/既存価格復活は新規取得・紐付けと別。購入可能価格はGO保証ではない。' };
  fs.writeFileSync(path.join(root,'data/purchase-price-recovery.json'),JSON.stringify(output));
  const historyFile = path.join(root,'work/purchase-price-recovery-history.json');
  const history = fs.existsSync(historyFile) ? JSON.parse(fs.readFileSync(historyFile,'utf8')) : [];
  const compact = {...output,rows:undefined};
  fs.writeFileSync(historyFile,JSON.stringify([...history.filter(r=>r.baselineAt!==output.baselineAt),compact].slice(-90)));
  console.log(JSON.stringify({...output,rows:undefined}));
}
