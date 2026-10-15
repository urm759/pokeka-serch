const fs=require('node:fs'),cp=require('node:child_process'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {load}=require('./audit_search_profit_consistency'),read=p=>JSON.parse(fs.readFileSync(p)),hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function uniqueOutcomes(report){const before=new Set(report.profiles.flatMap(p=>p.previousPublishedDataOldReferenceAtSameTime||[])),after=new Set(report.profiles.flatMap(p=>p.after));report.uniqueAcrossProfiles={before:before.size,after:after.size,gained:[...after].filter(id=>!before.has(id)),lost:[...before].filter(id=>!after.has(id)),note:'4条件の重複を除いた同時刻比較。参考中央値の再集計とデータ隔離を含む表示入替であり、実取得による初適合ではない'};return report;}
function build(){
  const at=new Date().toISOString(),beforeCode=cp.execFileSync('git',['show','ab025c84:exploration-metrics.js'],{encoding:'utf8'}),box={module:{exports:{}},URL};
  vm.runInNewContext(beforeCode,box);const old=box.module.exports,source=fs.readFileSync('app.js','utf8');
  const profiles=require('./search_profile_variants').allProfiles(read('work/priority-search-profiles.json')).map(p=>{
    const evaluate=(metrics,dataRef)=>{const api=load(source,at,{url:p.url,explorationMetrics:metrics,dataRef}),cards=api.prepareCalculatedCards(api.state.cards);return {api,cards,ids:cards.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id).sort(),financialHash:hash(cards.map(c=>[c.id,c.buyLimits,c.purchaseDecision]))};};
    const b=evaluate(old),a=evaluate(require('../exploration-metrics'));assert.equal(b.financialHash,a.financialHash,'Reference aggregation must not alter limits/GO');
    if(!p.id.includes('median'))assert.deepEqual(b.ids,a.ids,'Original profile must not change');
    const selected=new Set([...b.ids,...a.ids,...b.cards.filter(c=>/\[S6a /i.test(c.name)).map(c=>c.id)]);
    const rows=a.cards.filter(c=>selected.has(c.id)).map(c=>{const previous=b.cards.find(x=>x.id===c.id);return {id:c.id,name:c.name,before:b.api.cardEfficiency(previous),after:a.api.cardEfficiency(c),exclusions:a.api.cardSearchExclusions(c)};});
    const priorData=evaluate(require('../exploration-metrics'),'ab025c84');
    const priorOriginal=evaluate(old,'ab025c84');
    return {id:p.id,urlHash:hash(p.url),before:b.ids,after:a.ids,gainedFromReferenceReaggregation:a.ids.filter(id=>!b.ids.includes(id)),lostFromReferenceReaggregation:b.ids.filter(id=>!a.ids.includes(id)),financialHash:a.financialHash,limitsAndGoUnchanged:true,
      previousPublishedDataOldReferenceAtSameTime:priorOriginal.ids,dataChangesSameCodeAndTime:{before:priorData.ids,after:a.ids,gained:a.ids.filter(id=>!priorData.ids.includes(id)),lost:priorData.ids.filter(id=>!a.ids.includes(id)),note:'同一修正後コード/同時刻で前回公開保存データと今回保存データを比較。実取得と明示言語違い隔離のデータ変更を含む。中央値再集計そのものの増減と別'},rows};
  });
  const cycle=read('data/search-profile-cycle-progress.json').cycles.find(c=>c.key==='evidence-refresh-20261016');
  const baseline=read('work/search-profile-cycle-baseline-evidence-refresh-20261016.json'),outcomes=require('./audit_completion_outcomes');
  const result={version:1,at,referenceBaseline:'ab025c84',profiles,dataGlobalDelta:outcomes.compare(outcomes.unpack(baseline.snapshot),outcomes.snapshot(process.cwd(),Date.parse(at))),identityIsolation:read('data/shop-identity-quarantine.json'),dataAcquisitionCycle:cycle?{...cycle,comparisonStatus:'改修途中の基準を含むため適合増減の成果集計には不使用。上の固定コード・時刻による履歴比較を採用'}:null,formulaChanged:false,referenceSelectionChanged:true,
    note:'同じ最新データ・時刻・条件で、新鮮な採用元だけの再集計を比較。再集計による探索適合は新規取得/初補完と別。上限/GOは旧原票のまま。',psa9:read('data/psa9-provenance-audit.json').counts,
    fixedFreshness:read('data/priority-price-monitor.json').fixedCohortFreshness.sources.hareruya2};
  fs.writeFileSync('data/evidence-refresh-outcomes.json',JSON.stringify(uniqueOutcomes(result)));
  console.log(JSON.stringify(profiles.map(p=>({id:p.id,before:p.before.length,after:p.after.length,gained:p.gainedFromReferenceReaggregation,lost:p.lostFromReferenceReaggregation}))));return result;
}
if(require.main===module){if(process.argv.includes('--summarize-existing')){const result=uniqueOutcomes(read('data/evidence-refresh-outcomes.json'));fs.writeFileSync('data/evidence-refresh-outcomes.json',JSON.stringify(result));console.log(result.uniqueAcrossProfiles);}else build();}module.exports={build,uniqueOutcomes};
