const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..');
const read = f => JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const { snapshot, compare, unpack } = require('./audit_completion_outcomes');
const before = unpack(read('work/fixtures/long-observation-before.json'));
const after = snapshot(root), history = read('work/market_stability_history.json');
const summary = read('data/psa10-period-summary.json'), progress = read('work/psa-fetch-progress.json');
const cards = read('data/pokemon-cards.json');
const dayCounts = Object.values(summary.cards).map(row=>row[10] || 0);
const detailBytes = Array.from({length:16},(_,i)=>fs.statSync(path.join(root,`data/psa10-periods/${i}.json`)).size).reduce((a,b)=>a+b,0);
const latestRows=Object.values(history.cards).map(rows=>rows.at(-1)).filter(Boolean);
const projectedBytes=latestRows.reduce((n,row)=>n+Buffer.byteLength(JSON.stringify(row))+1,0)*365;
const out = { version:1,generatedAt:after.at,formulaChanges:0,goRuleChanges:0,
  calendar:'Asia/Tokyo・200暦日・同日1記録',retentionDays:365,backfilledDays:0,
  observation:{cards:summary.coverage.historyCards,maximumObservedDays:Math.max(0,...dayCounts),complete200Cards:summary.coverage.byPeriod[200].completeCalendarCards,
    coverage:summary.coverage.byPeriod,unverifiedLegacy:'旧形式の根拠未記録を明示。推定履歴を作らず、完全200日には扱わない'},
  acquisition:{kind:'手動で開始した既存非AI正規PSA取得',sets:progress.attemptedCount,rows:progress.refreshedCount,newRaw:progress.newAcquiredCount,changedRaw:progress.changedCount,durationMs:progress.durationMs,selection:progress.selectedLanes},
  outcomes:compare(before,after),analysis:read('data/card-catalog-completion.json').summary.analyzable,
  newlyValidPsaIds:Object.keys(after.rows).filter(id=>after.rows[id].sources.psaOfficial?.valid&&!before.rows[id]?.sources.psaOfficial?.valid),
  lostValidPsaIds:Object.keys(before.rows).filter(id=>before.rows[id].sources.psaOfficial?.valid&&!after.rows[id]?.sources.psaOfficial?.valid),
  newlyAnalyzableCards:cards.filter(c=>after.rows[c.id]?.analysis&&!before.rows[c.id]?.analysis).map(c=>({id:c.id,name:c.name})),
  storage:{rawBytes:fs.statSync(path.join(root,'work/market_stability_history.json')).size,summaryBytes:fs.statSync(path.join(root,'data/psa10-period-summary.json')).size,
    lazyDetailBytes:detailBytes,projected365RawBytes:projectedBytes,storageBudgetBytes:512*1024*1024,
    rule:'原票は初期取得なし。200日中央値を含む詳細は16分割の必要時取得。容量見通しは現在のカード群・最新行サイズが継続する仮定'},
  scheduledFreshness:read('data/priority-price-monitor.json').fixedCohortFreshness,
  scheduledEvidence:read('data/scheduled-execution-audit.json').runs.map(r=>({workflow:r.workflow,run:r.id,sha:r.sha,createdAt:r.createdAt,status:r.status,conclusion:r.conclusion})),
  nextScheduled:'毎時47分の変更後定期運転は、非AI受領証の取得・保存・公開照合を待つ。手動成功では代用しない',llmCalls:0,codexCalls:0 };
fs.writeFileSync(path.join(root,'data/long-observation-report.json'),JSON.stringify(out));
console.log(JSON.stringify(out));
