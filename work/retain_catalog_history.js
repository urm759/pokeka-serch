// A provider's missing row is not evidence that a printed card ceased to exist.
// Keep catalog identity/history, but never refresh its market observation timestamps.
function retained(previous,current,receivedAt){
  if(!Number.isFinite(Date.parse(receivedAt)))throw Error('Actual response receipt time required');
  const ids=new Set(current.map(c=>c.id)),identities=new Set(current.map(c=>c.identityKey).filter(Boolean));
  const rows=[];
  for(const old of previous){
    if(!old.id||ids.has(old.id)||old.identityKey&&identities.has(old.identityKey))continue;
    rows.push({...old,providerPresence:{state:'not-in-latest-response',listConfirmedAt:receivedAt,
      reason:'今回の取得元一覧には対象行なし。カード掲載・旧原票を保持し、価格や在庫の再確認成功とは扱わない'}});
    ids.add(old.id);if(old.identityKey)identities.add(old.identityKey);
  }
  return rows;
}
module.exports={retained};
