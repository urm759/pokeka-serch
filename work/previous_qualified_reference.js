const fs=require('fs'),path=require('path');
function project(targets,previous={}){
  const current=new Set((targets.profiles||[]).flatMap(p=>(p.urlsMatched||[]).map(id=>p.id+':'+id))),rows=new Map((previous.rows||[]).map(r=>[r.profile+':'+r.id,r]));
  for(const r of targets.pendingDepartures||[]){const b=r.before||{},roots=(r.departureAudit?.roots||[]).map(x=>x.code),repair=r.departureAudit?.repair?.fields||[];
    rows.set(r.profile+':'+r.id,{id:r.id,profile:r.profile,lastQualifiedAt:r.beforeMeta?.at||null,lastPrice:b.purchase?.price??b.efficiency?.buy??null,lastPriceAt:b.purchase?.priceObservedAt||null,
      category:roots.includes('acquisition-failure')?'取得エラー':roots.includes('expired-price')?'鮮度切れ・再確認待ち':roots.includes('out-of-stock')?'在庫待ち':roots.includes('missing-data')?'不足・再確認待ち':'採算・品質条件による不採用',
      missing:repair,reasons:r.after?.exclusions||[],lastCheckedAt:r.lastCheckedAt||targets.at});}
  for(const key of current)rows.delete(key);
  return {version:1,at:targets.at,rows:[...rows.values()],note:'前回適合の保存参考。現在候補・購入可能価格・GOへ不使用。旧条件の履歴を含み、設定間の互換適合とは扱わない。確認できない最終適合日時はnull。'};
}
function build(root,targets){const f=path.join(root,'data/previous-qualified-reference.json');let old={};try{old=JSON.parse(fs.readFileSync(f));}catch{}const value=project(targets,old);require('./acquisition_retry').atomicWrite(f,value,0);return value;}
module.exports={project,build};
