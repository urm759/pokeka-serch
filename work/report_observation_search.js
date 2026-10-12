const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=require('node:path').join(__dirname,'..'),base='e756ef98';
const read=f=>JSON.parse(fs.readFileSync(require('node:path').join(root,f),'utf8'));
const old=f=>JSON.parse(execFileSync('git',['show',base+':'+f],{cwd:root,encoding:'utf8',maxBuffer:64000000}));
const before=old('data/card-catalog-completion.json'),after=read('data/card-catalog-completion.json');
const psaBefore=old('data/psa-population-summary.json').cards,psaAfter=read('data/psa-population-summary.json').cards;
const oldMeans=old('data/psa10-period-summary.json'),means=read('data/psa10-period-summary.json');
const observations=Object.entries(means.cards).reduce((a,[id,r])=>a+Math.max(0,(r[10]||0)-(oldMeans.cards[id]?.[10]||0)),0);
const beforeCards=new Map(old('data/pokemon-cards.json').map(c=>[c.id,c])),cards=read('data/pokemon-cards.json');
const fieldKeys=Object.keys(require('./completion_routes').ROUTES).filter(k=>!['psa9Evidence','buybackExitEvidence'].includes(k));
const filledIds=Object.keys(after.cards).filter(id=>fieldKeys.some(k=>after.cards[id].i?.[k]==='取得済み' && before.cards[id]?.i?.[k]!=='取得済み'));
const newlyAnalysis=Object.keys(after.cards).filter(id=>after.cards[id].s==='分析可能' && before.cards[id]?.s!=='分析可能');
const lostAnalysis=Object.keys(before.cards).filter(id=>before.cards[id].s==='分析可能' && after.cards[id]?.s!=='分析可能');
const valid=row=>Number.isFinite(row?.rate)&&row.total>0;
const newPsa=Object.keys(psaAfter).filter(id=>valid(psaAfter[id])&&!valid(psaBefore[id]));
const lostPsa=Object.keys(psaBefore).filter(id=>valid(psaBefore[id])&&!valid(psaAfter[id]));
const {load,specifiedUrl}=require('./audit_search_profit_consistency');
const app=fs.readFileSync('app.js','utf8'),oldApp=execFileSync('git',['show',base+':app.js'],{encoding:'utf8',maxBuffer:10000000});
const at=new Date().toISOString(),a=load(oldApp,at),b=load(app,at);
const rows=a.prepareCalculatedCards(a.state.cards),newRows=b.prepareCalculatedCards(b.state.cards);
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
assert.equal(digest(rows.map(c=>[c.id,c.buyLimits,c.purchaseDecision])),digest(newRows.map(c=>[c.id,c.buyLimits,c.purchaseDecision])));
const ids=(api,rs)=>rs.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id);
assert.deepEqual(ids(a,rows),ids(b,newRows),'disabled observation filters preserve IDs');
b.state.observation7Min=-20;b.state.observation7Max=0;b.state.observationIncludeReference=true;
const filtered=ids(b,newRows);
for(const card of newRows.filter(c=>filtered.includes(c.id))) assert.equal(require('../exploration-metrics').observationExclusions(means,card,b.state).length,0);
const receipt=read('data/psa10-observation-receipt.json');
const latestUrl=require('./audit_efficiency_thresholds').userUrl();
const latestBefore=load(oldApp,at,{url:latestUrl}),latestAfter=load(app,at,{url:latestUrl});
const latestOldRows=latestBefore.prepareCalculatedCards(latestBefore.state.cards),latestRows=latestAfter.prepareCalculatedCards(latestAfter.state.cards);
assert.deepEqual(ids(latestBefore,latestOldRows),ids(latestAfter,latestRows));
assert.equal(digest(latestOldRows.map(c=>[c.id,c.buyLimits,c.purchaseDecision])),digest(latestRows.map(c=>[c.id,c.buyLimits,c.purchaseDecision])));
const out={version:1,generatedAt:at,baseline:base,formulaChanges:0,goSafetyChanges:0,
  latestSharedConditions:{before:ids(latestBefore,latestOldRows).length,after:ids(latestAfter,latestRows).length,idsUnchanged:true,formulaUnchanged:true,queryHash:digest(latestUrl)},
  search:{sameDataCandidatesBefore:ids(a,rows).length,sameDataCandidatesAfter:ids(load(app,at),newRows).length,idsUnchanged:true,calculationHash:digest(newRows.map(c=>[c.id,c.buyLimits,c.purchaseDecision])),
    sevenDayMinus20ToZero:filtered.length,filteredIds:filtered,queryHash:digest(specifiedUrl)},
  observation:{newCalendarObservations:observations,verifiedPriceRechecks:Object.keys(receipt.cards).length,observedAt:receipt.observedAt,complete200:means.coverage.byPeriod[200].completeCalendarCards,coverage:means.coverage.byPeriod},
  outcomes:{newlyListed:cards.filter(c=>!beforeCards.has(c.id)).length,filledCards:filledIds.length,filledIds,newlyAnalyzable:newlyAnalysis.length,lostAnalyzable:lostAnalysis.length,newlyAnalyzableIds:newlyAnalysis,
    newValidPsa:newPsa.length,lostValidPsa:lostPsa.length,validPsaNet:newPsa.length-lostPsa.length,
    actualPriceChanges:Object.fromEntries(['price','snkPsa10Price','snkPsa9Price'].map(k=>[k,cards.filter(c=>beforeCards.has(c.id)&&c[k]!==beforeCards.get(c.id)[k]).length]))},
  acquisition:{prices:read('data/update-performance.json'),psa:read('data/psa-publication-handoff.json'),psaScheduledAcquisition:read('work/psa-fetch-progress.json').endedAt,
    note:'PSAは04:30定期取得後の保存済み原票を統合。国内価格は手動開始の既存非AI取得。定期取得と表示改修を分離。'},
  fixedCohortFreshness:read('data/priority-price-monitor.json').fixedCohortFreshness,
  sourceFailures:['カードラッシュ403','遊々亭403','PSA料金403','スニダン許諾待ち'],
  scheduledAfterCode:'未到来。非AI受領証で取得・保存・公開を継続確認。AI予定タスク停止。',llmCalls:0,codexCalls:0};
fs.writeFileSync('data/observation-search-report.json',JSON.stringify(out));
console.log(JSON.stringify({search:out.search,observation:out.observation,outcomes:out.outcomes}));
