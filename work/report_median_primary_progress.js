const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const {load}=require('./audit_search_profit_consistency'),outcomes=require('./audit_completion_outcomes');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const cycle=read('data/search-profile-cycle-progress.json').cycles.filter(r=>r.key==='median-primary-20261015').at(-1);
const at=cycle.recordedAt,base='4e2eeb34',source=fs.readFileSync('app.js','utf8'),old=cp.execFileSync('git',['show',base+':app.js'],{encoding:'utf8',maxBuffer:12e6});
const definitions=require('./search_profile_variants').allProfiles(read('work/priority-search-profiles.json')),profiles=[];
for(const p of definitions) {
  const rows=[];
  for(const code of [old,source]) {
    const api=load(code,at,{url:p.url}),cards=api.prepareCalculatedCards(api.state.cards);
    rows.push({ids:cards.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id).sort(),hash:hash(cards.map(c=>[c.id,c.buyLimits,c.purchaseDecision]))});
  }
  if(JSON.stringify(rows[0])!==JSON.stringify(rows[1]))throw Error('Unexpected financial/qualification code change '+p.id);
  profiles.push({id:p.id,baseId:p.baseId||null,basis:p.basis||'auto',urlHash:hash(p.url),sameDataCodeComparisonEqual:true,...cycle.profiles.find(r=>r.id===p.id)});
}
const before=outcomes.unpack(read('work/search-profile-cycle-baseline-median-primary-20261015.json').snapshot);
const changes=outcomes.compare(before,outcomes.snapshot(process.cwd(),Date.parse(at)));
const priorCamp=JSON.parse(cp.execFileSync('git',['show',base+':work/torecacamp_catalog.json'],{maxBuffer:20e6}));
const ids=new Set(priorCamp.map(r=>r.cardId)),catalog=read('data/pokemon-cards.json'),newCamp=read('work/torecacamp_catalog.json').filter(r=>!ids.has(r.cardId));
const report={version:1,at,base,profiles,dataChanges:changes,
  basisComparisons:read('data/priority-search-profile-audit.json').basisComparisons,
  newShopLinks:newCamp.map(r=>({id:r.cardId,name:catalog.find(c=>c.id===r.cardId)?.name,price:r.price,available:r.available,observedAt:r.observedAt,url:r.detailUrl})),
  learning:read('data/supply-demand-validation-summary.json'),freshness:read('data/priority-price-monitor.json').fixedCohortFreshness.sources.hareruya2,
  recentIntervalMinima:read('work/priority-freshness-history.json').sources.hareruya2.intervalMinima.slice(-3),
  manualShopRun:read('work/candidate-shop-refresh.json').sources.hareruya2,
  scheduledEvidence:read('data/scheduled-execution-audit.json').runs.map(r=>({id:r.id,head:r.sha,createdAt:r.createdAt,conclusion:r.conclusion,
    published:r.jobs.map(j=>j.publication).filter(Boolean)})),
  defaultMigration:{newDefault:'median',explicitAutoUnchanged:true,savedAutoWithoutUrl:'One-time migration to explicit median, full prior settings retained locally',otherSettingsUnchanged:true},
  productionCalculationChanged:false,purchaseGoSafetyChanged:false,llmCalls:0,codexCalls:0,
  note:'Buying-basis differences are not acquisition outcomes. Same-day observations are not new days. Manual success is not scheduled success. Historical price/probability/context gaps remain missing.'};
fs.writeFileSync('data/median-primary-progress.json',JSON.stringify(report));
console.log(JSON.stringify({profiles:profiles.map(p=>({id:p.id,before:p.before,after:p.after,filled:p.profileFilledCards,referenceRecovered:p.medianEvidenceRecovered,first:p.firstQualified,returned:p.requalified,lost:p.lost})),changes,newShopLinks:report.newShopLinks}));
