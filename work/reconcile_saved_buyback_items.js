// Reuse actual saved observations after shared identity rules improve. No fetch,
// timestamp changes, conflict replacement, or permission-state override.
function reconcile(matched, unmatched, cards) {
  const {resolveSavedItem}=require('./build_buyback_observation_summary');
  const rows=[...matched], held=[], recovered=[];
  for(const item of unmatched) {
    if(item.grade!=='PSA10'||item.currency!=='JPY'||!item.strictIdentity||item.quarantined||!item.conditionsConfirmed||!Number.isFinite(Date.parse(item.observedAt))) {held.push(item);continue;}
    const match=resolveSavedItem(item,cards);
    if(!match.cardId||rows.some(r=>r.shopItemId===item.shopItemId||r.cardId===match.cardId&&r.observedAt===item.observedAt)) {held.push(item);continue;}
    const row={...item,cardId:match.cardId,verifiedCardId:match.cardId,score:100,matchMethod:match.method,identityEvidence:match.evidence,mismatchReason:null};
    rows.push(row);recovered.push({id:row.cardId,price:row.price,observedAt:row.observedAt});
  }
  return {matched:rows,unmatched:held,recovered};
}
module.exports={reconcile};
