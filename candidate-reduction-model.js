(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CandidateReductionModel=api;})(typeof globalThis==='object'?globalThis:this,()=>{
  function compare(before,after){
    const common=Object.keys(after.rows).filter(id=>before.rows[id]);
    const lost=[],gained=[],overlap={},sequential={};
    for(const id of common){const a=before.rows[id],b=after.rows[id];
      if(a.selected&&!b.selected){
        const added=b.exclusions.filter(r=>!a.exclusions.includes(r));
        const old=b.exclusions.filter(r=>a.exclusions.includes(r));
        for(const reason of new Set(added))overlap[reason]=(overlap[reason]||0)+1;
        const first=added[0]||'候補条件の変化・要内訳確認';sequential[first]=(sequential[first]||0)+1;
        lost.push({id,name:b.name,before:a,after:b,newlyFailed:added,preexisting:old});
      }else if(!a.selected&&b.selected)gained.push({id,name:b.name,before:a,after:b});
    }
    return {commonCards:common.length,before:common.filter(id=>before.rows[id].selected).length,
      after:common.filter(id=>after.rows[id].selected).length,lostCount:lost.length,gainedCount:gained.length,
      addedCards:Object.keys(after.rows).filter(id=>!before.rows[id]).length,
      removedCards:Object.keys(before.rows).filter(id=>!after.rows[id]).length,
      newSelected:Object.keys(after.rows).filter(id=>!before.rows[id]&&after.rows[id].selected).length,
      overlap,sequential,lost,gained};
  }
  function holds(card){
    const result=[];
    const status=card.purchasePriceStatus?.code;
    const purchase={expired:'購入価格・有効期限超過',unacquired:'購入価格・未取得','out-of-stock':'購入価格・在庫なし',stopped:'購入価格・取得停止'};
    if(purchase[status])result.push(purchase[status]);
    if(card.forecastPeriodMismatch)result.push('予測期間不一致・参考探索のみ');
    if(card.dataQuality?.manualReview||card.dataQuality?.dataAnomaly||card.priceAggregation?.conflicted)result.push('価格対立・誤紐付け');
    return result;
  }
  function counts(rows){
    const all=Object.values(rows),selected=all.filter(r=>r.selected),overlap={},sequential={};
    for(const row of all.filter(r=>r.preset&&!r.selected)){
      for(const reason of new Set(row.exclusions))overlap[reason]=(overlap[reason]||0)+1;
      if(row.exclusions[0])sequential[row.exclusions[0]]=(sequential[row.exclusions[0]]||0)+1;
    }
    const purchase={};for(const row of selected)purchase[row.purchaseState]=(purchase[row.purchaseState]||0)+1;
    return {catalog:all.length,presetOnly:all.filter(r=>r.preset).length,selected:selected.length,
      referenceExploration:selected.filter(r=>!r.now).length,now:selected.filter(r=>r.now).length,
      purchasePriceWaiting:selected.filter(r=>r.purchaseState!=='available').length,
      periodHeld:selected.filter(r=>r.periodHeld).length,purchase,overlap,sequential};
  }
  function recoveryTargets(rows){
    const targets={};
    for(const [id,row] of Object.entries(rows)){
      if(!row.selected || row.holds?.includes('価格対立・誤紐付け') || row.specificationHeld)continue;
      if(['expired','unacquired'].includes(row.purchaseState))targets[id]={name:row.name,
        purchasePriceMissing:true,priceRefreshReady:true,recovery:true,
        reason:row.purchaseState==='expired'?'共有URL候補・購入価格期限超過の再確認':'共有URL候補・購入価格未取得の補完'};
    }
    return targets;
  }
  return {compare,holds,counts,recoveryTargets};
});
