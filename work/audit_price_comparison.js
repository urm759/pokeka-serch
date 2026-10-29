const fs = require('node:fs'), cp = require('node:child_process');
const {load} = require('./audit_search_profit_consistency');
const {allProfiles} = require('./search_profile_variants');
const read = p => JSON.parse(fs.readFileSync(p));
const file = 'work/price-comparison-baseline-20261016.json';
function capture(at, options = {}, definitions = allProfiles(read('work/priority-search-profiles.json'))) {
  const profiles = definitions.map(p => {
    const api = load(fs.readFileSync('app.js','utf8'),at,{url:p.url,...options});
    const cards = api.prepareCalculatedCards(api.state.cards);
    return {id:p.id,url:p.url,settings:{effBuy:api.state.efficiencyBuy,exitPolicy:api.state.exitPolicy},
      ids:cards.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id),cards:cards.map(c=>({
        id:c.id,name:c.name,price:c.price,referencePrice:c.torecaPrice,referenceEvidence:c.referenceEvidence,
        rows:[...(c.priceAggregation?.included||[]),...(c.priceAggregation?.outliers||[]),...(c.priceAggregation?.excluded||[])],
        comparison:c.priceAggregation?.comparison||null,integrity:c.priceIntegrity,quality:c.dataQuality,
        purchase:c.currentStoreOffer,psa10:c.psa10,psa9:c.psa9Audit,official:c.official,
        efficiency:api.cardEfficiency(c),median:api.cardEfficiency(c,Date.parse(at),api.state.purchaseMode,api.state.efficiencyScenario,'median'),
        limits:c.buyLimits?.clean?{maxPrice:c.buyLimits.clean.maxPrice,currentBreakEvenRaw:c.buyLimits.clean.currentBreakEvenRaw,
          assumptions:c.buyLimits.clean.assumptions,finalMaxPrice:c.purchaseDecision?.finalMaxPrice}:null,
        decision:c.purchaseDecision,exclusions:api.cardSearchExclusions(c)
      }))};
  });
  return {at,commit:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),profiles};
}
if (process.argv.includes('--baseline')) {
  if(fs.existsSync(file))throw Error('Do not overwrite the saved baseline');
  const baseline=capture(new Date().toISOString());
  fs.writeFileSync(file,JSON.stringify(baseline));
  console.log(JSON.stringify({at:baseline.at,profiles:baseline.profiles.map(p=>({id:p.id,count:p.ids.length}))}));
} else {
  // Replay the baseline's exact URLs, not today's focus profiles. A/B and
  // reference-min have different semantics and must not be paired by position.
  const before=read(file),after=capture(before.at,{dataRef:before.commit},before.profiles),unique=ps=>[...new Set(ps.flatMap(p=>p.ids))];
  const changes=after.profiles.map(p=>{
    const old=before.profiles.find(b=>b.id===p.id),oldCards=new Map(old.cards.map(c=>[c.id,c]));
    const changed=p.cards.filter(c=>JSON.stringify(c.quality?.manualReviewReasons)!==JSON.stringify(oldCards.get(c.id)?.quality?.manualReviewReasons));
    return {id:p.id,before:old.ids.length,after:p.ids.length,gained:p.ids.filter(id=>!old.ids.includes(id)),lost:old.ids.filter(id=>!p.ids.includes(id)),
      arithmeticChanges:p.cards.filter(c=>JSON.stringify(c.limits)!==JSON.stringify(oldCards.get(c.id)?.limits)).map(c=>c.id),
      verdictChanges:p.cards.filter(c=>c.decision?.verdict!==oldCards.get(c.id)?.decision?.verdict).map(c=>({id:c.id,before:oldCards.get(c.id)?.decision?.verdict,after:c.decision?.verdict})),
      reviewCleared:changed.filter(c=>oldCards.get(c.id)?.quality?.manualReview&&!c.quality?.manualReview).map(c=>c.id),
      reviewAdded:changed.filter(c=>!oldCards.get(c.id)?.quality?.manualReview&&c.quality?.manualReview).map(c=>c.id),
      rows:changed.map(c=>{const b=oldCards.get(c.id);return {id:c.id,name:c.name,
        before:{review:b.quality.manualReviewReasons,exclusions:b.exclusions,price:b.price,median:b.median.purchasePrice,annual:b.efficiency.annual},
        after:{review:c.quality.manualReviewReasons,exclusions:c.exclusions,price:c.price,median:c.median.purchasePrice,annual:c.efficiency.annual},
        currentSpread:c.comparison?.spreadPct,comparableSources:c.comparison?.included.map(r=>r.source),
        excludedSources:c.comparison?.excluded.map(r=>({source:r.source,reasons:r.comparisonReasons}))};})};
  });
  const target=process.argv.find(v=>v.startsWith('--id='))?.slice(5);
  const detail=Buffer.from(JSON.stringify({profiles:changes}));
  fs.writeFileSync('data/price-comparison-details.json',JSON.stringify({codec:'gzip-base64-json-v1',
    sha256:require('node:crypto').createHash('sha256').update(detail).digest('hex'),
    data:require('node:zlib').gzipSync(detail).toString('base64')}));
  const report={version:1,at:new Date().toISOString(),evaluationAt:before.at,baselineCommit:before.commit,
    profiles:changes.map(({rows,reviewCleared,reviewAdded,...p})=>({...p,reviewCleared:reviewCleared.length,reviewAdded:reviewAdded.length})),
    detailsFile:'data/price-comparison-details.json',uniqueBefore:unique(before.profiles).length,uniqueAfter:unique(after.profiles).length,
    target:target?after.profiles.map(p=>({profile:p.id,before:before.profiles.find(b=>b.id===p.id).cards.find(c=>c.id===target),after:p.cards.find(c=>c.id===target)})):null,
    note:'同じ保存データ・設定・評価時刻で比較。参考中央値/確認待ち根拠の訂正を実取得の成果と数えない。原票を保持。'};
  fs.writeFileSync('data/price-comparison-audit.json',JSON.stringify(report));
  console.log(JSON.stringify({evaluationAt:report.evaluationAt,profiles:report.profiles,uniqueBefore:report.uniqueBefore,uniqueAfter:report.uniqueAfter}));
}
