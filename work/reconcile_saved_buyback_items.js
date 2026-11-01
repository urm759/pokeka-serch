// Reuse actual saved observations after shared identity rules improve. No fetch,
// timestamp changes, conflict replacement, or permission-state override.
function reconcile(matched, unmatched, cards) {
  const {resolveSavedItem}=require('./build_buyback_observation_summary');
  const serial=require('./cardshop151').number,byNumber=new Map();
  for(const card of cards){const key=serial(card.model||card.name);if(!byNumber.has(key))byNumber.set(key,[]);byNumber.get(key).push(card);}
  const rows=[], held=[], recovered=[];
  for(const item of matched) {
    if(!item.strictIdentity){rows.push(item);continue;}
    const match=resolveSavedItem(item,cards,byNumber);
    if(match.cardId!==item.cardId){
      held.push({...item,previousCardId:item.cardId,cardId:null,verifiedCardId:null,identityHeld:true,
        mismatchReason:match.reason||'保存済み紐付けと同一仕様の再照合が不一致'});
    } else rows.push({...item,verifiedCardId:match.cardId,matchMethod:match.method,identityEvidence:match.evidence});
  }
  for(const item of unmatched) {
    if(item.grade!=='PSA10'||item.currency!=='JPY'||!item.strictIdentity||item.quarantined||!item.conditionsConfirmed||!Number.isFinite(Date.parse(item.observedAt))) {held.push(item);continue;}
    const match=resolveSavedItem(item,cards,byNumber);
    if(!match.cardId||rows.some(r=>r.shopItemId===item.shopItemId||r.cardId===match.cardId&&r.observedAt===item.observedAt)) {held.push(item);continue;}
    const row={...item,cardId:match.cardId,verifiedCardId:match.cardId,score:100,matchMethod:match.method,identityEvidence:match.evidence,mismatchReason:null};
    rows.push(row);recovered.push({id:row.cardId,price:row.price,observedAt:row.observedAt});
  }
  return {matched:rows,unmatched:held,recovered};
}
module.exports={reconcile};
