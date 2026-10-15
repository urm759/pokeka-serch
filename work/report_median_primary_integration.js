const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const outcome=require('./audit_completion_outcomes'),{load}=require('./audit_search_profit_consistency');
function build(){
  const at=new Date().toISOString(),manual=read('data/median-primary-progress.json');
  const code=fs.readFileSync('app.js','utf8'),old=cp.execFileSync('git',['show',manual.base+':app.js'],{encoding:'utf8',maxBuffer:12e6});
  const profiles=require('./search_profile_variants').allProfiles(read('work/priority-search-profiles.json')).map(p=>{
    const values=[old,code].map(source=>{const api=load(source,at,{url:p.url}),cards=api.prepareCalculatedCards(api.state.cards);
      return {ids:cards.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id).sort(),financialHash:hash(cards.map(c=>[c.id,c.buyLimits,c.purchaseDecision]))};});
    assert.deepEqual(values[0],values[1],'Unexpected code-only financial/candidate change '+p.id);
    const prior=manual.profiles.find(r=>r.id===p.id),now=values[1];
    return {id:p.id,urlHash:hash(p.url),manualAfter:prior.after,integratedCount:now.ids.length,...now,sameDataCodeComparisonEqual:true,
      deltaInterpretation:'Manual and integrated measurements have different data/time. Do not attribute this count difference solely to acquisition or model changes.'};
  });
  const snapshot=outcome.snapshot(process.cwd(),Date.parse(at)),before=outcome.unpack(read('work/search-profile-cycle-baseline-median-primary-20261015.json').snapshot);
  const pc=read('work/psa_acquisition_result.json'),progress=read('work/psa-fetch-progress.json');
  const report={version:1,at,manualReport:'data/median-primary-progress.json',scheduledIntegrated:cp.execFileSync('git',['rev-parse','MERGE_HEAD'],{encoding:'utf8'}).trim(),
    profiles,combinedChangesSinceBeforeManual:outcome.compare(before,snapshot),completion:read('data/card-catalog-completion.json').summary,
    fixedCohort:read('data/priority-price-monitor.json').fixedCohortFreshness.sources.hareruya2,
    psaScheduled:{startedAt:pc.startedAt,endedAt:pc.endedAt,attemptedSets:progress.attemptedCount,refreshedRows:progress.refreshedCount,newRows:progress.newAcquiredCount,
      recoveredSaved:pc.publishedSavedRecovery,lastSuccessAt:progress.lastSuccessAt,publicationCommit:cp.execFileSync('git',['rev-parse','origin/main'],{encoding:'utf8'}).trim(),
      note:'Task exit code, fetched rows, saved packet recovery, valid domestic linkage and analysis gains are separate. Publication recovered saved observations without another HTTP request.'},
    model:read('data/supply-demand-validation-summary.json'),llmCalls:0,codexCalls:0,
    safetyChanged:false,note:'Same-input old/new financial hashes and candidate IDs agree. Current freshness is not the earlier manual peak. Revised scheduled success remains unverified.'};
  fs.writeFileSync('data/median-primary-integration.json',JSON.stringify(report));
  console.log(JSON.stringify({profiles:profiles.map(p=>({id:p.id,manual:p.manualAfter,current:p.integratedCount})),changes:report.combinedChangesSinceBeforeManual,freshness:report.fixedCohort.latest,psa:report.psaScheduled}));
}
if(require.main===module)build();module.exports={build};
