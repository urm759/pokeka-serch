const {sameIdentity,identityFromCard,median}=require('../raw-psa9-gap-model');
const validSourceUrl=u=>{try{const x=new URL(u);return x.protocol==='https:'&&!x.username&&!x.password;}catch{return false;}};
function summarize(card,input,now=Date.now()) {
  const expected=identityFromCard(card),seen=new Map(),excluded={},rows=[],conflicts=new Set(),fingerprints=new Map();
  const signature=r=>JSON.stringify([r.cardId,r.price,r.soldAt,r.grade,r.currency,r.setCode,r.number,r.rarity,r.variant,r.language]);
  for(const r of input?.trades||[]){const id=r.transactionId||r.saleId;if(!r.source||!id)continue;const key=r.source+'|'+id,f=signature(r);if(fingerprints.has(key)&&fingerprints.get(key)!==f)conflicts.add(key);else fingerprints.set(key,f);}
  const permitted=input?.permission==='confirmed'&&typeof input.permissionEvidence==='string'&&input.permissionEvidence.trim().length>0;
  for(const r of input?.trades || []) {
    let reason=null;const at=Date.parse(r.soldAt),id=r.transactionId || r.saleId;
    const key=`${r.source || ''}|${id || ''}`,fingerprint=signature(r);
    if(!permitted)reason='許諾・正規提供根拠未確認';
    else if(conflicts.has(key))reason='同一取引IDの内容対立';
    else if(r.cardId!==card.id || !sameIdentity(expected,r))reason='同一仕様を確認できない';
    else if(r.grade!==9 || r.gradingCompany!=='PSA' || r.currency!=='JPY' || r.country!=='JP' || r.marketScope!=='domestic-jp' || r.saleType!=='sold' || r.singleCard!==true)reason='国内PSA9単品実成約ではない';
    else if(!Number.isFinite(r.price)||r.price<=0||!Number.isFinite(at)||at>now)reason='成約日・価格未確認（取得日時で代用しない）';
    else if(!id||!r.source)reason='取引ID・出典未取得';
    else if(seen.has(key))reason=seen.get(key)===fingerprint?'取引ID重複':'同一取引IDの内容対立';
    if(reason){excluded[reason]=(excluded[reason]||0)+1;if(reason==='同一取引IDの内容対立'){const i=rows.findIndex(x=>x.key===key);if(i>=0)rows.splice(i,1);}continue;}
    seen.set(key,fingerprint);rows.push({...r,key,at});
  }
  const jstDay=new Date(now+9*3600000).toISOString().slice(0,10),end=Date.parse(jstDay+'T00:00:00+09:00');
  const periods={};for(const days of [7,30,75,200]){
    const start=end-(days-1)*86400000,adopted=rows.filter(r=>r.at>=start),values=adopted.map(r=>r.price);
    periods[days]={mean:values.length?values.reduce((s,n)=>s+n,0)/values.length:null,median:median(values),observedSales:values.length,
      count:permitted&&input?.coverage?.[card.id]?.[days]?.complete===true?values.length:null,coverageComplete:permitted&&input?.coverage?.[card.id]?.[days]?.complete===true,
      start:new Date(start+9*3600000).toISOString().slice(0,10),end:jstDay,
      latestSaleAt:adopted.length?new Date(Math.max(...adopted.map(r=>r.at))).toISOString():null,
      sourceUrls:[...new Set(adopted.map(r=>r.sourceUrl).filter(validSourceUrl))],sourceRefsComplete:adopted.length>0&&adopted.every(r=>validSourceUrl(r.sourceUrl)),
      sources:[...new Set(adopted.map(r=>r.source))],reference:input?.coverage?.[card.id]?.[days]?.complete!==true};
  }
  return {periods,excluded,validRows:rows.length,status:rows.length?'許諾確認済み実成約の保存分集計':'未取得・正規データ提供待ち',sourceFetchedAt:input?.fetchedAt || null};
}
module.exports={summarize};
