const number=v=>Number.isFinite(v)?v:null;
function cardFacts(api,card) {
  const offer=card.currentStoreOffer,eff=api.cardEfficiency(card),ratio=api.state.efficiencyBuy==='reference-min'?api.purchasePsa9Ratio(card,eff.purchasePrice,'reference-min'):api.purchasePsa9Ratio(card);
  const sources={};
  for(const source of ['cardrush','hareruya2','torecacamp','yuyutei']){
    const r=api.state[source+'Stock']?.[card.id];if(!r)continue;
    sources[source]={price:r[source+'Price']??r.price??null,stock:r.stock??null,available:r.available??null,
      priceObservedAt:r.priceObservedAt||r.observedAt||r.updatedAt||null,
      inventoryObservedAt:r.inventoryObservedAt||r.observedAt||r.updatedAt||null,
      url:r.detailUrl||r.url||card[source+'Url']||null,
      sourceFailure:api.state.updateStatus?.sources?.[source]?.lastError||null};
  }
  const review=card.priceAggregation?.comparison || card.priceAggregation || {};
  return {identityKey:card.identityKey||null,referencePrice:number(card.price),psa10:number(card.psa10),purchase:offer?{
    price:number(offer.value),source:offer.source,available:offer.available,fresh:offer.fresh,
    priceObservedAt:offer.updatedAt||null,inventoryObservedAt:offer.inventoryAt||null,stock:offer.stock??null,
    reason:offer.purchaseReason||null,url:offer.url||null}:null,sourceQuotes:sources,
    psa9:{price:ratio.psa9Price??null,ratio:ratio.ratio??null,buy:ratio.purchasePrice??null,measurementType:ratio.measurementType,
      updatedAt:ratio.updatedAt||null,reasons:ratio.reasons||[]},
    efficiency:{buy:eff.purchasePrice??null,profit:eff.profit??null,roi:eff.roi??null,annual:eff.annual??null,
      scenario:eff.scenario,exit:eff.exitLabel,days:eff.days,basis:eff.basis,blockingReasons:eff.blockingReasons||[]},
    buyback:(card.buybackAnalysis?.rows||[]).map(r=>({shopId:r.shopId,price:r.buybackPrice??null,
      priceDate:r.priceDate||null,observedAt:r.observedAt||r.updatedAt||null,valid:r.valid,stale:r.stale,
      listingActive:r.listingActive,reason:r.reason||null})),
    specificationHeld:Boolean(api.state.psaSpecificationHeld?.[card.id]),dataQuality:card.dataQuality,
    priceReview:{conflicted:Boolean(review.conflicted),integrityDisputed:Boolean(card.priceIntegrity?.disputed),
      manualReview:Boolean(card.dataQuality?.manualReview),reasons:review.reasons||[],
      sources:[...(review.included||[]),...(review.excluded||[])].map(r=>({source:r.source,url:r.url||null,value:r.value??r.price??null,at:r.updatedAt||r.observedAt||null,reason:r.reason||null}))},
    medianEvidence:eff.medianEvidence?{reasons:eff.medianEvidence.reasons||[],independent:eff.medianEvidence.independent,
      value:eff.medianEvidence.value,rows:eff.medianEvidence.rows,omitted:eff.medianEvidence.omitted}:null,
    inputs:{fee:api.state.fee??null,saleFeeRate:api.state.saleFeeRate??null,saleExtraCost:api.state.saleExtraCost??null,
      buybackDeductionRate:api.state.buybackDeductionRate??null,hitRate:card.buyLimits?.clean?.assumptions?.hitRate??null},
    assessment:{supplyRisk:card.overallAssessment?.supplyRisk??null,marketStability:card.overallAssessment?.marketStability??null,
      cautions:card.overallAssessment?.cautions||[],stockDemand:card.hareruya2Stock?.demand||card.cardrushStock?.demand||null},
    forecastEvidence:{rawTrend30:card.futurePriceForecast?.rawTrend30??null,downsideScore:card.futurePriceForecast?.downsideScore??null,
      supplyPressure:card.futurePriceForecast?.supplyPressure||null,psa10Tx30:card.psaTx30d??null,shopDrop30:card.shopDrop30??null},
    decision:{verdict:card.purchaseDecision?.verdict||null,reasons:card.purchaseDecision?.reasons||[],
      operationalLimit:card.purchaseDecision?.operationalMaxPrice??null},
    presets:api.presetQualifications(card),exclusions:api.cardSearchExclusions(card)};
}
function transition(before,after) {
  const b=new Set(before.ids),a=new Set(after.ids);
  const lost=before.ids.filter(id=>!a.has(id)),gained=after.ids.filter(id=>!b.has(id));
  return {before:b.size,after:a.size,lost,gained,rows:lost.map(id=>({id,name:after.facts[id]?.name||before.facts[id]?.name,
    before:before.facts[id]?.metrics||null,after:after.facts[id]?.metrics||null,
    newlyFailed:(after.facts[id]?.metrics?.exclusions||[]).filter(r=>!before.facts[id]?.metrics?.exclusions?.includes(r)),
    newDecisionFailures:(after.facts[id]?.metrics?.decision?.reasons||[]).filter(r=>!before.facts[id]?.metrics?.decision?.reasons?.includes(r)),
    comparability:before.facts[id]?.metrics&&after.facts[id]?.metrics?'同じ設定・同じカードIDの再計算':'前後の詳細記録不足・原因は未確定'}))};
}
function priceOnlyRecovery(facts){
  if(!facts||facts.specificationHeld||facts.dataQuality?.manualReview||facts.dataQuality?.dataAnomaly||facts.dataQuality?.priceQuarantined)return false;
  const reasons=facts.efficiency?.blockingReasons||[];
  return reasons.length>0&&reasons.every(r=>r==='期限超過・再確認待ち');
}
module.exports={cardFacts,transition,priceOnlyRecovery};
