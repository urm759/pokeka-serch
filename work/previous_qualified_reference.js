const fs=require('fs'),path=require('path');
function project(targets,previous={},options={}){
  const current=new Set((targets.profiles||[]).flatMap(p=>(p.urlsMatched||[]).map(id=>p.id+':'+id))),rows=new Map((previous.rows||[]).map(r=>[r.profile+':'+r.id,r]));
  for(const r of targets.pendingDepartures||[]){const b=r.before||{},roots=(r.departureAudit?.roots||[]).map(x=>x.code),repair=r.departureAudit?.repair?.fields||[];
    const requests=(targets.repairRequests||[]).filter(t=>t.id===r.id&&t.profile===r.profile);
    const waiting=requests.length?requests.some(t=>t.automatic)?'自動再確認・'+[...new Set(requests.filter(t=>t.automatic).flatMap(t=>t.sourceTargets?.map(s=>s.source)||[t.source]))].join('／'):'保留・取得経路/仕様の確認待ち':roots.includes('out-of-stock')?'在庫探索・通常巡回':repair.length?'補完経路の確認待ち':'条件不合格・通常巡回';
    rows.set(r.profile+':'+r.id,{id:r.id,name:options.names?.[r.id]||rows.get(r.profile+':'+r.id)?.name||r.name||null,profile:r.profile,lastQualifiedAt:r.beforeMeta?.at||null,lastPrice:b.purchase?.price??b.efficiency?.buy??null,lastPriceAt:b.purchase?.priceObservedAt||null,
      category:roots.includes('acquisition-failure')?'取得エラー':roots.includes('expired-price')?'鮮度切れ・再確認待ち':roots.includes('out-of-stock')?'在庫待ち':roots.includes('missing-data')?'不足・再確認待ち':'採算・品質条件による不採用',
      missing:repair,reasons:r.after?.exclusions||[],waitingStatus:waiting,lastCheckedAt:r.lastCheckedAt||targets.at});}
  for(const key of current)rows.delete(key);
  const focusProfileIds=options.focusProfileIds||(targets.profiles||[]).filter(p=>!p.id.endsWith('-specified')).map(p=>p.id);
  return {version:1,at:targets.at,focusProfileIds,rows:[...rows.values()].map(r=>({...r,name:options.names?.[r.id]||r.name||null})),note:'前回適合の保存参考。現在候補・購入可能価格・GOへ不使用。正式2条件を優先し、旧条件/比較モードの履歴は別。最終適合・価格確認・監査時刻を区別し、根拠なしは不明。'};
}
function build(root,targets){const f=path.join(root,'data/previous-qualified-reference.json');let old={};try{old=JSON.parse(fs.readFileSync(f));}catch{}const config=JSON.parse(fs.readFileSync(path.join(root,'work/priority-search-profiles.json'))),cards=JSON.parse(fs.readFileSync(path.join(root,'data/pokemon-cards.json')));const value=project(targets,old,{focusProfileIds:require('./search_profile_variants').allProfiles(config).map(p=>p.id),names:Object.fromEntries(cards.map(c=>[c.id,c.name]))});require('./acquisition_retry').atomicWrite(f,value,0);return value;}
module.exports={project,build};
