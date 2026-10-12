const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const {snapshot,compare,unpack}=require('./audit_completion_outcomes');
const root=path.join(__dirname,'..');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8').replace(/^\uFEFF/,''));
const fromGit=(ref,file)=>JSON.parse(cp.execFileSync('git',['show',`${ref}:${file}`],{cwd:root,encoding:'utf8',maxBuffer:64e6}));
const before=unpack(read('work/targeted-completion-before.json')),after=snapshot(root);
const manual=fromGit('eb844aab','data/card-catalog-completion.json');
const manualPsa=fromGit('eb844aab','data/psa-population-summary.json');
const raw=read('work/psa-fetch-progress.json'),completion=read('data/card-catalog-completion.json');
const oldOne=fromGit('588ef74b','data/one-item-completion-audit.json');
const oldQueue=fromGit('eb844aab','work/psa_priority_queue.json');
const oldRegistered=oldOne.rows.filter(row=>row.routing.includes('実取得')&&row.field==='psaOfficial');
const held=oldRegistered.filter(row=>oldQueue.rows.find(p=>p.cardId===row.id)?.specificationHeld);
const manualIds=Object.keys(manualPsa.cards).filter(id=>before.rows[id]&&!before.rows[id].sources.psaOfficial?.valid);
const analysisIds=Object.entries(manual.cards).filter(([id,row])=>before.rows[id]&&row.s==='分析可能'&&!before.rows[id].analysis).map(([id])=>id);
const oldFresh=fromGit('588ef74b','work/priority-freshness-history.json').sources.hareruya2;
const price=read('work/candidate-shop-refresh.json').sources.hareruya2;
const minimum=require('./proactive_refresh').intervalMinimum(oldFresh.lastConfirmedRows,oldFresh.cohort,
  Date.parse(oldFresh.observations.at(-1).at),Date.parse(price.startedAt));
const names=new Map(read('data/pokemon-cards.json').map(row=>[row.id,row.name]));
const report={version:1,generatedAt:after.at,beforeCatalog:Object.keys(before.rows).length,afterCatalog:Object.keys(after.rows).length,
  overall:compare(before,after),manualPsa:{setsAttempted:raw.attemptedCount,acquiredRows:raw.refreshedCount,newRawRows:raw.newAcquiredCount,
    updatedRawRows:raw.changedCount,durationMs:raw.durationMs,savedRowCount:read('data/psa-official-populations.json').rows.length,
    validDomesticAdded:manualIds.length,newlyAnalyzable:analysisIds.length,ids:manualIds,
    analysisCards:analysisIds.map(id=>({id,name:names.get(id)})),authRecovery:raw.authRecovery,remainingUrlHolds:Object.keys(raw.retryByUrl||{}),selection:raw.selectedLanes},
  registeredAudit:{previousReported:oldRegistered.length,actualAcquisitionWaiting:oldRegistered.length-held.length,specificationHeld:held.length,
    note:'分類修正であり89枚を取得成功・不存在へ移したわけではない。'},
  scheduled:{runId:38270107861,source:'Data Update Health Watchdog / schedule',durationMs:read('data/price-catchup-status.json').durationMs,
    acquiredPriceCards:price.refreshedCount,changed:price.changedCount,httpRequests:price.httpRequests,checkpoint:price.nextId,
    outcomes:read('data/price-catchup-status.json').outcomes,minimumBeforeRun:minimum,
    latestFixedFreshness:read('data/priority-price-monitor.json').fixedCohortFreshness.sources.hareruya2.latest,
    acquisitionPublication:'dad8c5f5',monitorPublication:'cb3ab116',
    nextCodeConfirmation:'新しい毎時47分の補完確認と正確URL選択の定期実証は次回の非AI受領証。今回の定期は前のコード。'},
  current:{analyzable:completion.summary.analyzable,pending:completion.summary.priorityQueueRemaining,
    oneAway:completion.summary.completableAfterNext,routes:read('data/one-item-completion-audit.json').byRoute},
  domesticPsa9IndividualCards:0,normalAcquisitionLlmCalls:0,codexCalls:0,
  note:'Manual PSA acquisition, automated domestic data updates, freshness and classification corrections are separate. Overseas metadata does not fill domestic decision requirements.'};
fs.writeFileSync(path.join(root,'data/targeted-completion-outcomes.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({overall:report.overall,manualPsa:report.manualPsa,registered:report.registeredAudit,minimum,analyzable:report.current.analyzable}));
