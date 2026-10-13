const fs=require('node:fs'),cp=require('node:child_process');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const old=(ref,file)=>JSON.parse(cp.execFileSync('git',['show',`${ref}:${file}`],{encoding:'utf8',maxBuffer:96e6}));
const current=read('data/card-catalog-completion.json'),psa=read('data/psa-population-summary.json');
function change(ref){
  const before=old(ref,'data/card-catalog-completion.json'),bPsa=old(ref,'data/psa-population-summary.json');
  const acquired=[],lost=[],analyzed=[],lostAnalysis=[],added=[];
  for(const [id,row]of Object.entries(current.cards)) {
    const b=before.cards[id];if(!b){added.push(id);continue;}
    const filled=Object.keys(row.i||{}).filter(k=>row.i[k]==='取得済み'&&b.i?.[k]!=='取得済み');
    const missing=Object.keys(b.i||{}).filter(k=>b.i[k]==='取得済み'&&row.i?.[k]!=='取得済み');
    if(filled.length)acquired.push({id,fields:filled});if(missing.length)lost.push({id,fields:missing});
    if(row.s==='分析可能'&&b.s!=='分析可能')analyzed.push(id);
    if(row.s!=='分析可能'&&b.s==='分析可能')lostAnalysis.push({id,missing:row.m,status:row.s});
  }
  const required=require('./completion_routes').REQUIRED,byField={};
  for(const row of acquired)for(const field of row.fields)byField[field]=(byField[field]||0)+1;
  return {ref,before:before.summary,after:current.summary,newCatalog:added,filledCards:acquired.length,byField,
    requiredFilledCards:acquired.filter(r=>r.fields.some(f=>required.includes(f))).length,
    filled:acquired,lostFields:lost,newlyAnalyzable:analyzed,lostAnalysis,analyzableNet:analyzed.length-lostAnalysis.length,
    psaValidAdded:Object.keys(psa.cards).filter(id=>!bPsa.cards[id]),psaValidLost:Object.keys(bPsa.cards).filter(id=>!psa.cards[id])};
}
const p=read('work/psa-fetch-progress.json'),monitor=read('data/priority-price-monitor.json');
const mean=read('data/psa10-period-summary.json'),oldMean=old('a9f8586e','data/psa10-period-summary.json');
let increased=0,days=0;
for(const [id,row]of Object.entries(mean.cards)){const prior=oldMean.cards[id];if(prior&&row[10]>prior[10]){increased++;days+=row[10]-prior[10];}}
const recovery=read('data/source-recovery-audit.json');
const report={version:1,at:new Date().toISOString(),currentTurn:change('a9f8586e'),sinceLastFeature:change('a854e98c'),
  manualPsa:{attemptedSets:p.attemptedCount,refreshedRows:p.refreshedCount,newRawRows:p.newAcquiredCount,changedPopRows:p.changedCount,
    durationMs:p.durationMs,status:p.status,selectedLanes:p.selectedLanes,failures:p.records.filter(r=>r.error),nextUrl:p.nextUrl},
  savedDailyRecovery:{runId:recovery.runId,verifiedFiles:recovery.verifiedFiles,restoredFiles:recovery.restoredFiles,newAcquisitionRequests:0},
  freshness:monitor.fixedCohortFreshness,observations:{cardsWithNewDays:increased,netObservedDays:days,
    note:'同日の正常な再確認は日数純増とは別。欠測や古値の埋め戻しなし'},
  remaining:read('data/one-item-completion-audit.json').byRoute,domesticPsa9IndividualCards:0,
  automaticLlmCalls:0,automaticCodexCalls:0,aiScheduledTasks:'停止を維持・新規作成/再開なし',
  limitations:'今回のPSAは小規模手動取得。保存回収は新規通信取得ではない。修正後のDaily定期・認証PokeDATA・国内個別成約・期間実証は未完了。'};
fs.writeFileSync('data/current-guide-progress.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({filled:report.currentTurn.filledCards,analyzableNet:report.currentTurn.analyzableNet,
  analysisAdded:report.currentTurn.newlyAnalyzable.length,analysisLost:report.currentTurn.lostAnalysis.length,
  psaAdded:report.currentTurn.psaValidAdded.length,manualPsa:report.manualPsa,observations:report.observations}));
