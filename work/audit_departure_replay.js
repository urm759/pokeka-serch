const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {load}=require('./audit_search_profit_consistency');
const ROOT=path.join(__dirname,'..');
function replay({ids,beforeRef,afterRef,beforeAt,afterAt,profileIds=['A','A-median']}) {
  const source=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
  const profiles=require('./search_profile_variants').allProfiles(require('./priority-search-profiles.json'));
  const report={version:1,codeHash:crypto.createHash('sha256').update(source).digest('hex'),beforeRef,afterRef,beforeAt,afterAt,
    rule:'同一コード・固定URL。各保存時点で評価し、日時は書換えない。新規取得/候補復帰とは別。',profiles:{}};
  for(const id of profileIds) {
    const profile=profiles.find(p=>p.id===id);if(!profile)throw Error('Unknown profile '+id);
    const snapshots=[];
    for(const [dataRef,at] of [[beforeRef,beforeAt],[afterRef,afterAt]]) {
      const api=load(source,at,{dataRef,url:profile.url,fixedModelClock:true});
      if(api.missingHistoricalInputs.length)throw Error('Historical inputs missing');
      const cards=api.prepareCalculatedCards(api.state.cards.filter(c=>ids.includes(c.id)));
      snapshots.push(cards.map(card=>({id:card.id,name:card.name,psa10:card.psa10,
        assumedRate:card.buyLimits?.clean?.assumptions?.hitRate ?? null,
        market:api.currentMarketView(card,true),efficiency:api.cardEfficiency(card),
        exit:card.buyLimits?.clean?.buybackExit,quotes:card.buybackAnalysis?.rows,
        exclusions:api.cardSearchExclusions(card),fee:api.state.fee,sellFee:api.state.saleFeeRate,deduction:api.state.buybackDeductionRate})));
    }
    const contributions=ids.map(cardId=>{
      const before=snapshots[0].find(c=>c.id===cardId),after=snapshots[1].find(c=>c.id===cardId);
      const a=before?.exit?.scenarios?.current,b=after?.exit?.scenarios?.current;
      if(!a||!b)return {id:cardId,status:'比較根拠不足'};
      const quoteOnly=Math.round(b.netPsa10*a.hitRate+a.lowerGradeNet*(1-a.hitRate));
      return {id:cardId,buyUnchanged:before.efficiency.purchasePrice===after.efficiency.purchasePrice,psa10Unchanged:before.psa10===after.psa10,
        grossBefore:a.grossPrice,grossAfter:b.grossPrice,quoteAndConservativeAggregationEffect:quoteOnly-a.expectedSale,
        rateAndOtherEffect:b.expectedSale-quoteOnly,feesUnchanged:before.fee===after.fee&&before.sellFee===after.sellFee&&before.deduction===after.deduction,
        warning:'提示額/保守集約の寄与を旧取得率へ固定して分離。店舗需要の原因や市場全体の下落とは断定しない'};
    });
    report.profiles[id]={urlHash:crypto.createHash('sha256').update(profile.url).digest('hex'),before:snapshots[0],after:snapshots[1],contributions};
  }
  return report;
}
if(require.main===module) {
  const [beforeRef,afterRef,beforeAt,afterAt,...ids]=process.argv.slice(2);
  if(!beforeRef||!afterRef||!ids.length)throw Error('beforeRef afterRef beforeAt afterAt cardIds required');
  const result=replay({ids,beforeRef,afterRef,beforeAt,afterAt});
  require('./acquisition_retry').atomicWrite(path.join(ROOT,'work/departure-fixed-code-replay.json'),result,0);
  console.log(JSON.stringify(Object.fromEntries(Object.entries(result.profiles).map(([id,p])=>[id,{before:p.before.map(r=>({id:r.id,efficiency:r.efficiency,market:r.market,exit:r.exit})),after:p.after.map(r=>({id:r.id,efficiency:r.efficiency,market:r.market,exit:r.exit}))}]))));
}
module.exports={replay};
