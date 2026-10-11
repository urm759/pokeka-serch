const fs=require('node:fs'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {load}=require('./audit_search_profit_consistency'), outcomes=require('./audit_completion_outcomes');
const root=require('node:path').join(__dirname,'..');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const at=new Date().toISOString(),source=fs.readFileSync('app.js','utf8');
const before=load(execFileSync('git',['show','f8805068:app.js'],{encoding:'utf8',maxBuffer:12000000}),at),after=load(source,at);
const oldCards=before.prepareCalculatedCards(before.state.cards),cards=after.prepareCalculatedCards(after.state.cards);
const hash=list=>crypto.createHash('sha256').update(JSON.stringify(list.map(c=>[c.id,c.buyLimits,c.purchaseDecision]))).digest('hex');
const ids=(api,list)=>list.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id);
const baseline=outcomes.unpack(JSON.parse(execFileSync('git',['show','f8805068:work/completion-outcomes-last.json'],{encoding:'utf8',maxBuffer:20000000})));
const delta=outcomes.compare(baseline,outcomes.snapshot(root));
const examples=[],counts={total:cards.length,available:0,nonnegative:0,negative:0,unavailable:{}};
for(const c of cards) {
  const e=after.cardEfficiency(c);
  if(Number.isFinite(e.annual)) {
    counts.available++;counts[e.annual>=0?'nonnegative':'negative']++;
    if(examples.length<8)examples.push({id:c.id,name:c.name,...e});
  } else counts.unavailable[e.reason]=(counts.unavailable[e.reason]||0)+1;
}
const check={before:hash(oldCards),after:hash(cards),candidateIdsEqual:JSON.stringify(ids(before,oldCards))===JSON.stringify(ids(after,cards))};
if(check.before!==check.after||!check.candidateIdsEqual)throw Error('Existing limits/GO/candidate IDs changed');
const prior=fs.existsSync('data/card-efficiency-audit.json') ? read('data/card-efficiency-audit.json') : {};
const monitor=read('data/priority-price-monitor.json'),run=fs.existsSync('work/efficiency-price-refresh.json') ? read('work/efficiency-price-refresh.json') : prior.manualRun || null;
const publicRuns=fs.existsSync('work/efficiency-actions-latest.json') ? read('work/efficiency-actions-latest.json').workflow_runs||[] : null;
const report={updatedAt:at,baselineCommit:'f8805068',financialCalculationsUnchanged:true,check,
  formula:'expectedProfit / (purchase + grading + extras + applicable travel reserve) *100*365/(return incl shipping + sale wait + payout wait)',
  assumptions:{defaultSaleWaitDays:7,defaultPayoutWaitDays:3,shippingReturnAlreadyIncludedDays:7,personalCapitalUsed:false,
    noSilentPriceFallback:true,psa8AndFailure:'未評価・仮定確率や価格で補完しない',newMetricAffectsGO:false},
  examples,counts,delta,manualRun:run,discovery:read('data/state-a-url-discovery.json'),
  fixedCohort:monitor.fixedCohortFreshness?.sources?.hareruya2||null,
  latestScheduled:publicRuns ? publicRuns.filter(r=>r.event==='schedule').map(r=>({id:r.id,name:r.name,sha:r.head_sha,status:r.status,conclusion:r.conclusion,startedAt:r.run_started_at})) : prior.latestScheduled || [],
  newRevisionScheduledVerification:'未到来・未実証。既存の非AI受領証スクリプトで記録。AI予定タスクは停止維持',
  normalLlmCalls:0,aiScheduledTasksResumed:false,
  residuals:{domesticPsa9IndividualSales:0,authenticatedPokedata:'認証済み個別成約の不足・公開一覧の進捗とは別',
    blocked:['カードラッシュ403','遊々亭403','PSA料金403','スニダン許諾待ち'],
    returnHorizons:'42/91/119/147日・実証不足。91日中央を147日返却の利益に使用しない',returnBacktest:'最短12/1・時間待ち'}};
fs.writeFileSync('data/card-efficiency-audit.json',JSON.stringify(report));
console.log(JSON.stringify({check,counts,delta,examples:examples.slice(0,2),freshness:report.fixedCohort}));
