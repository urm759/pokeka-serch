(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Psa10ListingCounts=api;})(typeof window==='object'?window:globalThis,function(){
  const DAY=86400000,day=at=>new Date(Date.parse(at)+9*3600000).toISOString().slice(0,10),number=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
  function observe(input,now=Date.now()){
    const u=new URL(input.url),at=Date.parse(input.observedAt);
    if(input.version!==1||input.source!=='SNKRDUNK'||input.language!=='ja'||input.grade!=='PSA10'||input.forSaleOnly!==true||!input.cardId||!input.identityKey||!Number.isFinite(at)||at>now||u.origin!=='https://snkrdunk.com'||u.pathname!=='/apparels/'+input.productId+'/used'||u.searchParams.get('conditionIds')!=='22')throw Error('PSA10販売中・仕様・実確認日時の根拠不足');
    const ids=new Map();let duplicates=0;
    for(const row of input.rows||[]){
      const a=new URL(row.url,u),m=a.pathname.match(/^\/apparels\/(\d+)\/used\/(\d+)$/);
      if(!m||m[1]!==String(input.productId)||a.origin!==u.origin||row.grade!=='PSA10'||row.active!==true)throw Error('他商品・他グレード・売切れ行の混入');
      const old=ids.get(m[2]);if(old){if(old.grade!==row.grade||old.active!==row.active)throw Error('同一出品の状態対立');duplicates++;}else ids.set(m[2],row);
    }
    const count=ids.size,reported=input.reportedCount;
    if(reported!=null&&(!number(reported.value)||!Number.isInteger(reported.value)||typeof reported.exact!=='boolean'||reported.value<count||reported.exact&&reported.value!==count))throw Error('出品件数と全件根拠が不一致');
    const exact=input.coverage==='complete'&&(reported?.exact===true||input.endConfirmed===true);
    if(!count&&!exact)throw Error('未観測を出品0へ変換しない');
    return {cardId:input.cardId,identityKey:input.identityKey,at:input.observedAt,date:day(input.observedAt),lower:reported?.value??count,exact:exact&&reported?.exact!==false,url:u.href,distinctIds:[...ids.keys()],duplicates,kind:input.acquisitionKind||'manual-browser-verification'};
  }
  function summarize(observations,identityKey,now=Date.now()){
    const end=day(new Date(now).toISOString()),start=day(new Date(now-29*DAY).toISOString()),byDay=new Map();
    for(const r of observations||[]){if(r.identityKey!==identityKey||!number(r.lower)||!Number.isInteger(r.lower)||typeof r.exact!=='boolean'||!Number.isFinite(Date.parse(r.at))||Date.parse(r.at)>now||r.date!==day(r.at)||r.date<start||r.date>end)continue;
      if(!byDay.has(r.date)||Date.parse(r.at)>Date.parse(byDay.get(r.date).at))byDay.set(r.date,r);
    }
    const rows=[...byDay.values()].sort((a,b)=>a.date.localeCompare(b.date)),latest=rows.at(-1),mean=rows.length?rows.reduce((n,r)=>n+r.lower,0)/rows.length:null;
    return {identityKey,current:latest?{lower:latest.lower,exact:latest.exact,at:latest.at,url:latest.url,stale:now-Date.parse(latest.at)>DAY}:null,mean30:mean==null?null:{lower:mean,exact:rows.every(r=>r.exact),days:rows.length,period:30,start:rows[0].date,end:latest.date,latest:latest.at,reference:rows.length<30},observedDays:rows.map(r=>r.date)};
  }
  const bound=n=>number(n)?n:null;
  function reasons(view,settings){
    const out=[];
    const name=settings.label||'PSA10出品数';
    for(const [key,label,lo,hi]of [['current','現在'+name,settings.listingCurrentMin,settings.listingCurrentMax],['mean30','30日平均'+name,settings.listingMeanMin,settings.listingMeanMax]]){
      const min=bound(lo),max=bound(hi);if(min==null&&max==null||min!=null&&max!=null&&min>max)continue;
      const v=view?.[key];if(!v||!number(v.lower)){out.push(label+'・未取得');continue;}if(key==='current'&&v.stale){out.push(label+'・期限切れ');continue;}
      if(min!=null&&v.lower<min)out.push(label+(v.exact?'・下限未達':'・下限判定不可（以上表示）'));
      if(max!=null&&(v.lower>max||!v.exact))out.push(label+(v.lower>max?'・上限超過':'・上限判定不可（以上表示）'));
    }return out;
  }
  function text(value){return value&&number(value.lower)?new Intl.NumberFormat('ja-JP',{maximumFractionDigits:2}).format(value.lower)+(value.exact?'件':'件以上'):'未取得';}
  function providerViews(payload,card,{catalogHash,now=Date.now()}={}){
    const empty=()=>({current:null,mean30:null,observedDays:[]});
    if(!payload)return {psa10:empty(),raw:empty()};
    if(payload.version!==1||payload.source!=='MINTORE'||payload.scope!=='provider-listed-psa10-and-clean-v1'||!catalogHash||payload.catalogHash!==catalogHash)throw Error('みんトレ出品数・カード原票の版不一致');
    const rows=payload.cards?.[card.id],out={};
    for(const [key,index]of [['psa10',0],['raw',1]]){
      const r=rows?.[index];if(!r){out[key]=empty();continue;}
      const receipt=payload.receipts?.[r[1]],at=receipt?.[0],time=Date.parse(at),days=r.length>3?r[4]:1,mean=r.length>3?r[3]:r[0],exact=r[2]===1,meanExact=r.length>3?r[6]===1:exact;
      const first=payload.receipts?.[r.length>3?r[5]:r[1]]?.[0];
      if(!number(r[0])||!Number.isInteger(r[0])||![0,1].includes(r[2])||!Number.isFinite(time)||time>now||!Number.isInteger(days)||days<1||days>30||!number(mean)||!Number.isFinite(Date.parse(first)))throw Error('みんトレ出品数・件数または実確認日時の根拠不足');
      out[key]={current:{lower:r[0],exact,at,sourceUpdatedAt:receipt[1],url:'https://toreca-souba.com/cards/'+encodeURIComponent(card.sourceId||card.id),stale:now-time>DAY},
        mean30:{lower:mean,exact:meanExact,days,period:30,start:day(first),end:day(at),latest:at,reference:days<30},observedDays:null,source:'MINTORE',field:key==='psa10'?'snkPsa10Count':'snkListings',sourceUpdateStatus:payload.sourceUpdateStatus};
      const status=rows?.[2],check=status&&payload.receipts?.[status[0]];
      if(status?.[index+1]&&check&&Date.parse(check[0])>=time){out[key].lastObserved=out[key].current;out[key].current=null;out[key].currentReason=({1:'取得元の項目未提供',2:'現在の該当状態の掲載根拠なし',3:'仕様・対応確認待ち'})[status[index+1]]||'再確認待ち';out[key].checkedAt=check[0];}
    }return out;
  }
  return {observe,summarize,reasons,text,day,providerViews};
});
